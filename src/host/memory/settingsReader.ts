import type { MemorySettings } from "@/shared/memory";
import { defaultMemorySettings } from "@/shared/memory";

let readSettings: () => MemorySettings = () => defaultMemorySettings;

export function setMemorySettingsReader(reader: () => MemorySettings): void {
  readSettings = reader;
}

export function readMemorySettings(): MemorySettings {
  try {
    return readSettings();
  } catch (error) {
    console.error("[memory] settings read failed:", error);
    return defaultMemorySettings;
  }
}
