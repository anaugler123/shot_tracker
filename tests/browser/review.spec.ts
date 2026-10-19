import { test, expect, type Page } from "@playwright/test";

async function mockPlayer(page: Page) {
  await page.route("https://www.youtube.com/iframe_api", (route) =>
    route.fulfill({
      contentType: "text/javascript",
      body: `
 window.__videoTime=1475;window.__playerInstances=0;window.__seeks=[];
 window.YT={Player:class {
  constructor(element,options){window.__playerInstances++;this.frame=document.createElement('iframe');this.frame.src='about:blank';this.frame.style.width=options.width||'640px';this.frame.style.height=options.height||'390px';const wrapper=document.createElement('div');wrapper.style.width=options.width||'640px';wrapper.style.height=options.height||'390px';wrapper.append(this.frame);element.replaceWith(wrapper);queueMicrotask(()=>options.events.onReady({target:this}));}
  getCurrentTime(){return window.__videoTime;}
  getIframe(){return this.frame;}
  seekTo(n){window.__seeks.push(n);}
  playVideo(){}
  destroy(){this.frame.remove();}
 }};window.onYouTubeIframeAPIReady();
 `,
    }),
  );
}

test("games are grouped by event with event filtering and date sorting", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("region", { name: "NextGen Classic games" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "New game", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Event", { exact: true }).fill("Autumn Event");
  await dialog.getByLabel("Opponent", { exact: true }).fill("Test Team");
  await dialog.getByLabel("Date", { exact: true }).fill("2026-10-01");
  await dialog.getByRole("button", { name: "Start scoring" }).click();
  await page
    .getByRole("button", { name: "Games", exact: false })
    .first()
    .click();
  await expect(page.locator(".event-group")).toHaveCount(2);
  await expect(page.locator(".event-group").first()).toHaveAttribute(
    "aria-label",
    "Autumn Event games",
  );
  await page
    .getByLabel("Filter games by event")
    .selectOption("NextGen Classic");
  await expect(page.locator(".game-card")).toHaveCount(5);
  await expect(
    page.getByRole("region", { name: "Autumn Event games" }),
  ).toHaveCount(0);
  await page.getByLabel("Sort games", { exact: true }).selectOption("oldest");
  await expect(page.locator(".game-info h3").first()).toHaveText("vs. Derksen");
  await page.getByLabel("Sort games", { exact: true }).selectOption("newest");
  await expect(page.locator(".game-info h3").first()).toHaveText("vs. Freeman");
  await page.getByLabel("Filter games by event").selectOption("all");
  await page.getByLabel("Sort games", { exact: true }).selectOption("event");
  await expect(page.locator(".event-group").first()).toHaveAttribute(
    "aria-label",
    "Autumn Event games",
  );
});

test("video capture advances without reloading the player and preserves shot details", async ({
  page,
}) => {
  // The YouTube API is mocked at its script boundary. No real stream is required
  // to verify player lifecycle, capture, seek, and persistence behavior.
  await mockPlayer(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Video review", exact: true }).click();
  await expect(page.locator(".review-shot-item").first()).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page
    .getByLabel("YouTube game stream")
    .fill("https://www.youtube.com/watch?v=abcdefghijk");
  await page.getByRole("button", { name: "Attach video", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Use current video time" }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Capture time, save & next", exact: true })
    .click();
  await expect(page.locator(".review-shot-header .shot-code")).toHaveText("1B");
  await expect(page.locator(".review-shot-item").first()).toContainText(
    "24:35",
  );
  expect(await page.evaluate(() => (window as any).__playerInstances)).toBe(1);
  await page
    .getByRole("button", { name: "Previous shot", exact: true })
    .click();
  await expect(page.getByLabel("Shot video timestamp")).toHaveValue("24:35");
  expect(await page.evaluate(() => (window as any).__seeks.at(-1))).toBe(1470);
  await page.getByLabel("Video pre-roll").selectOption("10");
  await page
    .getByRole("button", { name: "Play selected shot", exact: true })
    .click();
  expect(await page.evaluate(() => (window as any).__seeks.at(-1))).toBe(1465);
  await page.getByLabel("Coach’s note", { exact: true }).fill("Review release");
  await page
    .getByLabel("Mark for review", { exact: true })
    .selectOption("Player");
  await page.getByRole("button", { name: "Save & next", exact: true }).click();
  await expect(page.locator(".review-shot-header .shot-code")).toHaveText("1B");
  await page
    .getByRole("button", { name: "Previous shot", exact: true })
    .click();
  await expect(page.getByLabel("Coach’s note", { exact: true })).toHaveValue(
    "Review release",
  );
  await page.getByLabel("Shot video timestamp").fill("25:00");
  await page.getByRole("button", { name: "Next shot", exact: true }).click();
  await expect(
    page.getByText("Unsaved changes to shot 1A.", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Save & switch", exact: true })
    .click();
  await expect(page.locator(".review-shot-header .shot-code")).toHaveText("1B");
  await page
    .getByRole("checkbox", { name: "Without timestamp", exact: true })
    .check();
  await expect(page.locator(".review-shot-item")).toHaveCount(60);
  await page.reload();
  await page.getByRole("button", { name: "Video review", exact: true }).click();
  await expect(page.getByLabel("Shot video timestamp")).toHaveValue("25:00");
  await expect(page.getByLabel("Coach’s note", { exact: true })).toHaveValue(
    "Review release",
  );
});

test("video review layout stays inside laptop and iPad viewports", async ({
  page,
}) => {
  await mockPlayer(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Video review", exact: true }).click();
  await page
    .getByLabel("YouTube game stream")
    .fill("https://www.youtube.com/watch?v=abcdefghijk");
  await page.getByRole("button", { name: "Attach video", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Use current video time", exact: true }),
  ).toBeEnabled();
  for (const size of [
    { width: 2560, height: 1440 },
    { width: 1366, height: 768 },
    { width: 1024, height: 768 },
    { width: 768, height: 1024 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(size);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const stage = await page
      .locator(".review-workspace .video-container")
      .boundingBox();
    const frame = await page.locator(".youtube-host iframe").boundingBox();
    expect(Math.abs(frame!.x - stage!.x)).toBeLessThan(1);
    expect(Math.abs(frame!.y - stage!.y)).toBeLessThan(1);
    expect(Math.abs(frame!.width - stage!.width)).toBeLessThan(1);
    expect(Math.abs(frame!.height - stage!.height)).toBeLessThan(1);
    expect(Math.abs(stage!.width / stage!.height - 16 / 9)).toBeLessThan(0.01);
    await expect(page.locator(".review-editor")).toBeVisible();
    await expect(page.locator(".review-queue")).toBeVisible();
  }
});

test("advancing shots keeps the selection in view without scrolling the page", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Video review", exact: true }).click();
  const next = page.getByRole("button", {
    name: "Next video shot",
    exact: true,
  });
  await next.scrollIntoViewIfNeeded();
  const before = await page.evaluate(() => window.scrollY);
  for (let i = 0; i < 15; i++) await next.click();
  await expect(
    page.locator(".review-shot-item[aria-pressed=true]"),
  ).toHaveAttribute("data-shot-id", "2H");
  const visible = await page.evaluate(() => {
    const list = document
      .querySelector(".review-shot-list")!
      .getBoundingClientRect();
    const row = document
      .querySelector(".review-shot-item[aria-pressed=true]")!
      .getBoundingClientRect();
    return row.top >= list.top && row.bottom <= list.bottom + 1;
  });
  expect(visible).toBe(true);
  expect(await page.evaluate(() => window.scrollY)).toBe(before);
});
