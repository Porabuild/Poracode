import { existsSync } from "node:fs";
import { join } from "node:path";
import Database from "better-sqlite3";
import { resolveBetterSqliteNativeBindingOptions } from "@/host/db/nativeBinding";
import type { HostRootPaths } from "@/backend/ownership/hostRootPaths";
import { UpgradeRefusedError } from "./serverUpgradeContract";

export function readProfileSchemaVersion(paths: HostRootPaths): number | null {
  const databasePath = join(paths.dataRoot, "state.sqlite");
  if (!existsSync(databasePath)) return null;
  let database: InstanceType<typeof Database> | undefined;
  try {
    database = new Database(databasePath, {
      ...resolveBetterSqliteNativeBindingOptions(),
      readonly: true,
      fileMustExist: true,
      timeout: 5_000,
    });
    const row = database
      .prepare<[], { value: string }>("SELECT value FROM app_state WHERE key = 'schema_version'")
      .get();
    if (!row) return 0;
    const version = Number(row.value);
    if (!Number.isInteger(version) || version < 0)
      throw new UpgradeRefusedError("The profile database reports an invalid schema version.");
    return version;
  } finally {
    database?.close();
  }
}
