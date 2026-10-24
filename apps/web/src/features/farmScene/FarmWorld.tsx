import type { CatalogDocument, FarmView } from "@my-farm/contracts";
import { currentResidentScenePath } from "@my-farm/game-model/residentTasks";
import { FarmScene } from "../../components/FarmScene";
import type { FarmInteraction } from "../farmInteraction/useFarmInteraction";
import { selectedResidentTaskPreviewPath } from "../residents/residentTaskFormat";

/** The 3D farm wired to the farm interaction controller. */
export function FarmWorld({
  catalog,
  view,
  nowMs,
  interaction,
  showResidentPath,
}: {
  catalog: CatalogDocument;
  view: FarmView;
  nowMs: number;
  interaction: FarmInteraction;
  /** Whether the hidden resident path marker (used by tests) is exposed. */
  showResidentPath: boolean;
}) {
  const { selection } = interaction;
  const selectedPath = selection?.type === "resident"
    ? currentResidentScenePath(view, selection.id, nowMs)
    : null;
  const previewPath = selectedResidentTaskPreviewPath(view, interaction.selectedTaskPreview);
  const visibleResidentPath = previewPath ?? selectedPath;

  return (
    <>
      <FarmScene
        catalog={catalog}
        view={view}
        nowMs={nowMs}
        visualClockPaused={false}
        selection={selection}
        activeFieldTool={interaction.activeFieldTool}
        buildPlacement={interaction.buildPlacement}
        movingStructure={interaction.movingStructure}
        plantSweep={interaction.plantSweep}
        harvestSweep={interaction.harvestSweep}
        previewResidentPath={previewPath}
        onSelect={interaction.select}
        onSelectResident={interaction.selectResidentForWork}
        onOpenFieldMenu={interaction.openFieldMenu}
        onOpenStructureMenu={interaction.openStructureMenu}
        onPlaceNewStructure={interaction.placeNewStructure}
        onPlaceStructure={interaction.placeMovingStructure}
        onStartPlantSweep={interaction.startPlantSweep}
        onEnterPlantSweepPlot={interaction.enterPlantSweepPlot}
        onStartHarvestSweep={interaction.startHarvestSweep}
        onKeyboardFieldTool={interaction.applyFieldToolFromKeyboard}
        onEnterHarvestSweepPlot={interaction.enterHarvestSweepPlot}
        onCancelFieldToolAction={interaction.cancelFieldToolAction}
      />
      {showResidentPath && visibleResidentPath ? (
        <div
          className="resident-path-marker"
          data-testid={`resident-path-${visibleResidentPath.residentId}`}
          data-path-tile-count={visibleResidentPath.tiles.length}
          aria-hidden="true"
        />
      ) : null}
    </>
  );
}

/** CSS hook for the active pointer tool. */
export function farmToolClass(interaction: FarmInteraction) {
  if (interaction.buildPlacement) {
    return "app--tool-place";
  }
  if (interaction.movingStructure) {
    return "app--tool-move";
  }
  if (interaction.activeFieldTool.type === "plant") {
    return "app--tool-seed";
  }
  if (interaction.activeFieldTool.type === "harvest") {
    return "app--tool-harvest";
  }
  return "app--tool-default";
}
