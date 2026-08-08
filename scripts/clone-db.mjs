// Clones a Poracode channel SQLite DB into the dev base dir so dev runs start
// from real data. One-way (channel -> dev) by design; never the reverse.
//
// Source: ~/.poracode/state.sqlite       (default, stable)
//         ~/.poracode-nightly/state.sqlite (with "nightly" argument)
// Dest:   ~/.poracode-dev/state.sqlite
//
// Uses SQLite's online backup API so it is safe to run while the source app
// is open (no WAL/SHM corruption). The dev DB is overwritten.

import { spawnSync } from "node:child_process";
import { homedir } from "node:os";
import { existsSync, mkdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";

const channel = process.argv[2] === "nightly" ? "nightly" : "stable";
const srcDir = join(homedir(), channel === "nightly" ? ".poracode-nightly" : ".poracode");
const destDir = join(homedir(), ".poracode-dev");
const srcPath = join(srcDir, "state.sqlite");
const destPath = join(destDir, "state.sqlite");

if (!existsSync(srcPath)) {
  console.error(`[clone-db] Source DB not found: ${srcPath}`);
  process.exit(1);
}

mkdirSync(destDir, { recursive: true });

for (const path of [destPath, `${destPath}-wal`, `${destPath}-shm`]) {
  if (existsSync(path)) rmSync(path, { force: true });
}

console.log(`[clone-db] ${srcPath}`);
console.log(`[clone-db]   -> ${destPath}`);

function quoteSqliteDotArg(value) {
  return `'${value.replaceAll("'", "''")}'`;
}

function backupWithSqliteCli() {
  const result = spawnSync("sqlite3", [srcPath], {
    encoding: "utf8",
    input: `.backup ${quoteSqliteDotArg(destPath)}\n`,
  });

  if (result.error?.code === "ENOENT") {
    return false;
  }

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    const output = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
    throw new Error(output || `sqlite3 exited with status ${result.status}`);
  }

  return true;
}

async function backupWithBetterSqlite() {
  const { default: Database } = await import("better-sqlite3");
  const src = new Database(srcPath, { readonly: true, fileMustExist: true });
  try {
    await src.backup(destPath);
  } finally {
    src.close();
  }
}

try {
  if (!backupWithSqliteCli()) {
    await backupWithBetterSqlite();
  }

  const { size } = statSync(destPath);
  console.log(`[clone-db] Done (${(size / 1024 / 1024).toFixed(2)} MiB)`);
} catch (error) {
  console.error(`[clone-db] Failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
