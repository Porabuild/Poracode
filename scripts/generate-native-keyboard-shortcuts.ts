import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { DEFAULT_KEYBINDINGS } from "../src/shared/keybindings";

const directory = resolve("ios/App/App/Features/KeyboardShortcuts");
const path = resolve(directory, "NativeKeyboardDefaults.json");
const content = JSON.stringify(DEFAULT_KEYBINDINGS, null, 2) + "\n";
if (process.argv.includes("--check")) {
  if (readFileSync(path, "utf8") !== content) throw new Error("Native keyboard defaults are stale");
} else {
  mkdirSync(directory, { recursive: true });
  writeFileSync(path, content);
}
console.log(
  `Native keyboard defaults ${process.argv.includes("--check") ? "are current" : "generated"}.`,
);
