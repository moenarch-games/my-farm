import { expect, test, type Locator, type Page } from "@playwright/test";
import { type FarmState } from "../../../contracts/generated/ts/my-farm";

// Independent acceptance for #231 (Atlas 1.5.1, 1.5.2). See
// docs/acceptance/first-minute-harvest.md for the obligation map.
//
// Rules for this file: drive the real Pages WASM runtime through user-visible
// controls only. The Farm save is READ to verify authoritative state; it is
// never written, seeded or patched, and no command is injected. Time advances
// only through the Playwright clock (elapsed simulation).

const saveKey = "my-farm.demo.save.v1";
// crates/my_farm_core/src/catalog.rs: crop("wheat", 120, 2, 1, 1) -> 2 Wheat per harvest.
const wheatHarvestQuantity = 2;
const phone = { width: 390, height: 844 };

// Journeys advance several minutes of simulated time in small observable steps.
test.describe.configure({ timeout: 180_000 });

type ResidentPair = {
  defaultId: string;
  defaultName: string;
  otherId: string;
  otherName: string;
};

test.describe("desktop", () => {
  test("new Farm opens with a ripe Wheat Field Plot and a Resident-first harvest objective", async ({ page }) => {
    await newFarm(page);
    const residents = await residentPair(page);
    expect(residents.defaultId).not.toBe(residents.otherId);

    // No planting and no waiting: the ripe Wheat is visible on entry.
    const ripe = ripeWheatField(page);
    await expect(ripe.first()).toBeVisible();
    await expectUnobscured(page, ripe.first());

    // It is real authoritative Farm state, not browser-created markup.
    const saved = await savedFarm(page);
    const ripePlotId = await plotId(ripe.first());
    const plot = saved.field_plots.find((entry) => entry.id === ripePlotId);
    expect(plot?.crop?.item_id).toBe("wheat");
    expect(plot!.crop!.ready_at_ms).toBeLessThanOrEqual(saved.last_update_ms);
    expect(Object.values(saved.resident_task_queues).every((queue) => (queue ?? []).length === 0)).toBe(true);

    // The first contextual objective is Resident -> Harvest -> Field.
    const guidance = page.getByRole("region", { name: "Farm guidance" });
    await expect(guidance).toBeVisible();
    await expect(guidance).toContainText(/Resident[\s\S]*Harvest[\s\S]*(Field Plot|field|Wheat)/i);
    await expect(guidance).not.toContainText(/\bSeed\b|\bplant\b/i);
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("the chosen non-default Resident harvests, carries and deposits the ripe Wheat", async ({ page }) => {
    await newFarm(page);
    const { defaultId, otherId, otherName } = await residentPair(page);
    const ripe = ripeWheatField(page).first();
    const ripePlotId = await plotId(ripe);
    const startSilo = await siloUsed(page);
    const startWheat = (await savedFarm(page)).inventory.wheat ?? 0;
    await page.screenshot({ path: test.info().outputPath("desktop-1-before-harvest.png") });

    await page.getByRole("region", { name: "Farm Residents" }).getByRole("button", { name: new RegExp(`^${otherName}\\b`) }).click();
    await expectWorkSelection(page, otherId, otherName);
    await desktopHarvest(page).click();
    await expect(desktopHarvest(page)).toHaveAttribute("aria-pressed", "true");
    await page.getByLabel(`Field Plot ${ripePlotId}`, { exact: true }).click();

    // Exactly the chosen Resident received the real Task; no replacement.
    await expect.poll(async () => queueLength(await savedFarm(page), otherId)).toBe(1);
    expect(queueLength(await savedFarm(page), defaultId)).toBe(0);
    const guidance = page.getByRole("region", { name: "Farm guidance" });
    await expect(guidance).toContainText(new RegExp(`\\b${otherName}\\b`));
    await expect(guidance).not.toContainText("Harvest deposited");

    // Follow the physical work: harvest at the field, then transport to the Silo.
    const marker = residentMarker(page, otherId);
    await advanceUntil(page, async () => (await marker.getAttribute("data-resident-activity")) === "harvesting");
    expect(await siloUsed(page)).toBe(startSilo);
    await advanceUntil(page, async () => isTransportingToSilo(marker));
    // Queueing, pickup, harvest and transport are not success.
    expect(await siloUsed(page)).toBe(startSilo);
    await expect(guidance).not.toContainText("Harvest deposited");
    await expect(residentMarker(page, defaultId)).toHaveAttribute("data-resident-state", "idle");
    await page.screenshot({ path: test.info().outputPath("desktop-2-during-transport.png") });

    // Success only after the actual Silo deposit.
    await advanceUntil(page, async () => (await siloUsed(page)) !== startSilo);
    expect(await siloUsed(page)).toBe(startSilo + wheatHarvestQuantity);
    await expect(guidance).toContainText("Harvest deposited");
    await expect(ripeWheatField(page)).toHaveCount(0);
    await advanceUntil(page, async () => (await marker.getAttribute("data-resident-state")) === "idle");
    await page.screenshot({ path: test.info().outputPath("desktop-3-after-deposit.png") });

    // Persist the elapsed Farm with an ordinary Resident selection, then verify
    // the authoritative receipt belongs to the chosen Resident.
    await persistBySelecting(page, defaultId);
    const after = await savedFarm(page);
    expect(after.resident_last_harvest_deposit[otherId]?.crop_id).toBe("wheat");
    expect(after.resident_last_harvest_deposit[defaultId]).toBeUndefined();
    expect(after.inventory.wheat ?? 0).toBe(startWheat + wheatHarvestQuantity);
    expect(queueLength(after, otherId)).toBe(0);
  });

  test("cancelling Harvest target picking queues nothing", async ({ page }) => {
    await newFarm(page);
    const { defaultId, otherId, otherName } = await residentPair(page);
    const ripePlotId = await plotId(ripeWheatField(page).first());
    const startSilo = await siloUsed(page);

    await page.getByRole("region", { name: "Farm Residents" }).getByRole("button", { name: new RegExp(`^${otherName}\\b`) }).click();
    await desktopHarvest(page).click();
    await expect(desktopHarvest(page)).toHaveAttribute("aria-pressed", "true");
    await page.keyboard.press("Escape");
    await expect(desktopHarvest(page)).toHaveAttribute("aria-pressed", "false");
    await page.getByLabel(`Field Plot ${ripePlotId}`, { exact: true }).click();

    await page.clock.fastForward(30_000);
    const after = await savedFarm(page);
    expect(queueLength(after, otherId)).toBe(0);
    expect(queueLength(after, defaultId)).toBe(0);
    await expect(page.getByLabel(`Field Plot ${ripePlotId}`, { exact: true })).toHaveAttribute("data-crop-appearance", "wheat-ready");
    expect(await siloUsed(page)).toBe(startSilo);
    await expect(page.getByRole("region", { name: "Farm guidance" })).not.toContainText("Harvest deposited");
  });

  test("non-ready and already-assigned targets are rejected without fake completion", async ({ page }) => {
    await newFarm(page);
    const { defaultId, defaultName, otherId, otherName } = await residentPair(page);
    const ripePlotId = await plotId(ripeWheatField(page).first());
    const startSilo = await siloUsed(page);
    const residentsRegion = page.getByRole("region", { name: "Farm Residents" });

    // Non-ready (empty) Field Plot: no Task, no stock, no completion claim.
    await residentsRegion.getByRole("button", { name: new RegExp(`^${otherName}\\b`) }).click();
    await desktopHarvest(page).click();
    const empty = page.locator('[aria-label^="Field Plot "][data-crop-appearance="none"]').first();
    await empty.click();
    await page.clock.fastForward(5_000);
    expect(queueLength(await savedFarm(page), otherId)).toBe(0);
    expect(queueLength(await savedFarm(page), defaultId)).toBe(0);

    // Occupied: the field already belongs to the chosen Resident's Task.
    await page.getByLabel(`Field Plot ${ripePlotId}`, { exact: true }).click();
    await expect.poll(async () => queueLength(await savedFarm(page), otherId)).toBe(1);
    await residentsRegion.getByRole("button", { name: new RegExp(`^${defaultName}\\b`) }).click();
    await expectWorkSelection(page, defaultId, defaultName);
    await desktopHarvest(page).click();
    await page.getByLabel(`Field Plot ${ripePlotId}`, { exact: true }).click();
    await page.clock.fastForward(500);
    expect(queueLength(await savedFarm(page), defaultId)).toBe(0);
    expect(queueLength(await savedFarm(page), otherId)).toBe(1);

    // Exactly one deposit, by the original Resident.
    await advanceUntil(page, async () => (await siloUsed(page)) !== startSilo);
    await page.clock.fastForward(120_000);
    expect(await siloUsed(page)).toBe(startSilo + wheatHarvestQuantity);
    await persistBySelecting(page, otherId);
    const after = await savedFarm(page);
    expect(after.resident_last_harvest_deposit[otherId]?.crop_id).toBe("wheat");
    expect(after.resident_last_harvest_deposit[defaultId]).toBeUndefined();
  });

  test("reload during the harvest preserves status without duplicating stock or completion", async ({ page }) => {
    await newFarm(page);
    const { defaultId, otherId, otherName } = await residentPair(page);
    const ripePlotId = await plotId(ripeWheatField(page).first());
    const startSilo = await siloUsed(page);

    await page.getByRole("region", { name: "Farm Residents" }).getByRole("button", { name: new RegExp(`^${otherName}\\b`) }).click();
    await desktopHarvest(page).click();
    await page.getByLabel(`Field Plot ${ripePlotId}`, { exact: true }).click();
    await expect.poll(async () => queueLength(await savedFarm(page), otherId)).toBe(1);
    const marker = residentMarker(page, otherId);
    await advanceUntil(page, async () => (await marker.getAttribute("data-resident-state")) !== "idle");

    await page.reload();
    await page.getByRole("button", { name: "Start Farm" }).click();
    // Real status survives: still working, not yet deposited.
    await expect(residentMarker(page, otherId)).not.toHaveAttribute("data-resident-state", "idle");
    expect(await siloUsed(page)).toBe(startSilo);
    await expect(page.getByRole("region", { name: "Farm guidance" })).not.toContainText("Harvest deposited");

    await advanceUntil(page, async () => (await siloUsed(page)) !== startSilo);
    await page.clock.fastForward(120_000);
    expect(await siloUsed(page)).toBe(startSilo + wheatHarvestQuantity);
    await expect(page.getByRole("region", { name: "Farm guidance" })).toContainText("Harvest deposited");

    // A second reload after completion neither re-deposits nor re-completes.
    await persistBySelecting(page, defaultId);
    const settled = await savedFarm(page);
    await page.reload();
    await page.getByRole("button", { name: "Start Farm" }).click();
    await page.clock.fastForward(120_000);
    expect(await siloUsed(page)).toBe(startSilo + wheatHarvestQuantity);
    await persistBySelecting(page, otherId);
    const reloaded = await savedFarm(page);
    expect(reloaded.inventory).toEqual(settled.inventory);
    expect(reloaded.resident_last_harvest_deposit).toEqual(settled.resident_last_harvest_deposit);
    expect(queueLength(reloaded, otherId)).toBe(0);
  });

  test("keyboard-only Resident -> Harvest -> Field assignment", async ({ page }) => {
    await newFarm(page);
    const { defaultId, otherId, otherName } = await residentPair(page);
    const ripePlotId = await plotId(ripeWheatField(page).first());

    await tabTo(page, page.getByRole("region", { name: "Farm Residents" }).getByRole("button", { name: new RegExp(`^${otherName}\\b`) }));
    await page.keyboard.press("Enter");
    await expectWorkSelection(page, otherId, otherName);
    await tabTo(page, desktopHarvest(page));
    await page.keyboard.press("Enter");
    await expect(desktopHarvest(page)).toHaveAttribute("aria-pressed", "true");
    const field = page.getByLabel(`Field Plot ${ripePlotId}`, { exact: true });
    await tabTo(page, field);
    // Keyboard users must see which Field Plot Enter will activate. Inspect
    // the target and any DOM/pseudo cue without choosing its color or shape.
    const hasVisibleFocusCue = await field.evaluate((target) => {
      const opacityAt = (element: Element) => {
        let opacity = 1;
        for (let ancestor: Element | null = element; ancestor; ancestor = ancestor.parentElement) {
          opacity *= Number(getComputedStyle(ancestor).opacity);
        }
        return opacity;
      };
      return [target, ...target.querySelectorAll("*")].some((element) => {
        if (opacityAt(element) === 0) {
          return false;
        }
        return [null, "::before", "::after"].some((pseudo) => {
          const style = getComputedStyle(element, pseudo);
          if (pseudo && (style.content === "none" || style.content === "normal")) {
            return false;
          }
          const outline = style.outlineStyle !== "none" && Number.parseFloat(style.outlineWidth) > 0;
          const shadow = style.boxShadow !== "none";
          return style.visibility === "visible" && Number(style.opacity) > 0 && (outline || shadow);
        });
      });
    });
    await page.screenshot({ path: test.info().outputPath("keyboard-field-focused.png") });
    expect(hasVisibleFocusCue, "Keyboard focus must visibly identify the ripe Field Plot").toBe(true);
    await page.keyboard.press("Enter");

    await expect.poll(async () => queueLength(await savedFarm(page), otherId)).toBe(1);
    expect(queueLength(await savedFarm(page), defaultId)).toBe(0);
  });
});

// Regression for a suspended/throttled UI clock when the player returns to
// the menu and starts a fresh Farm. No Farm state or command is injected.
for (const input of ["pointer", "keyboard"] as const) {
  test(`immediate ${input} harvest after menu clock suspension`, async ({ page }) => {
    const openedAt = new Date("2026-10-15T12:00:00Z");
    await page.clock.install({ time: openedAt });
    // Freeze before App mounts, so its first periodic tick is still pending.
    await page.clock.pauseAt(openedAt.getTime() + 100);
    await page.goto("/");
    await expect(page.getByRole("region", { name: "Main menu" })).toBeVisible();
    // Hold scheduled callbacks, then move wall time forward as after a
    // suspended tab. setSystemTime does not execute the periodic UI callback.
    const beforeDwell = await page.evaluate(() => Date.now());
    await page.clock.setSystemTime(beforeDwell + 60_000);
    await page.getByRole("button", { name: "New Farm" }).click();
    // Publish the real scene/camera after async assets load, allowing at most
    // 960 ms of RAF time, below the first 2500 ms UI polling tick. Timers stay
    // paused during the subsequent actual Resident/Harvest/Field interaction.
    for (let frame = 0; frame < 60; frame += 1) {
      await page.clock.runFor(16);
      if (await page.getByRole("button", { name: /Farm Resident$/ }).count() === 2) {
        break;
      }
      await page.waitForTimeout(25);
    }
    await expect(page.getByTestId("storage-summary-chip")).toBeVisible();
    const { defaultId, otherId, otherName } = await residentPair(page);
    const fresh = await savedFarm(page);
    const wallNow = await page.evaluate(() => Date.now());
    const ripe = fresh.field_plots.find((plot) =>
      plot.crop?.item_id === "wheat" && plot.crop.ready_at_ms <= wallNow,
    );
    expect(ripe, "New Farm has authoritative ready Wheat immediately after the menu dwell").toBeTruthy();
    const field = page.getByLabel(`Field Plot ${ripe!.id}`, { exact: true });
    const resident = page.getByRole("region", { name: "Farm Residents" })
      .getByRole("button", { name: new RegExp(`^${otherName}\\b`) });
    const startSilo = await siloUsed(page);
    const startWheat = fresh.inventory.wheat ?? 0;

    if (input === "pointer") {
      await resident.click();
      await desktopHarvest(page).click();
      await field.click();
    } else {
      await tabTo(page, resident);
      await page.keyboard.press("Enter");
      await tabTo(page, desktopHarvest(page));
      await page.keyboard.press("Enter");
      await tabTo(page, field);
      await page.keyboard.press("Enter");
    }
    // Actual assignment must happen without a prerequisite polling tick or
    // another action/time advance. Observe the real persisted chosen queue.
    expect(await page.evaluate(() => Date.now())).toBe(wallNow);
    await expectWorkSelection(page, otherId, otherName);
    await test.info().attach("immediate-harvest-clock-boundary", {
      contentType: "application/json",
      body: JSON.stringify({
        input, beforeDwell, wallNow, authoritativeReadyAt: ripe!.crop!.ready_at_ms,
        savedLastUpdate: fresh.last_update_ms,
        renderedAppearance: await field.getAttribute("data-crop-appearance"),
        selectedResident: (await savedFarm(page)).selected_resident_id,
        chosenQueueLength: queueLength(await savedFarm(page), otherId),
      }),
    });
    await expect.poll(async () => queueLength(await savedFarm(page), otherId)).toBe(1);
    expect(queueLength(await savedFarm(page), defaultId)).toBe(0);
    expect(await siloUsed(page)).toBe(startSilo);
    expect((await savedFarm(page)).resident_last_harvest_deposit[otherId]).toBeUndefined();

    // Time may advance only after the immediate command was accepted. The
    // ordinary physical task must still deposit once for the chosen Resident.
    await advanceUntil(page, async () => (await siloUsed(page)) !== startSilo);
    expect(await siloUsed(page)).toBe(startSilo + wheatHarvestQuantity);
    await persistBySelecting(page, defaultId);
    const finished = await savedFarm(page);
    expect(finished.resident_last_harvest_deposit[otherId]?.crop_id).toBe("wheat");
    expect(finished.resident_last_harvest_deposit[defaultId]).toBeUndefined();
    expect(finished.inventory.wheat ?? 0).toBe(startWheat + wheatHarvestQuantity);
  });
}

test.describe("phone touch", () => {
  test.use({ viewport: phone, hasTouch: true, isMobile: true });

  test("narrow touch viewport completes the first-minute harvest without obscured targets", async ({ page }) => {
    await newFarm(page);
    const { defaultId, otherId, otherName } = await residentPair(page);
    const ripe = ripeWheatField(page).first();
    const ripePlotId = await plotId(ripe);
    const field = page.getByLabel(`Field Plot ${ripePlotId}`, { exact: true });
    const startSilo = await siloUsed(page);
    await expect(field).toBeVisible();
    await expectUnobscured(page, field);
    await page.screenshot({ path: test.info().outputPath("phone-1-before-harvest.png") });

    const marker = residentMarker(page, otherId);
    await expectUnobscured(page, marker);
    await marker.tap();
    await expect.poll(async () => (await savedFarm(page)).selected_resident_id).toBe(otherId);

    const harvest = page.getByRole("navigation", { name: "Farm actions" }).getByRole("button", { name: "Harvest", exact: true });
    await expectUnobscured(page, harvest);
    await harvest.tap();
    await expect(harvest).toHaveAttribute("aria-pressed", "true");

    await expectUnobscured(page, field);
    const before = await field.boundingBox();
    await field.tap();
    // A tap selects the target; it is not a camera gesture.
    const afterTap = await field.boundingBox();
    expect(before && afterTap).toBeTruthy();
    expect(Math.abs(afterTap!.x - before!.x)).toBeLessThanOrEqual(4);
    expect(Math.abs(afterTap!.y - before!.y)).toBeLessThanOrEqual(4);

    await expect.poll(async () => queueLength(await savedFarm(page), otherId)).toBe(1);
    expect(queueLength(await savedFarm(page), defaultId)).toBe(0);
    await expect(page.getByRole("region", { name: "Farm guidance" })).toContainText(new RegExp(`\\b${otherName}\\b`));

    const residentMarkerNow = residentMarker(page, otherId);
    await advanceUntil(page, async () => isTransportingToSilo(residentMarkerNow));
    expect(await siloUsed(page)).toBe(startSilo);
    await page.screenshot({ path: test.info().outputPath("phone-2-during-transport.png") });

    await advanceUntil(page, async () => (await siloUsed(page)) !== startSilo);
    expect(await siloUsed(page)).toBe(startSilo + wheatHarvestQuantity);
    await expect(page.getByRole("region", { name: "Farm guidance" })).toContainText("Harvest deposited");
    await page.screenshot({ path: test.info().outputPath("phone-3-after-deposit.png") });
  });

  test("phone cancel of Harvest target picking queues nothing", async ({ page }) => {
    await newFarm(page);
    const { defaultId, otherId } = await residentPair(page);
    const ripePlotId = await plotId(ripeWheatField(page).first());
    await residentMarker(page, otherId).tap();
    await expect.poll(async () => (await savedFarm(page)).selected_resident_id).toBe(otherId);
    const actions = page.getByRole("navigation", { name: "Farm actions" });
    await actions.getByRole("button", { name: "Harvest", exact: true }).tap();
    await actions.getByRole("button", { name: "Select", exact: true }).tap();
    await expect(actions.getByRole("button", { name: "Harvest", exact: true })).toHaveAttribute("aria-pressed", "false");
    await page.getByLabel(`Field Plot ${ripePlotId}`, { exact: true }).tap();
    await page.clock.fastForward(30_000);
    const after = await savedFarm(page);
    expect(queueLength(after, otherId)).toBe(0);
    expect(queueLength(after, defaultId)).toBe(0);
    await expect(page.getByLabel(`Field Plot ${ripePlotId}`, { exact: true })).toHaveAttribute("data-crop-appearance", "wheat-ready");
  });
});

async function newFarm(page: Page) {
  await page.clock.install();
  await page.goto("/");
  await page.getByRole("button", { name: "New Farm" }).click();
  await expect(page.getByTestId("storage-summary-chip")).toBeVisible();
}

function ripeWheatField(page: Page): Locator {
  return page.locator('[aria-label^="Field Plot "][data-crop-appearance="wheat-ready"]');
}

function desktopHarvest(page: Page): Locator {
  return page.getByRole("toolbar", { name: "Interaction Tools" }).getByRole("button", { name: "Harvest", exact: true });
}

function residentMarker(page: Page, residentId: string): Locator {
  return page.getByTestId(`farm-scene-resident-${residentId}`);
}

async function residentPair(page: Page): Promise<ResidentPair> {
  const markers = page.getByRole("button", { name: /Farm Resident$/ });
  await expect(markers).toHaveCount(2);
  const entries = await Promise.all(
    [0, 1].map(async (index) => {
      const marker = markers.nth(index);
      const testId = (await marker.getAttribute("data-testid")) ?? "";
      const label = (await marker.getAttribute("aria-label")) ?? "";
      return { id: testId.replace("farm-scene-resident-", ""), name: label.replace(/ Farm Resident$/, "") };
    }),
  );
  // The authoritative default work selection of the fresh Farm.
  const defaultId = (await savedFarm(page)).selected_resident_id;
  const selected = entries.find((entry) => entry.id === defaultId);
  const other = entries.find((entry) => entry.id !== defaultId);
  expect(selected, "default Resident is one of the two scene Residents").toBeTruthy();
  expect(other, "a second, non-default Resident exists").toBeTruthy();
  return { defaultId, defaultName: selected!.name, otherId: other!.id, otherName: other!.name };
}

// Desktop: the compact Farm Residents selector shows the work selection, and
// the authoritative Farm records it.
async function expectWorkSelection(page: Page, residentId: string, name: string) {
  await expect(
    page.getByRole("region", { name: "Farm Residents" }).getByRole("button", { name: new RegExp(`^${name}\\b`) }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect.poll(async () => (await savedFarm(page)).selected_resident_id).toBe(residentId);
}

async function plotId(field: Locator): Promise<string> {
  await expect(field, "a ripe Wheat Field Plot is visible on the new Farm").toBeVisible();
  const label = await field.getAttribute("aria-label");
  const id = label?.replace(/^Field Plot /, "");
  if (!id) {
    throw new Error("Field Plot target has no accessible plot id");
  }
  return id;
}

async function siloUsed(page: Page): Promise<number> {
  const label = (await page.getByTestId("storage-summary-chip").getAttribute("aria-label")) ?? "";
  const match = /Silo (\d+) of (\d+)/.exec(label);
  if (!match) {
    throw new Error(`Storage summary has no Silo count: ${label}`);
  }
  return Number(match[1]);
}

async function isTransportingToSilo(marker: Locator): Promise<boolean> {
  const target = (await marker.getAttribute("data-resident-target")) ?? "";
  const state = await marker.getAttribute("data-resident-state");
  const activity = await marker.getAttribute("data-resident-activity");
  return /Silo/i.test(target) && (state === "walking" || activity === "depositing_inventory");
}

// Advance only elapsed simulation time, in small steps so intermediate
// physical stages remain observable.
async function advanceUntil(page: Page, check: () => Promise<boolean>, stepMs = 250, maxMs = 240_000) {
  for (let elapsed = 0; elapsed <= maxMs; elapsed += stepMs) {
    if (await check()) {
      return;
    }
    await page.clock.fastForward(stepMs);
    await page.waitForTimeout(25);
  }
  throw new Error(`Condition not reached within ${maxMs} ms of simulated time`);
}

async function persistBySelecting(page: Page, residentId: string) {
  await residentMarker(page, residentId).click();
  await expect.poll(async () => (await savedFarm(page)).selected_resident_id).toBe(residentId);
}

async function tabTo(page: Page, target: Locator, maxTabs = 250) {
  const handle = await target.elementHandle();
  if (!handle) {
    throw new Error("Keyboard target is not rendered");
  }
  for (let index = 0; index < maxTabs; index += 1) {
    if (await handle.evaluate((element) => element === document.activeElement)) {
      return;
    }
    await page.keyboard.press("Tab");
  }
  throw new Error("Keyboard target is not reachable with Tab");
}

async function expectUnobscured(page: Page, target: Locator) {
  await target.scrollIntoViewIfNeeded();
  const box = await target.boundingBox();
  expect(box, "target has browser bounds").not.toBeNull();
  const viewport = page.viewportSize()!;
  const cx = box!.x + box!.width / 2;
  const cy = box!.y + box!.height / 2;
  expect(cx).toBeGreaterThanOrEqual(0);
  expect(cy).toBeGreaterThanOrEqual(0);
  expect(cx).toBeLessThanOrEqual(viewport.width);
  expect(cy).toBeLessThanOrEqual(viewport.height);
  const hit = await target.evaluate(
    (element, point) => {
      const top = document.elementFromPoint(point.x, point.y);
      return Boolean(top && (top === element || element.contains(top)));
    },
    { x: cx, y: cy },
  );
  expect(hit, "target is the topmost element at its centre").toBe(true);
}

function queueLength(farm: FarmState, residentId: string): number {
  return farm.resident_task_queues[residentId]?.length ?? 0;
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
