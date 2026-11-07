import { create } from "zustand";
import { isTrackedFeatureSignal, type FeatureSignal } from "@/shared/featureDiscovery";
import { readStoredJson, writeStoredJson } from "@/renderer/utils/localStorage";

/**
 * Device-local record of which parts of the app the user has opened or run
 * (`settings:crews`, `view:schedules`, `command:browser.toggle`, ...). Feature
 * discovery treats a recorded signal as "already knows about it" and stops
 * promoting that feature. Nothing here leaves the device.
 */
export const FEATURE_USAGE_STORAGE_KEY = "poracode-feature-signals";
const MAX_SIGNALS = 256;

function readSignals(): Record<string, number> {
  const value = readStoredJson(FEATURE_USAGE_STORAGE_KEY);
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  const signals: Record<string, number> = {};
  for (const [key, at] of Object.entries(value)) {
    if (typeof at === "number" && Number.isFinite(at)) signals[key] = at;
  }
  return signals;
}

interface FeatureUsageState {
  /** Signal → first time it was recorded (epoch ms). */
  signals: Record<string, number>;
  record: (signal: FeatureSignal) => void;
}

export const useFeatureUsageStore = create<FeatureUsageState>((set, get) => ({
  signals: readSignals(),
  record: (signal) => {
    const current = get().signals;
    if (signal in current || !isTrackedFeatureSignal(signal)) return;
    const entries = Object.entries({ ...current, [signal]: Date.now() });
    // Settings, view, and panel ids are a small closed set and commands are
    // allowlisted, so the cap is a backstop rather than routine eviction.
    const signals = Object.fromEntries(
      entries.toSorted((a, b) => b[1] - a[1]).slice(0, MAX_SIGNALS),
    );
    writeStoredJson(FEATURE_USAGE_STORAGE_KEY, signals);
    set({ signals });
  },
}));

export function recordFeatureSignal(signal: FeatureSignal): void {
  useFeatureUsageStore.getState().record(signal);
}
