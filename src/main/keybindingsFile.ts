import { existsSync, readFileSync } from "node:fs";
import { writeFileAtomic } from "@/shared/atomicFile";
import {
  type KeybindingsConfig,
  type KeybindingsFile,
  keybindingsFileSchema,
  serializeDefaultKeybindings,
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

export function writeKeybindingsFile(
  keybindingsPath: string,
  file: KeybindingsFile,
): KeybindingsConfig {
  const parsed = keybindingsFileSchema.parse(file);
  writeFileAtomic(keybindingsPath, `${JSON.stringify(parsed, null, 2)}\n`, { encoding: "utf8" });
  return { path: keybindingsPath, file: parsed };
}
