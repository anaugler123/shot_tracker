import test from "node:test";
import assert from "node:assert/strict";
import { endAdvantageTone } from "../src/endAdvantage";
test("tied positions keep the workbook's different hammer shades", () => {
  assert.equal(endAdvantageTone(0, true, 0, 8), "slight-good");
  assert.equal(endAdvantageTone(0, false, 0, 8), "slight-bad");
  assert.equal(endAdvantageTone(0, false, 0, 10), "start-bad");
  assert.equal(endAdvantageTone(0, true, 9, 10), "good");
  assert.equal(endAdvantageTone(0, false, 9, 10), "bad");
});
test("score, hammer and game stage determine advantage shade", () => {
  assert.equal(endAdvantageTone(2, false, 1, 8), "slight-good");
  assert.equal(endAdvantageTone(2, true, 4, 8), "good");
  assert.equal(endAdvantageTone(2, true, 5, 8), "strong-good");
  assert.equal(endAdvantageTone(-2, false, 4, 8), "bad");
  assert.equal(endAdvantageTone(-2, false, 5, 8), "strong-bad");
  assert.equal(endAdvantageTone(-2, true, 7, 10), "bad");
  assert.equal(endAdvantageTone(-2, true, 8, 10), "strong-bad");
});
test("regulation and extra-end results use the workbook's darkest result colours", () => {
  assert.equal(endAdvantageTone(1, false, 8, 8), "win");
  assert.equal(endAdvantageTone(-1, true, 10, 10), "loss");
  assert.equal(endAdvantageTone(0, true, 8, 8), "slight-good");
  assert.equal(endAdvantageTone(-2, true, 9, 8), "loss");
  assert.equal(endAdvantageTone(8, false, 2, 8), "strong-good");
  assert.equal(endAdvantageTone(-8, true, 2, 8), "strong-bad");
});
