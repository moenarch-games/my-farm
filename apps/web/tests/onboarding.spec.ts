import { expect, test, type Page } from "@playwright/test";
import { type FarmState } from "../../../contracts/generated/ts/my-farm";

const saveKey = "my-farm.demo.save.v1";

// Independent acceptance for #132: real browser UI and Rust/WASM saves only.
// Time changes exercise elapsed simulation; no commands/outcomes are injected.
test("fresh guidance keeps gameplay usable and follows completed planting and deposit", async ({ page }) => {
  const apiRequests: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/api/")) {
      apiRequests.push(request.url());
    }
  });
  await newFarm(page);
  const guidance = page.getByRole("region", { name: "Farm guidance" });
  await expect(guidance).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Guided Tutorial" })).toHaveCount(0);
  await expect(page.getByRole("toolbar", { name: "Interaction Tools" })).toBeVisible();

  await page.getByLabel("Farm Residents").getByRole("button", { name: /Man/ }).click();
  await page.locator(".interaction-tools").getByRole("button", { name: "Seed" }).click();
  await page.locator(".interaction-tools").getByRole("menuitemradio", { name: /Wheat/ }).click();
  await page.getByLabel("Field Plot plot-1", { exact: true }).click({ force: true });
  await expect.poll(async () => (await savedFarm(page)).resident_task_queues.man?.length ?? 0).toBeGreaterThan(0);
  await expect(guidance).not.toContainText(/Harvest deposited|Bread collected/);
  await page.clock.fastForward(60_000);
  await expect(page.getByLabel("Field Plot plot-1", { exact: true })).toHaveAttribute("data-wheat-appearance", "ready");

  await page.locator(".interaction-tools").getByRole("button", { name: "Harvest", exact: true }).click();
  await page.getByLabel("Field Plot plot-1", { exact: true }).click({ force: true });
  await expect.poll(async () => (await savedFarm(page)).resident_task_queues.man?.length ?? 0).toBeGreaterThan(0);
  // Acceptance of a harvest is not evidence that its Deposit Step completed.
  // Baseline new_farm starts 6 Wheat + 3 Corn; planting costs 1 Wheat
  // and a completed Wheat harvest stores 2, so total Silo use becomes 10.
  await expect(guidance).not.toContainText("Harvest deposited");
  await page.clock.fastForward(60_000);
  await expect(page.getByTestId("storage-summary-chip")).toHaveAttribute("aria-label", /Silo 10 of 40/);
  await expect(guidance).toContainText("Harvest deposited");
  await expect(guidance).toContainText(/Oven|Bread/);
  expect(apiRequests).toEqual([]);
  await page.screenshot({ path: test.info().outputPath("first-harvest-deposited.png"), fullPage: true });
});

test("dismiss and resume help preserve the Farm and survive reload", async ({ page }) => {
  await newFarm(page);
  const guidance = page.getByRole("region", { name: "Farm guidance" });
  await expect(guidance).toBeVisible();
  const before = await savedFarm(page);
  await guidance.getByRole("button", { name: "Dismiss guidance" }).click();
  await expect(guidance).toHaveCount(0);
  await page.reload();
  await page.getByRole("button", { name: "Start Farm" }).click();
  await expect(guidance).toHaveCount(0);
  await page.getByRole("button", { name: "Resume guidance" }).click();
  await expect(guidance).toBeVisible();
  const after = await savedFarm(page);
  expect(after.inventory).toEqual(before.inventory);
  expect(after.coins).toBe(before.coins);
  expect(after.xp).toBe(before.xp);
});

test("new Farm has fresh guidance even after the previous Farm dismissed it", async ({ page }) => {
  await newFarm(page);
  await page.getByRole("region", { name: "Farm guidance" }).getByRole("button", { name: "Dismiss guidance" }).click();
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  await page.getByRole("button", { name: "New Farm" }).click();
  await expect(page.getByRole("region", { name: "Farm guidance" })).toBeVisible();
  expect((await savedFarm(page)).inventory.wheat).toBe(6);
});

test("phone guidance is dismissible and leaves scene controls reachable", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await newFarm(page);
  const guidance = page.getByRole("region", { name: "Farm guidance" });
  await expect(guidance).toBeVisible();
  const box = await guidance.boundingBox();
  expect(box).not.toBeNull();
  if (!box) {
    throw new Error("Guidance has no browser bounds");
  }
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  expect(box.height).toBeLessThan(844 / 3);
  await guidance.getByRole("button", { name: "Dismiss guidance" }).click();
  await expect(page.getByLabel("Field Plot plot-1", { exact: true })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("phone-farm-guidance.png"), fullPage: true });
});

async function newFarm(page: Page) {
  await page.clock.install();
  await page.goto("/");
  await page.getByRole("button", { name: "New Farm" }).click();
}

async function savedFarm(page: Page): Promise<FarmState> {
  return page.evaluate((key) => {
    const saved = window.localStorage.getItem(key);
    if (!saved) {
      throw new Error("Real WASM Farm has not persisted a save");
    }
    return JSON.parse(saved).farm;
  }, saveKey);
}
