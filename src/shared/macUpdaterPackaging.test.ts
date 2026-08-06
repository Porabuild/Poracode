import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const requireFromHere = createRequire(import.meta.url);
const { restoreMacUpdaterManifests, snapshotMacUpdaterManifests } = requireFromHere(
  "../../scripts/mac-updater-manifest.cjs",
) as {
  snapshotMacUpdaterManifests: (directory: string) => Map<string, Buffer>;
  restoreMacUpdaterManifests: (directory: string, snapshots: Map<string, Buffer>) => void;
};

describe("macOS updater manifest packaging", () => {
  let releaseDir: string;

  beforeEach(() => {
    releaseDir = mkdtempSync(join(tmpdir(), "poracode-mac-manifest-"));
  });

  afterEach(() => {
    rmSync(releaseDir, { recursive: true, force: true });
  });

  it("restores ZIP metadata after the branded DMG pass overwrites it", () => {
    const manifestPath = join(releaseDir, "latest-mac.yml");
    writeFileSync(manifestPath, "path: Poracode-1.5.1-arm64.zip\n");
    const snapshots = snapshotMacUpdaterManifests(releaseDir);

    writeFileSync(manifestPath, "path: Poracode-1.5.1-arm64.dmg\n");
    restoreMacUpdaterManifests(releaseDir, snapshots);

    expect(readFileSync(manifestPath, "utf8")).toContain(".zip");
  });

  it("preserves stable and nightly manifests without unrelated YAML files", () => {
    writeFileSync(join(releaseDir, "latest-mac.yml"), "stable");
    writeFileSync(join(releaseDir, "nightly-mac.yml"), "nightly");
    writeFileSync(join(releaseDir, "builder-debug.yml"), "debug");

    expect([...snapshotMacUpdaterManifests(releaseDir).keys()].sort()).toEqual([
      "latest-mac.yml",
      "nightly-mac.yml",
    ]);
  });
});
