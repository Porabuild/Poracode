import Database from "better-sqlite3";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { closeDatabase, initDatabase } from "@/host/db/connection";
import { dbGetThreadRuntimeItems } from "@/host/db/runtimeItems";
import { dbGetSchedules } from "@/host/db/schedules";
import { scheduledTaskSchema } from "@/shared/contracts/schedule";
import { HostOwnerLease } from "./hostOwnerLease";
import { resolveDesktopHostRootPaths } from "./hostRootPaths";
import { ensureDesktopOwnedRoot } from "./promoteDesktopRoot";

const fixture = join(import.meta.dirname, "fixtures/released-1.8.2");
const expected = JSON.parse(readFileSync(join(fixture, "expected.json"), "utf8"));
let root: string | undefined;
let lease: HostOwnerLease | undefined;
const digest = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex");

afterEach(() => {
  closeDatabase();
  lease?.release();
  lease = undefined;
  vi.restoreAllMocks();
  if (root) rmSync(root, { recursive: true, force: true });
});

it("promotes the actual released schema42 and preserves history through schema57 and a second launch", async () => {
  // Fixture created by the unmodified v1.8.2 initializer/runtime writers, not
  // by relabelling the current schema. Frozen-source hashes are in expected.json.
  root = realpathSync.native(mkdtempSync(join(tmpdir(), "poracode-released182-")));
  const namespace = join(root, "profile");
  mkdirSync(namespace);
  const sourceDatabase = join(namespace, "state.sqlite");
  copyFileSync(join(fixture, "state.sqlite"), sourceDatabase);
  const settings = '{"theme":"dark","syntheticUpgradeMarker":"from-1.8.2"}\n';
  const sealedKey = Buffer.from("synthetic sealed old key").toString("base64");
  writeFileSync(join(namespace, "settings.json"), settings);
  writeFileSync(join(namespace, "secret-key.safe"), sealedKey);
  mkdirSync(join(namespace, "attachments"));
  writeFileSync(join(namespace, "attachments", "kept.txt"), "old attachment");
  const before = digest(sourceDatabase);
  const released = new Database(sourceDatabase, { readonly: true });
  try {
    expect(
      (
        released.prepare("SELECT count(*) AS n FROM thread_runtime_item_stream_chunks").get() as {
          n: number;
        }
      ).n,
    ).toBeGreaterThan(0);
  } finally {
    released.close();
  }
  const paths = resolveDesktopHostRootPaths(namespace);
  lease = HostOwnerLease.acquire(paths, "desktop");
  const unseal = vi.fn<(sealed: string) => Promise<string>>(async () =>
    Buffer.alloc(32, 7).toString("base64"),
  );
  const promoted = await ensureDesktopOwnedRoot(lease, { osSealedKey: { unseal } });
  expect(promoted.baseDir).toBe(`${namespace}.host-v1`);
  expect(unseal).toHaveBeenCalledExactlyOnceWith(sealedKey);
  expect(digest(sourceDatabase)).toBe(before);
  expect(readFileSync(join(promoted.baseDir, "settings.json"), "utf8")).toBe(settings);
  expect(readFileSync(join(promoted.baseDir, "secret-key.safe"), "utf8")).toBe(sealedKey);
  expect(readFileSync(join(promoted.baseDir, "attachments", "kept.txt"), "utf8")).toBe(
    "old attachment",
  );

  const checkUpgraded = async () => {
    // Freeze only the retention clock around init; old receipts remain inside
    // the documented30-day window rather than expiring as this fixture ages.
    vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-10-12T00:00:00.000Z"));
    const db = initDatabase(promoted.dbPath);
    vi.restoreAllMocks();
    expect(db.prepare("SELECT value FROM app_state WHERE key='schema_version'").get()).toEqual({
      value: "57",
    });
    expect(db.pragma("integrity_check")).toEqual([{ integrity_check: "ok" }]);
    expect(db.pragma("foreign_key_check")).toEqual([]);
    // Startup returns schedules through this schema even when disabled.
    expect(dbGetSchedules().map((task) => scheduledTaskSchema.parse(task))).toHaveLength(1);
    for (const table of [
      "projects",
      "threads",
      "project_notes",
      "scheduled_tasks",
      "thread_completed_turns",
    ]) {
      expect(db.prepare(`SELECT count(*) AS n FROM ${table}`).get()).toEqual({
        n: expected.tables[table].length,
      });
      for (const row of expected.tables[table]) {
        const columns = Object.keys(row);
        const actual = db.prepare(`SELECT ${columns.join(",")} FROM ${table}`).all();
        expect(actual).toContainEqual(row);
      }
    }
    for (const row of expected.tables.app_state.filter(
      (entry: { key: string }) => entry.key !== "schema_version",
    )) {
      expect(db.prepare("SELECT key,value FROM app_state WHERE key=?").get(row.key)).toEqual(row);
    }
    const runtime = await dbGetThreadRuntimeItems("18200000-0000-4000-8000-000000000002");
    for (const row of expected.runtime) {
      expect(runtime.find((item) => item.id === row.id)).toMatchObject(row);
    }
    expect(runtime).toHaveLength(expected.runtime.length);
    expect(
      db
        .prepare(
          "SELECT state FROM remote_command_receipts WHERE command_id='18200000-0000-4000-8000-000000000005'",
        )
        .get(),
    ).toEqual({ state: "uncertain" });
    closeDatabase();
  };
  await checkUpgraded();
  expect(digest(sourceDatabase)).toBe(before);
  lease.release();
  lease = HostOwnerLease.acquire(paths, "desktop");
  expect((await ensureDesktopOwnedRoot(lease)).baseDir).toBe(promoted.baseDir);
  await checkUpgraded();
  const preserved = new Database(sourceDatabase, { readonly: true });
  try {
    expect(
      preserved.prepare("SELECT value FROM app_state WHERE key='schema_version'").get(),
    ).toEqual({ value: "42" });
  } finally {
    preserved.close();
  }
  expect(digest(sourceDatabase)).toBe(before);
});
