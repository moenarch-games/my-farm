import { ResourceIcon } from "../../components/ResourceIcon";
import { type InventoryItemView } from "@my-farm/contracts";

export function ResourceAmount({ item, amount }: { item: InventoryItemView; amount: string }) {
  return (
    <span className="resource-amount">
      <ResourceIcon type="item" itemId={item.item_id} itemKind={item.kind} />
      <span className="resource-amount__name">{item.name}</span>
      <strong>{amount}</strong>
    </span>
  );
}
