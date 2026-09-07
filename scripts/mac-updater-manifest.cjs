const { existsSync, readdirSync, readFileSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");
const { parse, stringify } = require("yaml");

function setMacUpdaterMinimumSystemVersion(stageReleaseDir) {
  for (const [entry, contents] of snapshotMacUpdaterManifests(stageReleaseDir)) {
    const manifest = parse(contents.toString("utf8"));
    // electron-updater compares os.release(): macOS 13 corresponds to Darwin 22.
    manifest.minimumSystemVersion = "22.0.0";
    writeFileSync(join(stageReleaseDir, entry), stringify(manifest));
  }
}

function snapshotMacUpdaterManifests(stageReleaseDir) {
  if (!existsSync(stageReleaseDir)) return new Map();
  const snapshots = new Map();
  for (const entry of readdirSync(stageReleaseDir)) {
    if (!/^(?:latest|nightly)-mac\.yml$/u.test(entry)) continue;
    snapshots.set(entry, readFileSync(join(stageReleaseDir, entry)));
  }
  return snapshots;
}

function restoreMacUpdaterManifests(stageReleaseDir, snapshots) {
  for (const [entry, contents] of snapshots) {
    writeFileSync(join(stageReleaseDir, entry), contents);
  }
}

module.exports = {
  snapshotMacUpdaterManifests,
  restoreMacUpdaterManifests,
  setMacUpdaterMinimumSystemVersion,
};
