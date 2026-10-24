import { type MarketItemDef } from "@my-farm/contracts";

export function buyMarketDisabledReason(
  marketItem: MarketItemDef,
  locked: boolean,
  quantity: number,
  coins: number,
  storageRoom: number,
  storageLabel: string,
) {
  if (locked) {
    return `Unlocks at level ${marketItem.unlock_level}`;
  }
  if (marketItem.buy_price === null) {
    return "Cannot buy here";
  }
  if (!Number.isInteger(quantity) || quantity < 1) {
    return "Choose at least 1";
  }
  const total = marketItem.buy_price * quantity;
  if (coins < total) {
    return `Need ${total} coins`;
  }
  if (storageRoom < quantity) {
    return `${storageLabel} full`;
  }
  return null;
}

export function sellMarketDisabledReason(
  marketItem: MarketItemDef,
  locked: boolean,
  quantity: number,
  owned: number,
) {
  if (locked) {
    return `Unlocks at level ${marketItem.unlock_level}`;
  }
  if (marketItem.sell_price === null) {
    return "Cannot sell here";
  }
  if (!Number.isInteger(quantity) || quantity < 1) {
    return "Choose at least 1";
  }
  if (owned < quantity) {
    return `Need ${quantity} owned`;
  }
  return null;
}
