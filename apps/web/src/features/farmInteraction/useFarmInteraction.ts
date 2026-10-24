import { useCallback, useEffect, useRef, useState } from "react";
import type { CatalogDocument, FarmView, SweepHarvestMode } from "@my-farm/contracts";
import {
  isTileAvailableForNewFieldPlot,
  isTileAvailableForNewStructure,
  isTileAvailableForStructure,
  itemName,
  selectedStructureLabel,
  type Selection,
  type StructureSelection,
} from "@my-farm/game-model/selectors";
import { farmShopMoveDisabledReason } from "@my-farm/game-model/structureMenu";
import { reservedFieldReason } from "@my-farm/game-model/residentTasks";
import type { ActiveFieldTool } from "../../components/InteractionToolSelector";
import { buildKindLabel, type BuildableKind } from "../building/buildKinds";
import type { ResidentTaskPreviewSelection } from "../residents/residentTaskFormat";
import type { SendCommand } from "../runtime/farmCommandRunner";
import {
  farmInteractionReducer,
  hasActiveFarmInteraction,
  initialFarmInteractionState,
  type FarmInteractionAction,
  type FarmInteractionState,
} from "./farmInteractionState";

type Tile = { x: number; y: number };

export type FarmInteraction = ReturnType<typeof useFarmInteraction>;

function harvestToolMessage(mode: SweepHarvestMode) {
  return mode === "all_crops" ? "Harvest tool: all ready crops" : "Harvest tool: matching crop";
}

function availableInventory(view: FarmView) {
  return new Map(view.inventory.map((item) => [item.item_id, item.available_quantity ?? item.quantity]));
}

/**
 * Farm-scene interaction controller: selection, context menus, field tools
 * and sweeps, build placement and structure moves. Gameplay changes are only
 * ever submitted through `send`.
 */
export function useFarmInteraction({
  catalog,
  view,
  nowMs,
  send,
  notify,
  initialSelection = null,
  initialFieldTool = { type: "default" },
}: {
  catalog: CatalogDocument | null;
  view: FarmView | null;
  nowMs: number;
  send: SendCommand;
  notify: (message: string) => void;
  initialSelection?: Selection;
  initialFieldTool?: ActiveFieldTool;
}) {
  // The ref is the synchronous source of truth so pointer handlers that fire
  // before React re-renders (pointerup right after pointermove) see the latest sweep.
  const [state, setState] = useState<FarmInteractionState>(() =>
    initialFarmInteractionState({ selection: initialSelection, activeFieldTool: initialFieldTool }),
  );
  const stateRef = useRef(state);
  const dispatch = useCallback((action: FarmInteractionAction) => {
    const next = farmInteractionReducer(stateRef.current, action);
    if (next !== stateRef.current) {
      stateRef.current = next;
      setState(next);
    }
  }, []);

  useEffect(() => {
    if (view) {
      dispatch({ type: "viewChanged", view });
    }
  }, [dispatch, view]);

  const active = hasActiveFarmInteraction(state);
  useEffect(() => {
    if (!active) {
      return;
    }
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (event.target instanceof Element && event.target.closest(".farm-context-menu")) {
        return;
      }
      dispatch({ type: "closeContextMenus" });
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        dispatch({ type: "selectFieldTool", tool: { type: "default" } });
      }
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer, true);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer, true);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [active, dispatch]);

  const select = useCallback((selection: Selection) => dispatch({ type: "select", selection }), [dispatch]);
  const clearSelection = useCallback(() => dispatch({ type: "clearSelection" }), [dispatch]);
  const previewTask = useCallback(
    (preview: ResidentTaskPreviewSelection) => dispatch({ type: "previewTask", preview }),
    [dispatch],
  );
  const closeContextMenus = useCallback(() => dispatch({ type: "closeContextMenus" }), [dispatch]);
  /** Leaves every tool, menu and sweep (Escape, main menu, market). */
  const dismissTools = useCallback(
    () => dispatch({ type: "selectFieldTool", tool: { type: "default" } }),
    [dispatch],
  );
  const reset = useCallback(() => dispatch({ type: "reset" }), [dispatch]);
  const enterHouseInterior = useCallback(() => dispatch({ type: "enterHouseInterior" }), [dispatch]);
  const viewDeliveryOrders = useCallback(() => dispatch({ type: "viewDeliveryOrders" }), [dispatch]);

  const openFieldMenu = useCallback(
    (plotId: string, point: Tile) => dispatch({ type: "openFieldMenu", plotId, point }),
    [dispatch],
  );
  const openStructureMenu = useCallback(
    (target: StructureSelection, point: Tile) => dispatch({ type: "openStructureMenu", target, point }),
    [dispatch],
  );

  const selectResidentForWork = useCallback(
    async (residentId: string) => {
      dispatch({ type: "select", selection: { type: "resident", id: residentId } });
      if (!view || view.selected_resident_id === residentId) {
        return;
      }
      await send({ type: "select_resident", resident_id: residentId });
    },
    [dispatch, send, view],
  );

  const selectBuildKind = useCallback(
    (kind: BuildableKind, canPlace: boolean) => {
      dispatch({ type: "selectBuildKind", kind, canPlace });
      if (canPlace) {
        notify(`Place ${buildKindLabel(kind)}`);
      }
    },
    [dispatch, notify],
  );
  const inspectBuildKind = useCallback((kind: BuildableKind) => dispatch({ type: "inspectBuildKind", kind }), [dispatch]);
  const selectBuildTool = useCallback(() => {
    dispatch({ type: "selectBuildTool" });
    notify("Build tool");
  }, [dispatch, notify]);

  const startMovingStructure = useCallback(
    (target: StructureSelection) => {
      if (!view) {
        return;
      }
      if (target.type === "farm_shop") {
        const reason = farmShopMoveDisabledReason(view, target.id);
        if (reason) {
          notify(reason);
          return;
        }
      }
      dispatch({ type: "startMovingStructure", target });
      notify(`Moving ${selectedStructureLabel(view, target)}`);
    },
    [dispatch, notify, view],
  );

  const placeMovingStructure = useCallback(
    async (tile: Tile) => {
      const { movingStructure } = stateRef.current;
      if (!view || !movingStructure) {
        return;
      }
      if (movingStructure.type === "farmhouse") {
        notify("Farmhouse cannot be moved");
        dispatch({ type: "moveFinished" });
        return;
      }
      if (!isTileAvailableForStructure(view, tile, movingStructure)) {
        notify("Tile is occupied");
        return;
      }
      const result = await send({ type: "move_structure", target: movingStructure, tile });
      if (result.accepted) {
        dispatch({ type: "moveFinished" });
      }
    },
    [dispatch, notify, send, view],
  );

  const placeNewStructure = useCallback(
    async (tile: Tile) => {
      const { buildPlacement } = stateRef.current;
      if (!view || !buildPlacement) {
        return;
      }
      if (buildPlacement.kind === "field_plot") {
        if (!isTileAvailableForNewFieldPlot(view, tile)) {
          notify("Tile is occupied");
          return;
        }
        const result = await send({ type: "buy_field_plot", tile });
        if (result.accepted) {
          dispatch({ type: "buildPlacementFinished" });
        }
        return;
      }
      if (!isTileAvailableForNewStructure(view, tile, buildPlacement.kind)) {
        notify("Tile is occupied");
        return;
      }
      const result = await send({ type: "buy_structure", structure_kind: buildPlacement.kind, tile });
      if (result.accepted) {
        dispatch({ type: "buildPlacementFinished" });
      }
    },
    [dispatch, notify, send, view],
  );

  const selectDefaultFieldTool = useCallback(() => {
    dispatch({ type: "selectFieldTool", tool: { type: "default" } });
    notify("Default tool");
  }, [dispatch, notify]);

  const selectPlantFieldTool = useCallback(
    (cropId: string) => {
      dispatch({ type: "selectFieldTool", tool: { type: "plant", cropId } });
      notify(`Seed tool: ${itemName(catalog, cropId)}`);
    },
    [catalog, dispatch, notify],
  );

  const selectHarvestFieldTool = useCallback(() => {
    dispatch({ type: "selectFieldTool", tool: { type: "harvest" } });
    notify(harvestToolMessage(stateRef.current.harvestMode));
  }, [dispatch, notify]);

  const selectHarvestMode = useCallback(
    (mode: SweepHarvestMode) => {
      dispatch({ type: "selectFieldTool", tool: { type: "harvest" }, harvestMode: mode });
      notify(harvestToolMessage(mode));
    },
    [dispatch, notify],
  );

  const cancelFieldToolAction = useCallback(() => {
    dispatch({ type: "cancelFieldToolAction" });
    notify("Field tool cancelled");
  }, [dispatch, notify]);

  const startPlantSweep = useCallback(
    (plotId: string, pointerId: number) => {
      const tool = stateRef.current.activeFieldTool;
      if (!view || tool.type !== "plant") {
        return;
      }
      const plot = view.field_plots.find((entry) => entry.id === plotId);
      const reservedReason = reservedFieldReason(view, plotId);
      if (reservedReason) {
        notify(reservedReason);
        return;
      }
      if (plot?.crop || (availableInventory(view).get(tool.cropId) ?? 0) < 1) {
        return;
      }
      dispatch({ type: "plantSweepStarted", plotId, pointerId, cropId: tool.cropId });
    },
    [dispatch, notify, view],
  );

  const enterPlantSweepPlot = useCallback(
    (plotId: string) => {
      if (view) {
        dispatch({ type: "plantSweepEntered", plotId, view });
      }
    },
    [dispatch, view],
  );

  const startHarvestSweep = useCallback(
    (plotId: string, pointerId: number) => {
      if (!view) {
        return;
      }
      const plot = view.field_plots.find((entry) => entry.id === plotId);
      const reservedReason = reservedFieldReason(view, plotId);
      if (reservedReason) {
        notify(reservedReason);
        return;
      }
      if (!plot?.crop || plot.crop.ready_at_ms > nowMs) {
        return;
      }
      dispatch({ type: "harvestSweepStarted", plotId, pointerId, cropId: plot.crop.item_id });
    },
    [dispatch, notify, nowMs, view],
  );

  const enterHarvestSweepPlot = useCallback(
    (plotId: string) => {
      if (view) {
        dispatch({ type: "harvestSweepEntered", plotId, view, nowMs });
      }
    },
    [dispatch, nowMs, view],
  );

  const finishPlantSweep = useCallback(async () => {
    const sweep = stateRef.current.plantSweep;
    if (!sweep) {
      return;
    }
    dispatch({ type: "sweepEnded", sweep: "plant" });
    const result = await send({ type: "sweep_plant", crop_id: sweep.cropId, plot_ids: sweep.plotIds });
    if (result.accepted) {
      dispatch({ type: "fieldToolApplied", plotId: sweep.plotIds[0] });
    }
  }, [dispatch, send]);

  const finishHarvestSweep = useCallback(async () => {
    const sweep = stateRef.current.harvestSweep;
    if (!sweep) {
      return;
    }
    dispatch({ type: "sweepEnded", sweep: "harvest" });
    const result = await send({ type: "sweep_harvest", harvest_mode: sweep.harvestMode, plot_ids: sweep.plotIds });
    if (result.accepted) {
      dispatch({ type: "fieldToolApplied", plotId: sweep.plotIds[0] });
    }
  }, [dispatch, send]);

  // Keyboard activation of a Field Plot applies the active field tool to that
  // one plot, through the same sweep commands as pointer input.
  const applyFieldToolFromKeyboard = useCallback(
    async (plotId: string) => {
      const { activeFieldTool, harvestMode } = stateRef.current;
      if (!view || activeFieldTool.type === "default") {
        return;
      }
      const plot = view.field_plots.find((entry) => entry.id === plotId);
      const reservedReason = reservedFieldReason(view, plotId);
      if (reservedReason) {
        notify(reservedReason);
        return;
      }
      let result;
      if (activeFieldTool.type === "harvest") {
        if (!plot?.crop || plot.crop.ready_at_ms > nowMs) {
          return;
        }
        result = await send({ type: "sweep_harvest", harvest_mode: harvestMode, plot_ids: [plotId] });
      } else {
        if (plot?.crop || (availableInventory(view).get(activeFieldTool.cropId) ?? 0) < 1) {
          return;
        }
        result = await send({ type: "sweep_plant", crop_id: activeFieldTool.cropId, plot_ids: [plotId] });
      }
      if (result.accepted) {
        dispatch({ type: "fieldToolApplied", plotId });
      }
    },
    [dispatch, notify, nowMs, send, view],
  );

  const sweeping = state.activeFieldTool.type !== "default" || Boolean(state.plantSweep || state.harvestSweep);
  useEffect(() => {
    if (!sweeping) {
      return;
    }
    const finish = (event: PointerEvent) => {
      const { plantSweep, harvestSweep } = stateRef.current;
      if (plantSweep && event.pointerId === plantSweep.pointerId) {
        void finishPlantSweep();
        return;
      }
      if (harvestSweep && event.pointerId === harvestSweep.pointerId) {
        void finishHarvestSweep();
      }
    };
    const cancelOnContextMenu = (event: MouseEvent) => {
      if (event.target instanceof Element && event.target.closest(".interaction-tools")) {
        return;
      }
      const current = stateRef.current;
      if (current.activeFieldTool.type === "default" && !current.plantSweep && !current.harvestSweep) {
        return;
      }
      event.preventDefault();
      cancelFieldToolAction();
    };
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
    window.addEventListener("contextmenu", cancelOnContextMenu);
    return () => {
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      window.removeEventListener("contextmenu", cancelOnContextMenu);
    };
  }, [cancelFieldToolAction, finishHarvestSweep, finishPlantSweep, sweeping]);

  return {
    ...state,
    select,
    clearSelection,
    previewTask,
    closeContextMenus,
    dismissTools,
    reset,
    enterHouseInterior,
    viewDeliveryOrders,
    openFieldMenu,
    openStructureMenu,
    selectResidentForWork,
    selectBuildKind,
    inspectBuildKind,
    selectBuildTool,
    startMovingStructure,
    placeMovingStructure,
    placeNewStructure,
    selectDefaultFieldTool,
    selectPlantFieldTool,
    selectHarvestFieldTool,
    selectHarvestMode,
    cancelFieldToolAction,
    startPlantSweep,
    enterPlantSweepPlot,
    startHarvestSweep,
    enterHarvestSweepPlot,
    applyFieldToolFromKeyboard,
  };
}
