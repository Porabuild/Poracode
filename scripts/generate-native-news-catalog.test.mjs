import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

await test("native discovery copy covers every PWA feature in all supported locales", () => {
  execFileSync(process.execPath, ["scripts/generate-native-news-catalog.mjs", "--check"], {
    stdio: "pipe",
  });
  const catalog = JSON.parse(
    readFileSync("ios/App/App/Features/HomeNews/HomeNewsCatalog.json", "utf8"),
  );
  assert.equal(catalog.formatVersion, 1);
  assert.equal(
    new Set(catalog.features.map((feature) => feature.id)).size,
    catalog.features.length,
  );
  for (const feature of catalog.features) {
    assert.equal(Object.keys(feature.pitch).length, 13);
    assert.equal(Object.keys(feature.action).length, 13);
    assert.ok(Object.values(feature.pitch).every((message) => message.trim().length > 0));
    assert.ok(Object.values(feature.action).every((message) => message.trim().length > 0));
  }
});
