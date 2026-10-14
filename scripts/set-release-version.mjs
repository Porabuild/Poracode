#!/usr/bin/env node
/**
 * Set the release version in every publishable package manifest (root desktop
 * app + the publishable `poracode` npx entry). One implementation used by the
 * desktop build workflow, the server-artifact workflow and the release commit
 * step, so the npm launcher version always equals the released server version.
 *
 * Usage: node scripts/set-release-version.mjs <version>
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u;
const MANIFESTS = ["package.json", "packages/poracode-cli/package.json"];
const LAUNCHER_MANIFEST = "packages/poracode-cli/runtime-manifest.json";

export function setReleaseVersion(version, root = process.cwd()) {
  if (!VERSION_PATTERN.test(version)) {
    throw new Error(`Refusing to write a non-semver release version: ${version}`);
  }
  for (const relativePath of MANIFESTS) {
    const path = resolve(root, relativePath);
    const manifest = JSON.parse(readFileSync(path, "utf8"));
    manifest.version = version;
    writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`);
  }
  // The embedded launcher manifest must never disagree with the package
  // version. Its target table is replaced from the qualified artifact set by
  // the publication pipeline, so reset it here: a stale target would otherwise
  // point a new version at the previous release's bytes.
  const manifestPath = resolve(root, LAUNCHER_MANIFEST);
  const launcherManifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  launcherManifest.version = version;
  launcherManifest.targets = {};
  writeFileSync(manifestPath, `${JSON.stringify(launcherManifest, null, 2)}\n`);
  return [...MANIFESTS, LAUNCHER_MANIFEST].map((relativePath) => resolve(root, relativePath));
}

const invokedDirectly =
  process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  try {
    const version = process.argv[2];
    if (!version) throw new Error("Usage: set-release-version.mjs <version>");
    for (const path of setReleaseVersion(version)) process.stdout.write(`${path}\n`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
