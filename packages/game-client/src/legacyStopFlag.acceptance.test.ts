/// <reference types="bun-types/test" />

import { expect, test } from "bun:test";
import type { FarmView, ResidentWorkView } from "@my-farm/contracts";
import { normalizeFarmView, normalizeFarmResponse, normalizeCommandResponse } from "./index";

// Actual pre-field wire shape. Deliberately no assertion cast to the current
// stronger type: baseline typing also needs the legitimate legacy boundary.
type LegacyWork = Omit<ResidentWorkView, "stop_requested"> & { stop_requested?: boolean };
function legacyFixture() {
  const view = fixture();
  // Meaningful current wire state: this is a normalization fixture, not a
  // claimed command-execution trace. Replacing it with idle defaults must fail.
  const resident = view.resident_work.woman!;
  resident.display_name = "Marta";
  resident.state = "working";
  resident.scene = { tile: { x: 11, y: 12 }, path: [{ x: 10, y: 12 }, { x: 11, y: 12 }], inside_house: false };
  resident.carry = { items: [{ item_id: "wheat", name: "Wheat", quantity: 3, kind: "crop" }],
                     tools: [{ tool_kind: "sickle", label: "Sickle", quantity: 1 }] };
  const step = { label: "Harvest Wheat", activity: "harvesting", prop: "basket",
    quantity: 3, kind: "crop", walk_duration_ms: 1000, work_duration_ms: 2000, duration_ms: 3000 } satisfies NonNullable<ResidentWorkView["current_step"]>;
  resident.current_step = step;
  resident.current_task = { id: "retained-harvest", kind: { type: "field_work" }, label: "Harvest Wheat",
    step_count: 1, steps: [step], preview: { path: [{ x: 11, y: 12 }] }, queue_state: "current",
    started_at_ms: 1000, ready_at_ms: 4000 };
  resident.queue = [{ ...resident.current_task, id: "retained-next-harvest", queue_state: "queued",
                      started_at_ms: 4000, ready_at_ms: 7000 }];
  const { stop_requested: _flag, ...entry } = view.resident_work.woman!;
  const work: Record<string, LegacyWork> = { ...view.resident_work, woman: entry };
  return { ...view, resident_work: work };
}

test("existing legacy resident entry defaults the missing stop flag without changing state", () => {
  const input = legacyFixture();
  const before = structuredClone(input);
  const normalized = normalizeFarmView(input);
  expect(normalized.resident_work.woman?.stop_requested).toBe(false);
  expect(normalized).toEqual({ ...before, resident_work: {
    ...before.resident_work, woman: { ...before.resident_work.woman, stop_requested: false },
  } });
  expect(input).toEqual(before);
});

test("an entirely absent legacy work map defaults each resident to false", () => {
  const { resident_work: _work, ...input } = fixture();
  const normalized = normalizeFarmView(input);
  for (const resident of input.residents) {
    expect(normalized.resident_work[resident.id]?.stop_requested).toBe(false);
    expect(normalized.resident_work[resident.id]?.resident_id).toBe(resident.id);
  }
  const { resident_work: _normalizedWork, ...retained } = normalized;
  expect(retained).toEqual(input);
});

test("explicit true and false stop flags survive unchanged", () => {
  const input = fixture();
  input.resident_work.woman!.stop_requested = true;
  const before = structuredClone(input);
  expect(normalizeFarmView(input)).toEqual(before);
  expect(input).toEqual(before);
});

test("both public response adapters normalize legacy entries while retaining response metadata", () => {
  const view = legacyFixture();
  const farm = normalizeFarmResponse({ version: 17, view });
  const command = normalizeCommandResponse({ accepted: true, version: 18, events: [], error: null, view });
  expect(farm.version).toBe(17);
  expect(command.accepted).toBe(true);
  expect(command.version).toBe(18);
  expect(command.events).toEqual([]);
  expect(command.error).toBeNull();
  expect(farm.view.resident_work.woman?.stop_requested).toBe(false);
  expect(command.view).toEqual(farm.view);
});

function fixture(): FarmView {
  return {
    last_update_ms: 0,
    xp: 0,
    level: 1,
    coins: 180,
    silo_used: 0,
    silo_capacity: 40,
    silo_upgrade_tier: 0,
    silo_tile: { x: 14, y: 2 },
    barn_used: 0,
    barn_capacity: 30,
    barn_upgrade_tier: 0,
    barn_tile: { x: 16, y: 2 },
    inventory: [],
    field_plots: [],
    machines: [],
    owned_farmhouse_upgrades: [],
    oven: { id: "oven", queue: [] },
    shelters: [],
    delivery_board_built: false,
    delivery_board_tile: { x: 2, y: 7 },
    delivery_orders: [],
    residents: [
      { id: "woman", display_name: "Woman" },
      { id: "man", display_name: "Man" },
    ],
    selected_resident_id: "woman",
    resident_locations: {
      woman: { x: 8, y: 10 },
      man: { x: 9, y: 10 },
    },
    concrete_chains: {},
    resident_last_harvest_deposit: {},
    resident_work: {
      woman: {
        stop_requested: false,
        resident_id: "woman",
        display_name: "Woman",
        selected: true,
        state: "idle",
        queue: [],
        scene: { tile: { x: 8, y: 10 }, path: [], inside_house: false },
        carry: { items: [], tools: [] },
      },
      man: {
        stop_requested: false,
        resident_id: "man",
        display_name: "Man",
        selected: false,
        state: "idle",
        queue: [],
        scene: { tile: { x: 9, y: 10 }, path: [], inside_house: false },
        carry: { items: [], tools: [] },
      },
    },
    reservations: {
      field_plots: {},
      machines: {},
      animals: [],
      farm_shop_stock: {},
      path_tiles: [],
    },
    house_interior: { rooms: [] },
    unlocks: [],
  };
}
