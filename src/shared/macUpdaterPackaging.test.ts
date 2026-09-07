import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parse, stringify } from "yaml";

const requireFromHere = createRequire(import.meta.url);
const {
  restoreMacUpdaterManifests,
  snapshotMacUpdaterManifests,
  setMacUpdaterMinimumSystemVersion,
} = requireFromHere("../../scripts/mac-updater-manifest.cjs") as {
  snapshotMacUpdaterManifests: (directory: string) => Map<string, Buffer>;
  restoreMacUpdaterManifests: (directory: string, snapshots: Map<string, Buffer>) => void;
  setMacUpdaterMinimumSystemVersion: (directory: string) => void;
};

describe("macOS updater manifest packaging", () => {
  let releaseDir: string;

  beforeEach(() => {
    releaseDir = mkdtempSync(join(tmpdir(), "poracode-mac-manifest-"));
  });

  afterEach(() => {
    rmSync(releaseDir, { recursive: true, force: true });
  });

  it("rejects publishing before macOS metadata can be finalized", () => {
    const result = spawnSync(
      process.execPath,
      [
        fileURLToPath(new URL("../../scripts/build-desktop-artifact.mjs", import.meta.url)),
        "--platform",
        "mac",
        "--target",
        "zip",
        "--publish",
        "always",
        "--skip-build",
        "--check-runtime-deps",
      ],
      { encoding: "utf8" },
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "Use --publish never and upload the completed release artifacts separately.",
    );
    expect(result.stdout).not.toContain("[stage]");
  });

  it.each(["latest", "nightly"])(
    "restores %s ZIP metadata and the OS floor after the DMG pass",
    (channel) => {
      const manifestPath = join(releaseDir, `${channel}-mac.yml`);
      const zipManifest = 'path: Poracode-1.5.1-arm64.zip\nminimumSystemVersion: "22.0.0"\n';
      writeFileSync(manifestPath, zipManifest);
      const snapshots = snapshotMacUpdaterManifests(releaseDir);

      writeFileSync(manifestPath, "path: Poracode-1.5.1-arm64.dmg\n");
      restoreMacUpdaterManifests(releaseDir, snapshots);

      expect(readFileSync(manifestPath, "utf8")).toBe(zipManifest);
    },
  );

  it("preserves stable and nightly manifests without unrelated YAML files", () => {
    writeFileSync(join(releaseDir, "latest-mac.yml"), "stable");
    writeFileSync(join(releaseDir, "nightly-mac.yml"), "nightly");
    writeFileSync(join(releaseDir, "builder-debug.yml"), "debug");

    expect([...snapshotMacUpdaterManifests(releaseDir).keys()].sort()).toEqual([
      "latest-mac.yml",
      "nightly-mac.yml",
    ]);
  });

  it.each(["latest", "nightly"])("sets the Darwin floor in %s update metadata", (channel) => {
    const manifest = {
      version: "1.7.1",
      files: [{ url: "Poracode-1.7.1-arm64.zip", sha512: "abc==", size: 123 }],
      path: "Poracode-1.7.1-arm64.zip",
      sha512: "abc==",
      releaseDate: "2026-09-05T00:00:00.000Z",
      minimumSystemVersion: "13.0.0",
    };
    const manifestPath = join(releaseDir, `${channel}-mac.yml`);
    writeFileSync(manifestPath, stringify(manifest));
    writeFileSync(join(releaseDir, `${channel}.yml`), "windows metadata");

    setMacUpdaterMinimumSystemVersion(releaseDir);

    expect(parse(readFileSync(manifestPath, "utf8"))).toEqual({
      ...manifest,
      minimumSystemVersion: "22.0.0",
    });
    expect(readFileSync(join(releaseDir, `${channel}.yml`), "utf8")).toBe("windows metadata");
  });
});
