import { chmodSync, existsSync, lstatSync, mkdirSync, readdirSync } from "node:fs";
import { isAbsolute, join, relative } from "node:path";
import Database from "better-sqlite3";
import { writeFileAtomic } from "@/shared/atomicFile";
import { resolveBetterSqliteNativeBindingOptions } from "@/host/db/connection";
import { LATEST_SCHEMA_VERSION } from "@/host/db/migrations";
import { resolvePoracodeBaseDir } from "@/shared/poracodePaths";
import {
  copyImportFiles,
  hashImportFile,
  inventoryImportFiles,
} from "@/backend/ownership/hostImportFiles";
import { readHostOwnerRecord } from "@/backend/ownership/hostOwnerLease";
import { canonicalHostPath, resolveHostRootPaths } from "@/backend/ownership/hostRootPaths";

/**
 * `backup`: a consistent, restorable copy of one owned server data root.
 *
 * The database is captured with SQLite's own backup API from a read-only
 * connection, so a live owner may keep writing while the snapshot is taken
 * (WAL readers never block the writer). Every other regular file of the data
 * root is copied through the read-only import-staging primitives, which refuse
 * symbolic links, special files and multiply-linked files. The result is a
 * directory whose receipt describes exactly what was captured; `stageHostImport`
 * can later import a backup produced here after its owner is gone.
 */

export const SERVER_BACKUP_RECEIPT_VERSION = 1;
export const SERVER_BACKUP_RECEIPT_FILE = "poracode-backup.json";

const BUSY_TIMEOUT_MS = 5_000;

export interface ServerBackupRequest {
  /** Profile namespace; defaults to PORACODE_BASE_DIR or the default profile. */
  readonly profileNamespace?: string;
  /** Backup destination directory; must not exist and must not overlap the root. */
  readonly destination: string;
  readonly env?: NodeJS.ProcessEnv;
  /** Cooperative cancellation between the capture phases. */
  readonly signal?: AbortSignal;
}

export interface ServerBackupReceipt {
  readonly formatVersion: typeof SERVER_BACKUP_RECEIPT_VERSION;
  readonly createdAt: string;
  readonly sourceProfileNamespace: string;
  readonly sourceDataRoot: string;
  readonly ownerGeneration: string | null;
  readonly ownerKind: string | null;
  readonly ownerPhase: string | null;
  readonly credentialMode: "os-sealed-unverified" | "headless-file-unverified" | "unknown";
  readonly databaseSchemaVersion: number;
  readonly databaseSha256: string;
  readonly fileInventorySha256: string;
  readonly files: number;
  readonly fileBytes: number;
  readonly databaseSource: "sqlite-backup-api-online-snapshot";
  readonly excludedFromInventory: readonly string[];
}

function contains(parent: string, child: string): boolean {
  const path = relative(parent, child);
  return (
    path === "" ||
    (!isAbsolute(path) &&
      path !== ".." &&
      !path.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`))
  );
}

function credentialModeFor(dataRoot: string): ServerBackupReceipt["credentialMode"] {
  let entries: readonly string[] = [];
  try {
    entries = readdirSync(dataRoot).filter((name) => name.startsWith("secret-key."));
  } catch {
    return "unknown";
  }
  if (entries.length === 1 && entries[0] === "secret-key.safe") return "os-sealed-unverified";
  if (entries.length === 1 && entries[0] === "secret-key.headless") {
    return "headless-file-unverified";
  }
  return "unknown";
}

function journalFilesPresent(dataRoot: string): boolean {
  return ["state.sqlite-wal", "state.sqlite-shm", "state.sqlite-journal"].some((name) =>
    existsSync(join(dataRoot, name)),
  );
}

/**
 * Capture one backup. Refuses loudly rather than producing a partial or
 * misleading copy: unknown root layouts, overlapping or existing destinations,
 * symlinked/hard-linked source files, and databases that cannot be read
 * without recovery.
 */
export async function createHostDataBackup(
  request: ServerBackupRequest,
): Promise<ServerBackupReceipt> {
  request.signal?.throwIfAborted();
  const env = request.env ?? process.env;
  const namespaceInput =
    request.profileNamespace?.trim() || env.PORACODE_BASE_DIR?.trim() || resolvePoracodeBaseDir();
  const paths = resolveHostRootPaths(namespaceInput);

  if (!existsSync(paths.dataRoot)) {
    throw new Error(
      `The owned Poracode root ${paths.dataRoot} does not exist; there is nothing to back up.`,
    );
  }
  const databasePath = join(paths.dataRoot, "state.sqlite");
  if (!existsSync(databasePath)) {
    throw new Error(`The owned Poracode root has no state database at ${databasePath}.`);
  }

  const destination = canonicalHostPath(request.destination);
  for (const protectedPath of [
    paths.profileNamespace,
    paths.dataRoot,
    paths.electronUserDataRoot,
    paths.leasePath,
    paths.ownerRecordPath,
    paths.dataFencePath,
  ]) {
    if (contains(destination, protectedPath) || contains(protectedPath, destination)) {
      throw new Error(
        `Backup destination ${destination} overlaps the profile's owned paths; ` +
          "choose a directory outside the profile namespace and its siblings.",
      );
    }
  }
  if (existsSync(destination)) {
    throw new Error(`Backup destination already exists: ${destination}.`);
  }
  request.signal?.throwIfAborted();

  // The inventory excludes the database and its journals plus ephemeral owner
  // control credentials; it refuses symlinks, special and multiply-linked files.
  const inventory = await inventoryImportFiles(paths.dataRoot);
  request.signal?.throwIfAborted();

  mkdirSync(destination, { recursive: true, mode: 0o700 });

  const snapshotPath = join(destination, "state.sqlite");
  let database: InstanceType<typeof Database> | undefined;
  try {
    try {
      database = new Database(databasePath, {
        ...resolveBetterSqliteNativeBindingOptions(),
        readonly: true,
        fileMustExist: true,
        timeout: BUSY_TIMEOUT_MS,
      });
    } catch (error) {
      if (journalFilesPresent(paths.dataRoot)) {
        throw new Error(
          `The source database could not be opened read-only (${messageOf(error)}). ` +
            "Journal files are present with no owner running: start the owner once and " +
            "stop it cleanly (SIGTERM) so SQLite can checkpoint, then back up again.",
          { cause: error },
        );
      }
      throw error;
    }
    await database.backup(snapshotPath);
  } finally {
    database?.close();
  }
  chmodSync(snapshotPath, 0o600);
  request.signal?.throwIfAborted();

  // Copies every inventoried file and re-verifies the destination by hashing;
  // a source file that changed mid-copy is refused instead of backed up.
  await copyImportFiles(paths.dataRoot, destination, inventory);

  const databaseSchemaVersion = readSnapshotSchemaVersion(snapshotPath);
  // The read-only schema probe above leaves WAL sidecars beside a snapshot
  // whose header says WAL; checkpoint and close them so the delivered backup
  // directory is self-contained.
  if (journalFilesPresent(destination)) {
    const checkpoint = new Database(snapshotPath, {
      ...resolveBetterSqliteNativeBindingOptions(),
      timeout: BUSY_TIMEOUT_MS,
    });
    try {
      checkpoint.pragma("wal_checkpoint(TRUNCATE)");
    } finally {
      checkpoint.close();
    }
  }
  const ownerRecord = readHostOwnerRecord(paths);
  const receipt: ServerBackupReceipt = {
    formatVersion: SERVER_BACKUP_RECEIPT_VERSION,
    createdAt: new Date().toISOString(),
    sourceProfileNamespace: paths.profileNamespace,
    sourceDataRoot: paths.dataRoot,
    ownerGeneration: ownerRecord?.generation ?? null,
    ownerKind: ownerRecord?.kind ?? null,
    ownerPhase: ownerRecord?.phase ?? null,
    credentialMode: credentialModeFor(paths.dataRoot),
    databaseSchemaVersion,
    databaseSha256: await hashImportFile(snapshotPath),
    fileInventorySha256: inventory.sha256,
    files: inventory.files,
    fileBytes: inventory.bytes,
    databaseSource: "sqlite-backup-api-online-snapshot",
    excludedFromInventory: [
      "state.sqlite",
      "state.sqlite-shm",
      "state.sqlite-wal",
      "state.sqlite-journal",
      "host-control.json",
    ],
  };
  // Written after the verified copy so the receipt never predates its content.
  writeFileAtomic(
    join(destination, SERVER_BACKUP_RECEIPT_FILE),
    `${JSON.stringify(receipt, null, 2)}\n`,
    {
      encoding: "utf8",
      mode: 0o600,
    },
  );
  return receipt;
}

function readSnapshotSchemaVersion(snapshotPath: string): number {
  const metadata = lstatSync(snapshotPath);
  if (!metadata.isFile() || metadata.size === 0) {
    throw new Error("The captured database snapshot is not a plausible SQLite file.");
  }
  const snapshot = new Database(snapshotPath, {
    ...resolveBetterSqliteNativeBindingOptions(),
    readonly: true,
    fileMustExist: true,
  });
  try {
    const row = snapshot
      .prepare<[], { value: string }>("SELECT value FROM app_state WHERE key = 'schema_version'")
      .get();
    const schemaVersion = row ? Number(row.value) : 0;
    if (
      !Number.isInteger(schemaVersion) ||
      schemaVersion < 0 ||
      schemaVersion > LATEST_SCHEMA_VERSION
    ) {
      throw new Error("The captured database snapshot uses an unsupported schema version.");
    }
    return schemaVersion;
  } finally {
    snapshot.close();
  }
}

function messageOf(error: unknown): string {
  return redactBackupError(error instanceof Error ? error.message : String(error));
}

/** Backup errors describe the operator's own paths; secret-shaped runs are masked. */
function redactBackupError(message: string): string {
  return message.replace(/[A-Za-z0-9+/_=-]{43,}/gu, "[redacted]");
}
