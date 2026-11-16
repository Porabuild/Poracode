import { dirname, join } from "node:path";

/**
 * Fixed names from the Locked Computer Use contract. The installer and the
 * SecurityAgent plug-in own these paths; the host only reads them.
 */
export const LOCKED_USE_PLUGIN_BUNDLE_PATH =
  "/Library/Security/SecurityAgentPlugins/PoracodeLockedUse.bundle";
export const LOCKED_USE_SUPPORT_DIR = "/Library/Application Support/Poracode/LockedComputerUse";
export const LOCKED_USE_STATE_PATH = `${LOCKED_USE_SUPPORT_DIR}/state.json`;
export const LOCKED_USE_RIGHT = "com.poracode.locked-computer-use.unlock";
export const LOCKED_USE_SCREENSAVER_RIGHT = "system.login.screensaver";

/** Bundled resource folder name, beside `computer-use-helper` in every layout. */
export const LOCKED_USE_RESOURCES_DIR_NAME = "locked-computer-use";
export const LOCKED_USE_INSTALLER_NAME = "locked-computer-use-installer";

/** Host-side audit trail, one JSON object per line, in the computer-use state dir. */
export const LOCKED_USE_AUDIT_FILE_NAME = "locked-use-audit.jsonl";

/**
 * The installer ships beside the computer-use helper: packaged apps resolve
 * `process.resourcesPath/locked-computer-use`, development checkouts
 * `resources/locked-computer-use` (the dev helper root is
 * `resources/computer-use-helper-dev`, so the sibling rule covers both).
 */
export function resolveLockedComputerUseResourcesDir(computerUseHelperRootDir: string): string {
  return join(dirname(computerUseHelperRootDir), LOCKED_USE_RESOURCES_DIR_NAME);
}
