import { useEffect, useMemo, useState } from "react";
import { itemName } from "@my-farm/game-model/selectors";
import { type CatalogDocument, type FarmView } from "@my-farm/contracts";
import { StorageStatus } from "./StructureActions";
import { resourceItem } from "../inventory/resourceItem";
import { ResourceAmount } from "../inventory/ResourceAmount";
import { type SendCommand } from "../runtime/farmCommandRunner";

export function FarmShopActions({
  catalog,
  view,
  nowMs,
  send,
}: {
  catalog: CatalogDocument;
  view: FarmView;
  nowMs: number;
  send: SendCommand;
}) {
  const shop = view.farm_shop;
  const [itemId, setItemId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [price, setPrice] = useState(1);
  const inventory = useMemo(
    () => new Map(view.inventory.map((item) => [item.item_id, item])),
    [view.inventory],
  );
  const sellableItems = catalog.market_items.filter(
    (marketItem) => marketItem.sell_price !== null && marketItem.unlock_level <= view.level,
  );
  const selectedMarketItem = sellableItems.find((marketItem) => marketItem.item_id === itemId) ?? sellableItems[0];
  const selectedItemId = selectedMarketItem?.item_id ?? "";
  const selectedPrice = shop?.prices.find((entry) => entry.item_id === selectedItemId) ?? null;
  const stockUsed = shop?.stock.reduce((sum, stock) => sum + stock.quantity, 0) ?? 0;
  const stockCapacity = shop?.stock_capacity ?? 0;
  const listedItemTypes = shop?.prices.length ?? 0;
  const itemTypeCapacity = shop?.item_type_capacity ?? 0;
  const selectedInventory = selectedItemId ? inventory.get(selectedItemId) : null;
  const availableInventory = selectedInventory?.available_quantity ?? selectedInventory?.quantity ?? 0;
  const selectedStock = shop?.stock.find((stock) => stock.item_id === selectedItemId)?.quantity ?? 0;
  const selectedStockView = shop?.stock.find((stock) => stock.item_id === selectedItemId) ?? null;
  const reservedStock = selectedItemId
    ? selectedStockView?.reserved_quantity ?? view.reservations.farm_shop_stock[selectedItemId] ?? 0
    : 0;
  const availableStock = Math.max(0, selectedStock - reservedStock);
  const projectedStockUsed = shop ? projectedFarmShopStockUsed(view, shop.id, stockUsed) : 0;
  const projectedStockRoom = Math.max(0, stockCapacity - projectedStockUsed);
  const commandQuantity = Math.max(1, Math.floor(quantity));
  const requestedPrice = Number.isFinite(price) ? Math.floor(price) : 0;
  const commandPrice = Math.max(1, requestedPrice);
  const priceChance = selectedPrice ? `${Math.round(selectedPrice.sale_chance_bps / 100)}%` : "0%";
  const stockReason = !shop
    ? "Farm Shop not built"
    : !selectedMarketItem
      ? "Item is unavailable"
      : commandQuantity > availableInventory
        ? `Need ${commandQuantity - availableInventory} more in storage`
        : commandQuantity > projectedStockRoom
          ? "Projected Shop Stock capacity is full"
          : !selectedPrice && listedItemTypes >= itemTypeCapacity
            ? "Shop item type limit reached"
          : undefined;
  const returnReason = !shop
    ? "Farm Shop not built"
    : !selectedMarketItem
      ? "Item is unavailable"
      : commandQuantity > availableStock
        ? "Not enough available Shop Stock"
        : !storageHasRoomForReturn(catalog, view, selectedItemId, commandQuantity)
          ? "Destination storage is full"
          : undefined;
  const priceReason = !shop
    ? "Farm Shop not built"
    : !selectedMarketItem
      ? "Item is unavailable"
      : !selectedPrice
        ? "Stock item to set a Shop Price"
        : requestedPrice < 1
          ? "Price must be at least 1"
          : requestedPrice > selectedPrice.max_price
            ? `Max Shop Price is ${selectedPrice.max_price} coins`
            : undefined;

  useEffect(() => {
    if (!selectedItemId || selectedItemId === itemId) {
      return;
    }
    setItemId(selectedItemId);
  }, [itemId, selectedItemId]);

  useEffect(() => {
    setPrice(selectedPrice?.price ?? 1);
  }, [selectedItemId, selectedPrice?.price]);

  if (!shop) {
    return <p>Build the Farm Shop by the road.</p>;
  }

  return (
    <section className="farm-shop-panel" aria-label="Farm Shop stock">
      <StorageStatus label="Shop Stock" used={stockUsed} capacity={stockCapacity} unit="items" />
      {shop.current_sale && shop.current_sale.visible_until_ms > nowMs ? (
        <p className="farm-shop-panel__sale">
          Sold {itemName(catalog, shop.current_sale.item_id)} for {shop.current_sale.coins_gained} coins
        </p>
      ) : null}
      {shop.current_rejection && shop.current_rejection.visible_until_ms > nowMs ? (
        <p className="farm-shop-panel__sale">
          Customer passed on {itemName(catalog, shop.current_rejection.item_id)} at {shop.current_rejection.shop_price} coins
        </p>
      ) : null}
      <dl className="farm-shop-panel__summary">
        <div>
          <dt>Total stock</dt>
          <dd>{selectedStock}</dd>
        </div>
        <div>
          <dt>Reserved stock</dt>
          <dd>{reservedStock}</dd>
        </div>
        <div>
          <dt>Available stock</dt>
          <dd>{availableStock}</dd>
        </div>
        <div>
          <dt>Listed items</dt>
          <dd>{listedItemTypes}/{itemTypeCapacity}</dd>
        </div>
      </dl>
      <div className="farm-shop-panel__stock-list">
        {shop.stock.length === 0 ? <p>No Shop Stock</p> : null}
        {shop.stock.map((stock) => {
          const reserved = view.reservations.farm_shop_stock[stock.item_id] ?? 0;
          const available = Math.max(0, stock.quantity - reserved);
          const stockPrice = shop.prices.find((entry) => entry.item_id === stock.item_id);
          return (
            <div className="farm-shop-stock-row" key={stock.item_id}>
              <ResourceAmount item={resourceItem(catalog, stock.item_id, stock.quantity)} amount={`x${stock.quantity}`} />
              <small>
                {available} available{reserved > 0 ? `, ${reserved} reserved` : ""}
                {stockPrice ? ` - ${stockPrice.price} coins, ${Math.round(stockPrice.sale_chance_bps / 100)}% chance` : ""}
              </small>
            </div>
          );
        })}
      </div>
      <label className="farm-shop-panel__field">
        <span>Item</span>
        <select value={selectedItemId} onChange={(event) => setItemId(event.target.value)}>
          {sellableItems.map((marketItem) => (
            <option key={marketItem.item_id} value={marketItem.item_id}>
              {itemName(catalog, marketItem.item_id)} - {marketItem.sell_price} coins
            </option>
          ))}
        </select>
      </label>
      <label className="farm-shop-panel__field">
        <span>Quantity</span>
        <input
          aria-label="Farm Shop quantity"
          type="number"
          min={1}
          max={99}
          value={quantity}
          onChange={(event) => setQuantity(Number(event.target.value))}
        />
      </label>
      <label className="farm-shop-panel__field">
        <span>Shop Price</span>
        <input
          aria-label="Farm Shop price"
          type="number"
          min={1}
          max={selectedPrice?.max_price ?? 1}
          value={price}
          disabled={!selectedPrice}
          onChange={(event) => setPrice(Number(event.target.value))}
        />
      </label>
      <small className="farm-shop-panel__status">
        {selectedPrice
          ? `Base ${selectedPrice.base_price} coins - Max ${selectedPrice.max_price} coins - Sale chance ${priceChance}`
          : "Stock item to set a Shop Price"}
      </small>
      <div className="farm-shop-panel__actions">
        <button
          type="button"
          disabled={Boolean(stockReason)}
          onClick={() => send({ type: "stock_farm_shop", item_id: selectedItemId, quantity: commandQuantity })}
        >
          Stock
        </button>
        <button
          type="button"
          disabled={Boolean(returnReason)}
          onClick={() => send({ type: "unstock_farm_shop", item_id: selectedItemId, quantity: commandQuantity })}
        >
          Return
        </button>
        <button
          type="button"
          disabled={Boolean(priceReason)}
          onClick={() => send({ type: "set_farm_shop_price", item_id: selectedItemId, price: commandPrice })}
        >
          Set Price
        </button>
      </div>
      <small className="farm-shop-panel__status">
        {[stockReason, returnReason, priceReason].filter(Boolean).join(" - ") || "Ready"}
      </small>
    </section>
  );
}

function storageHasRoomForReturn(
  catalog: CatalogDocument,
  view: FarmView,
  itemId: string,
  quantity: number,
): boolean {
  const item = catalog.items.find((entry) => entry.id === itemId);
  if (!item) {
    return false;
  }
  if (item.kind === "crop") {
    return view.silo_used + quantity <= view.silo_capacity;
  }
  return view.barn_used + quantity <= view.barn_capacity;
}

function projectedFarmShopStockUsed(view: FarmView, shopId: string, currentStockUsed: number): number {
  let projected = currentStockUsed;
  for (const work of Object.values(view.resident_work)) {
    const steps = work?.queue.flatMap((task) => task.steps) ?? (work?.current_step ? [work.current_step] : []);
    for (const step of steps) {
      if (step.target?.kind !== "farm_shop" || step.target.id !== shopId) {
        continue;
      }
      if (step.activity === "depositing_inventory") {
        projected += step.quantity;
      } else if (step.activity === "picking_up_items") {
        projected -= step.quantity;
      }
    }
  }
  return Math.max(0, projected);
}
