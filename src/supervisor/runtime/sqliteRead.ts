import { existsSync } from "node:fs";

/**
 * Minimal read-only SQLite access for usage collectors that source data from a
 * local app database (Cursor's `state.vscdb`, OpenCode's `opencode.db`).
 *
 * `better-sqlite3` is a native module shipped with the app and marked
 * `neverBundle`, so it is loaded lazily and guarded: any failure (module not
 * present, file locked, corrupt DB) degrades to `undefined`/`[]` rather than
 * throwing into the usage refresh. Databases are opened read-only — the usage
 * tracker never writes to another app's store.
 */

interface SqliteStatement {
  get(...params: unknown[]): unknown;
  all(...params: unknown[]): unknown[];
}
interface SqliteDatabase {
  prepare(sql: string): SqliteStatement;
  close(): void;
}
type SqliteCtor = new (
  path: string,
  options: { readonly: boolean; fileMustExist: boolean },
) => SqliteDatabase;

let ctorPromise: Promise<SqliteCtor | null> | undefined;

async function loadSqliteCtor(): Promise<SqliteCtor | null> {
  if (ctorPromise === undefined) {
    ctorPromise = import("better-sqlite3")
      .then((mod) => ((mod as { default?: SqliteCtor }).default ?? mod) as SqliteCtor)
      .catch(() => null);
  }
  return ctorPromise;
}

/** Open `dbPath` read-only, run `fn`, always close. Returns undefined on any failure. */
export async function withReadonlyDb<T>(
  dbPath: string,
  fn: (db: SqliteDatabase) => T,
): Promise<T | undefined> {
  if (!existsSync(dbPath)) return undefined;
  const Ctor = await loadSqliteCtor();
  if (!Ctor) return undefined;
  let db: SqliteDatabase | undefined;
  try {
    db = new Ctor(dbPath, { readonly: true, fileMustExist: true });
    return fn(db);
  } catch {
    return undefined;
  } finally {
    try {
      db?.close();
    } catch {
      // ignore close errors
    }
  }
}
