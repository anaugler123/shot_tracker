import { test, expect } from "@playwright/test";
import { emptyShot, type Game } from "../../src/model";
test("ice cutaway follows home/away evidence, changes exaggeration, and links to shot review", async ({
  page,
}) => {
  const game: Game = {
    id: "shape",
    event: "Test Cup",
    opponent: "Visitors",
    date: "2026-04-25",
    venue: "Club",
    sheet: "A",
    round: "",
    ends: 8,
    players: ["Lead", "Second", "Third", "Fourth"],
    firstHammer: true,
    status: "complete",
    video: "",
    scores: Array.from({ length: 9 }, () => ({ us: null, them: null })),
    shots: [1, 2].flatMap((end) =>
      [0, 1, 2, 3].map((position) => ({
        ...emptyShot(end, position, 1),
        turn: end === 1 ? "CW C" : "CCW C",
        deficiency: "Overcurl",
        score: 2,
        type: "Draw",
        execution: "Limited",
      })),
    ),
  };
  await page.addInitScript(
    (game) =>
      localStorage.setItem(
        "hack.store.v1",
        JSON.stringify({ version: 1, games: [game] }),
      ),
    game,
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Dashboard", exact: true }).click();
  await page.getByRole("tab", { name: "Game", exact: true }).click();
  await page.locator(".sheet-shape > summary").click();
  await expect(
    page.getByRole("heading", {
      name: "Possible fall toward the right",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("img", {
      name: /Possible fall toward the right, exaggerated ice cross-section/,
    }),
  ).toBeVisible();
  const surface = page.locator(".ice-surface-profile");
  const before = await surface.getAttribute("d");
  await page.getByLabel("Ice shape exaggeration").fill("5");
  expect(await surface.getAttribute("d")).not.toBe(before);
  await page.getByLabel("Sheet shape player").selectOption("1");
  await expect(
    page.getByRole("heading", {
      name: "Not enough directional evidence",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.locator(".sheet-shape-evidence")).toContainText(
    "2 usable shots",
  );
  await page.getByLabel("Sheet shape player").selectOption("all");
  await page
    .getByRole("button", { name: "View shots", exact: true })
    .first()
    .click();
  await expect(page.locator(".sheet-shape-shot-evidence button")).toHaveCount(
    4,
  );
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.locator(".sheet-shape-shot-evidence button").first().click();
  await expect(
    page.getByRole("heading", { name: "Video review", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".review-shot-header .shot-code")).toHaveText("1A");
});
