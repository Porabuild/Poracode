import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * Apply the `prepare-server-native.mjs` overlay so node-pty (and the staged
 * better-sqlite3 binding) load without a C toolchain (V6 D.2).
 */

/**
 * docs/STANDALONE_SERVER.md §8: glibc and musl Linux prebuilds are distinct
 * directories (`linux-*` vs `linuxmusl-*`); mirror the packaging side's key.
 */
function runtimePlatformKey() {
  if (process.platform !== "linux") return process.platform;
  const report = process.report.getReport();
  return report.header?.glibcVersionRuntime ? "linux" : "linuxmusl";
}

function isTargetManifest(value) {
  if (!value || typeof value !== "object") return false;
  const target = value;
  return (
    typeof target.platform === "string" &&
    typeof target.arch === "string" &&
    typeof target.dir === "string" &&
    typeof target.overlayTarget === "string" &&
    target.overlayTarget.length > 0 &&
    !!target.stagedSha256 &&
    typeof target.stagedSha256 === "object"
  );
}

/**
 * Normalize a formatVersion 1 manifest (one host-shaped target) into the
 * formatVersion 2 target list. Kept so an older staged tree still applies;
 * new overlays are always written as formatVersion 2.
 */
function overlayTargets(overlay) {
  if (Array.isArray(overlay.targets)) {
    const targets = overlay.targets.filter(isTargetManifest);
    if (targets.length > 0) return targets;
  }
  if (
    typeof overlay.platform === "string" &&
    typeof overlay.arch === "string" &&
    typeof overlay.overlayTarget === "string" &&
    overlay.overlayTarget.length > 0 &&
    overlay.stagedSha256 &&
    typeof overlay.stagedSha256 === "object"
  ) {
    return [
      {
        platform: overlay.platform,
        arch: overlay.arch,
        dir: overlay.dir ?? `${overlay.platform}-${overlay.arch}`,
        overlayTarget: overlay.overlayTarget,
        stagedSha256: overlay.stagedSha256,
      },
    ];
  }
  throw new Error("node-pty overlay.json carries no staged targets.");
}

/**
 * Pick the staged target this runtime can load. Exact platform-key and arch
 * match only: a glibc host cannot load musl bindings and vice versa, and the
 * ABI is otherwise N-API (no Node ABI split).
 */
function selectOverlayTarget(targets) {
  const platform = runtimePlatformKey();
  const arch = process.arch;
  const match = targets.find((target) => target.platform === platform && target.arch === arch);
  if (match) return match;
  throw new Error(
    `node-pty overlay has no staged prebuild for ${platform}-${arch} ` +
      `(available: ${targets.map((target) => target.dir).join(", ") || "none"}).`,
  );
}

export function applyServerNativeOverlay(options) {
  const overlayPath = join(options.overlayRoot, "node-pty", "overlay.json");
  if (!existsSync(overlayPath)) {
    throw new Error(`node-pty overlay.json is missing at ${overlayPath}`);
  }
  const overlay = JSON.parse(readFileSync(overlayPath, "utf8"));
  const target = selectOverlayTarget(overlayTargets(overlay));
  const stagedDir = join(options.overlayRoot, "node-pty", target.dir);
  const dest = join(options.prefix, target.overlayTarget);
  mkdirSync(dest, { recursive: true });
  for (const [name, expected] of Object.entries(target.stagedSha256)) {
    const source = join(stagedDir, name);
    const bytes = readFileSync(source);
    const actual = createHash("sha256").update(bytes).digest("hex");
    if (actual !== expected) {
      throw new Error(`native overlay hash mismatch for ${name}`);
    }
    copyFileSync(source, join(dest, name));
  }

  const sqliteHost = join(options.overlayRoot, "better_sqlite3.node");
  const sqliteArch = join(
    options.overlayRoot,
    "better-sqlite3",
    `${runtimePlatformKey()}-${process.arch}.node`,
  );
  const sqliteSource = existsSync(sqliteArch) ? sqliteArch : sqliteHost;
  let betterSqliteBinding;
  if (existsSync(sqliteSource)) {
    betterSqliteBinding = join(options.prefix, "lib", "better_sqlite3.node");
    mkdirSync(dirname(betterSqliteBinding), { recursive: true });
    copyFileSync(sqliteSource, betterSqliteBinding);
  }
  return { nodePtyTarget: dest, betterSqliteBinding };
}
