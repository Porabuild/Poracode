import { cpSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, relative, resolve } from "node:path";
import { writeFileAtomic } from "@/shared/atomicFile";
import { type PoracodeChannel, resolvePoracodeChannel } from "@/shared/channel";
import { resolvePoracodeBaseDir } from "@/shared/poracodePaths";
import Database from "better-sqlite3";
import { resolveBetterSqliteNativeBindingOptions } from "./db/connection";

const MIGRATION_VERSION = 1;
const MIGRATION_MARKER_FILENAME = ".lightcode-migration-v1.json";
const MIGRATION_REQUEST_SUFFIX = ".lightcode-migration-request-v1";

const LEGACY_DATA_DIR_NAME: Record<PoracodeChannel, string> = {
  stable: ".lightcode",
  nightly: ".lightcode-nightly",
};

const LEGACY_PRODUCT_NAME: Record<PoracodeChannel, string> = {
  stable: "Lightcode",
  nightly: "Lightcode Nightly",
};

const TRANSIENT_DATA_ROOT_ENTRIES = new Set([
  "server.lock",
  MIGRATION_MARKER_FILENAME,
  "state.sqlite",
  "state.sqlite-journal",
  "state.sqlite-shm",
  "state.sqlite-wal",
]);
const TRANSIENT_ELECTRON_ENTRIES = new Set([
  "lockfile",
  "SingletonCookie",
  "SingletonLock",
  "SingletonSocket",
]);

export interface LegacyDataMigrationOptions {
  readonly baseDir: string;
  readonly channel?: PoracodeChannel;
  readonly electronUserDataDir?: string;
  readonly legacyElectronUserDataDir?: string;
  readonly legacyBaseDir?: string;
  readonly allowCustomDataRoot?: boolean;
}

export interface LegacyDataMigrationResult {
  readonly status: "migrated" | "already-complete" | "no-legacy-data" | "unavailable";
  readonly dataBackupPath?: string;
  readonly electronUserDataBackupPath?: string;
}

export interface LegacyDataMigrationRequestResult {
  readonly status: "scheduled" | "no-legacy-data" | "unavailable";
}

interface MigrationMarker {
  readonly version: typeof MIGRATION_VERSION;
  readonly completedAt: string;
  readonly importedDataRoot: boolean;
  readonly importedElectronUserData: boolean;
  readonly dataBackupPath?: string;
  readonly electronUserDataBackupPath?: string;
}

function normalizedPath(path: string): string {
  const resolved = resolve(path).replaceAll("\\", "/");
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function isDirectory(path: string | undefined): path is string {
  if (!path || !existsSync(path)) return false;
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function markerPath(baseDir: string): string {
  return join(baseDir, MIGRATION_MARKER_FILENAME);
}

function requestPath(baseDir: string): string {
  return `${baseDir}${MIGRATION_REQUEST_SUFFIX}`;
}

function isDefaultDataRoot(baseDir: string, channel: PoracodeChannel): boolean {
  return normalizedPath(baseDir) === normalizedPath(resolvePoracodeBaseDir(channel));
}

function legacyDataDir(channel: PoracodeChannel, override?: string): string {
  return override ?? join(homedir(), LEGACY_DATA_DIR_NAME[channel]);
}

export function legacyProductNameFor(channel: PoracodeChannel): string {
  return LEGACY_PRODUCT_NAME[channel];
}

function uniqueBackupPath(targetDir: string): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const prefix = `${targetDir}.before-lightcode-import-${timestamp}`;
  let candidate = prefix;
  let suffix = 2;
  while (existsSync(candidate)) {
    candidate = `${prefix}-${suffix}`;
    suffix++;
  }
  return candidate;
}

function hasLiveServerLock(dataDir: string): boolean {
  const lockPath = join(dataDir, "server.lock");
  if (!existsSync(lockPath)) return false;
  try {
    const pid = Number(readFileSync(lockPath, "utf8").trim());
    if (!Number.isInteger(pid) || pid <= 0) return false;
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

function assertDataRootAvailable(dataDir: string): void {
  if (hasLiveServerLock(dataDir)) {
    throw new Error(`Cannot migrate data while a server is using ${dataDir}.`);
  }
}

function topLevelEntry(sourceDir: string, sourcePath: string): string | undefined {
  const rel = relative(sourceDir, sourcePath);
  if (!rel) return undefined;
  return rel.split(/[\\/]/, 1)[0];
}

function replaceDirectoryFromLegacy(
  sourceDir: string,
  targetDir: string,
  transientEntries: ReadonlySet<string>,
  prepareStaging?: (stagingDir: string) => void,
): string | undefined {
  const stagingDir = `${targetDir}.importing-lightcode`;
  let backupDir: string | undefined;

  rmSync(stagingDir, { recursive: true, force: true });
  try {
    cpSync(sourceDir, stagingDir, {
      recursive: true,
      preserveTimestamps: true,
      filter: (sourcePath) => {
        const entry = topLevelEntry(sourceDir, sourcePath);
        return entry === undefined || !transientEntries.has(entry);
      },
    });
    prepareStaging?.(stagingDir);

    if (existsSync(targetDir)) {
      backupDir = uniqueBackupPath(targetDir);
      renameSync(targetDir, backupDir);
    }

    try {
      renameSync(stagingDir, targetDir);
    } catch (error) {
      if (backupDir && !existsSync(targetDir) && existsSync(backupDir)) {
        renameSync(backupDir, targetDir);
      }
      throw error;
    }
    return backupDir;
  } catch (error) {
    rmSync(stagingDir, { recursive: true, force: true });
    throw error;
  }
}

function restoreReplacedDirectory(targetDir: string, backupDir: string | undefined): void {
  rmSync(targetDir, { recursive: true, force: true });
  if (backupDir && existsSync(backupDir)) renameSync(backupDir, targetDir);
}

function quoteSqliteString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

/** Create a transactionally consistent copy even when the source DB is in WAL mode. */
function snapshotLegacyDatabase(sourceDir: string, stagingDir: string): void {
  const sourcePath = join(sourceDir, "state.sqlite");
  if (!existsSync(sourcePath)) return;

  const destinationPath = join(stagingDir, "state.sqlite");
  const database = new Database(sourcePath, {
    ...resolveBetterSqliteNativeBindingOptions(),
    readonly: true,
    fileMustExist: true,
  });
  try {
    database.exec(`VACUUM INTO ${quoteSqliteString(destinationPath)}`);
  } finally {
    database.close();
  }
}

function writeMigrationMarker(baseDir: string, marker: MigrationMarker): void {
  mkdirSync(baseDir, { recursive: true });
  writeFileAtomic(markerPath(baseDir), `${JSON.stringify(marker, null, 2)}\n`, {
    encoding: "utf8",
  });
}

function removeMigrationRequest(baseDir: string): void {
  rmSync(requestPath(baseDir), { force: true });
}

export function resolveLegacyElectronUserDataDir(
  electronUserDataDir: string,
  channel: PoracodeChannel = resolvePoracodeChannel(),
  isDev = false,
): string {
  const currentProductDir = isDev ? dirname(electronUserDataDir) : electronUserDataDir;
  const legacyProductDir = join(dirname(currentProductDir), legacyProductNameFor(channel));
  return isDev ? join(legacyProductDir, basename(electronUserDataDir)) : legacyProductDir;
}

export function migrateLegacyDataOnLaunch(
  options: LegacyDataMigrationOptions,
): LegacyDataMigrationResult {
  const channel = options.channel ?? resolvePoracodeChannel();
  if (!options.allowCustomDataRoot && !isDefaultDataRoot(options.baseDir, channel)) {
    return { status: "unavailable" };
  }

  const requested = existsSync(requestPath(options.baseDir));
  if (!requested && existsSync(markerPath(options.baseDir))) {
    return { status: "already-complete" };
  }

  const sourceDataDir = legacyDataDir(channel, options.legacyBaseDir);
  const importDataRoot =
    isDirectory(sourceDataDir) && normalizedPath(sourceDataDir) !== normalizedPath(options.baseDir);
  const importElectronUserData =
    isDirectory(options.legacyElectronUserDataDir) &&
    options.electronUserDataDir !== undefined &&
    normalizedPath(options.legacyElectronUserDataDir) !==
      normalizedPath(options.electronUserDataDir);

  if (!importDataRoot && !importElectronUserData) {
    removeMigrationRequest(options.baseDir);
    if (!requested) {
      writeMigrationMarker(options.baseDir, {
        version: MIGRATION_VERSION,
        completedAt: new Date().toISOString(),
        importedDataRoot: false,
        importedElectronUserData: false,
      });
    }
    return { status: "no-legacy-data" };
  }

  if (importDataRoot) {
    assertDataRootAvailable(sourceDataDir);
    if (isDirectory(options.baseDir)) assertDataRootAvailable(options.baseDir);
  }

  let electronUserDataImported = false;
  let dataImported = false;
  let electronUserDataBackupPath: string | undefined;
  let dataBackupPath: string | undefined;
  try {
    if (importElectronUserData) {
      electronUserDataBackupPath = replaceDirectoryFromLegacy(
        options.legacyElectronUserDataDir,
        options.electronUserDataDir!,
        TRANSIENT_ELECTRON_ENTRIES,
      );
      electronUserDataImported = true;
    }

    if (importDataRoot) {
      dataBackupPath = replaceDirectoryFromLegacy(
        sourceDataDir,
        options.baseDir,
        TRANSIENT_DATA_ROOT_ENTRIES,
        (stagingDir) => snapshotLegacyDatabase(sourceDataDir, stagingDir),
      );
      dataImported = true;
    }

    writeMigrationMarker(options.baseDir, {
      version: MIGRATION_VERSION,
      completedAt: new Date().toISOString(),
      importedDataRoot: importDataRoot,
      importedElectronUserData: importElectronUserData,
      ...(dataBackupPath ? { dataBackupPath } : {}),
      ...(electronUserDataBackupPath ? { electronUserDataBackupPath } : {}),
    });
    removeMigrationRequest(options.baseDir);
  } catch (error) {
    const rollbackErrors: unknown[] = [];
    if (dataImported) {
      try {
        restoreReplacedDirectory(options.baseDir, dataBackupPath);
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError);
      }
    }
    if (electronUserDataImported) {
      try {
        restoreReplacedDirectory(options.electronUserDataDir!, electronUserDataBackupPath);
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError);
      }
    }
    if (rollbackErrors.length > 0) {
      const details = rollbackErrors
        .map((rollbackError) =>
          rollbackError instanceof Error ? rollbackError.message : String(rollbackError),
        )
        .join("; ");
      throw new Error(
        `Lightcode data import failed and Poracode data could not be fully restored: ${details}`,
        { cause: error },
      );
    }
    throw error;
  }

  return {
    status: "migrated",
    ...(dataBackupPath ? { dataBackupPath } : {}),
    ...(electronUserDataBackupPath ? { electronUserDataBackupPath } : {}),
  };
}

export function requestLegacyDataMigration(
  options: LegacyDataMigrationOptions,
): LegacyDataMigrationRequestResult {
  const channel = options.channel ?? resolvePoracodeChannel();
  if (!options.allowCustomDataRoot && !isDefaultDataRoot(options.baseDir, channel)) {
    return { status: "unavailable" };
  }

  const sourceDataDir = legacyDataDir(channel, options.legacyBaseDir);
  const hasLegacyData =
    (isDirectory(sourceDataDir) &&
      normalizedPath(sourceDataDir) !== normalizedPath(options.baseDir)) ||
    (isDirectory(options.legacyElectronUserDataDir) &&
      options.electronUserDataDir !== undefined &&
      normalizedPath(options.legacyElectronUserDataDir) !==
        normalizedPath(options.electronUserDataDir));
  if (!hasLegacyData) return { status: "no-legacy-data" };

  writeFileAtomic(
    requestPath(options.baseDir),
    `${JSON.stringify({ version: MIGRATION_VERSION, requestedAt: new Date().toISOString() })}\n`,
    { encoding: "utf8" },
  );
  return { status: "scheduled" };
}

export function readLegacyDataMigrationMarker(baseDir: string): MigrationMarker | null {
  try {
    return JSON.parse(readFileSync(markerPath(baseDir), "utf8")) as MigrationMarker;
  } catch {
    return null;
  }
}
