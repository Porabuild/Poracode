import Database from "better-sqlite3";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LATEST_SCHEMA_VERSION } from "@/main/db/migrations";
import { HOST_CONTROL_DISCOVERY_FILE } from "@/shared/hostControlProtocol";
import { HostOwnerLease } from "./hostOwnerLease";
import { HOST_ROOT_MANIFEST_FILE, resolveHostRootPaths } from "./hostRootPaths";
import {
  HOST_IMPORT_RECEIPT_FILE,
  HostActivationRequiredError,
  prepareOwnedHostRoot,
} from "./hostRootManifest";
import { readHostImportReceipt, stageHostImport } from "./stageHostImport";

const roots: string[] = [];
const leases: HostOwnerLease[] = [];

function fixture(schemaVersion = 0) {
  const created = mkdtempSync(join(tmpdir(), "poracode-owned-import-"));
  roots.push(created);
  const root = realpathSync.native(created);
  const lease = HostOwnerLease.acquire(resolveHostRootPaths(join(root, "profile")), "headless");
  leases.push(lease);
  const source = join(root, "offline-backup");
  mkdirSync(source);
  const database = new Database(join(source, "state.sqlite"));
  database.exec(
    "CREATE TABLE app_state (key TEXT PRIMARY KEY, value TEXT); CREATE TABLE scheduled_tasks (id TEXT PRIMARY KEY, enabled INTEGER, prompt TEXT); CREATE TABLE threads (id TEXT PRIMARY KEY, session_ref TEXT, worktree_path TEXT)",
  );
  database.prepare("INSERT INTO app_state VALUES ('schema_version', ?)").run(String(schemaVersion));
  database
    .prepare(
      "INSERT INTO scheduled_tasks VALUES ('synthetic-schedule', 1, 'synthetic inert backup text')",
    )
    .run();
  database
    .prepare("INSERT INTO threads VALUES ('synthetic-thread', 'synthetic-provider-reference', ?)")
    .run(join(root, "disposable-project"));
  database.close();
  writeFileSync(join(source, "settings.json"), '{"synthetic":true}\n');
  return { root, source, lease };
}

function importFixture(value: ReturnType<typeof fixture>) {
  return stageHostImport(value.lease, {
    sourceBackupPath: value.source,
    sourceDeclaredOffline: true,
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const lease of leases.splice(0)) lease.release();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("explicit offline backup staging", () => {
  it("excludes the old owner's ephemeral control credential from an otherwise valid offline backup", async () => {
    const value = fixture();
    const sourceControl = join(value.source, HOST_CONTROL_DISCOVERY_FILE);
    const bytes = JSON.stringify({ token: "synthetic-old-owner-control-secret" });
    writeFileSync(sourceControl, bytes);
    const receipt = await importFixture(value);
    expect(existsSync(join(value.lease.paths.dataRoot, HOST_CONTROL_DISCOVERY_FILE))).toBe(false);
    expect(readFileSync(sourceControl, "utf8")).toBe(bytes);
    expect(receipt.files).toBe(1);
    expect(() => prepareOwnedHostRoot(value.lease)).toThrow(HostActivationRequiredError);
  });

  it.each(["secret-key.safe", "secret-key.headless"])(
    "preserves %s and database content behind the activation gate",
    async (keyFile) => {
      const value = fixture();
      mkdirSync(value.lease.paths.profileNamespace);
      const original = join(value.lease.paths.profileNamespace, "unchanged.txt");
      writeFileSync(original, "legacy profile remains untouched");
      const key =
        keyFile === "secret-key.safe"
          ? "synthetic-sealed-key-bytes"
          : Buffer.alloc(32, 7).toString("base64");
      writeFileSync(join(value.source, keyFile), key);
      const receipt = await importFixture(value);
      expect(receipt).toMatchObject({
        formatVersion: 1,
        activation: "required",
        sourceDeclaredOffline: true,
        databaseSchemaVersion: 0,
      });
      expect(readHostImportReceipt(value.lease)).toEqual(receipt);
      expect(readFileSync(join(value.lease.paths.dataRoot, keyFile), "utf8")).toBe(key);
      expect(readFileSync(join(value.source, keyFile), "utf8")).toBe(key);
      expect(readFileSync(original, "utf8")).toBe("legacy profile remains untouched");
      expect(() => prepareOwnedHostRoot(value.lease)).toThrow(HostActivationRequiredError);
      const copied = new Database(join(value.lease.paths.dataRoot, "state.sqlite"), {
        readonly: true,
      });
      try {
        expect(copied.prepare("SELECT enabled FROM scheduled_tasks").pluck().get()).toBe(1);
        expect(copied.prepare("SELECT session_ref FROM threads").pluck().get()).toBe(
          "synthetic-provider-reference",
        );
      } finally {
        copied.close();
      }
    },
  );

  it("retains the source SQLite lock while inventory and backup work run", async () => {
    const value = fixture();
    const original = Database.prototype.backup;
    let probe: { status: string; code?: string } | undefined;
    vi.spyOn(Database.prototype, "backup").mockImplementation(
      async function (this: InstanceType<typeof Database>, destination, options) {
        const result = await original.call(this, destination, options);
        const child = spawnSync(
          process.execPath,
          [
            fileURLToPath(new URL("./fixtures/importDatabaseProbe.mjs", import.meta.url)),
            join(value.source, "state.sqlite"),
          ],
          { encoding: "utf8", timeout: 5_000 },
        );
        expect(child.status).toBe(0);
        probe = JSON.parse(child.stdout);
        return result;
      },
    );
    await importFixture(value);
    expect(probe).toEqual({ status: "refused", code: "SQLITE_BUSY" });
  });

  it.each(["server.lock", "state.sqlite-wal", "state.sqlite-shm", "state.sqlite-journal"])(
    "refuses a backup with unresolved %s",
    async (name) => {
      const value = fixture();
      writeFileSync(join(value.source, name), "synthetic unresolved source");
      await expect(importFixture(value)).rejects.toThrow(/still contains/u);
      expect(existsSync(value.lease.paths.dataRoot)).toBe(false);
    },
  );

  it("refuses a dangling journal link before SQLite could follow it", async () => {
    const value = fixture();
    symlinkSync(
      join(value.root, "missing-outside-journal"),
      join(value.source, "state.sqlite-journal"),
      "file",
    );
    await expect(importFixture(value)).rejects.toThrow(/still contains/u);
    expect(existsSync(join(value.root, "missing-outside-journal"))).toBe(false);
  });

  it("refuses an existing source database owner", async () => {
    const value = fixture();
    const other = new Database(join(value.source, "state.sqlite"));
    other.pragma("locking_mode = EXCLUSIVE");
    other.exec("BEGIN EXCLUSIVE; COMMIT");
    try {
      await expect(importFixture(value)).rejects.toThrow(/locked/u);
    } finally {
      other.close();
    }
    expect(existsSync(value.lease.paths.dataRoot)).toBe(false);
  });

  it("refuses a future database schema without migrating it", async () => {
    const value = fixture(LATEST_SCHEMA_VERSION + 1);
    const before = readFileSync(join(value.source, "state.sqlite"));
    await expect(importFixture(value)).rejects.toThrow(/unsupported schema/u);
    expect(readFileSync(join(value.source, "state.sqlite"))).toEqual(before);
    expect(existsSync(value.lease.paths.dataRoot)).toBe(false);
  });

  it.each(["symlink", "hardlink", "database-hardlink"] as const)(
    "refuses a %s that could alias live state",
    async (kind) => {
      const value = fixture();
      if (kind === "symlink")
        symlinkSync(
          join(value.source, "settings.json"),
          join(value.source, "settings-alias"),
          "file",
        );
      else if (kind === "hardlink")
        linkSync(join(value.source, "settings.json"), join(value.source, "settings-alias"));
      else linkSync(join(value.source, "state.sqlite"), join(value.root, "database-alias"));
      await expect(importFixture(value)).rejects.toThrow(
        /symbolic link|multiply linked|independently copied/u,
      );
      expect(existsSync(value.lease.paths.dataRoot)).toBe(false);
    },
  );

  it.each([
    { names: ["secret-key.safe", "secret-key.headless"] },
    { names: ["secret-key.future"] },
  ])("refuses unknown or cross-mode credential files (%j)", async ({ names }) => {
    const value = fixture();
    for (const name of names) writeFileSync(join(value.source, name), "synthetic credential bytes");
    await expect(importFixture(value)).rejects.toThrow(/unknown or conflicting credential/u);
    expect(existsSync(value.lease.paths.dataRoot)).toBe(false);
  });

  it.each([HOST_ROOT_MANIFEST_FILE, HOST_IMPORT_RECEIPT_FILE])(
    "does not reinterpret a source with an owned format marker (%s)",
    async (marker) => {
      const value = fixture();
      writeFileSync(join(value.source, marker), '{"version":999}');
      await expect(importFixture(value)).rejects.toThrow(/format markers/u);
    },
  );

  it("requires a separate backup and refuses replacing existing owned state", async () => {
    const value = fixture();
    mkdirSync(value.lease.paths.profileNamespace);
    await expect(
      stageHostImport(value.lease, {
        sourceBackupPath: value.lease.paths.profileNamespace,
        sourceDeclaredOffline: true,
      }),
    ).rejects.toThrow(/separate offline backup/u);
    await expect(
      stageHostImport(value.lease, { sourceBackupPath: value.root, sourceDeclaredOffline: true }),
    ).rejects.toThrow(/separate offline backup/u);
    prepareOwnedHostRoot(value.lease);
    const before = readFileSync(join(value.lease.paths.dataRoot, HOST_ROOT_MANIFEST_FILE), "utf8");
    await expect(importFixture(value)).rejects.toThrow(/cannot overwrite/u);
    expect(readFileSync(join(value.lease.paths.dataRoot, HOST_ROOT_MANIFEST_FILE), "utf8")).toBe(
      before,
    );
  });

  it("rejects source changes during an asynchronous database backup and removes its staging directory", async () => {
    const value = fixture();
    const original = Database.prototype.backup;
    vi.spyOn(Database.prototype, "backup").mockImplementation(
      async function (this: InstanceType<typeof Database>, destination, options) {
        const result = await original.call(this, destination, options);
        writeFileSync(join(value.source, "settings.json"), '{"changed":true}');
        return result;
      },
    );
    await expect(importFixture(value)).rejects.toThrow(/changed/u);
    expect(existsSync(value.lease.paths.dataRoot)).toBe(false);
    expect(readdirSync(value.root).some((name) => name.includes(".import-"))).toBe(false);
  });

  it("does not publish a late backup result after owner loss", async () => {
    const value = fixture();
    const original = Database.prototype.backup;
    vi.spyOn(Database.prototype, "backup").mockImplementation(
      async function (this: InstanceType<typeof Database>, destination, options) {
        const result = await original.call(this, destination, options);
        value.lease.release();
        return result;
      },
    );
    await expect(importFixture(value)).rejects.toThrow(/no longer active/u);
    expect(existsSync(value.lease.paths.dataRoot)).toBe(false);
    expect(readdirSync(value.root).some((name) => name.includes(".import-"))).toBe(false);
  });

  it.each([0, 2, "1", undefined])(
    "refuses a receipt with an unsupported version (%s)",
    async (version) => {
      const value = fixture();
      const receipt = await importFixture(value);
      const path = join(value.lease.paths.dataRoot, HOST_IMPORT_RECEIPT_FILE);
      writeFileSync(path, JSON.stringify({ ...receipt, formatVersion: version }));
      expect(() => readHostImportReceipt(value.lease)).toThrow(/Unsupported.*receipt version/u);
    },
  );

  it("detects a changed receipt even when its version and profile still match", async () => {
    const value = fixture();
    const receipt = await importFixture(value);
    writeFileSync(
      join(value.lease.paths.dataRoot, HOST_IMPORT_RECEIPT_FILE),
      JSON.stringify({ ...receipt, files: receipt.files + 1 }),
    );
    expect(() => readHostImportReceipt(value.lease)).toThrow(/does not match its root manifest/u);
  });
});
