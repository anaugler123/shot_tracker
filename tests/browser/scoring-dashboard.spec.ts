import { test, expect } from "@playwright/test";
import { emptyShot, type Game } from "../../src/model";
function fixture(): Game {
  return {
    id: "end-transition-game",
    event: "Club event",
    opponent: "Visitors",
    date: "2026-04-25",
    venue: "Home rink",
    sheet: "A",
    round: "",
    ends: 8,
    players: ["Lead", "Second", "Third", "Fourth"],
    firstHammer: true,
    status: "live",
    video: "",
    scores: Array.from({ length: 9 }, () => ({ us: null, them: null })),
    shots: Array.from({ length: 7 }, (_, i) => ({
      ...emptyShot(1, Math.floor(i / 2), (i % 2) + 1),
      turn: "CW C",
      type: "Draw",
      execution: "Make",
      deficiency: "Make",
      score: 5,
    })),
  };
}
test("saving the eighth shot prompts for a score and advances the end without a checkbox", async ({
  page,
}) => {
  await page.addInitScript(
    (game) =>
      localStorage.setItem(
        "hack.store.v1",
        JSON.stringify({ version: 1, games: [game] }),
      ),
    fixture(),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Live scoring", exact: true }).click();
  await expect(page.locator(".shot-panel .shot-code")).toHaveText("1H");
  await page.getByRole("button", { name: "CW C", exact: true }).click();
  await page.getByRole("button", { name: "Draw", exact: true }).last().click();
  await page.getByRole("button", { name: "Make", exact: true }).first().click();
  await page.getByRole("button", { name: "Score 5", exact: true }).click();
  await page.getByRole("button", { name: "Make", exact: true }).last().click();
  await page
    .getByRole("button", { name: "Save & next shot", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "End 1 score", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("checkbox", { name: "End has not been played" }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "2 points for our team", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Save & next end", exact: true })
    .click();
  await expect(page.locator(".shot-panel .shot-code")).toHaveText("2A");
  await expect(page.getByLabel("Shot log end")).toHaveValue("2");
  await expect(
    page.locator(".scoreboard tbody tr").first().locator("td").first(),
  ).toHaveText("2");
  await page
    .getByRole("button", { name: "Dashboard", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: "Dashboard", exact: true }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Game", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Shooting by end", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Deficiencies", exact: true }),
  ).toBeVisible();
});
test("team charts replace summary tiles and completed games open a dashboard", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".team-charts")).toBeVisible();
  await expect(page.locator(".stat-grid")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Team shooting by game" }),
  ).toBeVisible();
  await page.locator(".game-card").first().click();
  await expect(
    page.getByRole("heading", { name: "Dashboard", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Shot type performance" }),
  ).toBeVisible();
});

test("finishing early requests the current end score and opens the game dashboard", async ({
  page,
}) => {
  await page.addInitScript(
    (game) =>
      localStorage.setItem(
        "hack.store.v1",
        JSON.stringify({ version: 1, games: [game] }),
      ),
    fixture(),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Live scoring", exact: true }).click();
  await page.getByRole("button", { name: "Finish game", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page
    .getByRole("button", { name: "2 points for our team", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Save & finish game", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Dashboard", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".game-overview")).toContainText(
    "Our team 2 – 0 Visitors",
  );
  await expect(page.locator(".game-overview")).toContainText("FINAL");
});

test("end advantage uses workbook greens and reds with readable final results", async ({
  page,
}) => {
  const game = fixture();
  game.status = "complete";
  game.scores = [
    { us: 2, them: 0 },
    { us: 0, them: 1 },
    { us: 0, them: 3 },
    { us: 0, them: 0 },
    { us: 0, them: 0 },
    { us: 3, them: 0 },
    { us: 3, them: 0 },
    { us: 0, them: 0 },
    { us: null, them: null },
  ];
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
  const positions = page.locator(".position-timeline .position-state");
  await expect(positions).toHaveCount(9);
  await expect(positions.nth(1)).toHaveCSS(
    "background-color",
    "rgb(178, 255, 170)",
  );
  await expect(positions.nth(2)).toHaveCSS(
    "background-color",
    "rgb(158, 207, 153)",
  );
  await expect(positions.nth(3)).toHaveCSS(
    "background-color",
    "rgb(255, 147, 143)",
  );
  await expect(positions.nth(8)).toHaveCSS("background-color", "rgb(0, 91, 0)");
  await expect(positions.nth(8).locator("span")).toHaveCSS(
    "color",
    "rgb(255, 255, 255)",
  );
  await expect(positions.nth(3)).toContainText("With hammer");
  await expect(positions.nth(8)).toContainText("8 – 4");
});
