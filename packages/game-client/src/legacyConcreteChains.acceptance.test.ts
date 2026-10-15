/// <reference types="bun-types/test" />
import { expect, test } from "bun:test";
import type { FarmView } from "@my-farm/contracts";
import { normalizeFarmView } from "./index";

// Legitimate old wire shape; no cast asserts a missing field exists.
function legacyView(): Omit<FarmView, "concrete_chains"> {
  return fixture();
}
test("legacy view without concrete chains normalizes to an empty authoritative mapping", () => {
  const input = legacyView();
  const before = structuredClone(input);
  const normalized = normalizeFarmView(input);
  expect(normalized.concrete_chains).toEqual({});
  const { concrete_chains: _chains, ...retained } = normalized;
  expect(retained).toEqual(before);
  expect(input).toEqual(before);
});


test("an existing authoritative chain mapping survives public normalization unchanged", () => {
  // Wire compatibility fixture only: no claim that this manufactured view proves
  // core admission. The Rust contract owns real task/job correspondence.
  const concrete_chains = {
    "existing-chain": {
      jobs: {
        bake: {
          resident_id: "woman",
          task_ids: ["resident-task-17"],
          production_job_id: "oven-job-8",
          after: [],
          inputs: [{ item_id: "wheat", quantity: 3, source: { type: "stored" } }],
        },
      },
    },
  } satisfies FarmView["concrete_chains"];
  const input = { ...legacyView(), concrete_chains };
  const before = structuredClone(input);
  expect(normalizeFarmView(input)).toEqual(before);
  expect(input).toEqual(before);
});

function fixture(): Omit<FarmView, "concrete_chains"> {
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
