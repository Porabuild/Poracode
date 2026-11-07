import Database from "better-sqlite3";
import { afterEach, expect, it } from "vitest";
import { resolveBetterSqliteNativeBindingOptions } from "./nativeBinding";
import { prepareCachedRead } from "./readStatementCache";

const databases: InstanceType<typeof Database>[] = [];
function database() {
  const db = new Database(":memory:", resolveBetterSqliteNativeBindingOptions());
  databases.push(db);
  db.exec("CREATE TABLE entries(value TEXT); INSERT INTO entries VALUES ('first')");
  return db;
}
afterEach(() => {
  for (const db of databases.splice(0)) db.close();
});

it("reuses compilation while binding fresh values and reading fresh committed data", () => {
  const db = database(),
    sql = "SELECT value FROM entries WHERE value != ?";
  const first = prepareCachedRead(db, sql);
  expect(first.all("none")).toEqual([{ value: "first" }]);
  db.prepare("INSERT INTO entries VALUES (?)").run("second");
  expect(prepareCachedRead(db, sql)).toBe(first);
  expect(first.all("first")).toEqual([{ value: "second" }]);
  expect(first.all("second")).toEqual([{ value: "first" }]);
});

it("keeps statement ownership per connection and evicts the least recently used SQL", () => {
  const a = database(),
    b = database(),
    sql = "SELECT value FROM entries";
  const first = prepareCachedRead(a, sql);
  expect(prepareCachedRead(b, sql)).not.toBe(first);
  for (let i = 0; i < 127; i++) prepareCachedRead(a, `SELECT ${i}`);
  expect(prepareCachedRead(a, sql)).toBe(first);
  prepareCachedRead(a, "SELECT 1000");
  expect(prepareCachedRead(a, sql)).toBe(first);
  for (let i = 0; i < 128; i++) prepareCachedRead(a, `SELECT ${i + 2000}`);
  expect(prepareCachedRead(a, sql)).not.toBe(first);
});

it("rejects writes without executing them or changing ordinary prepare semantics", () => {
  const db = database();
  expect(() => prepareCachedRead(db, "DELETE FROM entries")).toThrow(/Only read/);
  expect(db.prepare("SELECT value FROM entries").all()).toEqual([{ value: "first" }]);
  expect(db.prepare("SELECT 1")).not.toBe(db.prepare("SELECT 1"));
});
