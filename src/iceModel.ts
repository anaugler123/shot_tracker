import type { Game, Shot } from "./model";
export type PlayingDirection = "away" | "home";
export type CurlSide = "left" | "right";
export interface CurlEvidence {
  shot: Shot;
  direction: PlayingDirection;
  turn: "CW" | "CCW";
  pull: -1 | 0 | 1;
}
export interface CurlGroup {
  direction: PlayingDirection;
  turn: "CW" | "CCW";
  shots: CurlEvidence[];
  over: number;
  under: number;
  made: number;
  left: number;
  right: number;
  net: number;
}
/** Coordinates always look from the home end toward the away end.
 * CW curls right from the thrower's view; turning around reverses that axis.
 * Overcurl adds pull along the curl; undercurl adds pull against it.
 * These are equal-weight directional observations, never measured elevations.
 */
export function estimateSheetShape(
  game: Game,
  firstEndDirection: PlayingDirection,
  {
    includeHits = false,
    target = "all",
    player = "all",
  }: {
    includeHits?: boolean;
    target?: "all" | "C" | "S";
    player?: "all" | number;
  } = {},
) {
  const eligible = game.shots.filter(
    (s) =>
      (includeHits || s.kind === "Draw") &&
      (player === "all" || s.position === player) &&
      (target === "all" || s.turn.split(" ")[1] === target),
  );
  const evidence: CurlEvidence[] = [];
  for (const shot of eligible) {
    const turn = /^(CW|CCW) [CS]$/.exec(shot.turn)?.[1] as
      "CW" | "CCW" | undefined;
    if (
      !turn ||
      shot.score === null ||
      !["Overcurl", "Undercurl", "Make"].includes(shot.deficiency)
    )
      continue;
    const direction =
      shot.end % 2 === 1
        ? firstEndDirection
        : firstEndDirection === "away"
          ? "home"
          : "away";
    const curl = (turn === "CW" ? 1 : -1) * (direction === "away" ? 1 : -1);
    const pull = (
      shot.deficiency === "Make"
        ? 0
        : curl * (shot.deficiency === "Overcurl" ? 1 : -1)
    ) as -1 | 0 | 1;
    evidence.push({ shot, turn, direction, pull });
  }
  const groups: CurlGroup[] = (["away", "home"] as const).flatMap((direction) =>
    (["CW", "CCW"] as const).map((turn) => {
      const shots = evidence.filter(
        (e) => e.direction === direction && e.turn === turn,
      );
      const left = shots.filter((e) => e.pull === -1).length;
      const right = shots.filter((e) => e.pull === 1).length;
      return {
        direction,
        turn,
        shots,
        left,
        right,
        net: right - left,
        over: shots.filter((e) => e.shot.deficiency === "Overcurl").length,
        under: shots.filter((e) => e.shot.deficiency === "Undercurl").length,
        made: shots.filter((e) => e.pull === 0).length,
      };
    }),
  );
  const left = evidence.filter((e) => e.pull === -1).length;
  const right = evidence.filter((e) => e.pull === 1).length;
  const bias = evidence.length ? (right - left) / evidence.length : 0;
  const byDirection = (["away", "home"] as const).map((direction) => {
    const list = evidence.filter((e) => e.direction === direction);
    return {
      misses: list.filter((e) => e.pull !== 0).length,
      net: list.reduce((sum, e) => sum + e.pull, 0),
    };
  });
  const enough = left + right >= 8 && byDirection.every((d) => d.misses >= 3);
  const agrees = byDirection.every(
    (d) => Math.sign(d.net) === Math.sign(bias) && d.net !== 0,
  );
  const status = !enough
    ? "insufficient"
    : agrees && Math.abs(bias) >= 0.2
      ? "directional"
      : "mixed";
  return {
    evidence,
    groups,
    left,
    right,
    bias,
    status,
    side: (bias > 0 ? "right" : bias < 0 ? "left" : null) as CurlSide | null,
    excluded: eligible.length - evidence.length,
    made: evidence.filter((e) => e.pull === 0).length,
    players: new Set(
      evidence.filter((e) => e.pull !== 0).map((e) => e.shot.position),
    ).size,
  };
}
