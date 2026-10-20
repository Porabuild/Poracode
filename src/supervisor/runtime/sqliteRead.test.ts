import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, toNamespacedPath } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { withReadonlyDb } from "./sqliteRead";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("withReadonlyDb", () => {
  it("reads a SQLite database beyond MAX_PATH", async () => {
    const root = mkdtempSync(join(tmpdir(), "poracode-sqlite-read-"));
    tempDirs.push(root);
    const base = join(root, "sdk-store");
    const stateRoot = join(base, "x".repeat(Math.max(1, 176 - base.length - 1)));
    const dbPath = join(stateRoot, "agents", `agent-${"a".repeat(64)}`, "store.db");
    expect(dbPath.length).toBeGreaterThanOrEqual(263);
    mkdirSync(dirname(dbPath), { recursive: true });

    const writer = new DatabaseSync(toNamespacedPath(dbPath));
    writer.exec("CREATE TABLE items (value TEXT); INSERT INTO items VALUES ('ok');");
    writer.close();

    const value = await withReadonlyDb(dbPath, (db) => {
      const row = db.prepare("SELECT value FROM items").get() as { value?: string } | undefined;
      return row?.value;
    });
    expect(value).toBe("ok");
  });
});
