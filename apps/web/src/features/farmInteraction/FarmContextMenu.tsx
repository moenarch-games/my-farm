import type { CatalogDocument, FarmView } from "@my-farm/contracts";
import { buildFieldMenuModel, buildStructureMenuModel } from "@my-farm/game-model/structureMenu";
import type { SendCommand } from "../runtime/farmCommandRunner";
import { demoMenuModel, StructureContextMenu } from "./StructureContextMenu";
import type { FarmInteraction } from "./useFarmInteraction";

/** The open field or structure context menu, built from the authoritative view. */
export function FarmContextMenu({
  catalog,
  view,
  nowMs,
  demoMode,
  interaction,
  send,
  onViewOrders,
}: {
  catalog: CatalogDocument;
  view: FarmView;
  nowMs: number;
  demoMode: boolean;
  interaction: FarmInteraction;
  send: SendCommand;
  onViewOrders: () => void;
}) {
  const { fieldMenu, structureMenu } = interaction;
  const fullModel = fieldMenu
    ? buildFieldMenuModel(
        catalog,
        view,
        view.field_plots.find((plot) => plot.id === fieldMenu.plotId) ?? view.field_plots[0],
        nowMs,
      )
    : structureMenu
      ? buildStructureMenuModel(catalog, view, structureMenu.target, nowMs)
      : null;
  const model = demoMode && fullModel ? demoMenuModel(fullModel) : fullModel;
  const point = fieldMenu ?? structureMenu;
  if (!point || !model) {
    return null;
  }
  return (
    <StructureContextMenu
      targetType={structureMenu ? "structure" : "field"}
      model={model}
      x={point.x}
      y={point.y}
      onClose={interaction.closeContextMenus}
      onCommand={async (command) => {
        const result = await send(command);
        if (result.accepted) {
          interaction.closeContextMenus();
        }
      }}
      onStartMove={() => {
        if (structureMenu) {
          interaction.startMovingStructure(structureMenu.target);
        }
      }}
      onViewOrders={onViewOrders}
    />
  );
}
