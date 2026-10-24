import type { FarmView, SweepHarvestMode } from "@my-farm/contracts";
import {
  isStructureTargetPresent,
} from "@my-farm/game-model/structureMenu";
import { reservedFieldReason, residentWork } from "@my-farm/game-model/residentTasks";
import type {
  FieldContextMenuState,
  Selection,
  StructureContextMenuState,
  StructureSelection,
} from "@my-farm/game-model/selectors";
import type {
  ActiveFieldTool,
  HarvestSweepState,
  PlantSweepState,
} from "../../components/InteractionToolSelector";
import type { BuildableKind, BuildPlacementState } from "../building/buildKinds";
import type { ResidentTaskPreviewSelection } from "../residents/residentTaskFormat";

/**
 * Transient farm-scene interaction: what is selected, which context menu is
 * open, the active field/build/move tool and in-progress pointer sweeps.
 * This is presentation state only; every gameplay effect goes through a
 * Farm Command and the authoritative FarmView.
 */
export type FarmInteractionState = {
  selection: Selection;
  fieldMenu: FieldContextMenuState;
  structureMenu: StructureContextMenuState;
  activeFieldTool: ActiveFieldTool;
  buildToolSelected: boolean;
  buildPlacement: BuildPlacementState;
  selectedBuildKind: BuildableKind | null;
  movingStructure: StructureSelection | null;
  plantSweep: PlantSweepState;
  harvestSweep: HarvestSweepState;
  harvestMode: SweepHarvestMode;
  selectedTaskPreview: ResidentTaskPreviewSelection;
};

type MenuPoint = { x: number; y: number };

export type FarmInteractionAction =
  | { type: "select"; selection: Selection }
  | { type: "clearSelection" }
  | { type: "previewTask"; preview: ResidentTaskPreviewSelection }
  | { type: "openFieldMenu"; plotId: string; point: MenuPoint }
  | { type: "openStructureMenu"; target: StructureSelection; point: MenuPoint }
  | { type: "closeContextMenus" }
  | { type: "selectFieldTool"; tool: ActiveFieldTool; harvestMode?: SweepHarvestMode }
  | { type: "cancelFieldToolAction" }
  | { type: "selectBuildTool" }
  | { type: "selectBuildKind"; kind: BuildableKind; canPlace: boolean }
  | { type: "inspectBuildKind"; kind: BuildableKind }
  | { type: "buildPlacementFinished" }
  | { type: "startMovingStructure"; target: StructureSelection }
  | { type: "moveFinished" }
  | { type: "viewDeliveryOrders" }
  | { type: "enterHouseInterior" }
  | { type: "plantSweepStarted"; plotId: string; pointerId: number; cropId: string }
  | { type: "plantSweepEntered"; plotId: string; view: FarmView }
  | { type: "harvestSweepStarted"; plotId: string; pointerId: number; cropId: string }
  | { type: "harvestSweepEntered"; plotId: string; view: FarmView; nowMs: number }
  | { type: "sweepEnded"; sweep: "plant" | "harvest" }
  | { type: "fieldToolApplied"; plotId: string }
  | { type: "viewChanged"; view: FarmView }
  | { type: "reset" };

export function initialFarmInteractionState(
  overrides: Partial<Pick<FarmInteractionState, "selection" | "activeFieldTool">> = {},
): FarmInteractionState {
  return {
    selection: overrides.selection ?? null,
    fieldMenu: null,
    structureMenu: null,
    activeFieldTool: overrides.activeFieldTool ?? { type: "default" },
    buildToolSelected: false,
    buildPlacement: null,
    selectedBuildKind: null,
    movingStructure: null,
    plantSweep: null,
    harvestSweep: null,
    harvestMode: "matching_crop",
    selectedTaskPreview: null,
  };
}

/** True while any tool, menu or sweep is active (Escape/outside clicks matter). */
export function hasActiveFarmInteraction(state: FarmInteractionState) {
  return Boolean(
    state.fieldMenu ||
      state.structureMenu ||
      state.buildToolSelected ||
      state.buildPlacement ||
      state.movingStructure ||
      state.plantSweep ||
      state.harvestSweep ||
      state.activeFieldTool.type !== "default",
  );
}

const noMenus = { fieldMenu: null, structureMenu: null } as const;
const noSweeps = { plantSweep: null, harvestSweep: null } as const;
const noPointerFlows = { ...noMenus, ...noSweeps, buildPlacement: null, movingStructure: null } as const;

export function farmInteractionReducer(
  state: FarmInteractionState,
  action: FarmInteractionAction,
): FarmInteractionState {
  switch (action.type) {
    case "select":
      return { ...state, ...noPointerFlows, selection: action.selection, selectedTaskPreview: null };
    case "clearSelection":
      return { ...state, selection: null };
    case "previewTask":
      return { ...state, selectedTaskPreview: action.preview };
    case "openFieldMenu":
      return {
        ...state,
        ...noPointerFlows,
        selection: { type: "plot", id: action.plotId },
        fieldMenu: { plotId: action.plotId, x: action.point.x, y: action.point.y },
      };
    case "openStructureMenu":
      return {
        ...state,
        ...noPointerFlows,
        selection: action.target,
        structureMenu: { target: action.target, x: action.point.x, y: action.point.y },
      };
    case "closeContextMenus":
      return { ...state, ...noMenus };
    case "selectFieldTool":
      return {
        ...state,
        ...noPointerFlows,
        activeFieldTool: action.tool,
        buildToolSelected: false,
        harvestMode: action.harvestMode ?? state.harvestMode,
      };
    case "cancelFieldToolAction":
      return { ...state, ...noMenus, ...noSweeps, activeFieldTool: { type: "default" } };
    case "selectBuildTool":
      return {
        ...state,
        ...noMenus,
        ...noSweeps,
        movingStructure: null,
        activeFieldTool: { type: "default" },
        buildToolSelected: true,
      };
    case "selectBuildKind":
      return {
        ...state,
        ...noMenus,
        ...noSweeps,
        movingStructure: null,
        selectedBuildKind: action.kind,
        activeFieldTool: { type: "default" },
        buildToolSelected: true,
        buildPlacement: action.canPlace ? { kind: action.kind } : null,
        selection: action.canPlace ? null : state.selection,
      };
    case "inspectBuildKind":
      return { ...state, selectedBuildKind: action.kind };
    case "buildPlacementFinished":
      return { ...state, buildPlacement: null };
    case "startMovingStructure":
      return {
        ...state,
        ...noPointerFlows,
        selection: action.target,
        activeFieldTool: { type: "default" },
        buildToolSelected: false,
        movingStructure: action.target,
      };
    case "moveFinished":
      return { ...state, movingStructure: null };
    case "viewDeliveryOrders":
      return { ...state, ...noPointerFlows, selection: { type: "delivery_board" }, buildToolSelected: false };
    case "enterHouseInterior":
      return { ...state, ...noMenus, selection: { type: "farmhouse" } };
    case "plantSweepStarted": {
      const current = state.plantSweep;
      const plantSweep: PlantSweepState =
        current && current.pointerId === action.pointerId && current.cropId === action.cropId
          ? current.plotIds.includes(action.plotId)
            ? current
            : { ...current, plotIds: [...current.plotIds, action.plotId] }
          : { cropId: action.cropId, plotIds: [action.plotId], pointerId: action.pointerId };
      return {
        ...state,
        ...noMenus,
        buildPlacement: null,
        movingStructure: null,
        harvestSweep: null,
        selection: { type: "plot", id: action.plotId },
        plantSweep,
      };
    }
    case "plantSweepEntered": {
      const current = state.plantSweep;
      if (!current || current.plotIds.includes(action.plotId)) {
        return state;
      }
      const { view } = action;
      const plot = view.field_plots.find((entry) => entry.id === action.plotId);
      const inventory = view.inventory.find((item) => item.item_id === current.cropId)?.quantity ?? 0;
      if (plot?.crop || reservedFieldReason(view, action.plotId) || current.plotIds.length >= inventory) {
        return state;
      }
      return { ...state, plantSweep: { ...current, plotIds: [...current.plotIds, action.plotId] } };
    }
    case "harvestSweepStarted": {
      const current = state.harvestSweep;
      const { harvestMode } = state;
      const harvestSweep: HarvestSweepState =
        current &&
        current.pointerId === action.pointerId &&
        current.harvestMode === harvestMode &&
        (harvestMode === "all_crops" || current.cropId === action.cropId)
          ? current.plotIds.includes(action.plotId)
            ? current
            : { ...current, plotIds: [...current.plotIds, action.plotId] }
          : { cropId: action.cropId, harvestMode, plotIds: [action.plotId], pointerId: action.pointerId };
      return {
        ...state,
        ...noMenus,
        buildPlacement: null,
        movingStructure: null,
        plantSweep: null,
        selection: { type: "plot", id: action.plotId },
        harvestSweep,
      };
    }
    case "harvestSweepEntered": {
      const current = state.harvestSweep;
      if (!current || current.plotIds.includes(action.plotId)) {
        return state;
      }
      const { view, nowMs } = action;
      const plot = view.field_plots.find((entry) => entry.id === action.plotId);
      if (
        !plot?.crop ||
        reservedFieldReason(view, action.plotId) ||
        plot.crop.ready_at_ms > nowMs ||
        (current.harvestMode === "matching_crop" && plot.crop.item_id !== current.cropId)
      ) {
        return state;
      }
      return { ...state, harvestSweep: { ...current, plotIds: [...current.plotIds, action.plotId] } };
    }
    case "sweepEnded":
      return action.sweep === "plant" ? { ...state, plantSweep: null } : { ...state, harvestSweep: null };
    case "fieldToolApplied":
      return {
        ...state,
        ...noMenus,
        buildPlacement: null,
        buildToolSelected: false,
        selection: { type: "plot", id: action.plotId },
      };
    case "viewChanged":
      return pruneMissingTargets(state, action.view);
    case "reset":
      return {
        ...state,
        ...noPointerFlows,
        selection: null,
        activeFieldTool: { type: "default" },
        buildToolSelected: false,
        selectedBuildKind: null,
        selectedTaskPreview: null,
      };
  }
}

/** Drops menus, moves and task previews whose target left the authoritative view. */
function pruneMissingTargets(state: FarmInteractionState, view: FarmView): FarmInteractionState {
  const structureMenu =
    state.structureMenu && !isStructureTargetPresent(view, state.structureMenu.target) ? null : state.structureMenu;
  const movingStructure =
    state.movingStructure && !isStructureTargetPresent(view, state.movingStructure) ? null : state.movingStructure;
  const fieldMenu =
    state.fieldMenu && !view.field_plots.some((plot) => plot.id === state.fieldMenu?.plotId) ? null : state.fieldMenu;
  const preview = state.selectedTaskPreview;
  const selectedTaskPreview =
    preview && !residentWork(view, preview.residentId)?.queue.some((task) => task.id === preview.taskId)
      ? null
      : preview;
  if (
    structureMenu === state.structureMenu &&
    movingStructure === state.movingStructure &&
    fieldMenu === state.fieldMenu &&
    selectedTaskPreview === state.selectedTaskPreview
  ) {
    return state;
  }
  return { ...state, structureMenu, movingStructure, fieldMenu, selectedTaskPreview };
}
