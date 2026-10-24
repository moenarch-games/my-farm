import { mkdir } from "node:fs/promises";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

const saveKey = "my-farm.demo.save.v1";
const evidencePath = path.resolve("crop-evidence");
const crops = ["wheat", "corn"] as const;
type Crop = (typeof crops)[number];

type DemoRuntime = {
  command_json(request: string, nowMs: number): string;
  farm_json(nowMs: number): string;
  save_json(): string;
};
type DemoModule = {
  default(): Promise<unknown>;
  DemoFarmRuntime: new (save: string | undefined, nowMs: number) => DemoRuntime;
};
declare global {
  interface Window {
    __myFarmWasmModule?: DemoModule;
  }
}

async function loadWasm(page: Page) {
  await page.evaluate(async () => {
    const existing = window.__myFarmWasmModule;
    if (existing) return;
    const wasm = (await Function("return import('/src/generated/my_farm_wasm/my_farm_wasm.js')")()) as DemoModule;
    await wasm.default();
    window.__myFarmWasmModule = wasm;
  });
}

// Create the crop through the actual WASM command and resident work queue; only
// fixture timestamps are adjusted afterwards to exercise each render selection.
async function seedPlantedCrop(page: Page, crop: Crop) {
  await page.goto("/");
  await loadWasm(page);
  await page.evaluate(({ key, crop }) => {
    const wasm = window.__myFarmWasmModule!;
    let runtime = new wasm.DemoFarmRuntime(undefined, 1_000);
    if (crop === "corn") {
      // Corn unlocks at level 2; reuse the scenario fixtures' level-two progression.
      const start = JSON.parse(runtime.save_json());
      start.farm.xp = 4;
      start.farm.level = 2;
      runtime = new wasm.DemoFarmRuntime(JSON.stringify(start), 1_000);
    }
    const response = JSON.parse(runtime.command_json(JSON.stringify({
      expected_version: 0,
      command: { type: "sweep_plant", crop_id: crop, plot_ids: ["plot-1"] },
    }), 1_000)) as { accepted: boolean; error: string | null };
    if (!response.accepted) throw new Error(response.error ?? `${crop} planting rejected`);
    runtime.farm_json(1_000_000);
    const save = JSON.parse(runtime.save_json());
    const plot = save.farm.field_plots.find((entry: { id: string }) => entry.id === "plot-1");
    if (!plot?.crop || plot.crop.item_id !== crop) throw new Error(`Resident did not plant ${crop}`);
    const now = Date.now();
    plot.crop.planted_at_ms = now - 1_000;
    plot.crop.ready_at_ms = now + 300_000;
    save.farm.last_update_ms = now;
    window.localStorage.setItem(key, JSON.stringify(save));
  }, { key: saveKey, crop });
}

async function changeCropProgress(page: Page, fraction: number) {
  await page.evaluate(({ key, fraction }) => {
    const save = JSON.parse(window.localStorage.getItem(key)!);
    const plot = save.farm.field_plots.find((entry: { id: string }) => entry.id === "plot-1");
    if (!plot?.crop) throw new Error("Expected saved crop");
    const now = Date.now();
    plot.crop.planted_at_ms = now - Math.round(100_000 * fraction);
    plot.crop.ready_at_ms = now + Math.round(100_000 * (1 - fraction));
    save.farm.last_update_ms = now;
    window.localStorage.setItem(key, JSON.stringify(save));
  }, { key: saveKey, fraction });
}

async function startSavedFarm(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Start Farm" }).click();
  await expect(page.getByLabel("Field Plot plot-1")).toBeVisible();
}

async function screenshot(page: Page, crop: Crop, file: string) {
  await mkdir(evidencePath, { recursive: true });
  await page.screenshot({ path: path.join(evidencePath, `${crop}-${file}`), animations: "disabled" });
}

async function waitForGeneratedArt(page: Page, name: string) {
  await expect.poll(async () => page.evaluate((filename) =>
    performance.getEntriesByType("resource").some((entry) => entry.name.endsWith(filename)),
  name), { timeout: 15_000 }).toBe(true);
}

test("published asset-tooling Crops and soil are actual pinned web resources", async ({ request }) => {
  const manifest = await request.get("/farm-art/manifest.json");
  expect(manifest.ok()).toBe(true);
  const data = await manifest.json();
  expect(data.assetToolingCommit).toBe("98e6356047733d4dbf63eb197a0ec2e3813d86f4");
  const names = Object.keys(data.files);
  expect(names).toContain("farmhouse-toy.glb");
  expect(names).toContain("silo-toy.glb");
  for (const crop of crops) {
    for (const stage of ["early", "mature-straw", "harvested"]) {
      expect(names).toContain(`${crop}-${stage}.glb`);
      expect(names).toContain(`${crop}-${stage}.png`);
    }
  }
  for (const [name, metadata] of Object.entries(data.files) as Array<[string, { byteLength: number }]>) {
    const response = await request.get(`/farm-art/${name}`);
    expect(response.ok(), name).toBe(true);
    const bytes = await response.body();
    expect(bytes.length, name).toBe(metadata.byteLength);
    if (name.endsWith(".glb")) {
      expect(bytes.subarray(0, 4).toString("ascii"), name).toBe("glTF");
    } else if (name.endsWith(".wav")) {
      expect(bytes.subarray(0, 4).toString("ascii"), name).toBe("RIFF");
    } else if (name.endsWith(".json")) {
      expect(JSON.parse(bytes.toString("utf8")).schemaVersion, name).toBe(1);
    } else {
      expect(bytes.subarray(0, 8).toString("hex"), name).toBe("89504e470d0a1a0a");
    }
  }
});

for (const crop of crops) {
  const label = crop === "wheat" ? "Wheat" : "Corn";
  test(`${label} appearance follows planted Crop state through progress, harvest and reload`, async ({ page }) => {
    test.setTimeout(120_000);
    // Stable overview screenshots; separate pure tests verify the active wind motion.
    await page.emulateMedia({ reducedMotion: "reduce" });
    await seedPlantedCrop(page, crop);
    await startSavedFarm(page);
    const field = page.getByLabel("Field Plot plot-1");
    await expect(field).toHaveAttribute("data-crop-appearance", `${crop}-early`);
    await waitForGeneratedArt(page, `${crop}-early.glb`);
    await screenshot(page, crop, "01-desktop-early.png");

    await page.setViewportSize({ width: 390, height: 844 });
    await startSavedFarm(page);
    await expect(field).toHaveAttribute("data-crop-appearance", `${crop}-early`);
    await screenshot(page, crop, "07-mobile-early.png");

    await page.setViewportSize({ width: 1280, height: 800 });
    await changeCropProgress(page, 0.7);
    await startSavedFarm(page);
    await expect(field).toHaveAttribute("data-crop-appearance", `${crop}-mature`);
    await waitForGeneratedArt(page, `${crop}-mature-straw.glb`);
    await screenshot(page, crop, "02-desktop-mature.png");

    await page.setViewportSize({ width: 390, height: 844 });
    await startSavedFarm(page);
    await expect(field).toHaveAttribute("data-crop-appearance", `${crop}-mature`);
    await screenshot(page, crop, "08-mobile-mature.png");

    await page.setViewportSize({ width: 1280, height: 800 });
    await changeCropProgress(page, 1.1);
    await startSavedFarm(page);
    await expect(field).toHaveAttribute("data-crop-appearance", `${crop}-ready`);
    await field.click();
    await expect(page.locator(`.resource-icon--${crop} img`).first())
      .toHaveAttribute("src", new RegExp(`farm-art/${crop}-mature-straw\\.png$`));
    await screenshot(page, crop, "03-desktop-ready.png");

    await page.setViewportSize({ width: 390, height: 844 });
    await startSavedFarm(page);
    await expect(field).toHaveAttribute("data-crop-appearance", `${crop}-ready`);
    await screenshot(page, crop, "04-mobile-ready.png");

    await page.setViewportSize({ width: 1280, height: 800 });
    await startSavedFarm(page);
    await field.click();
    const selection = page.locator(".panel-section").filter({
      has: page.getByRole("heading", { name: "Selection" }),
    });
    await expect(selection.getByText(`${label} - ready`)).toBeVisible();
    await selection.getByRole("button", { name: "Harvest" }).click();
    await expect(page.getByText("Command accepted")).toBeVisible();
    // A confirmed queued Task does not imply the Crop has already been harvested.
    await expect(field).toHaveAttribute("data-crop-appearance", `${crop}-ready`);

    await page.evaluate(({ key, crop }) => {
      const wasm = window.__myFarmWasmModule!;
      const now = Date.now();
      const runtime = new wasm.DemoFarmRuntime(window.localStorage.getItem(key) ?? undefined, now);
      const before = JSON.parse(runtime.save_json()).farm.inventory[crop] ?? 0;
      runtime.farm_json(now + 1_000_000);
      const save = JSON.parse(runtime.save_json());
      const plot = save.farm.field_plots.find((entry: { id: string }) => entry.id === "plot-1");
      if (plot?.crop) throw new Error("Resident harvest did not complete");
      if (!(save.farm.inventory[crop] > before)) throw new Error(`${crop} was not deposited in the Silo`);
      // Test-only fast-forward should not leave the loaded save's clock in the future.
      save.farm.last_update_ms = now;
      window.localStorage.setItem(key, JSON.stringify(save));
    }, { key: saveKey, crop });
    await startSavedFarm(page);
    await expect(field).toHaveAttribute("data-crop-appearance", "none");
    await screenshot(page, crop, "05-desktop-harvested.png");

    await page.setViewportSize({ width: 390, height: 844 });
    await startSavedFarm(page);
    await expect(field).toHaveAttribute("data-crop-appearance", "none");
    await screenshot(page, crop, "06-mobile-harvested.png");
  });
}
