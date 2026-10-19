import test from "node:test";
import assert from "node:assert/strict";
import { emptyShot, type Game, type Shot } from "../src/model";
import { estimateSheetShape } from "../src/iceModel";
function game(shots: Shot[]): Game {
  return { shots } as Game;
}
function shot(end: number, turn: string, deficiency = "Overcurl"): Shot {
  return { ...emptyShot(end, 0, 1), turn, deficiency, score: 2 };
}
test("opposite turns in opposite directions support the same rink-side curl bias", () => {
  const shots = [
    ...Array.from({ length: 4 }, () => shot(1, "CW C")),
    ...Array.from({ length: 4 }, () => shot(2, "CCW C")),
  ];
  const away = estimateSheetShape(game(shots), "away");
  assert.equal(away.status, "directional");
  assert.equal(away.side, "right");
  assert.equal(away.right, 8);
  const home = estimateSheetShape(game(shots), "home");
  assert.equal(home.status, "directional");
  assert.equal(home.side, "left");
  assert.equal(home.left, 8);
});
test("undercurl is evidence in the opposite direction to overcurl", () => {
  const estimate = estimateSheetShape(
    game([
      shot(1, "CW S", "Undercurl"),
      shot(2, "CCW C", "Undercurl"),
      shot(1, "CCW C", "Undercurl"),
      shot(2, "CW C", "Undercurl"),
    ]),
    "away",
  );
  assert.equal(estimate.left, 2);
  assert.equal(estimate.right, 2);
  assert.equal(estimate.bias, 0);
});
test("small or one-way samples do not produce a cross-slope estimate", () => {
  assert.equal(
    estimateSheetShape(game([shot(1, "CW C")]), "away").status,
    "insufficient",
  );
  assert.equal(
    estimateSheetShape(
      game(Array.from({ length: 20 }, () => shot(1, "CW C"))),
      "away",
    ).status,
    "insufficient",
  );
});
test("opposing direction evidence remains mixed and makes dilute miss bias", () => {
  const mixed = [
    ...Array.from({ length: 4 }, () => shot(1, "CW C")),
    ...Array.from({ length: 4 }, () => shot(2, "CW C")),
  ];
  assert.equal(estimateSheetShape(game(mixed), "away").status, "mixed");
  const made = [
    ...Array.from({ length: 4 }, () => shot(1, "CW C")),
    ...Array.from({ length: 4 }, () => shot(2, "CCW C")),
    ...Array.from({ length: 40 }, () => shot(1, "CW C", "Make")),
  ];
  const estimate = estimateSheetShape(game(made), "away");
  assert.equal(estimate.status, "mixed");
  assert.equal(estimate.made, 40);
});
test("non-curl, unscored and unclassified shots are excluded; filters narrow evidence", () => {
  const list = [
    shot(1, "CW C"),
    shot(2, "CCW S"),
    shot(1, "CW C", "Light"),
    shot(1, "", "Overcurl"),
    { ...shot(1, "CW C"), score: null },
    { ...shot(1, "CW C"), kind: "Hit" as const },
    { ...shot(1, "CW C"), position: 1 },
  ];
  const estimate = estimateSheetShape(game(list), "away");
  assert.equal(estimate.evidence.length, 3);
  assert.equal(estimate.excluded, 3);
  assert.equal(
    estimateSheetShape(game(list), "away", { includeHits: true }).evidence
      .length,
    4,
  );
  assert.equal(
    estimateSheetShape(game(list), "away", { target: "S" }).evidence.length,
    1,
  );
  assert.equal(
    estimateSheetShape(game(list), "away", { player: 1 }).evidence.length,
    1,
  );
});
