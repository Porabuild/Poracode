import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

await test("native shortcut defaults track the canonical PWA configuration", () => {
  execFileSync("bun", ["scripts/generate-native-keyboard-shortcuts.ts", "--check"], {
    stdio: "pipe",
  });
  const defaults = JSON.parse(
    readFileSync("ios/App/App/Features/KeyboardShortcuts/NativeKeyboardDefaults.json", "utf8"),
  );
  assert.equal(defaults.version, 1);
  assert.ok(defaults.keybindings.length > 0);
});
