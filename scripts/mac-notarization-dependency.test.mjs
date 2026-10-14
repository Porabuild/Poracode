import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  MAC_NOTARIZE_VERSION,
  verifyMacNotarizationDependency,
} from "./mac-notarization-dependency.mjs";

async function writePackage(root, name, version) {
  const packageRoot = join(root, "node_modules", name);
  await mkdir(join(packageRoot, "lib"), { recursive: true });
  await writeFile(
    join(packageRoot, "package.json"),
    JSON.stringify({ name, version, main: "lib/index.js" }),
  );
  await writeFile(join(packageRoot, "lib/index.js"), "");
  return packageRoot;
}

async function createStage(t, version) {
  const root = await mkdtemp(join(tmpdir(), "poracode-notarization-dependency-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, "package.json"), "{}");
  await writePackage(root, "electron-builder", "26.15.3");
  const appBuilder = await writePackage(root, "app-builder-lib", "26.15.3");
  await writePackage(root, "@electron/notarize", version);
  return { root, appBuilder };
}

void test("macOS staging accepts the fixed notarize dependency", async (t) => {
  const { root } = await createStage(t, "3.1.2");
  assert.equal(verifyMacNotarizationDependency(root), "3.1.2");
});

void test("macOS staging refuses the previous dependency without effective retries", async (t) => {
  const { root } = await createStage(t, "2.5.0");
  assert.throws(
    () => verifyMacNotarizationDependency(root),
    /resolved @electron\/notarize@2\.5\.0/u,
  );
});

void test("macOS staging checks the builder's dependency rather than a hoisted copy", async (t) => {
  const { root, appBuilder } = await createStage(t, MAC_NOTARIZE_VERSION);
  await writePackage(appBuilder, "@electron/notarize", "2.5.0");
  assert.throws(
    () => verifyMacNotarizationDependency(root),
    /resolved @electron\/notarize@2\.5\.0/u,
  );
});

void test("macOS staging refuses an unqualified newer notarize dependency", async (t) => {
  const { root } = await createStage(t, "3.1.3");
  assert.throws(
    () => verifyMacNotarizationDependency(root),
    /resolved @electron\/notarize@3\.1\.3/u,
  );
});
