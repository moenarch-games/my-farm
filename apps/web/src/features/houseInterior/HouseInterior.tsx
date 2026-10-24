import type { CatalogDocument, FarmView } from "@my-farm/contracts";
import { HouseInteriorScene } from "../../components/HouseInteriorScene";
import type { SendCommand } from "../runtime/farmCommandRunner";
import type { HouseInteriorController } from "./useHouseInteriorController";

/** The house interior scene wired to its editor controller. */
export function HouseInterior({
  catalog,
  view,
  nowMs,
  controller,
  send,
  onBackToFarm,
}: {
  catalog: CatalogDocument;
  view: FarmView;
  nowMs: number;
  controller: HouseInteriorController;
  send: SendCommand;
  onBackToFarm: () => void;
}) {
  return (
    <HouseInteriorScene
      catalog={catalog}
      view={view}
      nowMs={nowMs}
      mode={controller.mode}
      selectedRoom={controller.selectedRoom}
      gridEnabled={controller.gridEnabled}
      selectedDecorationId={controller.selectedDecorationId}
      selectedPlacementId={controller.selectedPlacementId}
      onSelectRoom={controller.selectRoom}
      onExitRoomToOverview={controller.exitRoomToOverview}
      onSetGridEnabled={controller.setGridMode}
      onSelectDecoration={controller.selectDecoration}
      onSelectPlacement={controller.selectPlacement}
      onPlaceDecoration={controller.placeDecoration}
      onMoveDecoration={controller.moveDecoration}
      onRemoveDecoration={controller.removeDecoration}
      onRenameResident={controller.renameResident}
      onRunCommand={send}
      onBackToFarm={onBackToFarm}
    />
  );
}
