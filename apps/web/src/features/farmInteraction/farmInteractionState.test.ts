/// <reference types="bun-types/test" />

import { describe, expect, test } from "bun:test";
import type { FarmView } from "@my-farm/contracts";
import {
  farmInteractionReducer,
  hasActiveFarmInteraction,
  initialFarmInteractionState,
  type FarmInteractionAction,
  type FarmInteractionState,
} from "./farmInteractionState";

function farmView({
  plots = [],
  wheat = 0,
  reservedPlots = {},
  machines = [],
  residentWork = {},
}: {
  plots?: { id: string; crop?: { item_id: string; ready_at_ms: number } }[];
  wheat?: number;
  reservedPlots?: Record<string, unknown>;
  machines?: { id: string }[];
  residentWork?: Record<string, { queue: { id: string }[] }>;
} = {}): FarmView {
  return {
    field_plots: plots.map((plot) => ({ id: plot.id, crop: plot.crop ?? null })),
    inventory: [{ item_id: "wheat", quantity: wheat }],
    reservations: { field_plots: reservedPlots, machines: {}, oven: null, animals: [] },
    machines,
    shelters: [],
    resident_work: residentWork,
  } as unknown as FarmView;
}

function run(state: FarmInteractionState, ...actions: FarmInteractionAction[]) {
  return actions.reduce(farmInteractionReducer, state);
}

const initial = initialFarmInteractionState();

describe("farm interaction state", () => {
  test("Escape-style dismissal leaves every tool, menu and sweep", () => {
    const busy = run(
      initial,
      { type: "selectBuildKind", kind: "feed_mill", canPlace: true },
      { type: "openFieldMenu", plotId: "plot-1", point: { x: 4, y: 8 } },
    );
    expect(hasActiveFarmInteraction(busy)).toBe(true);

    const dismissed = run(busy, { type: "selectFieldTool", tool: { type: "default" } });
    expect(dismissed.buildToolSelected).toBe(false);
    expect(dismissed.buildPlacement).toBeNull();
    expect(dismissed.fieldMenu).toBeNull();
    expect(hasActiveFarmInteraction(dismissed)).toBe(false);
    // Selection survives dismissal.
    expect(dismissed.selection).toEqual({ type: "plot", id: "plot-1" });
  });

  test("placeable build kinds start placement and clear the selection", () => {
    const selected = run(initial, { type: "select", selection: { type: "farmhouse" } });
    const placing = run(selected, { type: "selectBuildKind", kind: "chicken_coop", canPlace: true });
    expect(placing.buildPlacement).toEqual({ kind: "chicken_coop" });
    expect(placing.selection).toBeNull();

    const locked = run(selected, { type: "selectBuildKind", kind: "chicken_coop", canPlace: false });
    expect(locked.buildPlacement).toBeNull();
    expect(locked.buildToolSelected).toBe(true);
    expect(locked.selection).toEqual({ type: "farmhouse" });
  });

  test("plant sweeps extend only to empty, unreserved plots within the seed count", () => {
    const view = farmView({
      plots: [{ id: "a" }, { id: "b" }, { id: "c", crop: { item_id: "wheat", ready_at_ms: 0 } }, { id: "d" }, { id: "e" }],
      wheat: 3,
      reservedPlots: { d: { reason: "Reserved for Woman" } },
    });
    const sweep = run(
      initialFarmInteractionState({ activeFieldTool: { type: "plant", cropId: "wheat" } }),
      { type: "plantSweepStarted", plotId: "a", pointerId: 1, cropId: "wheat" },
      { type: "plantSweepEntered", plotId: "b", view },
      { type: "plantSweepEntered", plotId: "c", view },
      { type: "plantSweepEntered", plotId: "d", view },
      { type: "plantSweepEntered", plotId: "b", view },
      { type: "plantSweepEntered", plotId: "e", view },
    );
    expect(sweep.plantSweep).toEqual({ cropId: "wheat", plotIds: ["a", "b", "e"], pointerId: 1 });
    expect(sweep.selection).toEqual({ type: "plot", id: "a" });

    const full = run(sweep, { type: "plantSweepEntered", plotId: "f", view });
    expect(full).toBe(sweep);
  });

  test("matching-crop harvest sweeps skip unripe and other crops", () => {
    const view = farmView({
      plots: [
        { id: "a", crop: { item_id: "wheat", ready_at_ms: 0 } },
        { id: "b", crop: { item_id: "corn", ready_at_ms: 0 } },
        { id: "c", crop: { item_id: "wheat", ready_at_ms: 5_000 } },
        { id: "d", crop: { item_id: "wheat", ready_at_ms: 100 } },
      ],
    });
    const sweep = run(
      initial,
      { type: "harvestSweepStarted", plotId: "a", pointerId: 7, cropId: "wheat" },
      { type: "harvestSweepEntered", plotId: "b", view, nowMs: 1_000 },
      { type: "harvestSweepEntered", plotId: "c", view, nowMs: 1_000 },
      { type: "harvestSweepEntered", plotId: "d", view, nowMs: 1_000 },
    );
    expect(sweep.harvestSweep).toEqual({ cropId: "wheat", harvestMode: "matching_crop", plotIds: ["a", "d"], pointerId: 7 });

    const allCrops = run(
      initial,
      { type: "selectFieldTool", tool: { type: "harvest" }, harvestMode: "all_crops" },
      { type: "harvestSweepStarted", plotId: "a", pointerId: 7, cropId: "wheat" },
      { type: "harvestSweepEntered", plotId: "b", view, nowMs: 1_000 },
    );
    expect(allCrops.harvestSweep?.plotIds).toEqual(["a", "b"]);
  });

  test("starting a sweep for another pointer replaces the previous sweep", () => {
    const state = run(
      initial,
      { type: "plantSweepStarted", plotId: "a", pointerId: 1, cropId: "wheat" },
      { type: "plantSweepStarted", plotId: "b", pointerId: 2, cropId: "wheat" },
    );
    expect(state.plantSweep).toEqual({ cropId: "wheat", plotIds: ["b"], pointerId: 2 });
  });

  test("an accepted field tool keeps the tool but selects the first plot", () => {
    const state = run(
      initialFarmInteractionState({ activeFieldTool: { type: "plant", cropId: "wheat" } }),
      { type: "plantSweepStarted", plotId: "a", pointerId: 1, cropId: "wheat" },
      { type: "sweepEnded", sweep: "plant" },
      { type: "fieldToolApplied", plotId: "a" },
    );
    expect(state.plantSweep).toBeNull();
    expect(state.activeFieldTool).toEqual({ type: "plant", cropId: "wheat" });
    expect(state.selection).toEqual({ type: "plot", id: "a" });
  });

  test("authoritative view changes prune menus, moves and previews whose targets disappeared", () => {
    const state = run(
      initial,
      { type: "openStructureMenu", target: { type: "machine", id: "mill-1" }, point: { x: 0, y: 0 } },
      { type: "previewTask", preview: { residentId: "woman", taskId: "t1" } },
    );
    const kept = farmInteractionReducer(state, {
      type: "viewChanged",
      view: farmView({ machines: [{ id: "mill-1" }], residentWork: { woman: { queue: [{ id: "t1" }] } } }),
    });
    expect(kept).toBe(state);

    const pruned = farmInteractionReducer(state, { type: "viewChanged", view: farmView() });
    expect(pruned.structureMenu).toBeNull();
    expect(pruned.selectedTaskPreview).toBeNull();
  });

  test("reset clears transient UI but keeps the harvest mode preference", () => {
    const state = run(
      initial,
      { type: "selectFieldTool", tool: { type: "harvest" }, harvestMode: "all_crops" },
      { type: "selectBuildKind", kind: "tool_shed", canPlace: false },
      { type: "reset" },
    );
    expect(state).toEqual({ ...initial, harvestMode: "all_crops" });
  });
});
