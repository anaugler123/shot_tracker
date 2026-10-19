import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { createPool, migrate, readGame } from "../../db/database.mjs";
import { createApp } from "../../server.mjs";

test("coach/player accounts share database games, preserve offline edits, and resolve conflicts", async ({
  page,
  browser,
}) => {
  test.skip(
    !process.env.TEST_DATABASE_URL,
    "Set TEST_DATABASE_URL to run the real PostgreSQL browser workflow.",
  );
  const schema = "hack_browser_" + randomUUID().replaceAll("-", "");
  const admin = createPool(process.env.TEST_DATABASE_URL);
  await admin.query(`CREATE SCHEMA ${schema}`);
  const url = new URL(process.env.TEST_DATABASE_URL!);
  url.searchParams.set("options", `-c search_path=${schema}`);
  const pool = createPool(url.toString());
  await migrate(pool);
  const server = createApp(undefined, {
    pool,
    setupToken: "browser-setup-token",
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  let playerContext: Awaited<ReturnType<typeof browser.newContext>> | undefined;
  try {
    await page.goto(origin);
    await expect(
      page.getByRole("heading", { name: "Create the first coach account" }),
    ).toBeVisible();
    await page
      .getByLabel("Setup token", { exact: true })
      .fill("browser-setup-token");
    await page.getByLabel("Name", { exact: true }).fill("Coach");
    await page.getByLabel("Email", { exact: true }).fill("coach@example.test");
    await page
      .getByLabel("Password", { exact: true })
      .fill("browser-test-password");
    await page
      .getByRole("button", { name: "Create account", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Games", exact: true, level: 1 }),
    ).toBeVisible();
    await page.getByRole("button", { name: "New game", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Event", { exact: true }).fill("Shared Cup");
    await dialog.getByLabel("Opponent", { exact: true }).fill("Team Sync");
    await dialog.getByRole("button", { name: "Start scoring" }).click();
    await expect(page.locator(".cloud-toolbar")).toContainText(
      "Synced with team database",
    );
    const row = await pool.query("SELECT id FROM games");
    expect(row.rowCount).toBe(1);
    const gameId = row.rows[0].id;
    await page
      .getByRole("button", { name: "Team accounts", exact: true })
      .click();
    await page.getByLabel("Email", { exact: true }).fill("player@example.test");
    await page.getByRole("button", { name: "Create invitation" }).click();
    const invite = await page
      .getByRole("textbox", { name: /Invitation link/ })
      .inputValue();
    playerContext = await browser.newContext();
    const playerPage = await playerContext.newPage();
    await playerPage.goto(invite);
    await expect(
      playerPage.getByRole("heading", { name: "Join your team" }),
    ).toBeVisible();
    await playerPage.getByLabel("Name", { exact: true }).fill("Player");
    await playerPage
      .getByLabel("Password", { exact: true })
      .fill("player-browser-password");
    await playerPage
      .getByRole("button", { name: "Join team", exact: true })
      .click();
    await expect(
      playerPage.getByRole("heading", { name: "Games", exact: true, level: 1 }),
    ).toBeVisible();
    await expect(
      playerPage.getByRole("button", { name: "Live scoring", exact: true }),
    ).toHaveCount(0);
    await expect(
      playerPage.getByRole("button", { name: "New game", exact: true }),
    ).toBeDisabled();
    await page
      .getByRole("button", { name: "Live scoring", exact: true })
      .click();
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await page.context().setOffline(true);
    await page.getByRole("button", { name: "CW C", exact: true }).click();
    await page
      .getByRole("button", { name: "Draw", exact: true })
      .last()
      .click();
    await page
      .getByRole("button", { name: "Make", exact: true })
      .first()
      .click();
    await page.getByRole("button", { name: "Score 5", exact: true }).click();
    await page
      .getByRole("button", { name: "Make", exact: true })
      .last()
      .click();
    await page
      .getByRole("button", { name: "Save & next shot", exact: true })
      .click();
    await expect(page.locator(".shot-panel .shot-code")).toHaveText("1B");
    expect((await readGame(pool, gameId)).game.shots).toHaveLength(0);
    // Simulate another coach changing the same game while the first device is offline.
    const snapshot = await readGame(pool, gameId);
    const cookies = await page.context().cookies();
    const cookie = cookies.find((c) => c.name === "hack_session")!.value;
    const remote = await fetch(origin + "/api/games/" + gameId, {
      method: "PUT",
      headers: {
        Cookie: `hack_session=${cookie}`,
        Origin: origin,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        game: { ...snapshot.game, venue: "Updated by another coach" },
        expectedRevision: snapshot.revision,
      }),
    });
    expect(remote.status).toBe(200);
    await page.context().setOffline(false);
    await expect(page.locator(".sync-conflict")).toContainText("Team Sync");
    await expect(
      page.locator(".log-row").first().locator(".score-badge"),
    ).toContainText("5");
    await page
      .getByRole("button", { name: "Keep and upload my version", exact: true })
      .click();
    await expect(page.locator(".cloud-toolbar")).toContainText(
      "Synced with team database",
    );
    expect((await readGame(pool, gameId)).game.shots[0].score).toBe(5);
    await playerPage
      .getByRole("button", { name: "Sync now", exact: true })
      .click();
    await playerPage
      .locator(".game-card")
      .filter({ hasText: "Team Sync" })
      .click();
    await expect(
      playerPage.getByRole("heading", { name: "Dashboard", exact: true }),
    ).toBeVisible();
    await expect(playerPage.locator(".charts-summary")).toContainText(
      "1 scored shots",
    );
    await expect(
      playerPage.getByRole("button", {
        name: "Score / edit game",
        exact: true,
      }),
    ).toHaveCount(0);
    await page
      .getByRole("button", { name: "Manage teams", exact: true })
      .click();
    await page.getByLabel("Team name", { exact: true }).fill("Team Alpha");
    await page
      .getByRole("button", { name: "Save team name", exact: true })
      .click();
    await expect(page.getByRole("dialog").getByRole("status")).toContainText(
      "Team saved",
    );
    await page
      .getByRole("button", { name: "Close dialog", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Manage teams", exact: true })
      .click();
    await page.getByLabel("Name", { exact: true }).fill("Team Beta");
    await page
      .getByRole("button", { name: "Create team", exact: true })
      .click();
    await expect(
      page.getByLabel("Active team").locator("option:checked"),
    ).toHaveText("Team Beta");
    await expect(page.getByLabel("Active team")).toHaveValue(
      await pool
        .query("SELECT id FROM teams WHERE name='Team Beta'")
        .then((r) => r.rows[0].id),
    );
    await page
      .getByRole("button", { name: /^Games/ })
      .first()
      .click();
    await expect(page.locator(".game-card")).toHaveCount(0);
    await page.getByRole("button", { name: "New game", exact: true }).click();
    const betaDialog = page.getByRole("dialog");
    await betaDialog.getByLabel("Event", { exact: true }).fill("Beta Event");
    await betaDialog
      .getByLabel("Opponent", { exact: true })
      .fill("Beta Visitors");
    await betaDialog.getByRole("button", { name: "Start scoring" }).click();
    await expect(page.locator(".cloud-toolbar")).toContainText(
      "Synced with team database",
    );
    await page.getByLabel("Active team").selectOption({ label: "Team Alpha" });
    await expect(page.getByText("Beta Visitors", { exact: true })).toHaveCount(
      0,
    );
    await page.reload();
    await expect(
      page.getByLabel("Active team").locator("option:checked"),
    ).toHaveText("Team Alpha");
    await expect(page.getByText("Beta Visitors", { exact: true })).toHaveCount(
      0,
    );
    await page.getByLabel("Active team").selectOption({ label: "Team Beta" });
    await page
      .getByRole("button", { name: /^Games/ })
      .first()
      .click();
    await expect(page.locator(".game-card")).toHaveCount(1);
    await expect(page.locator(".game-card")).toContainText("Beta Visitors");
    await playerPage.reload();
    await expect(
      playerPage.getByLabel("Active team").locator("option"),
    ).toHaveCount(1);
    await expect(
      playerPage.getByLabel("Active team").locator("option"),
    ).toHaveText("Team Alpha");
    // An already signed-in player can join another team as a coach.
    await page
      .getByRole("button", { name: "Team accounts", exact: true })
      .click();
    await page.getByLabel("Email", { exact: true }).fill("player@example.test");
    await page
      .getByRole("combobox", { name: "Role", exact: true })
      .selectOption("coach");
    await page
      .getByRole("button", { name: "Create invitation", exact: true })
      .click();
    const betaInvite = await page
      .getByRole("textbox", { name: /Invitation link/ })
      .inputValue();
    await playerPage.goto(betaInvite);
    await expect(
      playerPage.getByRole("heading", { name: "Join your team", exact: true }),
    ).toBeVisible();
    await playerPage
      .getByLabel("Password", { exact: true })
      .fill("player-browser-password");
    await playerPage
      .getByRole("button", { name: "Join team", exact: true })
      .click();
    await expect(
      playerPage.getByLabel("Active team").locator("option:checked"),
    ).toHaveText("Team Beta");
    await expect(
      playerPage.getByRole("button", { name: "New game", exact: true }),
    ).toBeVisible();
    await playerPage
      .getByLabel("Active team")
      .selectOption({ label: "Team Alpha" });
    await expect(
      playerPage.getByRole("button", { name: "New game", exact: true }),
    ).toHaveCount(0);
  } finally {
    await playerContext?.close();
    await new Promise<void>((r) => server.close(() => r()));
    await pool.end();
    await admin.query(`DROP SCHEMA ${schema} CASCADE`);
    await admin.end();
  }
});
