import { expect, test, type Locator, type Page } from "@playwright/test";

// #229: authoritative harvest feedback from the pinned asset-tooling kit, driven
// through the real Pages WASM runtime and user-visible controls only.

const settingsKey = "my-farm.settings.v1";
const phone = { width: 390, height: 844 };

type FeedbackRecord = { key: string; kit: string; target: string; item: string; motion: string; sound: string; frames: string[] };

test.describe.configure({ timeout: 180_000 });

// Feedback lives ~600 ms of game-clock time; record every element that appears.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const log: Record<string, FeedbackRecord> = {};
    (window as unknown as { __farmFeedback: Record<string, FeedbackRecord> }).__farmFeedback = log;
    const record = (element: Element) => {
      const key = element.getAttribute("data-feedback-key");
      if (!key) return;
      const entry = (log[key] ??= {
        key,
        kit: element.getAttribute("data-kit") ?? "",
        target: element.getAttribute("data-target") ?? "",
        item: element.getAttribute("data-item") ?? "",
        motion: element.getAttribute("data-motion") ?? "",
        sound: "pending",
        frames: [],
      });
      const sound = element.getAttribute("data-sound");
      if (sound && sound !== "pending") entry.sound = sound;
      const frame = element.querySelector("[data-frame]")?.getAttribute("data-frame");
      if (frame && !entry.frames.includes(frame)) entry.frames.push(frame);
    };
    new MutationObserver(() => document.querySelectorAll('[data-testid="farm-feedback"]').forEach(record)).observe(document, {
      subtree: true,
      childList: true,
      attributes: true,
    });
  });
});

test("a confirmed Wheat harvest puffs at the Field Plot and pulses Wheat at the Silo, once", async ({ page }) => {
  await openFarm(page);
  const plot = await ripePlotId(page);
  const startSilo = await siloUsed(page);

  await harvestTool(page).click();
  await page.getByLabel(`Field Plot ${plot}`, { exact: true }).click();
  // Queueing a Task is not an outcome.
  await page.clock.fastForward(200);
  expect(await feedback(page)).toEqual([]);

  await advanceUntil(page, async () => (await feedback(page)).some((entry) => entry.target === "field_plot"));
  expect(await siloUsed(page)).toBe(startSilo);
  await page.screenshot({ path: test.info().outputPath("desktop-harvest-pop.png") });
  await advanceUntil(page, async () => (await feedback(page)).some((entry) => entry.target === "silo"));
  expect(await siloUsed(page)).toBeGreaterThan(startSilo);
  await page.screenshot({ path: test.info().outputPath("desktop-silo-pulse.png") });
  await page.clock.fastForward(5_000);

  const entries = await feedback(page);
  expect(entries.map(({ key, kit, target, item, motion }) => ({ key, kit, target, item, motion }))).toEqual([
    { key: expect.stringMatching(new RegExp(`^harvest:${plot}:`)), kit: "farm.harvest-pop", target: "field_plot", item: "wheat", motion: "animated" },
    { key: expect.stringMatching(/^deposit:/), kit: "ui.reward-pulse", target: "silo", item: "wheat", motion: "animated" },
  ]);
  // The player has clicked, so sound was attempted; a browser block is silent.
  for (const entry of entries) expect(["played", "blocked"]).toContain(entry.sound);
  expect(entries[0]!.frames.length).toBeGreaterThan(1);
  await expect(page.getByTestId("farm-feedback")).toHaveCount(0);

  // Reload restores a baseline only: no replayed feedback.
  await page.reload();
  await expect(page.getByRole("button", { name: "Start Farm" })).toBeVisible();
  await page.getByRole("button", { name: "Start Farm" }).click();
  await page.clock.fastForward(3_000);
  expect(await feedback(page)).toEqual([]);
});

test("operating-system reduced motion always shows the still frame", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openFarm(page);
  const plot = await ripePlotId(page);
  await harvestTool(page).click();
  await page.getByLabel(`Field Plot ${plot}`, { exact: true }).click();
  await advanceUntil(page, async () => (await feedback(page)).some((entry) => entry.target === "silo"));
  const entries = await feedback(page);
  expect(entries.length).toBe(2);
  expect(entries.every((entry) => entry.motion === "still" && entry.frames.length === 0)).toBe(true);
});

test("main-menu Sound and Reduced Motion control the kit and persist in this browser", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Settings" }).click();
  const sound = page.getByRole("checkbox", { name: "Sound" });
  const reduced = page.getByRole("checkbox", { name: "Reduced Motion" });
  await expect(sound).toBeChecked();
  await expect(reduced).not.toBeChecked();
  await sound.click();
  await expect(sound).not.toBeChecked();
  await reduced.click();
  await expect(reduced).toBeChecked();
  expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "{}"), settingsKey)).toEqual({
    sound: false,
    reducedMotion: true,
  });

  // The Farm journey below runs on the Playwright clock.
  await page.clock.install();
  await page.reload();
  await page.getByRole("button", { name: "Settings" }).click();
  await expect(page.getByRole("checkbox", { name: "Sound" })).not.toBeChecked();
  await expect(page.getByRole("checkbox", { name: "Reduced Motion" })).toBeChecked();
  await page.getByRole("button", { name: /Back/ }).click();
  await page.getByRole("button", { name: "New Farm" }).click();
  await expect(page.getByTestId("storage-summary-chip")).toBeVisible();

  const plot = await ripePlotId(page);
  await harvestTool(page).click();
  await page.getByLabel(`Field Plot ${plot}`, { exact: true }).click();
  await advanceUntil(page, async () => (await feedback(page)).some((entry) => entry.target === "silo"));
  const entries = await feedback(page);
  expect(entries.length).toBe(2);
  for (const entry of entries) {
    expect(entry.motion).toBe("still");
    expect(entry.sound).toBe("muted");
  }
});

test.describe("phone touch", () => {
  test.use({ viewport: phone, hasTouch: true, isMobile: true });

  test("phone harvest shows the same feedback", async ({ page }) => {
    await openFarm(page);
    const plot = await ripePlotId(page);
    const harvest = page.getByRole("navigation", { name: "Farm actions" }).getByRole("button", { name: "Harvest", exact: true });
    await harvest.tap();
    await page.getByLabel(`Field Plot ${plot}`, { exact: true }).tap();
    await advanceUntil(page, async () => (await feedback(page)).some((entry) => entry.target === "field_plot"));
    await page.screenshot({ path: test.info().outputPath("phone-harvest-pop.png") });
    await advanceUntil(page, async () => (await feedback(page)).some((entry) => entry.target === "silo"));
    await page.screenshot({ path: test.info().outputPath("phone-silo-pulse.png") });
    expect((await feedback(page)).map((entry) => entry.target)).toEqual(["field_plot", "silo"]);
  });
});

async function openFarm(page: Page) {
  await page.clock.install();
  await page.goto("/");
  await page.getByRole("button", { name: "New Farm" }).click();
  await expect(page.getByTestId("storage-summary-chip")).toBeVisible();
}

async function ripePlotId(page: Page): Promise<string> {
  const ripe = page.locator('[aria-label^="Field Plot "][data-crop-appearance="wheat-ready"]').first();
  await expect(ripe).toBeVisible();
  return ((await ripe.getAttribute("aria-label")) ?? "").replace(/^Field Plot /, "");
}

function harvestTool(page: Page): Locator {
  return page.getByRole("toolbar", { name: "Interaction Tools" }).getByRole("button", { name: "Harvest", exact: true });
}

async function feedback(page: Page): Promise<FeedbackRecord[]> {
  return page.evaluate(() => Object.values((window as unknown as { __farmFeedback: Record<string, FeedbackRecord> }).__farmFeedback));
}

async function siloUsed(page: Page): Promise<number> {
  const label = (await page.getByTestId("storage-summary-chip").getAttribute("aria-label")) ?? "";
  return Number(/Silo (\d+) of/.exec(label)?.[1] ?? NaN);
}

async function advanceUntil(page: Page, check: () => Promise<boolean>, stepMs = 250, maxMs = 240_000) {
  for (let elapsed = 0; elapsed <= maxMs; elapsed += stepMs) {
    if (await check()) return;
    await page.clock.fastForward(stepMs);
    await page.waitForTimeout(20);
  }
  throw new Error(`Condition not reached within ${maxMs} ms of simulated time`);
}
