import test from "node:test";
import assert from "node:assert/strict";
import {
  emptyShot,
  percentage,
  hammerAt,
  parseTime,
  timeLabel,
  videoId,
  nextShot,
  sameGame,
  total,
  type Game,
} from "../src/model";
const game = (): Game => ({
  id: "one",
  event: "Test event",
  opponent: "Visitors",
  date: "2026-04-25",
  venue: "Club",
  sheet: "A",
  round: "PreLim",
  ends: 8,
  players: ["A", "B", "C", "D"],
  firstHammer: true,
  scores: [
    { us: 0, them: 0 },
    { us: 2, them: 0 },
    { us: 0, them: 1 },
    { us: null, them: null },
  ],
  shots: [],
  status: "live",
  video: "",
});
test("shooting percentage excludes missing scores but includes zero", () => {
  assert.equal(
    percentage([
      { ...emptyShot(1, 0, 1), score: 5 },
      { ...emptyShot(1, 0, 2), score: 0 },
      emptyShot(1, 1, 1),
    ]),
    50,
  );
  assert.equal(percentage([]), null);
});
test("shot progression follows all four players and then the next end", () => {
  const g = game();
  for (let i = 0; i < 8; i++) {
    const s = nextShot(g);
    g.shots.push(s);
  }
  assert.equal(nextShot(g).id, "2A");
  assert.equal(g.shots.map((s) => s.id).join(","), "1A,1B,1C,1D,1E,1F,1G,1H");
});
test("blank ends retain hammer, scoring gives it to opposition, unknown ends stop inference", () => {
  const g = game();
  assert.equal(hammerAt(g, 2), true);
  assert.equal(hammerAt(g, 3), false);
  assert.equal(hammerAt(g, 4), true);
  assert.equal(hammerAt(g, 5), null);
  assert.deepEqual(total(g), [2, 1]);
});
test("timestamps parse and round trip without confusing hours and minutes", () => {
  for (const n of [0, 65, 3599, 3601, 7210])
    assert.equal(parseTime(timeLabel(n)), n);
  assert.equal(parseTime(""), null);
  assert.ok(Number.isNaN(parseTime("1:99")));
  assert.ok(Number.isNaN(parseTime("-1:20")));
});
test("only valid YouTube hosts and IDs are embedded", () => {
  assert.equal(
    videoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ"),
    "dQw4w9WgXcQ",
  );
  assert.equal(videoId("https://youtu.be/dQw4w9WgXcQ?t=20"), "dQw4w9WgXcQ");
  assert.equal(
    videoId("https://www.youtube.com/live/dQw4w9WgXcQ"),
    "dQw4w9WgXcQ",
  );
  assert.equal(
    videoId("https://youtube.com.attacker.com/watch?v=dQw4w9WgXcQ"),
    null,
  );
  assert.equal(videoId("javascript:alert(1)"), null);
});
test("identical imports are detected without requiring a matching ID", () => {
  const g = game();
  assert.equal(sameGame(g, { ...g, id: "other" }), true);
  assert.equal(
    sameGame(g, { ...g, id: "other", opponent: "Different team" }),
    false,
  );
});

test("backups are validated before restoring state", async () => {
  const { decodeBackup } = await import("../src/model");
  const g = game();
  g.scores = Array.from({ length: 9 }, () => ({ us: null, them: null }));
  assert.equal(
    decodeBackup(JSON.stringify({ version: 1, games: [g] })).games.length,
    1,
  );
  assert.throws(
    () =>
      decodeBackup(
        JSON.stringify({ version: 1, games: [{ ...g, players: [] }] }),
      ),
    /valid Hack/,
  );
  assert.throws(
    () =>
      decodeBackup(
        JSON.stringify({
          version: 1,
          games: [{ ...g, shots: [{ ...emptyShot(1, 0, 1), score: 10 }] }],
        }),
      ),
    /valid Hack/,
  );
  assert.throws(
    () => decodeBackup(JSON.stringify({ version: 1, games: [g, g] })),
    /valid Hack/,
  );
});
