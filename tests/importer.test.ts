import test from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { readWorkbook } from "../src/importer";
async function fixture(
  options: { empty?: boolean; badScore?: boolean; tenEnds?: boolean } = {},
) {
  const w = new ExcelJS.Workbook();
  const d = w.addWorksheet("Details");
  d.getCell("B3").value = "Test Event";
  d.getCell("B4").value = "April 2026";
  d.getCell("B5").value = "Test club";
  for (let i = 0; i < 4; i++) {
    d.getCell(i + 7, 2).value = "Last" + i;
    d.getCell(i + 7, 3).value = "First" + i;
  }
  const s = w.addWorksheet("Game 1");
  s.getCell("A10").value = "Shot";
  s.getCell("H10").value = "Shot Score";
  s.getCell("C3").value = "April 25";
  s.getCell("G3").value = "Team";
  s.getCell("G4").value = options.tenEnds ? 10 : 8;
  s.getCell("C5").value = "Opponent";
  if (!options.empty) {
    s.getCell("A11").value = "1A";
    s.getCell("B11").value = "CW C";
    s.getCell("C11").value = "Draw";
    s.getCell("E11").value = "Select";
    s.getCell("G11").value = "Xmiss";
    s.getCell("H11").value = options.badScore ? 6 : 0;
    s.getCell("I11").value = "Light";
    s.getCell("A12").value = "1B";
    s.getCell("K12").value = "Picked rock";
    s.getCell("A13").value = "2A";
    s.getCell("B13").value = "Select";
    s.getCell("H13").value = "Select";
  }
  const b = w.addWorksheet("Scoreboard Analysis");
  const c = options.tenEnds ? 43 : 1;
  b.getCell(8, c).value = "Game 1";
  for (let i = 1; i <= 11; i++) {
    b.getCell(9, c + i + 2).value = "0";
    b.getCell(10, c + i + 2).value = "0";
  }
  if (options.rawBoard) {
    s.getCell("AW10").value = "End";
    s.getCell("AW11").value = "Us";
    s.getCell("AW12").value = "Them";
    s.getCell("AY11").value = 0;
    s.getCell("AY12").value = 0;
    b.getCell("D9").value = { formula: "'Game 1'!AY11" };
    b.getCell("D10").value = { formula: "'Game 1'!AY12" };
  }
  const buf = await w.xlsx.writeBuffer();
  return buf as unknown as ArrayBuffer;
}
test("imports players, shot zeroes, unscored notes and ignores empty placeholders", async () => {
  const r = await readWorkbook(await fixture(), "test.xlsx");
  const g = r.games[0];
  assert.equal(g.players[0], "First0 Last0");
  assert.equal(g.shots.length, 2);
  assert.equal(g.shots[0].score, 0);
  assert.equal(g.shots[1].score, null);
  assert.equal(g.shots[1].note, "Picked rock");
  assert.equal(g.date, "2026-04-25");
  assert.deepEqual(g.scores[0], { us: 0, them: 0 });
  assert.deepEqual(g.scores[1], { us: null, them: null });
  assert.equal(g.firstHammer, true);
});
test("empty workbook with template headers reports no entered shots", async () => {
  await assert.rejects(
    () => fixture({ empty: true }).then((b) => readWorkbook(b, "test.xlsx")),
    /No entered shots/,
  );
});
test("rejects out of range scores", async () => {
  await assert.rejects(
    () => fixture({ badScore: true }).then((b) => readWorkbook(b, "test.xlsx")),
    /0 to 5/,
  );
});
test("supports the separate 10-end scoreboard block", async () => {
  const r = await readWorkbook(await fixture({ tenEnds: true }), "test.xlsx");
  assert.equal(r.games[0].ends, 10);
  assert.equal(r.games[0].scores.length, 11);
  assert.deepEqual(r.games[0].scores[0], { us: 0, them: 0 });
});

test("uses original per-game zeroes when cached analysis formulas omit their results", async () => {
  const r = await readWorkbook(await fixture({ rawBoard: true }), "test.xlsx");
  assert.deepEqual(r.games[0].scores[0], { us: 0, them: 0 });
  assert.deepEqual(r.games[0].scores[1], { us: null, them: null });
});
