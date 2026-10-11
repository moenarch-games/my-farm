import type { FarmView } from "@my-farm/contracts";

// Presentation observations only. The Farm remains the authority for tasks,
// carried goods and stored quantities; this record never submits a Command.
export type HarvestObservation = {
  taskId: string;
  residentId: string;
  cropId: string;
  storedBefore: number;
};
export type GuidancePreferences = {
  dismissed: boolean;
  deposited: boolean;
  lastUpdateMs: number;
  harvests: HarvestObservation[];
};
const preferenceKey = `my-farm.guidance.v1:${import.meta.env.VITE_MY_FARM_RUNTIME ?? "server"}:${import.meta.env.VITE_API_BASE_URL ?? "local"}`;
export const freshGuidance = (): GuidancePreferences => ({
  dismissed: false, deposited: false, lastUpdateMs: 0, harvests: [],
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
      || !("harvests" in value) || !Array.isArray(value.harvests)) {
      return freshGuidance();
    }
    const harvests: HarvestObservation[] = [];
    for (const harvest of value.harvests) {
      if (!harvest || typeof harvest !== "object" || typeof harvest.taskId !== "string"
        || typeof harvest.residentId !== "string" || typeof harvest.cropId !== "string"
        || typeof harvest.storedBefore !== "number" || !Number.isFinite(harvest.storedBefore)) {
        return freshGuidance();
      }
      harvests.push({ taskId: harvest.taskId, residentId: harvest.residentId,
        cropId: harvest.cropId, storedBefore: harvest.storedBefore });
    }
    return { dismissed: value.dismissed, deposited: value.deposited,
      lastUpdateMs: value.lastUpdateMs, harvests };
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
  const harvests = [...next.harvests];
  for (const work of Object.values(view.resident_work)) {
    if (!work) { continue; }
    for (const task of work.queue) {
      const step = task.steps.find((candidate) => candidate.activity === "harvesting");
      if (!step || harvests.some((harvest) => harvest.taskId === task.id)) { continue; }
      const plot = view.field_plots.find((candidate) => candidate.id === step.target?.id);
      const cropId = plot?.crop?.item_id;
      if (!cropId) { continue; }
      harvests.push({ taskId: task.id, residentId: work.resident_id, cropId,
        storedBefore: view.inventory.find((item) => item.item_id === cropId)?.quantity ?? 0 });
    }
  }
  const deposited = next.deposited || harvests.some((harvest) => {
    const work = view.resident_work[harvest.residentId];
    if (!work || work.block) { return false; }
    const task = work.queue.find((candidate) => candidate.id === harvest.taskId);
    // A task may still return its tools after its Silo Deposit Step completed.
    const depositPending = task?.steps.some((step) => step.activity === "harvesting"
      || (step.activity === "depositing_inventory" && step.target?.kind === "silo"));
    const stored = view.inventory.find((item) => item.item_id === harvest.cropId)?.quantity ?? 0;
    return !depositPending && stored > harvest.storedBefore;
  });
  // Do not let a later unrelated inventory increase credit an old, vanished task.
  const pendingHarvests = harvests.filter((harvest) => {
    const task = view.resident_work[harvest.residentId]?.queue.find((candidate) => candidate.id === harvest.taskId);
    return task?.steps.some((step) => step.activity === "harvesting"
      || (step.activity === "depositing_inventory" && step.target?.kind === "silo"));
  });
  return { ...next, deposited, harvests: deposited ? [] : pendingHarvests, lastUpdateMs: view.last_update_ms };
}
