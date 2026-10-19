import { test, expect } from "@playwright/test";
test("coach records, corrects and persists shots and played scoreboard ends", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Games", level: 1 }),
  ).toBeVisible();
  await expect(page.getByText("306", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "New game", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Event", { exact: true }).fill("Prototype Cup");
  await dialog.getByLabel("Opponent", { exact: true }).fill("Team Test");
  await dialog.getByLabel("Venue", { exact: true }).fill("Home rink");
  await dialog.getByRole("button", { name: "Start scoring" }).click();
  await page.getByRole("button", { name: "CW C", exact: true }).click();
  await page.getByRole("button", { name: "Draw", exact: true }).last().click();
  await page.getByRole("button", { name: "Make", exact: true }).first().click();
  await page.getByRole("button", { name: "Score 5", exact: true }).click();
  await page.getByRole("button", { name: "Make", exact: true }).last().click();
  await page.getByRole("button", { name: "Save & next shot" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "1A saved" }),
  ).toBeVisible();
  await expect(page.locator(".shot-code")).toHaveText("1B");
  await page.locator(".log-row").first().click();
  await page.getByRole("button", { name: "Score 4", exact: true }).click();
  await page.getByRole("button", { name: "Update shot", exact: true }).click();
  await expect(
    page.locator(".log-row").first().locator(".score-badge"),
  ).toContainText("4");
  await page
    .getByRole("button", { name: "Edit end 1 score", exact: true })
    .click();
  await expect(
    page.getByRole("checkbox", { name: "End has not been played" }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "2 points for our team", exact: true })
    .click();
  await page.getByRole("button", { name: "Save end score" }).click();
  await expect(
    page.locator(".scoreboard tbody tr").first().locator("td").first(),
  ).toHaveText("2");
  await page.reload();
  await page.getByRole("button", { name: "Live scoring", exact: true }).click();
  await page.getByLabel("Shot log end").selectOption("1");
  await expect(
    page.locator(".log-row").first().locator(".score-badge"),
  ).toContainText("4");
  await expect(
    page.locator(".scoreboard tbody tr").first().locator("td").first(),
  ).toHaveText("2");
});
test("imports real workbook with date confirmation and prevents duplicates", async ({
  page,
}) => {
  test.skip(
    !process.env.NEXTGEN_WORKBOOK,
    "Set NEXTGEN_WORKBOOK to exercise the uploaded workbook.",
  );
  await page.goto("/");
  await page
    .getByLabel("Import spreadsheet", { exact: true })
    .setInputFiles(process.env.NEXTGEN_WORKBOOK!);
  await expect(
    page.getByRole("heading", { name: "Review your workbook" }),
  ).toBeVisible();
  await page.getByLabel("Date for Hocevar", { exact: true }).fill("2026-04-27");
  await page.getByRole("button", { name: "Import 5 games" }).click();
  await expect(page.getByRole("status")).toContainText("Imported 5 games");
  await expect(page.getByText("306", { exact: true })).toBeVisible();
  await page
    .getByLabel("Import spreadsheet", { exact: true })
    .setInputFiles(process.env.NEXTGEN_WORKBOOK!);
  await expect(
    page.getByText("5 duplicates will be skipped", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Import 0 games" }),
  ).toBeDisabled();
});
test("production app reloads offline after its first visit", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await page.evaluate(async () => {
    const r = await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller)
      await new Promise<void>((resolve) =>
        navigator.serviceWorker.addEventListener(
          "controllerchange",
          () => resolve(),
          { once: true },
        ),
      );
    return r.active?.state;
  });
  await context.setOffline(true);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Games", level: 1 }),
  ).toBeVisible();
  await expect(page.getByText("Offline · saving on device")).toBeVisible();
  await page
    .getByRole("button", { name: "Player insights", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Player insights", level: 1 }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Live scoring", exact: true }).click();
  await page.getByLabel("Shot log end").selectOption("1");
  await page.locator(".log-row").first().click();
  await page.getByRole("button", { name: "Score 2", exact: true }).click();
  await page.getByRole("button", { name: "Update shot", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("1A updated");
  await page.reload();
  await page.getByRole("button", { name: "Live scoring", exact: true }).click();
  await page.getByLabel("Shot log end").selectOption("1");
  await expect(
    page.locator(".log-row").first().locator(".score-badge"),
  ).toContainText("2");
});
test("iPad layout stays within the viewport and supports video bookmarks", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Games", level: 1 }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Video review", exact: true }).click();
  await page.locator(".review-shot-item").first().click();
  await page.getByLabel("Shot video timestamp", { exact: true }).fill("24:35");
  await page.getByRole("button", { name: "Save timestamp" }).click();
  await expect(page.getByRole("status")).toContainText("Shot 1A saved");
  await page.reload();
  await page.getByRole("button", { name: "Video review", exact: true }).click();
  await page.locator(".review-shot-item").first().click();
  await expect(
    page.getByLabel("Shot video timestamp", { exact: true }),
  ).toHaveValue("24:35");
});

test("exports a restorable backup and does not overwrite existing games", async ({
  page,
}) => {
  await page.goto("/");
  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export data backup", exact: true })
    .click();
  const download = await downloadPromise;
  const filename = await download.path();
  expect(filename).toBeTruthy();
  await page
    .getByLabel("Restore backup file", { exact: true })
    .setInputFiles(filename!);
  await expect(
    page.getByRole("heading", { name: "Restore a data backup" }),
  ).toBeVisible();
  await expect(
    page.getByText("5 games to restore", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Restore missing games" }).click();
  await expect(page.getByRole("status")).toContainText("Restored 5 games");
  await page.reload();
  await expect(page.getByText("306", { exact: true })).toBeVisible();
  await page
    .getByLabel("Restore backup file", { exact: true })
    .setInputFiles(filename!);
  await expect(
    page.getByText("0 games to restore", { exact: true }),
  ).toBeVisible();
});
