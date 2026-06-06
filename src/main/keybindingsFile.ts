import { existsSync, readFileSync } from "node:fs";
import { writeFileAtomic } from "@/shared/atomicFile";
import {
  keybindingsFileSchema,
  serializeDefaultKeybindings,
  type KeybindingsConfig,
} from "@/shared/keybindings";

export function readKeybindingsFile(keybindingsPath: string): KeybindingsConfig {
  if (!existsSync(keybindingsPath)) {
    writeFileAtomic(keybindingsPath, serializeDefaultKeybindings(), { encoding: "utf8" });
  }

  const raw = readFileSync(keybindingsPath, "utf8");
  return {
    path: keybindingsPath,
    file: keybindingsFileSchema.parse(JSON.parse(raw)),
  };
}
