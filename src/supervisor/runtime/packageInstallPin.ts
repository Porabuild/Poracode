import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { writeFileAtomic } from "@/shared/atomicFile";
import { poracodeBaseDirFromEnv, resolvePoracodePaths } from "@/shared/poracodePaths";

/**
 * Durable memory of *where* a package installation was last resolved to, keyed
 * by an opaque provider-declared slot id.
 *
 * Providers whose runtime is an npm package the user installs (rather than a
 * binary Poracode owns) otherwise re-derive that location on every detection
 * pass by asking a package manager for its global root. That route is only
 * reachable when the resolving process happens to inherit a `PATH` containing
 * the package manager — which a GUI-launched, packaged app does not — and it
 * silently points somewhere else whenever a Node version manager re-points the
 * active prefix. Either failure reads back as "not installed" for a package
 * that is intact on disk. Recording the absolute root once makes later
 * resolution independent of both.
 *
 * The store is deliberately ignorant of what any slot means: it validates only
 * that a record is well-formed and still describes a readable package, so
 * adding a provider needs no change here.
 */

/**
 * On-disk generation of the pin document.
 *
 * - 1 — first generation: `{ version, pins: { [slotId]: PinRecord } }`.
 *
 * A mismatch is discarded rather than migrated: every pin is recoverable by one
 * successful discovery pass, so losing the memory must never lose an install.
 */
export const PACKAGE_INSTALL_PIN_FILE_VERSION = 1;

export interface PackageInstallPin {
  /** Guard against a slot id being reused for a different package. */
  packageName: string;
  /** Absolute directory holding the resolved package's `package.json`. */
  packageRoot: string;
  version: string;
  /** Provenance token from the discovering provider, echoed back verbatim. */
  source: string;
  resolvedAt: string;
}

export interface PackageInstallPinPaths {
  pinsPath: string;
}

function defaultPaths(): PackageInstallPinPaths {
  // The same data-directory seam the supervisor itself boots with, fallback
  // included, so a run pointed at a scratch profile — a test, a smoke harness —
  // records pins there instead of into the user's real profile.
  return {
    pinsPath: resolvePoracodePaths(poracodeBaseDirFromEnv() ?? join(homedir(), ".poracode"))
      .packageInstallPinsPath,
  };
}

/**
 * The recorded installation, or `undefined` when there is nothing usable: no
 * file, an unknown generation, a slot nobody wrote, a record for a different
 * package, or a root that no longer holds a `package.json`. Never throws — a
 * corrupt pin file must degrade to "discover it the slow way", not to a failed
 * provider.
 */
export function readPackageInstallPin(
  slotId: string,
  packageName: string,
  paths: PackageInstallPinPaths = defaultPaths(),
): PackageInstallPin | undefined {
  const candidate = readPinMap(paths)[slotId];
  if (!candidate || candidate.packageName !== packageName) return undefined;
  // A pin is a pointer, not a claim that the install is loadable: the caller
  // still runs full validation against this root. Only existence is checked
  // here, so a pruned or moved directory falls through to normal discovery
  // instead of failing the load outright.
  if (!existsSync(join(candidate.packageRoot, "package.json"))) return undefined;
  return candidate;
}

/**
 * Best-effort write. Failures are swallowed: the pin is an optimization, and a
 * read-only or full disk must not surface as a provider error.
 */
export function recordPackageInstallPin(
  slotId: string,
  pin: PackageInstallPin,
  paths: PackageInstallPinPaths = defaultPaths(),
): void {
  try {
    const pins = readPinMap(paths);
    const previous = pins[slotId];
    if (
      previous &&
      previous.packageRoot === pin.packageRoot &&
      previous.version === pin.version &&
      previous.source === pin.source
    ) {
      return;
    }
    pins[slotId] = pin;
    writePinMap(paths, pins);
  } catch {
    // Best-effort.
  }
}

/**
 * Drop a slot's record. Used when discovery reports the installation is
 * definitively gone, so a stale pointer cannot keep steering resolution at a
 * directory the package manager has since replaced.
 */
export function forgetPackageInstallPin(
  slotId: string,
  paths: PackageInstallPinPaths = defaultPaths(),
): void {
  try {
    const pins = readPinMap(paths);
    if (!(slotId in pins)) return;
    delete pins[slotId];
    writePinMap(paths, pins);
  } catch {
    // Best-effort.
  }
}

function readPinMap(paths: PackageInstallPinPaths): Record<string, PackageInstallPin> {
  try {
    const value: unknown = JSON.parse(readFileSync(paths.pinsPath, "utf8"));
    if (!isRecord(value)) return {};
    if (value["version"] !== PACKAGE_INSTALL_PIN_FILE_VERSION) return {};
    const pins = value["pins"];
    if (!isRecord(pins)) return {};
    return Object.fromEntries(
      Object.entries(pins).filter((entry): entry is [string, PackageInstallPin] =>
        isPackageInstallPin(entry[1]),
      ),
    );
  } catch {
    return {};
  }
}

function writePinMap(paths: PackageInstallPinPaths, pins: Record<string, PackageInstallPin>): void {
  writeFileAtomic(
    paths.pinsPath,
    JSON.stringify({ version: PACKAGE_INSTALL_PIN_FILE_VERSION, pins }, null, 2),
    { encoding: "utf8" },
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPackageInstallPin(value: unknown): value is PackageInstallPin {
  if (!isRecord(value)) return false;
  return (
    typeof value["packageName"] === "string" &&
    typeof value["packageRoot"] === "string" &&
    value["packageRoot"].length > 0 &&
    typeof value["version"] === "string" &&
    typeof value["source"] === "string" &&
    typeof value["resolvedAt"] === "string"
  );
}
