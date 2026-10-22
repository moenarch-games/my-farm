import { describe, expect, test } from "bun:test";
import type { CatalogDocument, FarmView } from "@my-farm/contracts";
import { admitFeedbackCues, detectFeedbackCues, type FeedbackCue } from "./harvestFeedback";

const catalog = {
  recipes: [{ id: "bread", target: { type: "oven" }, outputs: [{ item_id: "bread", quantity: 1 }] }],
} as unknown as CatalogDocument;

function farm(overrides: Partial<FarmView> = {}): FarmView {
  return {
    last_update_ms: 1_000,
    silo_tile: { x: 2, y: 2 },
    barn_tile: { x: 5, y: 2 },
    inventory: [],
    field_plots: [{ id: "plot-1", tile: { x: 3, y: 6 }, crop: { item_id: "wheat", planted_at_ms: 0, ready_at_ms: 500 } }],
    oven: { id: "oven", queue: [] },
    resident_work: {},
    resident_last_harvest_deposit: {},
    ...overrides,
  } as unknown as FarmView;
}

function carrying(itemId: string, quantity: number) {
  return { r1: { carry: { items: quantity ? [{ item_id: itemId, quantity }] : [], tools: [] } } } as unknown as FarmView["resident_work"];
}

describe("authoritative harvest and collection feedback", () => {
  test("a first view after mount or reload is only a baseline", () => {
    expect(detectFeedbackCues(catalog, null, farm())).toEqual([]);
  });

  test("unchanged, queued or re-rendered views fire nothing", () => {
    const view = farm();
    expect(detectFeedbackCues(catalog, view, view)).toEqual([]);
    expect(detectFeedbackCues(catalog, view, farm())).toEqual([]);
  });

  test("a completed harvest puffs at its Field Plot", () => {
    const after = farm({ field_plots: [{ id: "plot-1", tile: { x: 3, y: 6 }, crop: null }] });
    expect(detectFeedbackCues(catalog, farm(), after)).toEqual([
      { key: "harvest:plot-1:0", kit: "farm.harvest-pop", anchor: { x: 3, y: 6 }, target: "field_plot", itemId: "wheat" },
    ]);
  });

  test("a new Silo deposit receipt pulses the Wheat icon at the Silo, once", () => {
    const receipt = { task_id: "t1", crop_id: "wheat", completed_at_ms: 900 };
    const before = farm();
    const after = farm({ resident_last_harvest_deposit: { r1: receipt } });
    expect(detectFeedbackCues(catalog, before, after)).toEqual([
      { key: "deposit:r1:t1:900", kit: "ui.reward-pulse", anchor: { x: 2.5, y: 2.5 }, target: "silo", itemId: "wheat" },
    ]);
    expect(detectFeedbackCues(catalog, after, farm({ resident_last_harvest_deposit: { r1: receipt } }))).toEqual([]);
  });

  test("Oven Bread collection puffs at the Oven and pulses Bread at the Barn on deposit", () => {
    const producing = farm({
      oven: { id: "oven", queue: [{ id: "job-1", recipe_id: "bread", status: "producing", started_at_ms: 0, ready_at_ms: 10 }] },
    });
    const collected = farm({ resident_work: carrying("bread", 1) });
    expect(detectFeedbackCues(catalog, producing, collected).map((cue) => [cue.target, cue.itemId])).toEqual([["oven", "bread"]]);
    const deposited = farm({
      last_update_ms: 2_000,
      inventory: [{ item_id: "bread", name: "Bread", quantity: 1, kind: "product" }] as FarmView["inventory"],
      resident_work: carrying("bread", 0),
    });
    expect(detectFeedbackCues(catalog, collected, deposited).map((cue) => [cue.target, cue.itemId])).toEqual([["barn", "bread"]]);
  });

  test("bought Bread or a pending Oven job leaving nothing behind does not pulse", () => {
    const bought = farm({ inventory: [{ item_id: "bread", name: "Bread", quantity: 3, kind: "product" }] as FarmView["inventory"] });
    expect(detectFeedbackCues(catalog, farm(), bought)).toEqual([]);
    const pending = farm({
      oven: { id: "oven", queue: [{ id: "job-1", recipe_id: "bread", status: "pending_start", started_at_ms: 0, ready_at_ms: 10 }] },
    });
    expect(detectFeedbackCues(catalog, pending, farm())).toEqual([]);
  });

  test("Sweep Harvest admits at most four per kit and drops the extras", () => {
    const cues: FeedbackCue[] = Array.from({ length: 6 }, (_, index) => ({
      key: `harvest:p${index}:0`,
      kit: "farm.harvest-pop",
      anchor: { x: index, y: 0 },
      target: "field_plot",
    }));
    const active = admitFeedbackCues([], cues, 0, 4);
    expect(active.map((entry) => entry.key)).toEqual(["harvest:p0:0", "harvest:p1:0", "harvest:p2:0", "harvest:p3:0"]);
    expect(admitFeedbackCues(active, [cues[0]!], 1, 4)).toHaveLength(4);
  });
});
