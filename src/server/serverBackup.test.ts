import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterAll, describe, expect, it } from "vitest";
import { LATEST_SCHEMA_VERSION } from "@/host/db/migrations";
import { resolveHostRootPaths } from "@/backend/ownership/hostRootPaths";
import {
  SERVER_BACKUP_RECEIPT_FILE,
  SERVER_BACKUP_RECEIPT_VERSION,
  createHostDataBackup,
} from "./serverBackup";

const fixtures: string[] = [];

afterAll(() => {
  for (const path of fixtures) rmSync(path, { recursive: true, force: true });
});

interface BackupFixture {
  readonly root: string;
  readonly namespace: string;
  readonly dataRoot: string;
  readonly secretKeyValue: string;
  readonly writer: InstanceType<typeof Database>;
}

/**
 * Build an owned-root-shaped fixture with a live WAL database (the writer
 * connection stays open) so the backup proves its online-snapshot behavior.
 */
function buildBackupFixture(): BackupFixture {
  const root = mkdtempSync(join(tmpdir(), "poracode-backup-"));
  fixtures.push(root);
  const namespace = join(root, "profile");
  mkdirSync(namespace, { recursive: true, mode: 0o700 });
  const paths = resolveHostRootPaths(namespace);
  mkdirSync(paths.dataRoot, { recursive: true, mode: 0o700 });
  const secretKeyValue = Buffer.alloc(32, 11).toString("base64");

  const privateWrite = (path: string, content: string): void => {
    writeFileSync(path, content, "utf8");
    chmodSync(path, 0o600);
  };
  privateWrite(
    join(paths.dataRoot, "host-root.json"),
    `${JSON.stringify({
      layoutVersion: 1,
      profileNamespace: paths.profileNamespace,
      dataRoot: paths.dataRoot,
      createdAt: "2026-09-16T00:00:00.000Z",
      source: { kind: "empty", activation: "ready" },
    })}\n`,
  );
  privateWrite(join(paths.dataRoot, "settings.json"), `${JSON.stringify({ theme: "dark" })}\n`);
  privateWrite(join(paths.dataRoot, "secret-key.headless"), `${secretKeyValue}\n`);
  privateWrite(
    join(paths.dataRoot, "host-control.json"),
    `${JSON.stringify({
      formatVersion: 1,
      profileNamespace: paths.profileNamespace,
      dataRoot: paths.dataRoot,
      ownerGeneration: "00000000-0000-4000-8000-000000000000",
      transport: { kind: "http-loopback", port: 49200 },
      token: `${"B".repeat(42)}A`,
    })}\n`,
  );
  mkdirSync(join(paths.dataRoot, "attachments"), { recursive: true, mode: 0o700 });
  writeFileSync(join(paths.dataRoot, "attachments", "note.txt"), "attachment bytes\n");

  const database = new Database(join(paths.dataRoot, "state.sqlite"));
  database.pragma("journal_mode = WAL");
  database.pragma("synchronous = NORMAL");
  database.exec("CREATE TABLE app_state (key TEXT PRIMARY KEY, value TEXT)");
  database
    .prepare("INSERT INTO app_state (key, value) VALUES ('schema_version', ?)")
    .run(String(LATEST_SCHEMA_VERSION));
  database.exec("CREATE TABLE demo (id INTEGER PRIMARY KEY, note TEXT)");
  const insert = database.prepare("INSERT INTO demo (note) VALUES (?)");
  const seed = database.transaction((count: number) => {
    for (let index = 0; index < count; index += 1) insert.run(`note-${index}`);
  });
  seed(50);
  // The writer deliberately stays open: the backup must snapshot the committed
  // WAL content without coordinating with any owner.
  return { root, namespace, dataRoot: paths.dataRoot, secretKeyValue, writer: database };
}

describe("createHostDataBackup", () => {
  it("captures an online snapshot plus a verified file inventory", async () => {
    const fixture = buildBackupFixture();
    const destination = join(fixture.root, "backup-01");
    const receipt = await createHostDataBackup({
      profileNamespace: fixture.namespace,
      destination,
    });

    expect(receipt.formatVersion).toBe(SERVER_BACKUP_RECEIPT_VERSION);
    expect(receipt.sourceDataRoot).toBe(fixture.dataRoot);
    expect(receipt.credentialMode).toBe("headless-file-unverified");
    expect(receipt.databaseSchemaVersion).toBe(LATEST_SCHEMA_VERSION);
    expect(receipt.databaseSource).toBe("sqlite-backup-api-online-snapshot");
    expect(receipt.databaseSha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(receipt.fileInventorySha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(receipt.files).toBeGreaterThan(3);
    expect(receipt.ownerGeneration).toBeNull();

    // The delivered backup directory is self-contained: no journal sidecars.
    expect(existsSync(join(destination, "state.sqlite-wal"))).toBe(false);
    expect(existsSync(join(destination, "state.sqlite-shm"))).toBe(false);

    // Snapshot is a consistent database including the committed WAL rows.
    const snapshot = new Database(join(destination, "state.sqlite"), { readonly: true });
    const count = snapshot
      .prepare<[], { total: number }>("SELECT COUNT(*) AS total FROM demo")
      .get();
    snapshot.close();
    expect(count?.total).toBe(50);

    // Other owned files copied; ephemeral control credentials excluded.
    expect(readFileSync(join(destination, "settings.json"), "utf8")).toContain("dark");
    expect(existsSync(join(destination, "attachments", "note.txt"))).toBe(true);
    expect(existsSync(join(destination, "host-control.json"))).toBe(false);

    // Snapshot file is owner-private and the receipt is written last.
    const mode = lstatSync(join(destination, "state.sqlite")).mode & 0o777;
    expect(mode).toBe(0o600);
    const storedReceipt = JSON.parse(
      readFileSync(join(destination, SERVER_BACKUP_RECEIPT_FILE), "utf8"),
    ) as Record<string, unknown>;
    expect(storedReceipt.formatVersion).toBe(SERVER_BACKUP_RECEIPT_VERSION);

    fixture.writer.close();
  });

  it("never captures secrets or credentials into the report", async () => {
    const fixture = buildBackupFixture();
    const destination = join(fixture.root, "backup-02");
    const receipt = await createHostDataBackup({
      profileNamespace: fixture.namespace,
      destination,
    });
    expect(JSON.stringify(receipt)).not.toContain(fixture.secretKeyValue);
    fixture.writer.close();
  });

  it("refuses destinations that exist or overlap the profile", async () => {
    const fixture = buildBackupFixture();
    const existing = join(fixture.root, "backup-03");
    mkdirSync(existing);
    const inside = join(fixture.dataRoot, "backup-inside");
    const enclosing = fixture.root;
    await expect(
      createHostDataBackup({ profileNamespace: fixture.namespace, destination: existing }),
    ).rejects.toThrow(/already exists/u);
    await expect(
      createHostDataBackup({ profileNamespace: fixture.namespace, destination: inside }),
    ).rejects.toThrow(/overlaps the profile/u);
    await expect(
      createHostDataBackup({ profileNamespace: fixture.namespace, destination: enclosing }),
    ).rejects.toThrow(/overlaps the profile/u);
    expect(existsSync(inside)).toBe(false);
    fixture.writer.close();
  });

  it("refuses sources with symbolic links instead of following them", async () => {
    const fixture = buildBackupFixture();
    symlinkSync(join(fixture.dataRoot, "settings.json"), join(fixture.dataRoot, "settings-link"));
    const destination = join(fixture.root, "backup-04");
    await expect(
      createHostDataBackup({ profileNamespace: fixture.namespace, destination }),
    ).rejects.toThrow(/symbolic link/u);
    expect(existsSync(destination)).toBe(false);
    fixture.writer.close();
  });

  it("refuses a profile that was never started", async () => {
    const root = mkdtempSync(join(tmpdir(), "poracode-backup-empty-"));
    fixtures.push(root);
    const namespace = join(root, "profile");
    mkdirSync(namespace, { recursive: true });
    await expect(
      createHostDataBackup({ profileNamespace: namespace, destination: join(root, "backup") }),
    ).rejects.toThrow(/nothing to back up/u);
  });

  it("refuses when the destination exists from a previous run", async () => {
    const fixture = buildBackupFixture();
    const destination = join(fixture.root, "backup-05");
    mkdirSync(destination);
    await expect(
      createHostDataBackup({ profileNamespace: fixture.namespace, destination }),
    ).rejects.toThrow(/already exists/u);
    fixture.writer.close();
  });

  it("honors a pre-aborted signal before touching anything", async () => {
    const fixture = buildBackupFixture();
    const controller = new AbortController();
    controller.abort();
    await expect(
      createHostDataBackup({
        profileNamespace: fixture.namespace,
        destination: join(fixture.root, "backup-06"),
        signal: controller.signal,
      }),
    ).rejects.toThrow(/aborted/i);
    expect(existsSync(join(fixture.root, "backup-06"))).toBe(false);
    fixture.writer.close();
  });

  it("leaves the source root unmodified except SQLite bookkeeping", async () => {
    const fixture = buildBackupFixture();
    const before = readdirSync(fixture.dataRoot).sort().join(",");
    await createHostDataBackup({
      profileNamespace: fixture.namespace,
      destination: join(fixture.root, "backup-07"),
    });
    const after = readdirSync(fixture.dataRoot).sort().join(",");
    // Only SQLite-managed journal bookkeeping may appear/disappear.
    expect(after.replace(/state\.sqlite-(wal|shm|journal),?/gu, "")).toBe(
      before.replace(/state\.sqlite-(wal|shm|journal),?/gu, ""),
    );
    fixture.writer.close();
  });
});
