import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

await test("native custom theme presets and copy match the canonical PWA resources", () => {
  execFileSync("bun", ["scripts/generate-native-custom-themes.ts", "--check"], {
    stdio: "pipe",
  });
  const catalog = JSON.parse(
    readFileSync("ios/App/App/Features/CustomThemes/CustomThemeCatalog.json", "utf8"),
  );
  assert.equal(catalog.formatVersion, 1);
  assert.equal(new Set(catalog.presets.map((preset) => preset.id)).size, catalog.presets.length);
  const strings = JSON.parse(
    readFileSync("ios/App/App/Features/CustomThemes/CustomThemes.xcstrings", "utf8"),
  );
  for (const entry of Object.values(strings.strings)) {
    assert.equal(Object.keys(entry.localizations).length, 13);
    for (const value of Object.values(entry.localizations)) {
      assert.ok(value.stringUnit.value.trim().length > 0);
      assert.equal(value.stringUnit.state, "translated");
    }
  }
});
