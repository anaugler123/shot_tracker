export function validGame(g) {
  const str = (x, max = 200) => typeof x === "string" && x.length <= max;
  const integer = (x, min, max) => Number.isInteger(x) && x >= min && x <= max;
  if (
    !g ||
    !str(g.id) ||
    !g.id ||
    !["event", "opponent", "date", "venue", "sheet", "round", "video"].every(
      (k) => str(g[k], k === "video" ? 2000 : 200),
    ) ||
    ![8, 10].includes(g.ends) ||
    !["live", "complete"].includes(g.status) ||
    typeof g.firstHammer !== "boolean" ||
    !Array.isArray(g.players) ||
    g.players.length !== 4 ||
    !g.players.every((n) => str(n, 100) && n.trim()) ||
    !Array.isArray(g.scores) ||
    g.scores.length !== g.ends + 1 ||
    !Array.isArray(g.shots) ||
    g.shots.length > 88
  )
    return false;
  const ids = new Set();
  for (const s of g.shots) {
    if (
      !s ||
      !integer(s.end, 1, g.ends + 1) ||
      !integer(s.position, 0, 3) ||
      ![1, 2].includes(s.stone) ||
      s.id !== `${s.end}${"ABCDEFGH"[s.position * 2 + s.stone - 1]}` ||
      ids.has(s.id) ||
      !["Draw", "Hit"].includes(s.kind) ||
      !["turn", "type", "execution", "deficiency", "review"].every((k) =>
        str(s[k]),
      ) ||
      !str(s.note, 10000) ||
      !(s.score === null || integer(s.score, 0, 5)) ||
      !(s.timestamp === null || integer(s.timestamp, 0, 2147483647))
    )
      return false;
    ids.add(s.id);
  }
  return g.scores.every(
    (s) =>
      s &&
      (s.us === null || integer(s.us, 0, 8)) &&
      (s.them === null || integer(s.them, 0, 8)) &&
      !(s.us > 0 && s.them > 0),
  );
}
