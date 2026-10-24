import { type CatalogDocument, type FarmView } from "@my-farm/contracts";

export function levelProgress(catalog: CatalogDocument, view: FarmView) {
  const thresholds = catalog.level_xp;
  const currentThreshold = thresholds[view.level] ?? 0;
  const nextThreshold = thresholds[view.level + 1] ?? null;
  if (nextThreshold === null || nextThreshold <= currentThreshold) {
    return {
      percent: 100,
      label: `Level ${view.level}, ${view.xp} XP, max level progress`,
    };
  }

  const earnedThisLevel = Math.max(0, view.xp - currentThreshold);
  const xpThisLevel = nextThreshold - currentThreshold;
  const percent = Math.min(100, Math.max(0, (earnedThisLevel / xpThisLevel) * 100));
  const remaining = Math.max(0, nextThreshold - view.xp);
  return {
    percent,
    label: `Level ${view.level}, ${view.xp} XP, ${remaining} XP to level ${view.level + 1}`,
  };
}

export function hudNoticeMessage(message: string) {
  const passiveMessages = new Set([
    "Demo farm loaded",
    "Local farm synced",
    "Default tool",
  ]);
  if (
    passiveMessages.has(message) ||
    message.startsWith("Loading ") ||
    message.startsWith("Scenario ")
  ) {
    return null;
  }
  return message;
}
