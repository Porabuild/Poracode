import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import {
  defaultSharedSettings,
  normalizeSharedSettings,
  type SharedSettings,
} from "../shared/settings";

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
  mkdirSync(dirname(settingsPath), { recursive: true });
  writeFileSync(settingsPath, serializeSharedSettings(settings), "utf8");
}

export function extractLegacySharedSettings(raw: string | null): SharedSettings | null {
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as { state?: unknown } | null;
    return normalizeSharedSettings(parsed?.state ?? parsed);
  } catch {
    return null;
  }
}

export function ensureSharedSettingsFile(
  settingsPath: string,
  legacyRaw: string | null,
): SharedSettings {
  if (existsSync(settingsPath)) {
    const normalized = readSharedSettingsFile(settingsPath);
    writeSharedSettingsFile(settingsPath, normalized);
    return normalized;
  }

  const settings = extractLegacySharedSettings(legacyRaw) ?? { ...defaultSharedSettings };
  writeSharedSettingsFile(settingsPath, settings);
  return settings;
}
