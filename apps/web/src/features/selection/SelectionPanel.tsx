import { ResourceIcon } from "../../components/ResourceIcon";
import { selectedMachine, selectedPlot, selectedResident, selectedShelter, type Selection } from "@my-farm/game-model/selectors";
import { type CatalogDocument, type FarmView, type InventoryItemView } from "@my-farm/contracts";
import { relevantInventoryItems, relevantItemIdsForSelection } from "./selectionInventory";
import { ResidentActions } from "../residents/ResidentActions";
import { type ResidentTaskPreviewSelection } from "../residents/residentTaskFormat";
import { FarmhouseActions, MachineActions, PlotActions, ShelterActions, StorageStatus, StorageUpgradeStatus } from "../structures/StructureActions";
import { FarmShopActions } from "../structures/FarmShopActions";
import { ResourceAmount } from "../inventory/ResourceAmount";
import { type SendCommand } from "../runtime/farmCommandRunner";

export function SelectionInventory({
  catalog,
  view,
  selection,
  send,
  demoMode,
}: {
  catalog: CatalogDocument;
  view: FarmView;
  selection: Selection;
  send: SendCommand;
  demoMode: boolean;
}) {
  if (!selection || !relevantItemIdsForSelection(catalog, view, selection)) {
    return null;
  }
  const storageSelection = selection.type === "silo" || selection.type === "barn";
  const items = relevantInventoryItems(catalog, view, selection).filter(
    (item) => !storageSelection || item.quantity > 0,
  );
  if (items.length === 0) {
    return null;
  }

  return (
    <div className="selection-inventory" aria-label="Relevant inventory">
      <h3>Inventory</h3>
      {storageSelection ? (
        <div className="storage-inventory-list">
          {items.map((item) => (
            <StorageInventoryItem key={item.item_id} item={item} send={send} demoMode={demoMode} />
          ))}
        </div>
      ) : (
        <div className="inventory-grid">
          {items.map((item) => (
            <ResourceAmount key={item.item_id} item={item} amount={String(item.quantity)} />
          ))}
        </div>
      )}
    </div>
  );
}

export function StorageInventoryItem({
  item,
  send,
  demoMode,
}: {
  item: InventoryItemView;
  send: SendCommand;
  demoMode: boolean;
}) {
  const hasAny = (item.available_quantity ?? item.quantity) > 0;
  return (
    <div className="storage-inventory-item">
      <ResourceIcon type="item" itemId={item.item_id} itemKind={item.kind} />
      <div className="storage-inventory-item__body">
        <span className="storage-inventory-item__name">{item.name}</span>
        <span className="storage-inventory-item__meta">
          {item.quantity} stored
          {(item.reserved_quantity ?? 0) > 0 ? ` - ${item.reserved_quantity} reserved` : ""}
          {(item.reserved_quantity ?? 0) > 0 ? ` - ${item.available_quantity ?? item.quantity} available` : ""}
        </span>
      </div>
      {!demoMode ? (
        <button
          type="button"
          className="storage-inventory-item__discard"
          disabled={!hasAny}
          aria-label={`Throw away 1 ${item.name}`}
          title={`Throw away 1 ${item.name}`}
          onClick={() => send({ type: "discard_inventory", item_id: item.item_id, quantity: 1 })}
        >
          <span>1</span>
          <span aria-hidden="true">🗑</span>
        </button>
      ) : null}
    </div>
  );
}

export function SelectionPanel({
  catalog,
  view,
  selection,
  nowMs,
  send,
  demoMode,
  selectedTaskPreview,
  onPreviewTask,
  onClearSelection,
  onEnterHouseInterior,
}: {
  catalog: CatalogDocument;
  view: FarmView;
  selection: Selection;
  nowMs: number;
  send: SendCommand;
  demoMode: boolean;
  selectedTaskPreview: ResidentTaskPreviewSelection;
  onPreviewTask: (selection: ResidentTaskPreviewSelection) => void;
  onClearSelection: () => void;
  onEnterHouseInterior: () => void;
}) {
  const plot = selectedPlot(view, selection);
  const machine = selectedMachine(view, selection);
  const shelter = selectedShelter(view, selection);
  const resident = selectedResident(view, selection);
  const isFarmhouse = selection?.type === "farmhouse";
  const isSilo = selection?.type === "silo";
  const isBarn = selection?.type === "barn";
  const isToolShed = selection?.type === "tool_shed";
  const isFarmShop = selection?.type === "farm_shop";
  return (
    <section className={resident ? "panel-section resident-details-panel" : "panel-section"}>
      <div className="selection-panel__header">
        <h2>{resident ? "Resident Details" : "Selection"}</h2>
        <button
          type="button"
          aria-label={resident ? "Close Resident Details" : "Clear Selection"}
          onClick={() => {
            onPreviewTask(null);
            onClearSelection();
          }}
        >
          Close
        </button>
      </div>
      {isSilo ? (
        demoMode ? (
          <StorageStatus label="Silo" used={view.silo_used} capacity={view.silo_capacity} unit="crops" />
        ) : (
          <StorageUpgradeStatus
            catalog={catalog}
            view={view}
            storageKind="silo"
            label="Silo"
            used={view.silo_used}
            capacity={view.silo_capacity}
            tier={view.silo_upgrade_tier}
            unit="crops"
            send={send}
          />
        )
      ) : null}
      {isBarn ? (
        demoMode ? (
          <StorageStatus label="Barn" used={view.barn_used} capacity={view.barn_capacity} unit="goods" />
        ) : (
          <StorageUpgradeStatus
            catalog={catalog}
            view={view}
            storageKind="barn"
            label="Barn"
            used={view.barn_used}
            capacity={view.barn_capacity}
            tier={view.barn_upgrade_tier}
            unit="goods"
            send={send}
          />
        )
      ) : null}
      {isFarmhouse ? (
        <FarmhouseActions
          catalog={catalog}
          view={view}
          nowMs={nowMs}
          send={send}
          onEnterHouseInterior={onEnterHouseInterior}
        />
      ) : null}
      {plot ? <PlotActions catalog={catalog} view={view} plot={plot} nowMs={nowMs} send={send} /> : null}
      {machine ? (
        <MachineActions catalog={catalog} view={view} machine={machine} nowMs={nowMs} send={send} />
      ) : null}
      {shelter ? (
        <ShelterActions catalog={catalog} view={view} shelter={shelter} nowMs={nowMs} send={send} />
      ) : null}
      {resident ? (
        <ResidentActions
          catalog={catalog}
          view={view}
          resident={resident}
          nowMs={nowMs}
          send={send}
          selectedTaskPreview={selectedTaskPreview}
          onPreviewTask={onPreviewTask}
        />
      ) : null}
      {!demoMode && selection?.type === "delivery_board" ? <p>Use delivery orders below.</p> : null}
      {!demoMode && isFarmShop ? (
        <FarmShopActions catalog={catalog} view={view} nowMs={nowMs} send={send} />
      ) : null}
      {isToolShed ? <p>Tool Shed</p> : null}
      <SelectionInventory
        catalog={catalog}
        view={view}
        selection={selection}
        send={send}
        demoMode={demoMode}
      />
    </section>
  );
}
