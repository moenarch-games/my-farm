import { useCallback, useEffect, useState } from "react";
import type { CatalogDocument, FarmView } from "@my-farm/contracts";
import type { RoomTile } from "@my-farm/game-model/houseInterior";
import type { HouseInteriorMode, HouseRoomId } from "../../components/HouseInteriorScene";
import type { SendCommand } from "../runtime/farmCommandRunner";
import {
  decorationEditingLevel,
  decorationMoveRejection,
  decorationPlacementRejection,
  decorationSelectionCheck,
} from "./houseDecorationRules";

export type HouseInteriorController = ReturnType<typeof useHouseInteriorController>;

/** House-interior editor state: overview/room mode, grid and decoration selection. */
export function useHouseInteriorController({
  catalog,
  view,
  send,
  notify,
}: {
  catalog: CatalogDocument | null;
  view: FarmView | null;
  send: SendCommand;
  notify: (message: string) => void;
}) {
  const [mode, setMode] = useState<HouseInteriorMode>("overview");
  const [gridEnabled, setGridEnabled] = useState(true);
  const [selectedRoom, setSelectedRoom] = useState<HouseRoomId>("living_room");
  const [selectedDecorationId, setSelectedDecorationId] = useState<string | null>(null);
  const [selectedPlacementId, setSelectedPlacementId] = useState<string | null>(null);

  useEffect(() => {
    if (
      !view ||
      !selectedPlacementId ||
      view.house_interior.rooms.some((room) =>
        room.decoration_placements.some((placement) => placement.id === selectedPlacementId),
      )
    ) {
      return;
    }
    setSelectedPlacementId(null);
  }, [selectedPlacementId, view]);

  /** Entering the house always starts at the overview. */
  const openOverview = useCallback(() => setMode("overview"), []);

  const clearDecorationSelection = useCallback(() => {
    setSelectedDecorationId(null);
    setSelectedPlacementId(null);
  }, []);

  const selectDecoration = useCallback(
    (decorationId: string) => {
      const decoration = catalog?.decorations.find((entry) => entry.id === decorationId);
      setSelectedDecorationId(decorationId);
      setSelectedPlacementId(null);
      notify(decoration ? `Place ${decoration.name}` : "Place Decoration");
    },
    [catalog, notify],
  );

  const selectRoom = useCallback((roomId: HouseRoomId) => {
    setSelectedRoom(roomId);
    setMode("room");
    setSelectedPlacementId(null);
  }, []);

  const exitRoomToOverview = useCallback(() => {
    setMode("overview");
    clearDecorationSelection();
    notify("House Overview");
  }, [clearDecorationSelection, notify]);

  const setGridMode = useCallback(
    (enabled: boolean) => {
      setGridEnabled(enabled);
      if (!enabled) {
        clearDecorationSelection();
      }
    },
    [clearDecorationSelection],
  );

  const selectPlacement = useCallback(
    (roomId: string, placementId: string) => {
      if (!catalog || !view) {
        return;
      }
      const check = decorationSelectionCheck(catalog, view, roomId, placementId);
      if (!check.ok) {
        notify(check.message);
        return;
      }
      setSelectedDecorationId(null);
      setSelectedPlacementId(placementId);
      notify(`Selected ${check.name}`);
    },
    [catalog, notify, view],
  );

  const placeDecoration = useCallback(
    async (roomId: string, decorationId: string, tile: RoomTile) => {
      if (!catalog || !view) {
        return;
      }
      const rejection = decorationPlacementRejection(catalog, view, roomId, decorationId, tile);
      if (rejection) {
        notify(rejection);
        return;
      }
      await send({ type: "place_decoration", room_id: roomId, decoration_id: decorationId, tile });
    },
    [catalog, notify, send, view],
  );

  const moveDecoration = useCallback(
    async (roomId: string, placementId: string, tile: RoomTile) => {
      if (!catalog || !view) {
        return;
      }
      const rejection = decorationMoveRejection(catalog, view, roomId, placementId, tile);
      if (rejection) {
        notify(rejection);
        return;
      }
      await send({ type: "move_decoration", room_id: roomId, placement_id: placementId, tile });
    },
    [catalog, notify, send, view],
  );

  const removeDecoration = useCallback(
    async (roomId: string, placementId: string) => {
      if (!view) {
        return;
      }
      if (view.level < decorationEditingLevel) {
        notify("Decoration editing unlocks at Farm level 5");
        return;
      }
      const result = await send({ type: "remove_decoration", room_id: roomId, placement_id: placementId });
      if (result.accepted) {
        setSelectedPlacementId(null);
      }
    },
    [notify, send, view],
  );

  const renameResident = useCallback(
    (residentId: string, displayName: string) =>
      send({ type: "rename_resident", resident_id: residentId, display_name: displayName.trim() }),
    [send],
  );

  return {
    mode,
    gridEnabled,
    selectedRoom,
    selectedDecorationId,
    selectedPlacementId,
    openOverview,
    clearDecorationSelection,
    selectDecoration,
    selectRoom,
    exitRoomToOverview,
    setGridMode,
    selectPlacement,
    placeDecoration,
    moveDecoration,
    removeDecoration,
    renameResident,
  };
}
