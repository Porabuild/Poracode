import {
  copyFileSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  renameSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { resolve, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDatabase, initDatabase } from "./connection";
import { nativeBindingEnv } from "./runtimeItems.testFixtures";
import { LATEST_SCHEMA_VERSION } from "./migrations";
import {
  capturePreparedDatabaseWriteAdmission,
  PreparedDatabaseUnavailableError,
} from "./preparedDatabaseWriteAdmission";

vi.mock("node:fs", async (importOriginal) => {
  const original = await importOriginal<typeof import("node:fs")>();
  return { ...original, lstatSync: vi.fn<typeof original.lstatSync>(original.lstatSync) };
});

let root: string;
const handles: ReturnType<typeof initDatabase>[] = [];
const priorNativeBinding = process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING;
beforeEach(() => {
  mkdirSync("tmp", { recursive: true });
  root = resolve(mkdtempSync(join("tmp", "prepared-write-")));
  if (nativeBindingEnv) process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = nativeBindingEnv;
});
afterEach(() => {
  vi.mocked(lstatSync).mockReset();
  closeDatabase();
  for (const database of handles.splice(0)) if (database.open) database.close();
  rmSync(root, { recursive: true, force: true });
  if (priorNativeBinding === undefined) delete process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING;
  else process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = priorNativeBinding;
});

function prepared() {
  const path = join(root, "state.sqlite");
  const database = initDatabase(path);
  handles.push(database);
  return {
    database,
    path,
    assertWrite: capturePreparedDatabaseWriteAdmission(database, root, path),
  };
}

describe("live prepared database write admission", () => {
  it("admits the actual current root and rechecks its schema on each call", () => {
    const { database, assertWrite } = prepared();
    expect(() => assertWrite(root)).not.toThrow();
    database.prepare("UPDATE app_state SET value = '56' WHERE key = 'schema_version'").run();
    expect(() => assertWrite(root)).toThrow(PreparedDatabaseUnavailableError);
    database
      .prepare("UPDATE app_state SET value = ? WHERE key = 'schema_version'")
      .run(String(LATEST_SCHEMA_VERSION));
    expect(() => assertWrite(root)).not.toThrow();
  });

  it.each(["", "058", "58.0", " 58 ", "invalid", String(LATEST_SCHEMA_VERSION + 1)])(
    "refuses the stored schema marker %j without repairing it",
    (value) => {
      const { database, assertWrite } = prepared();
      database.prepare("UPDATE app_state SET value = ? WHERE key = 'schema_version'").run(value);
      expect(() => assertWrite(root)).toThrow(PreparedDatabaseUnavailableError);
      expect(
        database.prepare("SELECT value FROM app_state WHERE key = 'schema_version'").get(),
      ).toEqual({ value });
    },
  );

  it("refuses a missing schema marker", () => {
    const { database, assertWrite } = prepared();
    database.prepare("DELETE FROM app_state WHERE key = 'schema_version'").run();
    expect(() => assertWrite(root)).toThrow(PreparedDatabaseUnavailableError);
  });

  it("does not mistake a supported validation-only schema for current write admission", () => {
    const first = prepared();
    first.database.prepare("UPDATE app_state SET value = '56' WHERE key = 'schema_version'").run();
    closeDatabase();
    const database = initDatabase(first.path, { schemaMode: "validate" });
    handles.push(database);
    const assertWrite = capturePreparedDatabaseWriteAdmission(database, root, first.path);
    expect(() => assertWrite(root)).toThrow(PreparedDatabaseUnavailableError);
  });

  it("refuses a foreign settings root", () => {
    const { assertWrite } = prepared();
    const other = join(root, "foreign");
    mkdirSync(other);
    expect(() => assertWrite(other)).toThrow(PreparedDatabaseUnavailableError);
  });

  it("refuses a closed or replaced active connection even at the current schema", () => {
    const { assertWrite } = prepared();
    const other = initDatabase(join(root, "other.sqlite"));
    handles.push(other);
    expect(() => assertWrite(root)).toThrow(PreparedDatabaseUnavailableError);
    closeDatabase();
    expect(() => assertWrite(root)).toThrow(PreparedDatabaseUnavailableError);
  });

  it("refuses a replaced database file while its original connection stays open", () => {
    const { path, assertWrite } = prepared();
    if (process.platform === "win32") {
      // Windows locks open SQLite files; supply the identity of a real copy
      // at the stat boundary to exercise the same replacement refusal.
      const replacement = `${path}.replacement`;
      copyFileSync(path, replacement);
      const rootStat = lstatSync(root);
      const fileStat = lstatSync(replacement);
      vi.mocked(lstatSync).mockReturnValueOnce(rootStat).mockReturnValueOnce(fileStat);
    } else {
      renameSync(path, `${path}.original`);
      copyFileSync(`${path}.original`, path);
    }
    expect(() => assertWrite(root)).toThrow(PreparedDatabaseUnavailableError);
  });

  it("refuses a replacement data root with a copied database while the original stays open", () => {
    const { assertWrite } = prepared();
    const displaced = `${root}.original`;
    if (process.platform === "win32") {
      const replacement = join(root, "replacement");
      mkdirSync(replacement);
      copyFileSync(join(root, "state.sqlite"), join(replacement, "state.sqlite"));
      const rootStat = lstatSync(replacement);
      vi.mocked(lstatSync).mockReturnValueOnce(rootStat);
    } else {
      renameSync(root, displaced);
      mkdirSync(root);
      copyFileSync(join(displaced, "state.sqlite"), join(root, "state.sqlite"));
    }
    try {
      expect(() => assertWrite(root)).toThrow(PreparedDatabaseUnavailableError);
    } finally {
      closeDatabase();
      rmSync(displaced, { recursive: true, force: true });
    }
  });

  it("refuses a symlink substituted for the prepared root even when it points to the original", () => {
    const { assertWrite } = prepared();
    const displaced = `${root}.original`;
    if (process.platform === "win32") {
      const link = join(root, "root-link");
      symlinkSync(root, link, "junction");
      const rootStat = lstatSync(link);
      vi.mocked(lstatSync).mockReturnValueOnce(rootStat);
    } else {
      renameSync(root, displaced);
      symlinkSync(displaced, root, "dir");
    }
    try {
      expect(() => assertWrite(root)).toThrow(PreparedDatabaseUnavailableError);
    } finally {
      closeDatabase();
      if (process.platform !== "win32") rmSync(root, { force: true });
      rmSync(displaced, { recursive: true, force: true });
    }
  });
});
