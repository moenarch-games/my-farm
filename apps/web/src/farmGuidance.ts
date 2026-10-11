import type { FarmView } from "@my-farm/contracts";

// Presentation observations only. The Farm remains the authority for tasks,
// carried goods and stored quantities; this record never submits a Command.
export type GuidancePreferences = {
  dismissed: boolean;
  deposited: boolean;
  lastUpdateMs: number;
};
const preferenceKey = `my-farm.guidance.v1:${import.meta.env.VITE_MY_FARM_RUNTIME ?? "server"}:${import.meta.env.VITE_API_BASE_URL ?? "local"}`;
export const freshGuidance = (): GuidancePreferences => ({
  dismissed: false, deposited: false, lastUpdateMs: 0,
});

export function loadGuidance(): GuidancePreferences {
  try {
    const raw = localStorage.getItem(preferenceKey);
    if (!raw) { return freshGuidance(); }
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object") { return freshGuidance(); }
    if (!("dismissed" in value) || typeof value.dismissed !== "boolean"
      || !("deposited" in value) || typeof value.deposited !== "boolean"
      || !("lastUpdateMs" in value) || typeof value.lastUpdateMs !== "number" || !Number.isFinite(value.lastUpdateMs)
    ) {
      return freshGuidance();
    }
    return { dismissed: value.dismissed, deposited: false,
      lastUpdateMs: value.lastUpdateMs };
  } catch (error) {
    // Help is optional when storage is blocked or its old record is invalid.
    console.warn("Farm guidance preferences could not be loaded", error);
    return freshGuidance();
  }
}

export function persistGuidance(preferences: GuidancePreferences) {
  try { localStorage.setItem(preferenceKey, JSON.stringify(preferences)); }
  catch (error) { console.warn("Farm guidance preferences could not be saved", error); }
}

export function observeGuidance(previous: GuidancePreferences, view: FarmView): GuidancePreferences {
  // A restored older Farm cannot inherit later completion claims. Explicit reset
  // also clears this UI record even when its new timestamp is newer.
  const next = view.last_update_ms < previous.lastUpdateMs ? freshGuidance() : previous;
  // The core receipt is historical proof even if later work spends the same Crop.
  // Browser preferences, queue disappearance and net stock never establish it.
  const deposited = Object.values(view.resident_last_harvest_deposit ?? {}).some((receipt) => Boolean(receipt));
  return { ...next, deposited, lastUpdateMs: view.last_update_ms };
}
