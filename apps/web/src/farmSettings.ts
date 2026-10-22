import { useSyncExternalStore } from "react";

// Browser-local presentation preferences from the main-menu Settings panel.
export type FarmSettings = {
  sound: boolean;
  reducedMotion: boolean;
};

export const FARM_SETTINGS_KEY = "my-farm.settings.v1";
const DEFAULTS: FarmSettings = { sound: true, reducedMotion: false };
const listeners = new Set<() => void>();
let current: FarmSettings | null = null;

function load(): FarmSettings {
  try {
    const raw = window.localStorage.getItem(FARM_SETTINGS_KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<FarmSettings>) : {};
    return {
      sound: typeof parsed.sound === "boolean" ? parsed.sound : DEFAULTS.sound,
      reducedMotion: typeof parsed.reducedMotion === "boolean" ? parsed.reducedMotion : DEFAULTS.reducedMotion,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function farmSettings(): FarmSettings {
  current ??= load();
  return current;
}

export function updateFarmSettings(patch: Partial<FarmSettings>) {
  current = { ...farmSettings(), ...patch };
  try {
    window.localStorage.setItem(FARM_SETTINGS_KEY, JSON.stringify(current));
  } catch {
    // Storage may be unavailable (private mode); the setting still applies for this session.
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useFarmSettings(): FarmSettings {
  return useSyncExternalStore(subscribe, farmSettings, () => DEFAULTS);
}
