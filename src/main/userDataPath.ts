import { join } from "node:path";

export interface ElectronUserDataPathOptions {
  readonly isPackaged: boolean;
  readonly isDev: boolean;
  readonly baseDirOverride: string | undefined;
  readonly currentUserDataDir: string;
  readonly cdpUserDataDir?: string | undefined;
  readonly cliUserDataDir?: string | undefined;
}

/**
 * Resolves the `userData` override before single-instance lock acquisition.
 * Unpackaged smoke/CDP launches keep their isolated `--user-data-dir` /
 * `PORACODE_CDP_USER_DATA_DIR` outside `PORACODE_BASE_DIR` so Chromium's
 * startup writes cannot mutate a legacy host profile while root promotion
 * snapshots it. Packaged apps ignore the CDP env var.
 */
export function resolveElectronUserDataPath(
  options: ElectronUserDataPathOptions,
): string | undefined {
  if (!options.isPackaged) {
    const explicit = options.cliUserDataDir?.trim() || options.cdpUserDataDir?.trim();
    if (explicit) return explicit;
  }
  if (options.baseDirOverride) {
    return join(options.baseDirOverride, "userData");
  }
  if (options.isDev) {
    return join(options.currentUserDataDir, "Dev");
  }
  return undefined;
}
