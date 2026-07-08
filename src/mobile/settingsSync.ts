import { applyExternalSharedSettings } from "@/renderer/state/sharedSettingsStore";
import {
  REMOTE_SETTINGS_KEYS,
  type RemoteSettings,
  type RemoteSettingsPatch,
} from "@/shared/remote";
import type { SharedSettingsInput } from "@/shared/settings";
import type { RemoteDesktopClient } from "./remoteClient";

/**
 * Two-way sync for the desktop's remote-editable settings (the AI helpers).
 * The PWA's settings store holds both kinds of keys: device-local ones that
 * live in this device's localStorage, and the remote keys mirrored here from
 * the paired desktop. Hydration pulls the desktop's values in (without
 * echoing a write); the bridge shim routes every store persist through
 * {@link pushDesktopSettingsDiff}, which forwards only the remote keys that
 * actually changed.
 */

let desktopSettings: RemoteSettings | null = null;
let pendingPushes = 0;
// Monotonic id of the most recent push. Only its resolution may write back to
// desktopSettings, so a slow or failed earlier push can't clobber the value a
// newer push already committed (nor a late push repopulate after a reset).
let latestPushToken = 0;

/** Remote-editable values are JSON data (scalars plus the agent/model
 * records); structural comparison is what "changed" means here. */
function settingChanged(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return false;
  if (typeof a === "object" && typeof b === "object" && a !== null && b !== null) {
    return JSON.stringify(a) !== JSON.stringify(b);
  }
  return true;
}

/** Applies the desktop's settings into the shared store (no write-back). */
export function applyDesktopSettings(settings: RemoteSettings): void {
  // A refresh fetched concurrently with an in-flight edit carries values from
  // before that edit; let the push response win instead of flip-flopping.
  if (pendingPushes > 0) return;
  desktopSettings = settings;
  applyExternalSharedSettings(settings);
}

/** Forget the synced snapshot (disconnect / switching desktops). */
export function resetDesktopSettings(): void {
  desktopSettings = null;
  // Invalidate any in-flight push so its late resolution can't repopulate the
  // snapshot for a desktop we've since switched away from.
  latestPushToken += 1;
}

/** Forwards changed remote-editable keys to the desktop. No-op until the
 * desktop's settings have been hydrated, so local defaults never clobber it. */
export function pushDesktopSettingsDiff(
  client: RemoteDesktopClient | null,
  settings: SharedSettingsInput,
): void {
  const synced = desktopSettings;
  if (!client || !synced) return;
  const patch: RemoteSettingsPatch = {};
  const merged: RemoteSettings = { ...synced };
  for (const key of REMOTE_SETTINGS_KEYS) {
    if (settingChanged(settings[key], synced[key])) {
      (patch as Record<string, unknown>)[key] = settings[key];
      (merged as Record<string, unknown>)[key] = settings[key];
    }
  }
  if (Object.keys(patch).length === 0) return;
  // Optimistically advance the snapshot so identical follow-up persists
  // (the store writes the full object on every change) don't re-send.
  desktopSettings = merged;
  pendingPushes += 1;
  const token = ++latestPushToken;
  client
    .updateSettings(patch)
    .then((next) => {
      // Ignore an out-of-order resolution from a superseded push.
      if (token === latestPushToken) desktopSettings = next;
    })
    .catch(() => {
      // Only the latest push's failure invalidates the snapshot; an older push
      // failing after a newer one succeeded must not discard the newer value.
      // Next hydration restores the desktop's truth.
      if (token === latestPushToken) desktopSettings = null;
    })
    .finally(() => {
      pendingPushes -= 1;
    });
}
