import Database from "better-sqlite3";
import { chmodSync, lstatSync } from "node:fs";
import { join } from "node:path";
import { resolveBetterSqliteNativeBindingOptions } from "@/main/db/connection";
import { LATEST_SCHEMA_VERSION } from "@/main/db/migrations";

/**
 * A lock on an explicitly offline BACKUP, never the original profile. SQLite
 * requires a writable descriptor for exclusive locking and may create/clean
 * journal bookkeeping; this does not promise byte-untouched backup files.
 */
export class OfflineImportDatabase {
  private constructor(
    private readonly database: InstanceType<typeof Database>,
    readonly schemaVersion: number,
  ) {}

  static open(source: string): OfflineImportDatabase {
    for (const name of [
      "server.lock",
      "state.sqlite-wal",
      "state.sqlite-shm",
      "state.sqlite-journal",
    ]) {
      let present = false;
      try {
        lstatSync(join(source, name));
        present = true;
      } catch (error) {
        if (!error || typeof error !== "object" || !("code" in error) || error.code !== "ENOENT") {
          throw error;
        }
      }
      if (present) {
        throw new Error(
          `Offline backup still contains ${name}; stop its owner and create a consistent backup.`,
        );
      }
    }
    const path = join(source, "state.sqlite");
    const metadata = lstatSync(path);
    if (!metadata.isFile() || metadata.nlink !== 1) {
      throw new Error("Offline backup state.sqlite must be a regular, independently copied file.");
    }
    const database = new Database(path, {
      ...resolveBetterSqliteNativeBindingOptions(),
      fileMustExist: true,
      timeout: 0,
    });
    try {
      database.pragma("locking_mode = EXCLUSIVE");
      database.exec("BEGIN EXCLUSIVE; COMMIT");
      database.pragma("query_only = ON");
      if (database.pragma("quick_check", { simple: true }) !== "ok") {
        throw new Error("Offline backup database failed SQLite integrity verification.");
      }
      const row = database
        .prepare<[], { value: string }>("SELECT value FROM app_state WHERE key = 'schema_version'")
        .get();
      const schemaVersion = row ? Number(row.value) : 0;
      if (
        !Number.isInteger(schemaVersion) ||
        schemaVersion < 0 ||
        schemaVersion > LATEST_SCHEMA_VERSION
      ) {
        throw new Error("Offline backup database uses an unsupported schema version.");
      }
      return new OfflineImportDatabase(database, schemaVersion);
    } catch (error) {
      database.close();
      throw error;
    }
  }

  async copyTo(destination: string, assertOwner: () => void): Promise<void> {
    assertOwner();
    await this.database.backup(destination, {
      progress: () => {
        assertOwner();
        return 100;
      },
    });
    assertOwner();
    chmodSync(destination, 0o600);
  }

  close(): void {
    this.database.close();
  }
}
