import { type CatalogDocument, type InventoryItemView } from "@my-farm/contracts";

export function resourceItem(catalog: CatalogDocument, itemId: string, quantity: number): InventoryItemView {
  const item = catalog.items.find((entry) => entry.id === itemId);
  return {
    item_id: itemId,
    name: item?.name ?? itemId,
    quantity,
    reserved_quantity: 0,
    available_quantity: quantity,
    kind: item?.kind ?? "product",
  };
}
