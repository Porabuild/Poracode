import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

void test("PoracodeThemePresets.kt is up to date with the PWA theme source", () => {
  const result = spawnSync("bun", ["scripts/generate-android-themes.ts", "--check"], {
    cwd: root,
    encoding: "utf8",
  });
  assert.equal(
    result.status,
    0,
    `generated Android theme presets are stale — run \`bun scripts/generate-android-themes.ts\`.\n${result.stderr}${result.stdout}`,
  );
});
