import type { FieldPlot } from "@my-farm/contracts";

// Crops with generated asset-tooling art. Others keep the procedural fallback.
export type GeneratedCrop = "wheat" | "corn";
export type CropStage = "early" | "mature" | "ready";
export type CropAppearance = { crop: GeneratedCrop; stage: CropStage };

function isGeneratedCrop(itemId: string): itemId is GeneratedCrop {
  return itemId === "wheat" || itemId === "corn";
}

// This is a view-only selection: it cannot advance a crop or authorize harvest.
export function cropAppearanceForCrop(crop: FieldPlot["crop"], nowMs: number): CropAppearance | null {
  if (!crop || !isGeneratedCrop(crop.item_id)) {
    return null;
  }
  return { crop: crop.item_id, stage: cropStage(crop, nowMs) };
}

function cropStage(crop: NonNullable<FieldPlot["crop"]>, nowMs: number): CropStage {
  if (nowMs >= crop.ready_at_ms) {
    return "ready";
  }
  const duration = crop.ready_at_ms - crop.planted_at_ms;
  if (duration <= 0) {
    return "ready";
  }
  return (nowMs - crop.planted_at_ms) / duration >= 0.55 ? "mature" : "early";
}

/** Stable DOM/testing label such as `corn-mature`, or `none` for an empty or fallback plot. */
export function cropAppearanceLabel(appearance: CropAppearance | null): string {
  return appearance ? `${appearance.crop}-${appearance.stage}` : "none";
}
