import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { parse } from "yaml";
import { SUPPORTED_LOCALES } from "../src/shared/locale.ts";
import { buildElectronBuilderConfig, buildStagePackageJson } from "./build-desktop-artifact.mjs";

void test("pins runtime, required peers and packaging tools to installed versions", (t) => {
  const root = mkdtempSync(join(tmpdir(), "desktop-stage-test-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  const installed = {};
  for (const name of [...Object.keys(pkg.dependencies), "electron", "electron-builder"]) {
    const directory = join(root, name);
    mkdirSync(directory, { recursive: true });
    installed[name] = "1.2.3";
    writeFileSync(
      join(directory, "package.json"),
      JSON.stringify({
        version: installed[name],
        ...(name === "ws"
          ? {
              peerDependencies: { react: "*", typescript: "*" },
              peerDependenciesMeta: { typescript: { optional: true } },
            }
          : {}),
      }),
    );
  }
  const stage = buildStagePackageJson(pkg, root);
  assert.ok(Object.keys(stage.dependencies).length >= 19);
  for (const [name, version] of Object.entries({ ...stage.dependencies, ...stage.devDependencies }))
    assert.equal(version, installed[name]);
  assert.equal(stage.dependencies.react, "1.2.3");
  assert.equal(stage.dependencies.typescript, undefined);
  assert.deepEqual(stage.overrides, pkg.overrides);
  rmSync(join(root, "ws", "package.json"));
  assert.throws(() => buildStagePackageJson(pkg, root), /not installed/);
});

void test("preserves supported Electron locales on Windows/Linux and macOS", () => {
  const config = parse(buildElectronBuilderConfig());
  // electron-builder matches literal tags or a wanted tag starting with language + '-'/'_'.
  const keeps = (language) =>
    config.electronLanguages.some(
      (wanted) =>
        wanted.toLowerCase() === language.toLowerCase() ||
        wanted.toLowerCase().startsWith(`${language.toLowerCase()}-`) ||
        wanted.toLowerCase().startsWith(`${language.toLowerCase()}_`),
    );
  for (const locale of SUPPORTED_LOCALES) {
    for (const language of locale === "en"
      ? ["en", "en-US", "en-GB"]
      : [locale, locale.replaceAll("-", "_")])
      assert.equal(keeps(language), true, language);
  }
  assert.equal(keeps("it"), false);
  assert.ok(config.files.includes("!node_modules/effect/src/**/*"));
  assert.ok(config.files.includes("node_modules/**/*"));
  assert.ok(config.asarUnpack.includes("node_modules/better-sqlite3/**/*"));
});
