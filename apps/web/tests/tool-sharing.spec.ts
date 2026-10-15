import { expect, test, type Page } from "@playwright/test";
import type { FarmState } from "../../../contracts/generated/ts/my-farm";

// Independent integration acceptance: actual UI, Rust/WASM and persisted saves.
// Observe authoritative state; never inject commands, stock or outcomes.
for (const width of [1280, 390]) {
  test(`manual shared Hoe commitments survive reload at viewport ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    const time = new Date("2026-10-12T00:00:00Z");
    await page.clock.install({ time });
    await page.goto("/");
    await page.getByRole("button", { name: "New Farm" }).click();
    // Let the real renderer publish its scene labels before freezing elapsed
    // time for the admission boundary. Pausing RAF before initialization would
    // prevent these actual interaction targets from being created.
    await expect(page.getByLabel("Field Plot plot-1", { exact: true })).toBeVisible();
    // Camera initialization also runs through RAF. Wait until the actual plot
    // centre accepts a pointer before pausing, including the phone layout.
    await expect.poll(() => page.getByLabel("Field Plot plot-1", { exact: true }).evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      return document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2) === element;
    })).toBe(true);
    // Schedule a future pause so the observer-to-driver round trip cannot
    // request a timestamp that has already elapsed. No work is queued yet.
    await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1_000));
    await seedWheat(page);
    for (const plot of ["plot-1", "plot-2"]) {
      await page.getByLabel(`Field Plot ${plot}`, { exact: true }).click();
    }
    await expect.poll(async () => (await saved(page)).resident_task_queues.woman?.length).toBe(2);
    const earlier = (await saved(page)).resident_task_queues.woman;
    await selectResident(page, "Man");
    await seedWheat(page);
    await page.getByLabel("Field Plot plot-3", { exact: true }).click();
    await expect.poll(async () => (await saved(page)).resident_task_queues.man?.length).toBe(1);
    const accepted = await saved(page);
    expect(accepted.resident_task_queues.woman).toEqual(earlier);
    expect(accepted.resident_inventories.woman?.tools.hoe).toBe(1);
    expect(accepted.resident_inventories.man?.tools.hoe ?? 0).toBe(0);
    expect(totalHoes(accepted)).toBe(1);

    await page.reload();
    await page.getByRole("button", { name: "Start Farm" }).click();
    // Persist the actual loaded Farm through an ordinary selection command.
    await selectResident(page, "Woman");
    const loaded = await saved(page);
    expect(loaded.resident_task_queues).toEqual(accepted.resident_task_queues);
    expect(loaded.resident_inventories).toEqual(accepted.resident_inventories);
    expect(totalHoes(loaded)).toBe(1);

    await page.clock.fastForward(180_000);
    await selectResident(page, "Man");
    const finished = await saved(page);
    expect(finished.resident_task_queues.woman ?? []).toHaveLength(0);
    expect(finished.resident_task_queues.man ?? []).toHaveLength(0);
    expect(finished.blocked_resident_tasks).toEqual({});
    expect(finished.field_plots.slice(0, 3).every((plot) => plot.crop?.item_id === "wheat")).toBe(true);
    expect(finished.inventory.wheat).toBe(3);
    expect(finished.farmhouse_tool_stock.hoe).toBe(1);
    expect(totalHoes(finished)).toBe(1);
    await page.screenshot({ path: test.info().outputPath(`shared-tool-${width}.png`), fullPage: true });
  });
}

async function seedWheat(page: Page) {
  const mobileActions = page.getByRole("navigation", { name: "Farm actions" });
  if (await mobileActions.isVisible()) {
    await mobileActions.getByRole("button", { name: "Plant", exact: true }).click();
    await page.getByLabel("Seed type").getByRole("button", { name: /Wheat/ }).click();
    return;
  }
  await page.locator(".interaction-tools").getByRole("button", { name: "Seed" }).click();
  await page.locator(".interaction-tools").getByRole("menuitemradio", { name: /Wheat/ }).click();
}

async function selectResident(page: Page, name: "Man" | "Woman") {
  if (await page.getByRole("navigation", { name: "Farm actions" }).isVisible()) {
    await page.getByLabel("Mobile farm controls")
      .getByRole("button", { name: /^(Woman|Man) \d+$/ }).click();
  }
  await page.getByLabel("Farm Residents").getByRole("button", { name: new RegExp(`^${name}\\b`) }).click();
}

async function saved(page: Page): Promise<FarmState> {
  return page.evaluate(() => {
    const value = localStorage.getItem("my-farm.demo.save.v1");
    if (!value) { throw new Error("Actual Rust/WASM Farm save is absent"); }
    return JSON.parse(value).farm;
  });
}

function totalHoes(farm: FarmState): number {
  return (farm.farmhouse_tool_stock.hoe ?? 0)
    + Object.values(farm.resident_inventories).reduce((sum, inventory) => sum + (inventory?.tools.hoe ?? 0), 0);
}
