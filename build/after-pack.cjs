// electron-builder afterPack hook.
//
// node-pty ships a `spawn-helper` binary that posix_spawn invokes to set up
// the pty. Keep only the target platform/architecture prebuild in each thin
// package, then restore +x because electron-builder's asar-unpack copy can
// strip the execute bit and make posix_spawnp fail with the opaque
// "posix_spawnp failed." error.

const {
  existsSync,
  statSync,
  chmodSync,
  readFileSync,
  readdirSync,
  mkdirSync,
  cpSync,
  writeFileSync,
  rmSync,
} = require("node:fs");
const { spawnSync } = require("node:child_process");
const { join, resolve } = require("node:path");

// electron-builder's Arch enum is numeric: ia32=0, x64=1, armv7l=2, arm64=3,
// universal=4. Map to the node-pty prebuilds/<plat>-<arch> directory names.
const ARCH_NAME = { 0: "ia32", 1: "x64", 2: "arm", 3: "arm64", 4: "universal" };

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

// Walk an @electron/asar raw header to a nested file entry, or null if absent.
function lookupAsarEntry(header, segments) {
  let node = header;
  for (const seg of segments) {
    node = node && node.files && node.files[seg];
    if (!node) return null;
  }
  return node;
}

function platformTag(electronPlatformName) {
  if (electronPlatformName === "darwin" || electronPlatformName === "mas") return "darwin";
  if (electronPlatformName === "win32") return "win32";
  return "linux";
}

// npm installs every node-pty prebuild from its package tarball. electron-builder
// preserves all of them under app.asar.unpacked, including the Intel-only macOS
// spawn-helper in an arm64 app. macOS treats that nested helper as an Intel-based
// component and displays its end-of-support warning even though Poracode itself
// and the helper it actually loads are arm64. Remove all foreign prebuilds from
// each thin package before signing. Older better-sqlite3 packages used a similar
// bin/<platform>-<arch>-<abi> layout, so prune those defensively as well.
function pruneForeignNativePrebuilds(resourcesDir, electronPlatformName, archName) {
  const expectedPrefix = `${platformTag(electronPlatformName)}-${archName}`;
  const roots = [
    {
      path: join(resourcesDir, "app.asar.unpacked", "node_modules", "node-pty", "prebuilds"),
      keep: (entry) => entry === expectedPrefix,
    },
    {
      path: join(resourcesDir, "app.asar.unpacked", "node_modules", "better-sqlite3", "bin"),
      keep: (entry) => entry === expectedPrefix || entry.startsWith(`${expectedPrefix}-`),
    },
  ];

  const removed = [];
  for (const root of roots) {
    if (!existsSync(root.path)) continue;
    for (const entry of readdirSync(root.path)) {
      if (root.keep(entry)) continue;
      const foreignPath = join(root.path, entry);
      rmSync(foreignPath, { recursive: true, force: true });
      removed.push(foreignPath);
    }
  }
  return removed;
}

// The packaging script (build-desktop-artifact.mjs) rebuilds better-sqlite3 for
// every target arch and stages each under <stageRoot>/native/<arch>/. A single
// multi-arch electron-builder pass packs only one of those binaries into BOTH
// installers, so the off-host arch would otherwise ship a wrong-arch
// better_sqlite3.node and crash. Inject the arch-correct staged binary into this
// arch's app.asar.unpacked (where the asar-unpacked module loads it), before
// code signing. Required for x64/arm64 — throw if the staged binary is missing.
function injectBetterSqliteBinary(context, resourcesDir, archName) {
  if (archName !== "x64" && archName !== "arm64") return;
  const projectDir =
    context.packager?.info?.projectDir ??
    context.packager?.projectDir ??
    resolve(context.appOutDir, "..", "..");
  const staged = join(projectDir, "native", archName, "better_sqlite3.node");
  if (!existsSync(staged)) {
    throw new Error(
      `[afterPack] FATAL: staged better-sqlite3 binary for ${archName} missing at ${staged}; ` +
        `refusing to ship a wrong-arch package.`,
    );
  }
  const destDir = join(
    resourcesDir,
    "app.asar.unpacked",
    "node_modules",
    "better-sqlite3",
    "build",
    "Release",
  );
  mkdirSync(destDir, { recursive: true });
  cpSync(staged, join(destDir, "better_sqlite3.node"));
  console.log(`[afterPack] injected ${archName} better_sqlite3.node`);
}

// Fail-fast guard: a packaged app is only shippable if its native modules can
// actually load at runtime. better-sqlite3's compiled binary must be present
// AND the module must be asar-UNPACKED (electron resolves an unpacked module's
// __dirname into app.asar.unpacked; if the module is packed inside app.asar,
// `bindings` searches inside the archive and the app crashes on launch with
// "Could not locate the bindings file"). node-pty must have a loadable binary
// for the target arch (it loads build/Release/pty.node OR a prebuild). If any
// invariant is violated we THROW so electron-builder aborts before producing or
// publishing a broken installer.
function assertNativeBinaries(resourcesDir, electronPlatformName, arch) {
  const archName = ARCH_NAME[arch];
  if (!archName) {
    throw new Error(`[afterPack] FATAL: unknown electron-builder Arch enum value ${arch}`);
  }
  const platTag = platformTag(electronPlatformName);

  const unpacked = join(resourcesDir, "app.asar.unpacked", "node_modules");

  // 1. better-sqlite3 compiled binary present in the unpacked tree.
  const betterSqliteBinary = join(
    unpacked,
    "better-sqlite3",
    "build",
    "Release",
    "better_sqlite3.node",
  );
  if (!existsSync(betterSqliteBinary)) {
    throw new Error(
      `[afterPack] FATAL: better-sqlite3 native binary missing — refusing to publish a broken app:\n  ${betterSqliteBinary}`,
    );
  }

  // 2. better-sqlite3 must be asar-UNPACKED, not packed inside app.asar. Inspect
  //    the asar header: an unpacked file carries `unpacked: true`; a packed file
  //    carries an `offset`. If its JS sits inside the archive, the runtime
  //    bindings search resolves inside app.asar and the app crashes on launch.
  const asarPath = join(resourcesDir, "app.asar");
  if (existsSync(asarPath)) {
    let asar;
    try {
      asar = require("@electron/asar");
    } catch {
      console.warn("[afterPack] @electron/asar unavailable; skipping in-asar packing check");
      asar = null;
    }
    if (asar) {
      const { header } = asar.getRawHeader(asarPath);
      const dbEntry = lookupAsarEntry(header, [
        "node_modules",
        "better-sqlite3",
        "lib",
        "database.js",
      ]);
      if (dbEntry && dbEntry.unpacked !== true && dbEntry.offset !== undefined) {
        throw new Error(
          "[afterPack] FATAL: better-sqlite3 is packed INSIDE app.asar (not unpacked); " +
            "its native bindings would resolve inside the archive and crash on launch. " +
            "Refusing to publish.",
        );
      }
    }
  }

  // 3. node-pty must ship a loadable binary for this arch. It loads from
  //    build/Release/pty.node (Linux, which has no prebuild) OR from a
  //    prebuilds/<plat>-<arch>/pty.node (mac/win ship prebuilts).
  const ptyCandidates = [
    join(unpacked, "node-pty", "build", "Release", "pty.node"),
    join(unpacked, "node-pty", "prebuilds", `${platTag}-${archName}`, "pty.node"),
  ];
  if (!ptyCandidates.some((p) => existsSync(p))) {
    throw new Error(
      `[afterPack] FATAL: node-pty native binary missing for ${platTag}-${archName} — refusing to publish:\n  ${ptyCandidates.join("\n  ")}`,
    );
  }

  console.log(
    `[afterPack] verified native binaries for ${platTag}-${archName}: better-sqlite3 (unpacked) + node-pty`,
  );
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

function computerUseTarget(electronPlatformName, archName) {
  if (electronPlatformName === "darwin" || electronPlatformName === "mas") {
    return { directory: "darwin-universal", executable: "poracode-computer-use" };
  }
  if (electronPlatformName === "win32") {
    if (archName !== "x64" && archName !== "arm64") {
      throw new Error(`[afterPack] FATAL: unsupported Windows computer-use arch ${archName}`);
    }
    return { directory: `win32-${archName}`, executable: "poracode-computer-use.exe" };
  }
  if (electronPlatformName === "linux") {
    if (archName !== "x64") {
      throw new Error(`[afterPack] FATAL: unsupported Linux computer-use arch ${archName}`);
    }
    return { directory: `linux-${archName}`, executable: "poracode-computer-use" };
  }
  throw new Error(`[afterPack] FATAL: unsupported computer-use platform ${electronPlatformName}`);
}

function allowMissingComputerUseHelper() {
  return /^(1|true|yes)$/i.test(process.env.PORACODE_ALLOW_MISSING_COMPUTER_USE_HELPER ?? "");
}

function pruneForeignComputerUseHelpers(resourcesDir, electronPlatformName, archName) {
  const root = join(resourcesDir, "computer-use-helper");
  if (!existsSync(root)) return [];
  const expected = computerUseTarget(electronPlatformName, archName).directory;
  const removed = [];
  for (const entry of readdirSync(root)) {
    if (entry === "manifest.json" || entry === expected) continue;
    const foreignPath = join(root, entry);
    rmSync(foreignPath, { recursive: true, force: true });
    removed.push(foreignPath);
  }
  return removed;
}

function assertComputerUseHelper(resourcesDir, electronPlatformName, archName) {
  const root = join(resourcesDir, "computer-use-helper");
  const manifestPath = join(root, "manifest.json");
  if (!existsSync(manifestPath)) {
    throw new Error(`[afterPack] FATAL: computer-use helper manifest missing at ${manifestPath}`);
  }
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch (error) {
    throw new Error(
      `[afterPack] FATAL: invalid computer-use helper manifest: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }

  const target = computerUseTarget(electronPlatformName, archName);
  if (
    !Number.isInteger(manifest.clientProtocolVersion) ||
    manifest.protocolVersion !== manifest.clientProtocolVersion ||
    !Number.isInteger(manifest.minClientProtocolVersion) ||
    manifest.minClientProtocolVersion < 1 ||
    manifest.minClientProtocolVersion > manifest.clientProtocolVersion
  ) {
    throw new Error(
      "[afterPack] FATAL: computer-use helper protocol is incompatible with the staged client protocol",
    );
  }
  if (!Array.isArray(manifest.targets) || !manifest.targets.includes(target.directory)) {
    throw new Error(
      `[afterPack] FATAL: computer-use helper manifest does not contain ${target.directory}`,
    );
  }
  const executable = join(root, target.directory, target.executable);
  if (
    !existsSync(executable) ||
    !statSync(executable).isFile() ||
    statSync(executable).size === 0
  ) {
    throw new Error(
      `[afterPack] FATAL: computer-use helper missing or empty for ${target.directory}: ${executable}`,
    );
  }

  if (electronPlatformName !== "win32") ensureExecutable(executable);
  if (target.directory === "darwin-universal") {
    const lipo = spawnSync("lipo", ["-archs", executable], { encoding: "utf8" });
    if (lipo.error || lipo.status !== 0) {
      throw new Error(
        `[afterPack] FATAL: could not inspect macOS computer-use helper: ${lipo.error?.message ?? lipo.stderr}`,
      );
    }
    const architectures = new Set(lipo.stdout.trim().split(/\s+/));
    if (!architectures.has("x86_64") || !architectures.has("arm64")) {
      throw new Error(
        `[afterPack] FATAL: macOS computer-use helper is not universal: ${lipo.stdout.trim()}`,
      );
    }
  }
  if (manifest.targets.length !== 1 || manifest.targets[0] !== target.directory) {
    manifest.targets = [target.directory];
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  }
  console.log(`[afterPack] verified computer-use helper for ${target.directory}`);
}

module.exports = async function afterPack(context) {
  const resourcesDir = findResourcesDir(context.appOutDir, context.electronPlatformName);
  if (!resourcesDir) {
    throw new Error(
      `[afterPack] FATAL: could not locate resources dir for platform ${context.electronPlatformName}`,
    );
  }
  // Replace the (possibly off-host-arch) binary electron-builder packed with the
  // arch-correct one staged per target arch.
  const archName = ARCH_NAME[context.arch];
  injectBetterSqliteBinary(context, resourcesDir, archName);
  const removed = pruneForeignNativePrebuilds(resourcesDir, context.electronPlatformName, archName);
  for (const path of removed) {
    console.log(`[afterPack] pruned foreign native prebuild ${path}`);
  }
  const removedHelpers = pruneForeignComputerUseHelpers(
    resourcesDir,
    context.electronPlatformName,
    archName,
  );
  for (const path of removedHelpers) {
    console.log(`[afterPack] pruned foreign computer-use helper ${path}`);
  }
  // Throws if a required native binary is missing or mis-packed, so a broken
  // app can never be packaged or published.
  assertNativeBinaries(resourcesDir, context.electronPlatformName, context.arch);
  if (allowMissingComputerUseHelper()) {
    console.warn(
      "[afterPack] PORACODE_ALLOW_MISSING_COMPUTER_USE_HELPER is set; skipping the computer-use helper assertion",
    );
  } else {
    assertComputerUseHelper(resourcesDir, context.electronPlatformName, archName);
  }
  const fixed = chmodNodePtyHelpers(resourcesDir);
  for (const path of fixed) {
    console.log(`[afterPack] chmod +x ${path}`);
  }
};
