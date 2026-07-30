import { isVersionInWindow, type VersionWindow } from "./updateResolver";

/**
 * Single source of truth for the `@cursor/sdk` release window Poracode's
 * structured Cursor runtime supports.
 *
 * Three consumers read it: the supervisor SDK loader (rejects an installed
 * package outside the window), the renderer install/update commands (pin their
 * npm spec to it), and the registry probe that decides whether a newer
 * *supported* release exists. Bumping support is a one-line change here.
 */

export const CURSOR_SDK_PACKAGE_NAME = "@cursor/sdk";

/** Oldest release the structured runtime can drive. */
export const CURSOR_SDK_MIN_SUPPORTED_VERSION = "1.0.24";

/** First major the runtime has not been validated against. */
export const CURSOR_SDK_MAX_EXCLUSIVE_MAJOR = 2;

/** Human-readable range, surfaced in loader diagnostics (">=1.0.24 <2.0.0"). */
export const CURSOR_SDK_SUPPORTED_RANGE = `>=${CURSOR_SDK_MIN_SUPPORTED_VERSION} <${CURSOR_SDK_MAX_EXCLUSIVE_MAJOR}.0.0`;

/** npm spec used by the in-app install and update commands. */
export const CURSOR_SDK_INSTALL_SPEC = `${CURSOR_SDK_PACKAGE_NAME}@^${CURSOR_SDK_MIN_SUPPORTED_VERSION}`;

export const CURSOR_SDK_SUPPORTED_VERSION_WINDOW: VersionWindow = {
  minVersion: CURSOR_SDK_MIN_SUPPORTED_VERSION,
  maxExclusiveMajor: CURSOR_SDK_MAX_EXCLUSIVE_MAJOR,
};

/** True when `version` is a stable `@cursor/sdk` release inside the window. */
export function isSupportedCursorSdkPackageVersion(version: string): boolean {
  return isVersionInWindow(version, CURSOR_SDK_SUPPORTED_VERSION_WINDOW);
}
