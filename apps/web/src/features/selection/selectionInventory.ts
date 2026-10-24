import { selectedMachine, selectedPlot, selectedShelter, type Selection } from "@my-farm/game-model/selectors";
import { type CatalogDocument, type FarmView } from "@my-farm/contracts";

export function relevantInventoryItems(catalog: CatalogDocument, view: FarmView, selection: Selection) {
  const relevantItemIds = relevantItemIdsForSelection(catalog, view, selection);
  if (!relevantItemIds) {
    return view.inventory;
  }

  const quantities = new Map(view.inventory.map((item) => [item.item_id, (item.available_quantity ?? item.quantity)]));
  return catalog.items
    .filter((item) => relevantItemIds.has(item.id))
    .map((item) => ({
      item_id: item.id,
      name: item.name,
      quantity: quantities.get(item.id) ?? 0,
      kind: item.kind,
    }));
}

export function relevantItemIdsForSelection(
  catalog: CatalogDocument,
  view: FarmView,
  selection: Selection,
): Set<string> | null {
  const plot = selectedPlot(view, selection);
  if (plot) {
    if (plot.crop) {
      return new Set([plot.crop.item_id]);
    }
    return new Set(
      catalog.crops
        .filter((crop) => crop.unlock_level <= view.level)
        .map((crop) => crop.item_id),
    );
  }

  const machine = selectedMachine(view, selection);
  if (machine) {
    const itemIds = new Set<string>();
    for (const recipe of catalog.recipes.filter(
      (entry) => entry.target.type === "machine" && entry.target.machine_kind === machine.kind,
    )) {
      for (const stack of [...recipe.inputs, ...recipe.outputs]) {
        itemIds.add(stack.item_id);
      }
    }
    return itemIds;
  }

  if (selection?.type === "farmhouse" && view.owned_farmhouse_upgrades.includes("oven")) {
    const itemIds = new Set<string>();
    for (const recipe of catalog.recipes.filter((entry) => entry.target.type === "oven")) {
      for (const stack of [...recipe.inputs, ...recipe.outputs]) {
        itemIds.add(stack.item_id);
      }
    }
    return itemIds;
  }

  const shelter = selectedShelter(view, selection);
  if (shelter) {
    const shelterDef = catalog.shelters.find((entry) => entry.kind === shelter.kind);
    return shelterDef ? new Set([shelterDef.feed_item_id, shelterDef.product_item_id]) : new Set();
  }

  if (selection?.type === "silo") {
    return new Set(catalog.items.filter((item) => item.kind === "crop").map((item) => item.id));
  }

  if (selection?.type === "barn") {
    return new Set(catalog.items.filter((item) => item.kind !== "crop").map((item) => item.id));
  }

  if (selection?.type === "delivery_board") {
    return new Set(
      view.delivery_orders.flatMap((order) => order.requirements.map((stack) => stack.item_id)),
    );
  }

  if (selection?.type === "farm_shop") {
    return new Set([
      ...(view.farm_shop?.stock.map((stock) => stock.item_id) ?? []),
      ...catalog.market_items
        .filter((marketItem) => marketItem.sell_price !== null && marketItem.unlock_level <= view.level)
        .map((marketItem) => marketItem.item_id),
    ]);
  }

  return null;
}
