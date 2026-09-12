import { CURSOR_SDK_PACKAGE_NAME } from "@/shared/agents/cursorSdkPackage";
import {
  forgetPackageInstallPin,
  readPackageInstallPin,
  recordPackageInstallPin,
  type PackageInstallPinPaths,
} from "../../runtime/packageInstallPin";
import {
  CURSOR_SDK_PACKAGE_SOURCES,
  type CursorSdkPackageSource,
  type CursorSdkPinHint,
} from "./sdkLoaderSupport";

/**
 * Cursor's claim on the shared durable-install store.
 *
 * The `@cursor/sdk` package is not one Poracode owns or installs into a
 * directory of its own: the user installs it with `npm install -g`, so
 * resolution depended on re-asking npm where its global root is on every
 * detection pass. That question only has an answer when the resolving process
 * inherited a `PATH` containing npm, and it points somewhere else whenever a
 * Node version manager re-points the active prefix — both of which read back as
 * "SDK not installed" for a package that is intact on disk. The resolved root
 * is recorded here so a working installation stays found across app updates.
 *
 * The record describes the native host only. WSL workers resolve inside their
 * own distro's login shell, and a root recorded in one environment is not a
 * path that exists in the other, so detection and sessions touch the pin for
 * native targets exclusively.
 */
const CURSOR_SDK_INSTALL_SLOT = "cursor-sdk";

const CURSOR_SDK_PACKAGE_SOURCE_TOKENS: ReadonlySet<string> = new Set(CURSOR_SDK_PACKAGE_SOURCES);

/**
 * Sources whose resolution runs through this process' `PATH` or executable
 * location — the routes a GUI-launched app cannot reach or that an app update
 * moves. Anything else (project checkouts, `NODE_PATH`, explicit roots)
 * re-derives deterministically on every pass, so recording it would only
 * freeze a stale copy ahead of fresher installs.
 */
const RECORDABLE_SOURCES: ReadonlySet<string> = new Set([
  "global-npm",
  "global-pnpm",
  "global-inferred",
]);

function isCursorSdkPackageSource(value: string): value is CursorSdkPackageSource {
  return CURSOR_SDK_PACKAGE_SOURCE_TOKENS.has(value);
}

export function shouldRecordCursorSdkInstall(
  source: CursorSdkPackageSource | "explicit-entry",
): source is CursorSdkPackageSource {
  return RECORDABLE_SOURCES.has(source);
}

export interface CursorSdkPinnedRoot extends CursorSdkPinHint {
  /** Version recorded alongside the root, for presentation without a probe. */
  version: string;
}

/**
 * The recorded installation, or `undefined` when there is none, it no longer
 * describes a readable package, or its source token is not part of Cursor's
 * vocabulary (the shared store validates string-ness only).
 */
export function readCursorSdkInstallPin(
  paths?: PackageInstallPinPaths,
): CursorSdkPinnedRoot | undefined {
  const pin = readPackageInstallPin(CURSOR_SDK_INSTALL_SLOT, CURSOR_SDK_PACKAGE_NAME, paths);
  if (!pin || !isCursorSdkPackageSource(pin.source)) return undefined;
  return {
    packageRoot: pin.packageRoot,
    source: pin.source,
    version: pin.version,
  };
}

export function recordCursorSdkInstallPin(
  resolved: CursorSdkPinnedRoot,
  paths?: PackageInstallPinPaths,
): void {
  recordPackageInstallPin(
    CURSOR_SDK_INSTALL_SLOT,
    {
      packageName: CURSOR_SDK_PACKAGE_NAME,
      packageRoot: resolved.packageRoot,
      version: resolved.version,
      source: resolved.source,
      resolvedAt: new Date().toISOString(),
    },
    paths,
  );
}

/**
 * Drop the record after discovery definitively found no installation. A stale
 * pointer must not keep steering resolution at a root the package manager has
 * since replaced.
 */
export function forgetCursorSdkInstallPin(paths?: PackageInstallPinPaths): void {
  forgetPackageInstallPin(CURSOR_SDK_INSTALL_SLOT, paths);
}
