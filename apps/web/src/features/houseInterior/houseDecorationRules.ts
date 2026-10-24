import type { CatalogDocument, FarmView } from "@my-farm/contracts";
import { decorationPlacementStatus, type RoomTile } from "@my-farm/game-model/houseInterior";

/** Farm level at which the house decoration editor unlocks. */
export const decorationEditingLevel = 5;

function findRoom(view: FarmView, roomId: string) {
  return view.house_interior.rooms.find((entry) => entry.id === roomId);
}

/**
 * Client-side pre-checks that give immediate feedback before a decoration
 * Command is sent. The Rust farm still validates and owns the result.
 */
export function decorationSelectionCheck(
  catalog: CatalogDocument,
  view: FarmView,
  roomId: string,
  placementId: string,
): { ok: true; name: string } | { ok: false; message: string } {
  if (view.level < decorationEditingLevel) {
    return { ok: false, message: "Decoration editing unlocks at Farm level 5" };
  }
  const placement = findRoom(view, roomId)?.decoration_placements.find((entry) => entry.id === placementId);
  const decoration = placement
    ? catalog.decorations.find((entry) => entry.id === placement.decoration_id)
    : null;
  if (!placement || !decoration) {
    return { ok: false, message: "Decoration placement not found" };
  }
  return { ok: true, name: decoration.name };
}

export function decorationPlacementRejection(
  catalog: CatalogDocument,
  view: FarmView,
  roomId: string,
  decorationId: string,
  tile: RoomTile,
): string | null {
  if (view.level < decorationEditingLevel) {
    return "Decoration placement unlocks at Farm level 5";
  }
  const room = findRoom(view, roomId);
  if (!room) {
    return "Room not found";
  }
  const status = decorationPlacementStatus(catalog, room, decorationId, tile);
  if (!status.fits) {
    return status.reason === "overlap" ? "Decoration placement overlaps" : "Decoration placement is out of bounds";
  }
  return null;
}

export function decorationMoveRejection(
  catalog: CatalogDocument,
  view: FarmView,
  roomId: string,
  placementId: string,
  tile: RoomTile,
): string | null {
  if (view.level < decorationEditingLevel) {
    return "Decoration editing unlocks at Farm level 5";
  }
  const room = findRoom(view, roomId);
  const placement = room?.decoration_placements.find((entry) => entry.id === placementId);
  if (!room || !placement) {
    return "Decoration placement not found";
  }
  const status = decorationPlacementStatus(catalog, room, placement.decoration_id, tile, {
    ignorePlacementId: placementId,
  });
  if (!status.fits) {
    return status.reason === "overlap" ? "Decoration move overlaps" : "Decoration move is out of bounds";
  }
  return null;
}
