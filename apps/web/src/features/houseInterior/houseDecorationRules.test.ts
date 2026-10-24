/// <reference types="bun-types/test" />

import { describe, expect, test } from "bun:test";
import type { CatalogDocument, FarmView } from "@my-farm/contracts";
import {
  decorationMoveRejection,
  decorationPlacementRejection,
  decorationSelectionCheck,
} from "./houseDecorationRules";

const catalog = {
  decorations: [{ id: "rug", name: "Rug", footprint: { width: 2, height: 2 } }],
} as unknown as CatalogDocument;

function farmView(level: number): FarmView {
  return {
    level,
    house_interior: {
      rooms: [
        {
          id: "living_room",
          width: 6,
          height: 6,
          decoration_placements: [{ id: "p1", decoration_id: "rug", tile: { x: 0, y: 0 } }],
        },
      ],
    },
  } as unknown as FarmView;
}

describe("house decoration rules", () => {
  test("editing is locked below farm level 5", () => {
    const view = farmView(4);
    expect(decorationPlacementRejection(catalog, view, "living_room", "rug", { x: 3, y: 3 })).toBe(
      "Decoration placement unlocks at Farm level 5",
    );
    expect(decorationMoveRejection(catalog, view, "living_room", "p1", { x: 3, y: 3 })).toBe(
      "Decoration editing unlocks at Farm level 5",
    );
    expect(decorationSelectionCheck(catalog, view, "living_room", "p1")).toEqual({
      ok: false,
      message: "Decoration editing unlocks at Farm level 5",
    });
  });

  test("placement reports missing rooms, overlaps and bounds", () => {
    const view = farmView(5);
    expect(decorationPlacementRejection(catalog, view, "attic", "rug", { x: 0, y: 0 })).toBe("Room not found");
    expect(decorationPlacementRejection(catalog, view, "living_room", "rug", { x: 1, y: 1 })).toBe(
      "Decoration placement overlaps",
    );
    expect(decorationPlacementRejection(catalog, view, "living_room", "rug", { x: 5, y: 5 })).toBe(
      "Decoration placement is out of bounds",
    );
    expect(decorationPlacementRejection(catalog, view, "living_room", "rug", { x: 3, y: 3 })).toBeNull();
  });

  test("moving a placement ignores its own footprint", () => {
    const view = farmView(5);
    expect(decorationMoveRejection(catalog, view, "living_room", "p1", { x: 1, y: 1 })).toBeNull();
    expect(decorationMoveRejection(catalog, view, "living_room", "missing", { x: 1, y: 1 })).toBe(
      "Decoration placement not found",
    );
    expect(decorationSelectionCheck(catalog, view, "living_room", "p1")).toEqual({ ok: true, name: "Rug" });
  });
});
