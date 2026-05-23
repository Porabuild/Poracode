// electron-builder afterPack hook.
//
// node-pty ships a `spawn-helper` binary that posix_spawn invokes to set up
// the pty. electron-builder's asar-unpack copy can strip the execute bit,
// which makes posix_spawnp fail at runtime with the opaque
// "posix_spawnp failed." error. Restore +x on every prebuild we ship.

const { existsSync, statSync, chmodSync, readdirSync } = require("node:fs");
const { join } = require("node:path");

function ensureExecutable(path) {
  if (!existsSync(path)) return false;
  const stat = statSync(path);
  if (!stat.isFile()) return false;
  if ((stat.mode & 0o111) === 0o111) return false;
  chmodSync(path, stat.mode | 0o111);
  return true;
}

function findResourcesDir(appOutDir, electronPlatformName) {
  if (electronPlatformName === "darwin" || electronPlatformName === "mas") {
    const entries = readdirSync(appOutDir).filter((name) => name.endsWith(".app"));
    if (entries.length === 0) return null;
    return join(appOutDir, entries[0], "Contents", "Resources");
  }
  if (electronPlatformName === "linux") {
    return join(appOutDir, "resources");
  }
  if (electronPlatformName === "win32") {
    return join(appOutDir, "resources");
  }
  return null;
}

function chmodNodePtyHelpers(resourcesDir) {
  const prebuildsRoot = join(
    resourcesDir,
    "app.asar.unpacked",
    "node_modules",
    "node-pty",
    "prebuilds",
  );
  if (!existsSync(prebuildsRoot)) return [];
  const fixed = [];
  for (const platformDir of readdirSync(prebuildsRoot)) {
    const helper = join(prebuildsRoot, platformDir, "spawn-helper");
    if (ensureExecutable(helper)) fixed.push(helper);
  }
  return fixed;
}

module.exports = async function afterPack(context) {
  const resourcesDir = findResourcesDir(context.appOutDir, context.electronPlatformName);
  if (!resourcesDir) return;
  const fixed = chmodNodePtyHelpers(resourcesDir);
  for (const path of fixed) {
    console.log(`[afterPack] chmod +x ${path}`);
  }
};
