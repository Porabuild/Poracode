import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, normalize, sep } from "node:path";

/**
 * Apply the `prepare-server-native.mjs` overlay so node-pty loads without a C
 * toolchain (V6 D.2).
 *
 * This file is the single overlay implementation. It ships inside the server
 * tarball (`scripts/server-native-overlay.mjs`), the TypeScript reader
 * (`src/server/serverNativeOverlay.ts`) re-exports it, the prefix installer
 * imports it, and the D1 launcher invokes the copy extracted from the very
 * tarball it verified. Do not create a second copy.
 *
 * Overlay format (docs/.agents/docs/versioning.md):
 * - node-pty `node-pty/overlay.json` formatVersion 2 carries one staged target
 *   per machine shape; formatVersion 1 (single host-shaped target) still
 *   applies.
 * - better-sqlite3 `better-sqlite3/overlay.json` formatVersion 1 records the
 *   wrapper version and the staged binding for each target. Its binding is not
 *   copied (better-sqlite3 13 loads its own shipped prebuilds); the manifest
 *   only carries the wrapper-version evidence the install validates.
 *
 * Every copied binding is verified against the staged sha256, and — when the
 * install prefix carries the pinned stage `package.json` — the recorded
 * wrapper version must equal the dependency version the install will resolve.
 * A mismatch fails closed instead of loading a binding from another wrapper.
 */

/**
 * docs/STANDALONE_SERVER.md §3.4: glibc and musl Linux prebuilds are distinct
 * directories (`linux-*` vs `linuxmusl-*`); mirror the packaging side's key.
 */
export function runtimePlatformKey() {
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
export function overlayTargets(overlay) {
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
export function selectOverlayTarget(targets, platform = runtimePlatformKey(), arch = process.arch) {
  const match = targets.find((target) => target.platform === platform && target.arch === arch);
  if (match) return match;
  throw new Error(
    `node-pty overlay has no staged prebuild for ${platform}-${arch} ` +
      `(available: ${targets.map((target) => target.dir).join(", ") || "none"}).`,
  );
}

/** Reject an overlay destination that would escape the install prefix. */
function assertContainedRelativePath(path, what) {
  if (typeof path !== "string" || path.length === 0 || isAbsolute(path)) {
    throw new Error(`${what} must be a relative path inside the install prefix: ${String(path)}`);
  }
  const normalized = normalize(path);
  if (normalized === ".." || normalized.startsWith(`..${sep}`)) {
    throw new Error(`${what} escapes the install prefix: ${path}`);
  }
  return normalized;
}

export function readNodePtyOverlay(overlayRoot) {
  const overlayPath = join(overlayRoot, "node-pty", "overlay.json");
  if (!existsSync(overlayPath)) {
    throw new Error(`node-pty overlay.json is missing at ${overlayPath}`);
  }
  return JSON.parse(readFileSync(overlayPath, "utf8"));
}

/**
 * The better-sqlite3 overlay manifest is optional for backwards compatibility:
 * a tarball assembled before this metadata existed still installs through the
 * legacy host/`<target>.node` lookup.
 */
export function readBetterSqlite3Overlay(overlayRoot) {
  const overlayPath = join(overlayRoot, "better-sqlite3", "overlay.json");
  if (!existsSync(overlayPath)) return null;
  return JSON.parse(readFileSync(overlayPath, "utf8"));
}

/** Target keys covered by the staged better-sqlite3 overlay. */
export function betterSqlite3OverlayTargets(overlay) {
  if (!overlay) return [];
  if (!Array.isArray(overlay.targets)) {
    throw new Error("better-sqlite3 overlay.json carries no staged targets.");
  }
  return overlay.targets.map((target) => target.dir);
}

/**
 * Fail closed when the staged bindings belong to a different wrapper version
 * than the one `npm install` will resolve in this prefix.
 */
export function validateOverlayWrapperVersions(options) {
  const prefix = options.prefix;
  const overlayRoot = options.overlayRoot;
  const packagePath = join(prefix, "package.json");
  if (!existsSync(packagePath)) return { checked: false, reason: "no stage package.json" };
  const stagePackage = JSON.parse(readFileSync(packagePath, "utf8"));
  const dependencies = stagePackage.dependencies ?? {};
  const checked = [];

  const nodePty = readNodePtyOverlay(overlayRoot);
  if (typeof nodePty.version === "string" && nodePty.version.length > 0) {
    const expected = dependencies["node-pty"];
    if (typeof expected === "string" && expected !== nodePty.version) {
      throw new Error(
        `native overlay mismatch: staged node-pty ${nodePty.version} but package.json pins ` +
          `${expected}. Rebuild the overlay with \`pnpm run prepare:server-native\`.`,
      );
    }
    checked.push({ package: "node-pty", version: nodePty.version });
  }

  const betterSqlite3 = readBetterSqlite3Overlay(overlayRoot);
  if (betterSqlite3 && typeof betterSqlite3.version === "string") {
    const expected = dependencies["better-sqlite3"];
    if (typeof expected === "string" && expected !== betterSqlite3.version) {
      throw new Error(
        `native overlay mismatch: staged better-sqlite3 ${betterSqlite3.version} but ` +
          `package.json pins ${expected}. Rebuild the overlay with ` +
          "`pnpm run prepare:server-native`.",
      );
    }
    checked.push({ package: "better-sqlite3", version: betterSqlite3.version });
  }

  return { checked: true, packages: checked };
}

function copyVerifiedFile(source, destination, expectedSha256, what) {
  const bytes = readFileSync(source);
  const actual = createHash("sha256").update(bytes).digest("hex");
  if (typeof expectedSha256 === "string" && actual !== expectedSha256) {
    throw new Error(`native overlay hash mismatch for ${what} (${source})`);
  }
  mkdirSync(dirname(destination), { recursive: true });
  copyFileSync(source, destination);
}

/**
 * The better-sqlite3 overlay is staged and version-validated, but its binding
 * is intentionally NOT copied into the install prefix. better-sqlite3 13 ships
 * every N-API `prebuilds/<target>.node` inside the package, and the server
 * opens the database without a `nativeBinding` override unless
 * `PORACODE_BETTER_SQLITE3_NATIVE_BINDING` names one; the host runtime never
 * sets it, so a copied `lib/better_sqlite3.node` was dead weight. The staged
 * manifest still pins the wrapper version the binding was built for, and
 * `validateOverlayWrapperVersions` refuses a mismatched stage.
 */
export function applyServerNativeOverlay(options) {
  validateOverlayWrapperVersions(options);
  const overlay = readNodePtyOverlay(options.overlayRoot);
  const target = selectOverlayTarget(overlayTargets(overlay));
  const overlayTarget = assertContainedRelativePath(target.overlayTarget, "node-pty overlayTarget");
  const stagedDir = join(options.overlayRoot, "node-pty", target.dir);
  const dest = join(options.prefix, overlayTarget);
  for (const [name, expected] of Object.entries(target.stagedSha256)) {
    const safeName = assertContainedRelativePath(name, "node-pty staged file");
    const source = join(stagedDir, safeName);
    if (!existsSync(source)) {
      throw new Error(`node-pty overlay file is missing: ${source}`);
    }
    copyVerifiedFile(source, join(dest, safeName), expected, name);
  }
  return { nodePtyTarget: dest, betterSqliteBinding: undefined };
}
