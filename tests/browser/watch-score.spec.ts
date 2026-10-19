import { test, expect, type Page, type Locator } from "@playwright/test";
import { emptyShot, type Game } from "../../src/model";
function fixture(shots = 0): Game {
  return {
    id: "watch-score",
    event: "Club Cup",
    opponent: "Visitors",
    date: "2026-04-25",
    venue: "Club",
    sheet: "A",
    round: "",
    ends: 8,
    players: ["Lead", "Second", "Third", "Fourth"],
    firstHammer: true,
    status: "live",
    video: "https://www.youtube.com/watch?v=abcdefghijk",
    scores: Array.from({ length: 9 }, () => ({ us: null, them: null })),
    shots: Array.from({ length: shots }, (_, i) => ({
      ...emptyShot(1, Math.floor(i / 2), (i % 2) + 1),
      turn: "CW C",
      type: "Draw",
      execution: "Make",
      deficiency: "Make",
      score: 5,
    })),
  };
}
async function setup(page: Page, game = fixture(), fallback = false) {
  await page.addInitScript(
    ({ game, fallback }) => {
      localStorage.setItem(
        "hack.store.v1",
        JSON.stringify({ version: 1, games: [game] }),
      );
      if (fallback)
        Object.defineProperty(document, "fullscreenEnabled", {
          get: () => false,
        });
    },
    { game, fallback },
  );
  await page.route("https://www.youtube.com/iframe_api", (route) =>
    route.fulfill({
      contentType: "text/javascript",
      body: `window.__videoTime=100;window.__state=2;window.__seeks=[];window.__instances=0;window.__paused=0;window.__played=0;window.YT={Player:class{constructor(el,o){window.__instances++;this.frame=document.createElement('iframe');this.frame.src='about:blank';this.frame.style.width=o.width;this.frame.style.height=o.height;el.replaceWith(this.frame);queueMicrotask(()=>o.events.onReady({target:this}));}getIframe(){return this.frame}getCurrentTime(){return window.__videoTime}getPlayerState(){return window.__state}seekTo(n){window.__seeks.push(n)}playVideo(){window.__state=1;window.__played++}pauseVideo(){window.__state=2;window.__paused++}destroy(){this.frame.remove()}}};window.onYouTubeIframeAPIReady();`,
    }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Video review", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Play selected shot", exact: true }),
  ).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => (window as any).__instances))
    .toBe(1);
  await page
    .getByRole("button", { name: "Watch & score", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Watch and score", exact: true }),
  ).toBeVisible();
}
async function fillShot(panel: Locator) {
  await panel.getByRole("button", { name: "CW C", exact: true }).click();
  await panel
    .locator(".choice-grid.types")
    .getByRole("button", { name: "Draw", exact: true })
    .click();
  await panel
    .locator(".choice-grid.execution")
    .getByRole("button", { name: "Make", exact: true })
    .click();
  await panel.getByRole("button", { name: "Score 5", exact: true }).click();
  await panel
    .locator(".choice-grid.deficiencies")
    .getByRole("button", { name: "Make", exact: true })
    .click();
}
test("fullscreen scoring keeps the stream, captures shot time, and retains drafts when hidden", async ({
  page,
}) => {
  await setup(page);
  await expect
    .poll(() =>
      page.evaluate(() =>
        document.fullscreenElement?.classList.contains("watch-surface"),
      ),
    )
    .toBe(true);
  const panel = page.locator(".watch-score-panel");
  await panel
    .getByRole("button", { name: "Mark shot time", exact: true })
    .click();
  await page.evaluate(() => ((window as any).__videoTime = 200));
  await fillShot(panel);
  await panel.locator(".shot-details summary").click();
  await panel
    .getByRole("textbox", { name: "Coach’s note", exact: true })
    .pressSequentially("Review release");
  await expect(
    panel.getByRole("textbox", { name: "Coach’s note", exact: true }),
  ).toHaveValue("Review release");
  await page
    .getByRole("button", { name: "Hide scoring panel", exact: true })
    .click();
  await expect(panel).toBeHidden();
  await page
    .getByRole("button", { name: "Show scoring panel", exact: true })
    .click();
  await expect(
    panel.getByRole("button", { name: "Score 5", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await panel.getByLabel("Scoring panel position").selectOption("left");
  await expect(panel).toHaveClass(/left/);
  await panel
    .getByRole("button", { name: "Save & next shot", exact: true })
    .click();
  await expect(panel.locator(".watch-score-heading .shot-code")).toHaveText(
    "1B",
  );
  await fillShot(panel);
  await panel
    .getByRole("button", { name: "Save & next shot", exact: true })
    .click();
  const shots = await page.evaluate(
    () => JSON.parse(localStorage.getItem("hack.store.v1")!).games[0].shots,
  );
  expect(shots.map((s: any) => [s.id, s.timestamp])).toEqual([
    ["1A", 100],
    ["1B", 200],
  ]);
  expect(shots[0].note).toBe("Review release");
  expect(await page.evaluate(() => (window as any).__instances)).toBe(1);
  await page.getByRole("button", { name: "Pause video", exact: true }).click();
  expect(await page.evaluate(() => (window as any).__paused)).toBe(1);
  await page
    .getByRole("button", { name: "Close watch and score", exact: true })
    .click();
  await expect(page.locator(".watch-surface")).toHaveCount(0);
  await expect
    .poll(() => page.evaluate(() => document.fullscreenElement === null))
    .toBe(true);
  expect(await page.evaluate(() => (window as any).__instances)).toBe(1);
});
test("end score entry stays inside fullscreen and advances to the next end", async ({
  page,
}) => {
  await setup(page, fixture(7));
  const panel = page.locator(".watch-score-panel");
  await expect(panel.locator(".watch-score-heading .shot-code")).toHaveText(
    "1H",
  );
  await fillShot(panel);
  await panel
    .getByRole("button", { name: "Save & next shot", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "End 1 score", exact: true });
  await expect(dialog).toBeVisible();
  expect(
    await dialog.evaluate((el) => document.fullscreenElement?.contains(el)),
  ).toBe(true);
  await dialog
    .getByRole("button", { name: "2 points for our team", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Save & next end", exact: true })
    .click();
  await expect(panel.locator(".watch-score-heading .shot-code")).toHaveText(
    "2A",
  );
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("hack.store.v1")!).games[0].scores[0],
    ),
  ).toEqual({ us: 2, them: 0 });
  expect(await page.evaluate(() => (window as any).__paused)).toBe(1);
});
test("window fallback fits tablets and phones and guards unsaved shots", async ({
  page,
}) => {
  await setup(page, fixture(), true);
  const panel = page.locator(".watch-score-panel");
  for (const size of [
    { width: 1024, height: 768 },
    { width: 768, height: 1024 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(size);
    const bounds = await panel.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(size.width);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(size.height);
    if (size.width <= 900 && size.height > size.width) {
      const video = await page
        .locator(".watch-surface .video-container")
        .boundingBox();
      expect(video!.y + video!.height).toBeLessThanOrEqual(bounds!.y);
    }

    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await panel.getByRole("button", { name: "CW C", exact: true }).click();
  await expect(panel).toHaveAttribute("data-unsaved", "true");
  await panel.getByLabel("Shot player", { exact: true }).selectOption("1");
  await expect(
    page.getByRole("dialog", { name: "Unsaved shot", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Keep editing", exact: true }).click();
  await expect(
    panel.getByRole("button", { name: "CW C", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page
    .getByRole("button", { name: "Close watch and score", exact: true })
    .click();
  await page.getByRole("button", { name: "Keep scoring", exact: true }).click();
  await expect(panel).toBeVisible();
  await page
    .getByRole("button", { name: "Close watch and score", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Discard & close", exact: true })
    .click();
  await expect(page.locator(".watch-surface")).toHaveCount(0);
  expect(await page.evaluate(() => document.body.style.overflow)).not.toBe(
    "hidden",
  );
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("hack.store.v1")!).games[0].shots
          .length,
    ),
  ).toBe(0);
});

test("player accounts can review video but cannot open scoring widgets", async ({
  page,
}) => {
  const game = { ...fixture(), teamId: "default" };
  const user = {
    id: "player-test",
    name: "Player",
    email: "player@example.test",
    role: "player",
  };
  const teams = [{ id: "default", name: "Our team", role: "player" }];
  await page.addInitScript(
    ({ game, user, teams }) =>
      localStorage.setItem(
        "hack.store.v1",
        JSON.stringify({
          version: 1,
          games: [game],
          sync: {
            database: true,
            user,
            teams,
            activeTeamId: "default",
            pending: {},
            conflicts: {},
            versions: { ["default::" + game.id]: 1 },
          },
        }),
      ),
    { game, user, teams },
  );
  await page.route("**/api/config", (route) =>
    route.fulfill({ json: { database: true, setupRequired: false } }),
  );
  await page.route("**/api/me", (route) =>
    route.fulfill({ json: { user, teams, activeTeamId: "default" } }),
  );
  await page.route("**/api/games", (route) =>
    route.fulfill({ json: { games: [{ game, revision: 1 }] } }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Video review", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Video review", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Watch & score", exact: true }),
  ).toHaveCount(0);
  await expect(page.locator(".watch-score-panel")).toHaveCount(0);
});

test("bottom scoring panel keeps draft fields, saves shots, and remembers its position", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await setup(page);
  const panel = page.locator(".watch-score-panel");
  await fillShot(panel);
  await panel.getByLabel("Scoring panel position").selectOption("bottom");
  await expect(panel).toHaveClass(/bottom/);
  await expect(
    panel.getByRole("button", { name: "Score 5", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  const bounds = await panel.boundingBox();
  expect(bounds!.height).toBeLessThanOrEqual(768 * 0.34);
  expect(bounds!.y).toBeGreaterThan(768 * 0.6);
  await expect(
    panel.getByRole("combobox", { name: "Turn / target", exact: true }),
  ).toHaveValue("CW C");
  await expect(
    panel.getByRole("combobox", { name: "Shot type", exact: true }),
  ).toHaveValue("Draw:Draw");
  await panel.locator(".shot-selection summary").click();
  await expect(panel.getByLabel("Shot end", { exact: true })).toBeVisible();
  await panel.locator(".shot-selection summary").click();
  await page.screenshot({ path: "/tmp/compact-bottom.png" });
  expect(bounds!.width).toBeGreaterThan(1366 * 0.8);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(768);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await panel
    .getByRole("button", { name: "Save & next shot", exact: true })
    .click();
  await expect(panel.locator(".watch-score-heading .shot-code")).toHaveText(
    "1B",
  );
  await panel
    .getByRole("combobox", { name: "Turn / target", exact: true })
    .selectOption("CCW S");
  await panel
    .getByRole("combobox", { name: "Shot type", exact: true })
    .selectOption("Hit:Hit & Roll");
  await panel
    .getByRole("combobox", { name: "Execution", exact: true })
    .selectOption("Partial");
  await panel.getByRole("button", { name: "Score 3", exact: true }).click();
  await panel
    .getByRole("combobox", { name: "Deficiency / outcome", exact: true })
    .selectOption("Overcurl");
  await panel
    .getByRole("button", { name: "Save & next shot", exact: true })
    .click();
  const recorded = await page.evaluate(
    () => JSON.parse(localStorage.getItem("hack.store.v1")!).games[0].shots[1],
  );
  expect(recorded).toMatchObject({
    id: "1B",
    turn: "CCW S",
    kind: "Hit",
    type: "Hit & Roll",
    execution: "Partial",
    score: 3,
    deficiency: "Overcurl",
  });
  for (const size of [
    { width: 1920, height: 1080 },
    { width: 1024, height: 768 },
    { width: 768, height: 1024 },
  ]) {
    await page.setViewportSize(size);
    const box = await panel.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(size.width);
    expect(box!.y + box!.height).toBeLessThanOrEqual(size.height);
    const saveBox = await panel
      .getByRole("button", { name: "Save & next shot", exact: true })
      .boundingBox();
    expect(saveBox!.y).toBeGreaterThan(box!.y);
    expect(saveBox!.y + saveBox!.height).toBeLessThanOrEqual(
      box!.y + box!.height,
    );
    await page.screenshot({ path: `/tmp/compact-${size.width}.png` });
  }
  await page.setViewportSize({ width: 1366, height: 768 });
  expect(await page.evaluate(() => (window as any).__instances)).toBe(1);
  await page
    .getByRole("button", { name: "Close watch and score", exact: true })
    .click();
  await expect(page.locator(".review-shot-header .shot-code")).toHaveText("1A");
  await page
    .getByRole("button", { name: "Watch & score", exact: true })
    .click();
  await expect(panel.getByLabel("Scoring panel position")).toHaveValue(
    "bottom",
  );
  await panel.getByLabel("Scoring panel position").selectOption("right");
  await expect(panel).toHaveClass(/right/);
});

test("video shortcuts work from scoring buttons without saving or changing fields", async ({
  page,
}) => {
  await setup(page);
  const panel = page.locator(".watch-score-panel");
  await fillShot(panel);
  const save = panel.getByRole("button", {
    name: "Save & next shot",
    exact: true,
  });
  await save.focus();
  await page.keyboard.press("Space");
  expect(await page.evaluate(() => (window as any).__played)).toBe(1);
  await page.keyboard.press("k");
  expect(await page.evaluate(() => (window as any).__paused)).toBe(1);
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowRight");
  expect(await page.evaluate(() => (window as any).__seeks.slice(-2))).toEqual([
    95, 105,
  ]);
  await page.evaluate(() => ((window as any).__videoTime = 2));
  await page.keyboard.press("ArrowLeft");
  expect(await page.evaluate(() => (window as any).__seeks.at(-1))).toBe(0);
  await expect(panel.locator(".watch-score-heading .shot-code")).toHaveText(
    "1A",
  );
  await expect(
    panel.getByRole("button", { name: "Score 5", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await panel.getByLabel("Scoring panel position").selectOption("bottom");
  await panel.getByRole("combobox", { name: "Execution", exact: true }).focus();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("k");
  expect(await page.evaluate(() => (window as any).__seeks.at(-1))).toBe(0);
  expect(await page.evaluate(() => (window as any).__played)).toBe(1);
  await panel.locator(".shot-details summary").click();
  const note = panel.getByRole("textbox", {
    name: "Coach’s note",
    exact: true,
  });
  await note.fill("k ");
  await note.press("ArrowLeft");
  await note.press("k");
  await expect(note).toHaveValue("kk ");
  expect(await page.evaluate(() => (window as any).__played)).toBe(1);
  await page
    .getByRole("button", { name: "Close watch and score", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Unsaved shot", exact: true })
    .getByRole("button", { name: "Keep scoring" })
    .focus();
  await page.keyboard.press("k");
  expect(await page.evaluate(() => (window as any).__played)).toBe(1);
});
