const { existsSync, readdirSync, readFileSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");

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

module.exports = { snapshotMacUpdaterManifests, restoreMacUpdaterManifests };
