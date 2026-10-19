import { test, expect } from "@playwright/test";
import { emptyShot, type Game } from "../../src/model";
function game(id: string, event: string, date: string): Game {
  return {
    id,
    event,
    date,
    opponent: id,
    venue: "Club",
    sheet: "A",
    round: "",
    ends: 8,
    players: ["A", "B", "C", "D"],
    firstHammer: true,
    status: "complete",
    video: "",
    scores: Array.from({ length: 9 }, () => ({ us: null, them: null })),
    shots: [
      {
        ...emptyShot(1, 0, 1),
        score: 5,
        turn: "CW C",
        type: "Draw",
        execution: "Make",
        deficiency: "Make",
      },
    ],
  };
}
test("one dashboard drills from season and date range to event and game", async ({
  page,
}) => {
  await page.addInitScript(
    (games) =>
      localStorage.setItem(
        "hack.store.v1",
        JSON.stringify({ version: 1, games }),
      ),
    [
      game("Spring 1", "Spring Cup", "2026-04-25"),
      game("Spring 2", "Spring Cup", "2026-04-26"),
      game("Fall 1", "Fall Cup", "2026-09-25"),
      game("Undated", "Spring Cup", ""),
    ],
  );
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Dashboard", exact: true }),
  ).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "Player insights", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Dashboard", exact: true }).click();
  await page.getByLabel("Dashboard season").selectOption("2025");
  await expect(page.locator(".charts-summary")).toContainText("2 games");
  await expect(page.getByLabel("Dashboard start date")).toHaveValue(
    "2025-07-01",
  );
  await page.getByRole("button", { name: "Spring Cup", exact: true }).click();
  await expect(
    page.getByRole("tab", { name: "Event", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(page.getByLabel("Dashboard event")).toHaveValue("Spring Cup");
  await page.getByRole("button", { name: "Spring 1", exact: true }).click();
  await expect(
    page.getByRole("tab", { name: "Game", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(page.getByLabel("Dashboard game")).toHaveValue("Spring 1");
  await expect(page.locator(".game-overview")).toContainText("Spring 1");
  await page.getByRole("tab", { name: "Season", exact: true }).click();
  await page.getByLabel("Dashboard start date").fill("2026-04-26");
  await expect(page.locator(".charts-summary")).toContainText("1 games");
  await page.getByRole("checkbox", { name: "Include undated" }).check();
  await expect(page.locator(".charts-summary")).toContainText("2 games");
  await page.getByLabel("Dashboard end date").fill("2026-01-01");
  await expect(page.getByRole("alert")).toContainText("start date");
  await expect(page.locator(".charts-summary")).toContainText("0 games");
});
test("local teams can be renamed and switched without mixing their games", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Manage teams", exact: true }).click();
  await page.getByLabel("Team name", { exact: true }).fill("Team Alpha");
  await page
    .getByRole("button", { name: "Save team name", exact: true })
    .click();
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await expect(
    page.getByLabel("Active team").locator("option:checked"),
  ).toHaveText("Team Alpha");
  await page.getByRole("button", { name: "Manage teams", exact: true }).click();
  await page.getByLabel("Name", { exact: true }).fill("Team Beta");
  await page.getByRole("button", { name: "Create team", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Dashboard", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: /^Games/ })
    .first()
    .click();
  await expect(page.locator(".game-card")).toHaveCount(0);
  await page.getByLabel("Active team").selectOption({ label: "Team Alpha" });
  await page
    .getByRole("button", { name: /^Games/ })
    .first()
    .click();
  await expect(page.locator(".game-card")).toHaveCount(5);
  await page.reload();
  await expect(
    page.getByLabel("Active team").locator("option:checked"),
  ).toHaveText("Team Alpha");
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.getByRole("button", { name: "Dashboard", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Dashboard", exact: true }),
  ).toBeVisible();
  const selector = await page.getByLabel("Active team").boundingBox();
  expect(selector!.width).toBeGreaterThanOrEqual(44);
  expect(selector!.height).toBeGreaterThanOrEqual(44);
  const manage = await page
    .getByRole("button", { name: "Manage teams", exact: true })
    .boundingBox();
  const gamesNav = await page
    .getByRole("button", { name: /^Games/ })
    .first()
    .boundingBox();
  expect(manage!.y + manage!.height).toBeLessThanOrEqual(gamesNav!.y);
});
