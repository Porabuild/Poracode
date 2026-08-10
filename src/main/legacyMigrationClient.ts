import { spawnSync } from "node:child_process";
import { join } from "node:path";
import type { LegacyDataMigrationOptions, LegacyDataMigrationResult } from "./legacyDataMigration";

/** Runs SQLite-touching legacy import outside Electron's latency-sensitive main process. */
export function migrateLegacyDataOutOfProcess(
  options: LegacyDataMigrationOptions,
): LegacyDataMigrationResult {
  const workerPath = join(__dirname, "legacyMigrationWorker.cjs");
  const encoded = Buffer.from(JSON.stringify(options), "utf8").toString("base64url");
  const result = spawnSync(process.execPath, [workerPath, encoded], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || `Legacy migration worker exited ${result.status}.`);
  }
  return JSON.parse(result.stdout) as LegacyDataMigrationResult;
}
