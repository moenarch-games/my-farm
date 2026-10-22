import type { CatalogDocument, FarmView, Tile } from "@my-farm/contracts";
import { FARM_HOUSE_FOOTPRINT, FARM_HOUSE_TILE, structureFootprint } from "@my-farm/game-model/selectors";

// Cosmetic feedback for confirmed harvest/collection outcomes. Cues are derived
// only from consecutive authoritative Farm views, never from queued commands.
export type FeedbackKitName = "farm.harvest-pop" | "ui.reward-pulse";

export type FeedbackCue = {
  key: string;
  kit: FeedbackKitName;
  // Tile-space centre of the anchor (Field Plot, Oven or storage building).
  anchor: { x: number; y: number };
  target: "field_plot" | "oven" | "silo" | "barn";
  itemId?: string;
};

export function detectFeedbackCues(
  catalog: CatalogDocument,
  previous: FarmView | null,
  next: FarmView,
): FeedbackCue[] {
  // The first view after mount, reload or reconnect only establishes a baseline.
  if (!previous) return [];
  const cues: FeedbackCue[] = [];

  const nextPlots = new Map(next.field_plots.map((plot) => [plot.id, plot]));
  for (const plot of previous.field_plots) {
    const after = nextPlots.get(plot.id);
    // The Rust runtime clears a Field Plot's Crop only when a harvest step completes.
    if (plot.crop && after && !after.crop) {
      cues.push({
        key: `harvest:${plot.id}:${plot.crop.planted_at_ms}`,
        kit: "farm.harvest-pop",
        anchor: centre(after.tile, { width: 1, height: 1 }),
        target: "field_plot",
        itemId: plot.crop.item_id,
      });
    }
  }

  const nextOvenJobs = new Set(next.oven.queue.map((job) => job.id));
  for (const job of previous.oven.queue) {
    // Oven jobs leave the queue only through a completed collection step.
    if (job.status === "producing" && !nextOvenJobs.has(job.id)) {
      cues.push({
        key: `oven:${job.id}`,
        kit: "farm.harvest-pop",
        anchor: centre(FARM_HOUSE_TILE, FARM_HOUSE_FOOTPRINT),
        target: "oven",
        itemId: catalog.recipes.find((recipe) => recipe.id === job.recipe_id)?.outputs[0]?.item_id,
      });
    }
  }

  for (const [residentId, receipt] of Object.entries(next.resident_last_harvest_deposit ?? {})) {
    const before = previous.resident_last_harvest_deposit?.[residentId];
    if (before && before.task_id === receipt.task_id && before.completed_at_ms === receipt.completed_at_ms) continue;
    cues.push({
      key: `deposit:${residentId}:${receipt.task_id}:${receipt.completed_at_ms}`,
      kit: "ui.reward-pulse",
      anchor: centre(next.silo_tile, structureFootprint("silo")),
      target: "silo",
      itemId: receipt.crop_id,
    });
  }

  // Oven products have no deposit receipt; a stored increase matched by the same
  // Residents carrying less of that item is the confirmed physical Barn deposit.
  const ovenOutputs = new Set(
    catalog.recipes.filter((recipe) => recipe.target.type === "oven").flatMap((recipe) => recipe.outputs.map((item) => item.item_id)),
  );
  for (const itemId of ovenOutputs) {
    const stored = storedQuantity(next, itemId) - storedQuantity(previous, itemId);
    const unloaded = carriedQuantity(previous, itemId) - carriedQuantity(next, itemId);
    if (stored > 0 && unloaded >= stored) {
      cues.push({
        key: `barn:${itemId}:${next.last_update_ms}`,
        kit: "ui.reward-pulse",
        anchor: centre(next.barn_tile, structureFootprint("barn")),
        target: "barn",
        itemId,
      });
    }
  }
  return cues;
}

export type ActiveFeedback = FeedbackCue & { startedAtMs: number };

// Kit concurrency contract: at most `maxActive` per kit; overflow drops the new cue.
export function admitFeedbackCues(
  active: readonly ActiveFeedback[],
  cues: readonly FeedbackCue[],
  nowMs: number,
  maxActive: number,
): ActiveFeedback[] {
  const admitted = [...active];
  for (const cue of cues) {
    if (admitted.some((entry) => entry.key === cue.key)) continue;
    if (admitted.filter((entry) => entry.kit === cue.kit).length >= maxActive) continue;
    admitted.push({ ...cue, startedAtMs: nowMs });
  }
  return admitted;
}

function centre(tile: Tile, footprint: { width: number; height: number }) {
  return { x: tile.x + (footprint.width - 1) / 2, y: tile.y + (footprint.height - 1) / 2 };
}

function storedQuantity(view: FarmView, itemId: string) {
  return view.inventory.find((item) => item.item_id === itemId)?.quantity ?? 0;
}

function carriedQuantity(view: FarmView, itemId: string) {
  return Object.values(view.resident_work ?? {}).reduce(
    (total, work) => total + (work.carry?.items ?? []).filter((item) => item.item_id === itemId).reduce((sum, item) => sum + item.quantity, 0),
    0,
  );
}
