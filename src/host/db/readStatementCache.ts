import type Database from "better-sqlite3";

type SqliteDatabase = InstanceType<typeof Database>;
type Statement = Database.Statement<unknown[], unknown>;
const MAX_STATEMENTS = 128;
const statementsByDatabase = new WeakMap<SqliteDatabase, Map<string, Statement>>();

/**
 * Connection-owned, bounded reuse for catalog reads, including varying IN lists.
 * Expose only get/all so callers cannot retain iterators or change row modes and
 * bindings on a shared statement. Owner writes and other prepare callers keep
 * their normal independent-statement semantics.
 */
export function prepareCachedRead(
  sqlite: SqliteDatabase,
  sql: string,
): Pick<Statement, "get" | "all"> {
  let cache = statementsByDatabase.get(sqlite);
  if (!cache) {
    cache = new Map();
    statementsByDatabase.set(sqlite, cache);
  }
  let statement = cache.get(sql);
  if (!statement) {
    statement = sqlite.prepare(sql);
    if (!statement.readonly) throw new Error("Only read statements may be cached.");
  }
  cache.delete(sql);
  cache.set(sql, statement);
  if (cache.size > MAX_STATEMENTS) cache.delete(cache.keys().next().value!);
  return statement;
}
