import { useEffect, useState } from "react";
import { ResourceIcon } from "../../components/ResourceIcon";
import { type CatalogDocument, type FarmCommand, type FarmView, type InventoryItemView, type MarketItemDef } from "@my-farm/contracts";
import { buyMarketDisabledReason, sellMarketDisabledReason } from "./marketRules";
import { resourceItem } from "../inventory/resourceItem";
import { type SendCommand } from "../runtime/farmCommandRunner";

type MarketTradeMode = "buy" | "sell";

export function FarmersMarket({
  catalog,
  view,
  send,
  onClose,
}: {
  catalog: CatalogDocument;
  view: FarmView;
  send: SendCommand;
  onClose: () => void;
}) {
  const [selectedItemId, setSelectedItemId] = useState(catalog.market_items[0]?.item_id ?? "");
  const [tradeMode, setTradeMode] = useState<MarketTradeMode>("buy");
  const [quantityInput, setQuantityInput] = useState("1");
  const inventory = new Map(view.inventory.map((item) => [item.item_id, (item.available_quantity ?? item.quantity)]));
  const itemKinds = new Map(catalog.items.map((item) => [item.id, item.kind]));
  const selectedMarketItem =
    catalog.market_items.find((marketItem) => marketItem.item_id === selectedItemId) ??
    catalog.market_items[0];

  useEffect(() => {
    if (!catalog.market_items.some((marketItem) => marketItem.item_id === selectedItemId)) {
      setSelectedItemId(catalog.market_items[0]?.item_id ?? "");
    }
  }, [catalog.market_items, selectedItemId]);

  const marketItemDetails = (marketItem: MarketItemDef) => {
    const item = resourceItem(catalog, marketItem.item_id, inventory.get(marketItem.item_id) ?? 0);
    const storage =
      itemKinds.get(marketItem.item_id) === "crop"
        ? {
            label: "Silo",
            used: view.silo_used,
            capacity: view.silo_capacity,
          }
        : {
            label: "Barn",
            used: view.barn_used,
            capacity: view.barn_capacity,
          };
    return { item, storage };
  };

  const selectMarketItem = (itemId: string) => {
    setSelectedItemId(itemId);
  };

  if (!selectedMarketItem) {
    return null;
  }

  const selectedDetails = marketItemDetails(selectedMarketItem);

  return (
    <section className="panel-section farmers-market" aria-label="Farmers Market">
      <div className="farmers-market__header">
        <div>
          <h2>Farmers Market</h2>
          <p>Select a resource, then choose whether to buy or sell.</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close Farmers Market">
          Close
        </button>
      </div>
      <div className="market-list" aria-label="Market resources">
        {catalog.market_items.map((marketItem) => {
          const { item } = marketItemDetails(marketItem);
          return (
            <MarketResourceButton
              key={marketItem.item_id}
              item={item}
              marketItem={marketItem}
              level={view.level}
              selected={marketItem.item_id === selectedMarketItem.item_id}
              onSelect={selectMarketItem}
            />
          );
        })}
      </div>
      <MarketTradePanel
        item={selectedDetails.item}
        marketItem={selectedMarketItem}
        level={view.level}
        coins={view.coins}
        storage={selectedDetails.storage}
        tradeMode={tradeMode}
        quantityInput={quantityInput}
        onTradeMode={setTradeMode}
        onQuantityInput={setQuantityInput}
        send={send}
      />
    </section>
  );
}

export function MarketResourceButton({
  item,
  marketItem,
  level,
  selected,
  onSelect,
}: {
  item: InventoryItemView;
  marketItem: MarketItemDef;
  level: number;
  selected: boolean;
  onSelect: (itemId: string) => void;
}) {
  const locked = level < marketItem.unlock_level;
  const status = locked ? `Unlocks at level ${marketItem.unlock_level}` : null;

  return (
    <button
      type="button"
      className={selected ? "market-item market-item--selected" : "market-item"}
      data-testid={`market-item-${marketItem.item_id}`}
      aria-pressed={selected}
      aria-label={`Select ${item.name}`}
      onClick={() => onSelect(marketItem.item_id)}
    >
      <span className="market-item__identity">
        <ResourceIcon type="item" itemId={item.item_id} itemKind={item.kind} />
        <span>
          <strong>{item.name}</strong>
          <span>Owned {item.quantity}</span>
        </span>
      </span>
      <span className="market-item__prices">
        <span>{marketItem.buy_price === null ? "Buy unavailable" : `Buy ${marketItem.buy_price} coins`}</span>
        <span>{marketItem.sell_price === null ? "Sell unavailable" : `Sell ${marketItem.sell_price} coins`}</span>
      </span>
      {status ? <small className="market-item__status">{status}</small> : null}
    </button>
  );
}

export function MarketTradePanel({
  item,
  marketItem,
  level,
  coins,
  storage,
  tradeMode,
  quantityInput,
  onTradeMode,
  onQuantityInput,
  send,
}: {
  item: InventoryItemView;
  marketItem: MarketItemDef;
  level: number;
  coins: number;
  storage: { label: string; used: number; capacity: number };
  tradeMode: MarketTradeMode;
  quantityInput: string;
  onTradeMode: (mode: MarketTradeMode) => void;
  onQuantityInput: (value: string) => void;
  send: SendCommand;
}) {
  const quantity = Number(quantityInput);
  const commandQuantity = Number.isInteger(quantity) && quantity > 0 ? quantity : 1;
  const locked = level < marketItem.unlock_level;
  const storageRoom = Math.max(0, storage.capacity - storage.used);
  const buyReason = buyMarketDisabledReason(marketItem, locked, quantity, coins, storageRoom, storage.label);
  const sellReason = sellMarketDisabledReason(marketItem, locked, quantity, item.quantity);
  const buyTotal = marketItem.buy_price === null ? null : marketItem.buy_price * commandQuantity;
  const sellTotal = marketItem.sell_price === null ? null : marketItem.sell_price * commandQuantity;
  const activeReason = tradeMode === "buy" ? buyReason : sellReason;
  const activeTotal = tradeMode === "buy" ? buyTotal : sellTotal;
  const activeVerb = tradeMode === "buy" ? "Buy" : "Sell";
  const activeTitle =
    activeReason ??
    (tradeMode === "buy" ? `Spend ${activeTotal} coins` : `Gain ${activeTotal} coins`);
  const tradeCommand: FarmCommand =
    tradeMode === "buy"
      ? { type: "buy_market_item", item_id: item.item_id, quantity: commandQuantity }
      : { type: "sell_market_item", item_id: item.item_id, quantity: commandQuantity };

  return (
    <article className="market-trade" data-testid={`market-trade-${marketItem.item_id}`}>
      <div className="market-trade__hero">
        <ResourceIcon type="item" itemId={item.item_id} itemKind={item.kind} />
        <div>
          <h3>{item.name}</h3>
          <p>Owned {item.quantity}</p>
        </div>
      </div>
      <div className="market-trade__stats">
        <span>{marketItem.buy_price === null ? "Cannot buy" : `Buy price ${marketItem.buy_price} coins`}</span>
        <span>{marketItem.sell_price === null ? "Cannot sell" : `Sell price ${marketItem.sell_price} coins`}</span>
        <span>{storage.label} room {storageRoom}</span>
      </div>
      <div className="market-trade__mode" aria-label={`${item.name} trade mode`}>
        <button
          type="button"
          className={tradeMode === "buy" ? "market-trade__mode-button market-trade__mode-button--active" : "market-trade__mode-button"}
          aria-pressed={tradeMode === "buy"}
          onClick={() => onTradeMode("buy")}
        >
          Buy
        </button>
        <button
          type="button"
          className={tradeMode === "sell" ? "market-trade__mode-button market-trade__mode-button--active" : "market-trade__mode-button"}
          aria-pressed={tradeMode === "sell"}
          onClick={() => onTradeMode("sell")}
        >
          Sell
        </button>
      </div>
      <div className="market-item__quantity" aria-label={`${item.name} trade quantity`}>
        <button
          type="button"
          aria-label={`Decrease ${item.name} quantity`}
          onClick={() => onQuantityInput(String(Math.max(1, commandQuantity - 1)))}
        >
          -
        </button>
        <input
          aria-label={`${item.name} quantity`}
          type="number"
          min="1"
          step="1"
          value={quantityInput}
          onChange={(event) => onQuantityInput(event.target.value)}
        />
        <button
          type="button"
          aria-label={`Increase ${item.name} quantity`}
          onClick={() => onQuantityInput(String(commandQuantity + 1))}
        >
          +
        </button>
      </div>
      <button
        type="button"
        className="market-trade__submit"
        disabled={activeReason !== null}
        title={activeTitle}
        aria-label={`${activeVerb} ${commandQuantity} ${item.name}`}
        onClick={() => send(tradeCommand)}
      >
        {activeVerb} {activeTotal === null ? "" : activeTotal}
      </button>
      <small className="market-item__status">{activeReason ?? `${activeVerb} ${commandQuantity} for ${activeTotal} coins`}</small>
    </article>
  );
}
