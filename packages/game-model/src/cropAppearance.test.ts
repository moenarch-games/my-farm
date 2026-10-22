import { describe, expect, test } from "bun:test";
import { cropAppearanceForCrop, cropAppearanceLabel } from "./cropAppearance";

const wheat = { item_id: "wheat", planted_at_ms: 1_000, ready_at_ms: 11_000 };
const corn = { ...wheat, item_id: "corn" };
const stage = (crop: typeof wheat | null, nowMs: number) => cropAppearanceForCrop(crop, nowMs)?.stage;

describe("authoritative generated Crop appearance mapping", () => {
  test("empty and non-generated Crop plots never gain a generated model", () => {
    expect(cropAppearanceForCrop(null, 100_000)).toBeNull();
    expect(cropAppearanceForCrop({ ...wheat, item_id: "carrot" }, 11_000)).toBeNull();
    expect(cropAppearanceLabel(null)).toBe("none");
  });
  test("keeps the planted Crop identity", () => {
    expect(cropAppearanceForCrop(wheat, 1_000)).toEqual({ crop: "wheat", stage: "early" });
    expect(cropAppearanceForCrop(corn, 11_000)).toEqual({ crop: "corn", stage: "ready" });
    expect(cropAppearanceLabel(cropAppearanceForCrop(corn, 7_000))).toBe("corn-mature");
  });
  test("maps planted, growing, and ready timestamps without new saved state", () => {
    for (const crop of [wheat, corn]) {
      expect(stage(crop, 1_000)).toBe("early");
      expect(stage(crop, 6_499)).toBe("early");
      expect(stage(crop, 6_500)).toBe("mature");
      expect(stage(crop, 10_999)).toBe("mature");
      expect(stage(crop, 11_000)).toBe("ready");
      expect(stage(crop, 20_000)).toBe("ready");
    }
  });
  test("handles clock rewind and invalid duration conservatively", () => {
    expect(stage(wheat, 0)).toBe("early");
    expect(stage({ ...corn, ready_at_ms: 1_000 }, 1_000)).toBe("ready");
  });
});
