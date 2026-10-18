export const positions = ["Lead", "Second", "Third", "Fourth"];
export const turns = [
  "CW C",
  "CW S",
  "CCW C",
  "CCW S",
  "CW C IO",
  "CW S IO",
  "CCW C IO",
  "CCW S IO",
];
export const draws = [
  "Guard/Front Stone",
  "Draw",
  "Come Around",
  "Angle/Freeze",
  "Tap/Split",
];
export const hits = [
  "Hit & Stay",
  "Hit & Roll",
  "Finesse Hit",
  "Peel",
  "Runback/Multiple",
];
export const executions = ["Make", "Partial", "Limited", "Xmiss"];
export const deficiencies = [
  "Make",
  "Light",
  "Heavy",
  "Undercurl",
  "Overcurl",
  "Management",
];
export const reviews = ["Team", "Player", "Strategy", "Highlight"];
export interface Shot {
  id: string;
  end: number;
  position: number;
  stone: number;
  turn: string;
  kind: "Draw" | "Hit";
  type: string;
  execution: string;
  score: number | null;
  deficiency: string;
  review: string;
  note: string;
  timestamp: number | null;
}
export interface EndScore {
  us: number | null;
  them: number | null;
}
export interface Game {
  id: string;
  event: string;
  opponent: string;
  date: string;
  venue: string;
  sheet: string;
  round: string;
  ends: number;
  players: string[];
  firstHammer: boolean;
  scores: EndScore[];
  shots: Shot[];
  status: "live" | "complete";
  video: string;
  source?: string;
  sample?: boolean;
}
export interface Store {
  version: 1;
  games: Game[];
}
export function shotId(end: number, position: number, stone: number) {
  return `${end}${"ABCDEFGH"[position * 2 + stone - 1]}`;
}
export function emptyShot(end: number, position: number, stone: number): Shot {
  return {
    id: shotId(end, position, stone),
    end,
    position,
    stone,
    turn: "",
    kind: "Draw",
    type: "",
    execution: "",
    score: null,
    deficiency: "",
    review: "",
    note: "",
    timestamp: null,
  };
}
export function percentage(shots: Shot[]) {
  const scored = shots.filter((s) => s.score !== null);
  return scored.length
    ? Math.round(
        (scored.reduce((a, s) => a + s.score!, 0) / (scored.length * 5)) * 100,
      )
    : null;
}
export function total(game: Game) {
  return game.scores.reduce(
    (a, s) => [a[0] + (s.us ?? 0), a[1] + (s.them ?? 0)],
    [0, 0],
  );
}
export function hammerAt(game: Game, end: number) {
  let hammer = game.firstHammer;
  for (let i = 0; i < end - 1; i++) {
    const s = game.scores[i];
    if (s?.us == null || s?.them == null) return null;
    if (s.us > 0) hammer = false;
    else if (s.them > 0) hammer = true;
  }
  return hammer;
}
export function nextShot(game: Game): Shot {
  for (let end = 1; end <= game.ends + 1; end++)
    for (let p = 0; p < 4; p++)
      for (let stone = 1; stone <= 2; stone++)
        if (!game.shots.some((s) => s.id === shotId(end, p, stone)))
          return emptyShot(end, p, stone);
  return emptyShot(game.ends + 1, 0, 1);
}
export function videoId(url: string) {
  try {
    const u = new URL(url);
    if (["youtu.be", "www.youtu.be"].includes(u.hostname))
      return /^[\w-]{11}$/.test(u.pathname.slice(1))
        ? u.pathname.slice(1)
        : null;
    if (
      ["youtube.com", "www.youtube.com", "m.youtube.com"].includes(u.hostname)
    ) {
      const id =
        u.searchParams.get("v") ||
        u.pathname.match(/^\/(?:live|embed|shorts)\/([\w-]{11})/)?.[1];
      return id && /^[\w-]{11}$/.test(id) ? id : null;
    }
    return null;
  } catch {
    return null;
  }
}
export function timeLabel(n: number | null) {
  if (n === null) return "";
  return (
    `${Math.floor(n / 3600) ? Math.floor(n / 3600) + ":" : ""}${Math.floor(n / 60) % 60}`.replace(
      /^(\d+):(\d)$/,
      "$1:0$2",
    ) +
    ":" +
    String(n % 60).padStart(2, "0")
  );
}
export function parseTime(s: string) {
  if (!s.trim()) return null;
  if (!/^\d+(?::[0-5]\d){1,2}$/.test(s)) return NaN;
  return s.split(":").reduce((a, b) => a * 60 + Number(b), 0);
}
export function sameGame(a: Game, b: Game) {
  return (
    a.id === b.id ||
    !!(a.source && a.source === b.source) ||
    [a.event, a.date, a.opponent]
      .map((v) => v.trim().toLowerCase())
      .join("|") ===
      [b.event, b.date, b.opponent].map((v) => v.trim().toLowerCase()).join("|")
  );
}
export function saveGames(games: Game[]) {
  localStorage.setItem("hack.store.v1", JSON.stringify({ version: 1, games }));
}

/** Validate backups before allowing their data into application state. */
export function decodeBackup(raw: string): Store {
  const data: unknown = JSON.parse(raw);
  const fail = () => {
    throw new Error(
      "This file is not a valid Hack data backup. No saved data was changed.",
    );
  };
  if (
    !data ||
    typeof data !== "object" ||
    !("version" in data) ||
    data.version !== 1 ||
    !("games" in data) ||
    !Array.isArray(data.games)
  )
    return fail();
  const ids = new Set<string>();
  for (const item of data.games) {
    if (!item || typeof item !== "object") return fail();
    const g = item as Game;
    if (
      [
        "id",
        "event",
        "opponent",
        "date",
        "venue",
        "sheet",
        "round",
        "video",
      ].some(
        (k) => typeof (g as unknown as Record<string, unknown>)[k] !== "string",
      ) ||
      !g.id ||
      ids.has(g.id) ||
      ![8, 10].includes(g.ends) ||
      typeof g.firstHammer !== "boolean" ||
      !["live", "complete"].includes(g.status) ||
      !Array.isArray(g.players) ||
      g.players.length !== 4 ||
      g.players.some((p) => typeof p !== "string" || !p.trim()) ||
      !Array.isArray(g.shots) ||
      !Array.isArray(g.scores) ||
      g.scores.length !== g.ends + 1
    )
      return fail();
    ids.add(g.id);
    const shotIds = new Set<string>();
    const score = (n: unknown) =>
      n === null ||
      (typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= 8);
    for (const s of g.scores)
      if (
        !s ||
        !score(s.us) ||
        !score(s.them) ||
        (s.us !== null && s.them !== null && s.us > 0 && s.them > 0)
      )
        return fail();
    for (const s of g.shots) {
      if (
        !s ||
        !Number.isInteger(s.end) ||
        s.end < 1 ||
        s.end > g.ends + 1 ||
        !Number.isInteger(s.position) ||
        s.position < 0 ||
        s.position > 3 ||
        ![1, 2].includes(s.stone) ||
        s.id !== shotId(s.end, s.position, s.stone) ||
        shotIds.has(s.id) ||
        !["Draw", "Hit"].includes(s.kind) ||
        ["turn", "type", "execution", "deficiency", "review", "note"].some(
          (k) =>
            typeof (s as unknown as Record<string, unknown>)[k] !== "string",
        ) ||
        !(
          s.score === null ||
          (Number.isInteger(s.score) && s.score >= 0 && s.score <= 5)
        ) ||
        !(
          s.timestamp === null ||
          (Number.isInteger(s.timestamp) && s.timestamp >= 0)
        )
      )
        return fail();
      shotIds.add(s.id);
    }
  }
  return data as Store;
}
