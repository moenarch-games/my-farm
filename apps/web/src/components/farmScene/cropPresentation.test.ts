import { describe, expect, test } from "bun:test";
import { CROP_LAYOUTS, cropWindRotation } from "./cropPresentation";

describe("readable but bounded generated Crop Field Plot presentation", () => {
  test("renders a dense, fixed patch of generated Wheat inside the Field Plot", () => {
    const wheat = CROP_LAYOUTS.wheat;
    expect(wheat.positions.length).toBe(16);
    expect(wheat.scale.early).toBeGreaterThan(1.5);
    expect(wheat.scale.mature).toBeGreaterThan(1);
  });

  test("Corn is a sparser patch of distinct models, not resized Wheat", () => {
    const { corn, wheat } = CROP_LAYOUTS;
    expect(corn.positions.length).toBeLessThan(wheat.positions.length);
    for (const stage of ["early", "mature", "ready"] as const) {
      expect(corn.model[stage]).toMatch(/^corn-/);
      expect(wheat.model[stage]).toMatch(/^wheat-/);
    }
    expect(corn.model.early).not.toBe(corn.model.mature);
  });

  test("every layout stays inside the Field Plot with unique positions", () => {
    for (const layout of Object.values(CROP_LAYOUTS)) {
      expect(new Set(layout.positions.map(([x, z]) => `${x},${z}`)).size).toBe(layout.positions.length);
      for (const [x, z, yaw] of layout.positions) {
        expect(Math.abs(x)).toBeLessThanOrEqual(0.23);
        expect(Math.abs(z)).toBeLessThanOrEqual(0.23);
        expect(Number.isFinite(yaw)).toBe(true);
      }
      expect(layout.scale.ready).toBe(layout.scale.mature);
      expect(layout.model.ready).toBe(layout.model.mature);
    }
  });

  test("wind is small, deterministic, varied and independent of crop progress", () => {
    const reference = cropWindRotation(7.2, 0, 1.1, false, false);
    expect(cropWindRotation(7.2, 0, 1.1, false, false)).toEqual(reference);
    expect(cropWindRotation(7.2, 1, 1.1, false, false)).not.toEqual(reference);
    for (const time of [0, 1, 10, 1000]) {
      for (let index = 0; index < 16; index += 1) {
        const [pitch, roll] = cropWindRotation(time, index, 0.37, false, false);
        expect(Math.abs(pitch)).toBeLessThanOrEqual(0.01201);
        expect(Math.abs(roll)).toBeLessThanOrEqual(0.02601);
      }
    }
  });

  test("reduced motion and paused visuals keep Crops motionless", () => {
    for (const time of [0, 1.2, 15, 500]) {
      expect(cropWindRotation(time, 4, 1.4, true, false)).toEqual([0, 0]);
      expect(cropWindRotation(time, 4, 1.4, false, true)).toEqual([0, 0]);
    }
  });
});
