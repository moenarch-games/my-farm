import { useEffect, useState, type ReactNode } from "react";
import { ChevronUp, Hammer, MousePointer2, Scissors, UserRound, Wheat, X } from "lucide-react";
import { type ActiveFieldTool, type PlantSweepState } from "../../components/InteractionToolSelector";
import { ResourceIcon } from "../../components/ResourceIcon";
import { itemName, secondsRemaining, selectedMachine, selectedPlot, selectedResident, selectedShelter, selectedStructureLabel, type StructureSelection, type Selection } from "@my-farm/game-model/selectors";
import { machineProductionStatus, productionStatusLabel, shelterProductionStatus } from "@my-farm/game-model/structureStatus";
import { residentTaskStatus, taskLabel } from "@my-farm/game-model/residentTasks";
import { type CatalogDocument, type FarmView, type SweepHarvestMode } from "@my-farm/contracts";
import { ResidentSelector } from "../residents/ResidentSelectors";
import { SelectionPanel } from "../selection/SelectionPanel";
import { type ResidentTaskPreviewSelection } from "../residents/residentTaskFormat";
import { type SendCommand } from "../runtime/farmCommandRunner";

type MobileFarmHudProps = {
  catalog: CatalogDocument;
  view: FarmView;
  selection: Selection;
  nowMs: number;
  send: SendCommand;
  demoMode: boolean;
  activeFieldTool: ActiveFieldTool;
  buildToolSelected: boolean;
  harvestMode: SweepHarvestMode;
  plantSweep: PlantSweepState;
  selectedTaskPreview: ResidentTaskPreviewSelection;
  onDefault: () => void;
  onPlant: (cropId: string) => void;
  onHarvest: () => void;
  onHarvestMode: (mode: SweepHarvestMode) => void;
  onBuild: () => void;
  onSelectResident: (residentId: string) => void;
  onPreviewTask: (selection: ResidentTaskPreviewSelection) => void;
  onClearSelection: () => void;
  onEnterHouseInterior: () => void;
};

export function MobileFarmHud({
  catalog,
  view,
  selection,
  nowMs,
  send,
  demoMode,
  activeFieldTool,
  buildToolSelected,
  harvestMode,
  plantSweep,
  selectedTaskPreview,
  onDefault,
  onPlant,
  onHarvest,
  onHarvestMode,
  onBuild,
  onSelectResident,
  onPreviewTask,
  onClearSelection,
  onEnterHouseInterior,
}: MobileFarmHudProps) {
  const [seedMenuOpen, setSeedMenuOpen] = useState(false);
  const [harvestMenuOpen, setHarvestMenuOpen] = useState(false);
  const [residentSwitcherOpen, setResidentSwitcherOpen] = useState(false);
  const [selectionExpanded, setSelectionExpanded] = useState(true);
  const selectionKey = selection ? `${selection.type}:${"id" in selection ? selection.id : "fixed"}` : "none";
  const selectedResidentRecord = view.residents.find((resident) => resident.id === view.selected_resident_id) ?? view.residents[0];
  const selectedResidentStatus = selectedResidentRecord
    ? residentTaskStatus(catalog, view, selectedResidentRecord.id, nowMs)
    : null;
  const inventory = new Map(view.inventory.map((item) => [item.item_id, (item.available_quantity ?? item.quantity)]));
  const unlockedCrops = catalog.crops.filter((crop) => crop.unlock_level <= view.level);
  const hasPlantableSeed = unlockedCrops.some((crop) => (inventory.get(crop.item_id) ?? 0) > 0);
  const selectedSeedCropId = activeFieldTool.type === "plant" ? activeFieldTool.cropId : null;
  const selectedSeedFieldCount = plantSweep?.plotIds.length ?? 0;
  const selectionSummary = mobileSelectionSummary(catalog, view, selection, nowMs);

  useEffect(() => {
    setSelectionExpanded(true);
  }, [selectionKey]);

  useEffect(() => {
    if (activeFieldTool.type !== "plant") {
      setSeedMenuOpen(false);
    }
    if (activeFieldTool.type !== "harvest") {
      setHarvestMenuOpen(false);
    }
  }, [activeFieldTool.type]);

  const closeTransientMenus = () => {
    setSeedMenuOpen(false);
    setHarvestMenuOpen(false);
    setResidentSwitcherOpen(false);
  };

  return (
    <div className="mobile-farm-hud" aria-label="Mobile farm controls">
      {selectionSummary ? (
        <section className="mobile-context-sheet" aria-label={selectionSummary.heading}>
          <div className="mobile-context-sheet__peek">
            <div>
              <span>{selectionSummary.kicker}</span>
              <h2>{selectionSummary.heading}</h2>
              <p>{selectionSummary.detail}</p>
            </div>
            <div className="mobile-context-sheet__actions">
              <button
                type="button"
                className="mobile-icon-button"
                aria-label="Toggle selection details"
                aria-expanded={selectionExpanded}
                onClick={() => setSelectionExpanded((expanded) => !expanded)}
              >
                <ChevronUp aria-hidden="true" />
              </button>
              <button
                type="button"
                className="mobile-icon-button"
                aria-label="Clear selection"
                onClick={() => {
                  onPreviewTask(null);
                  onClearSelection();
                }}
              >
                <X aria-hidden="true" />
              </button>
            </div>
          </div>
          {selectionExpanded ? (
            <div className="mobile-context-sheet__details">
              {selection ? (
                <SelectionPanel
                  catalog={catalog}
                  view={view}
                  selection={selection}
                  nowMs={nowMs}
                  send={send}
                  demoMode={demoMode}
                  selectedTaskPreview={selectedTaskPreview}
                  onPreviewTask={onPreviewTask}
                  onClearSelection={onClearSelection}
                  onEnterHouseInterior={onEnterHouseInterior}
                />
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}

      {residentSwitcherOpen ? (
        <section className="mobile-resident-switcher" aria-label="Farm Residents">
          <ResidentSelector
            catalog={catalog}
            view={view}
            nowMs={nowMs}
            onSelectResident={(residentId) => {
              void onSelectResident(residentId);
              setResidentSwitcherOpen(false);
            }}
          />
        </section>
      ) : null}

      {seedMenuOpen ? (
        <section className="mobile-tool-popover" aria-label="Seed type">
          {unlockedCrops.map((crop) => {
            const quantity = inventory.get(crop.item_id) ?? 0;
            const active = selectedSeedCropId === crop.item_id;
            return (
              <button
                type="button"
                key={crop.item_id}
                className={active ? "mobile-tool-popover__item mobile-tool-popover__item--active" : "mobile-tool-popover__item"}
                disabled={quantity < 1}
                aria-pressed={active}
                onClick={() => {
                  onPlant(crop.item_id);
                  setSeedMenuOpen(false);
                }}
              >
                <ResourceIcon type="item" itemId={crop.item_id} itemKind="crop" />
                <span>{itemName(catalog, crop.item_id)}</span>
                <strong>{quantity}</strong>
              </button>
            );
          })}
        </section>
      ) : null}

      {harvestMenuOpen ? (
        <section className="mobile-tool-popover mobile-tool-popover--compact" aria-label="Harvest mode">
          <button
            type="button"
            className={
              harvestMode === "matching_crop"
                ? "mobile-tool-popover__item mobile-tool-popover__item--active"
                : "mobile-tool-popover__item"
            }
            aria-pressed={harvestMode === "matching_crop"}
            onClick={() => {
              onHarvestMode("matching_crop");
              setHarvestMenuOpen(false);
            }}
          >
            <span>Matching crop</span>
          </button>
          <button
            type="button"
            className={
              harvestMode === "all_crops"
                ? "mobile-tool-popover__item mobile-tool-popover__item--active"
                : "mobile-tool-popover__item"
            }
            aria-pressed={harvestMode === "all_crops"}
            onClick={() => {
              onHarvestMode("all_crops");
              setHarvestMenuOpen(false);
            }}
          >
            <span>All crops</span>
          </button>
        </section>
      ) : null}

      <div className="mobile-resident-chip">
        <button
          type="button"
          aria-expanded={residentSwitcherOpen}
          onClick={() => {
            setResidentSwitcherOpen((open) => !open);
            setSeedMenuOpen(false);
            setHarvestMenuOpen(false);
          }}
        >
          <UserRound aria-hidden="true" />
          <span>{selectedResidentRecord?.display_name ?? "Resident"}</span>
          <strong>{selectedResidentStatus ? selectedResidentStatus.queuedCount : 0}</strong>
        </button>
      </div>

      {activeFieldTool.type === "plant" ? (
        <p className="mobile-tool-status" role="status" aria-live="polite">
          {selectedSeedFieldCount === 0
            ? "Tap Field Plots to seed"
            : `${selectedSeedFieldCount} ${selectedSeedFieldCount === 1 ? "field" : "fields"} selected`}
        </p>
      ) : null}

      <nav className="mobile-action-bar" aria-label="Farm actions">
        <MobileActionButton
          label="Select"
          active={!buildToolSelected && activeFieldTool.type === "default"}
          icon={<MousePointer2 aria-hidden="true" />}
          onClick={() => {
            closeTransientMenus();
            onDefault();
          }}
        />
        <MobileActionButton
          label="Plant"
          active={activeFieldTool.type === "plant"}
          icon={selectedSeedCropId ? <ResourceIcon type="item" itemId={selectedSeedCropId} itemKind="crop" /> : <Wheat aria-hidden="true" />}
          disabled={!hasPlantableSeed}
          expanded={seedMenuOpen}
          onClick={() => {
            setSeedMenuOpen((open) => !open);
            setHarvestMenuOpen(false);
            setResidentSwitcherOpen(false);
          }}
        />
        <MobileActionButton
          label="Harvest"
          active={activeFieldTool.type === "harvest"}
          icon={<Scissors aria-hidden="true" />}
          expanded={harvestMenuOpen}
          onClick={() => {
            if (activeFieldTool.type === "harvest") {
              setHarvestMenuOpen((open) => !open);
            } else {
              onHarvest();
              setHarvestMenuOpen(false);
            }
            setSeedMenuOpen(false);
            setResidentSwitcherOpen(false);
          }}
        />
        <MobileActionButton
          label="Build"
          active={buildToolSelected}
          icon={<Hammer aria-hidden="true" />}
          onClick={() => {
            closeTransientMenus();
            onBuild();
          }}
        />
      </nav>
    </div>
  );
}

export function MobileActionButton({
  label,
  icon,
  active,
  disabled,
  expanded,
  onClick,
}: {
  label: string;
  icon: ReactNode;
  active?: boolean;
  disabled?: boolean;
  expanded?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={active ? "mobile-action-button mobile-action-button--active" : "mobile-action-button"}
      aria-pressed={active}
      aria-expanded={expanded}
      disabled={disabled}
      onClick={onClick}
    >
      <span className="mobile-action-button__icon">{icon}</span>
      <span>{label}</span>
    </button>
  );
}

function mobileSelectionSummary(
  catalog: CatalogDocument,
  view: FarmView,
  selection: Selection,
  nowMs: number,
): { kicker: string; heading: string; detail: string } | null {
  if (!selection) {
    return null;
  }

  const plot = selectedPlot(view, selection);
  if (plot) {
    if (!plot.crop) {
      return { kicker: "Field Plot", heading: "Empty Field Plot", detail: "Choose Plant, then tap fields to seed." };
    }
    const cropName = itemName(catalog, plot.crop.item_id);
    const ready = plot.crop.ready_at_ms <= nowMs;
    return {
      kicker: "Field Plot",
      heading: cropName,
      detail: ready ? "Ready to harvest." : `${secondsRemaining(plot.crop.ready_at_ms, nowMs)} until ready.`,
    };
  }

  const resident = selectedResident(view, selection);
  if (resident) {
    const status = residentTaskStatus(catalog, view, resident.id, nowMs);
    return {
      kicker: resident.id === view.selected_resident_id ? "Selected Resident" : "Farm Resident",
      heading: resident.display_name,
      detail: status.currentTask ? `${taskLabel(catalog, status.currentTask)} in progress.` : "Idle and ready for work.",
    };
  }

  if (!isStructureSelectionForMobile(selection)) {
    return null;
  }

  return {
    kicker: "Selection",
    heading: selectedStructureLabel(view, selection),
    detail: mobileStructureSummary(catalog, view, selection, nowMs),
  };
}

function isStructureSelectionForMobile(selection: Selection): selection is StructureSelection {
  return selection !== null && selection.type !== "plot" && selection.type !== "resident";
}

function mobileStructureSummary(
  catalog: CatalogDocument,
  view: FarmView,
  selection: Exclude<Selection, { type: "plot" } | { type: "resident" } | null>,
  nowMs: number,
) {
  const machine = selectedMachine(view, selection);
  if (machine) {
    const status = machineProductionStatus(catalog, view, machine, nowMs);
    return productionStatusLabel(selectedStructureLabel(view, selection), catalog, status) ?? "No active production.";
  }
  const shelter = selectedShelter(view, selection);
  if (shelter) {
    const status = shelterProductionStatus(catalog, view, shelter, nowMs);
    return productionStatusLabel(selectedStructureLabel(view, selection), catalog, status) ?? "No active production.";
  }
  if (selection.type === "silo") {
    return `${view.silo_used}/${view.silo_capacity} crops stored.`;
  }
  if (selection.type === "barn") {
    return `${view.barn_used}/${view.barn_capacity} goods stored.`;
  }
  if (selection.type === "delivery_board") {
    return `${view.delivery_orders.length} delivery ${view.delivery_orders.length === 1 ? "order" : "orders"}.`;
  }
  if (selection.type === "farmhouse") {
    return "Enter rooms, inspect upgrades, or start household work.";
  }
  if (selection.type === "farm_shop") {
    return "Manage roadside Shop Stock and Customer Visits.";
  }
  if (selection.type === "tool_shed") {
    return "Stores tools for Farm Resident work.";
  }
  return "Open details for available commands.";
}
