import { existsSync, readFileSync } from "node:fs";
import { writeFileAtomic } from "@/shared/atomicFile";
import {
  defaultSharedSettings,
  normalizeSharedSettings,
  type SharedSettings,
} from "@/shared/settings";

function serializeSharedSettings(settings: SharedSettings): string {
  return `${JSON.stringify(settings, null, 2)}\n`;
}

export function readSharedSettingsFile(settingsPath: string): SharedSettings {
  if (!existsSync(settingsPath)) {
    return { ...defaultSharedSettings };
  }

  try {
    return normalizeSharedSettings(JSON.parse(readFileSync(settingsPath, "utf8")));
  } catch {
    return { ...defaultSharedSettings };
  }
}

export function writeSharedSettingsFile(settingsPath: string, settings: SharedSettings): void {
  writeFileAtomic(settingsPath, serializeSharedSettings(settings), { encoding: "utf8" });
}

/** Merges a partial update into the settings on disk and returns the result.
 * Used by write paths that don't hold the full settings object (the remote
 * settings API); `undefined` patch values are ignored rather than written. */
export function patchSharedSettingsFile(
  settingsPath: string,
  patch: { [K in keyof SharedSettings]?: SharedSettings[K] | undefined },
): SharedSettings {
  const next = readSharedSettingsFile(settingsPath);
  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined) (next as Record<string, unknown>)[key] = value;
  }
  writeSharedSettingsFile(settingsPath, next);
  return next;
}
