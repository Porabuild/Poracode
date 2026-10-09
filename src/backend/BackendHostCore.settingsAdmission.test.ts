/** Real SQLite + Core + prepared-root helper + settings persistence. Only the
 * supervisor is inert: these tests never launch an agent or use a user root. */
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  closeDatabase,
  getSqlite,
  initDatabase,
  registerBeforeDatabaseClose,
} from "@/host/db/connection";
import { LATEST_SCHEMA_VERSION } from "@/host/db/migrations";
import * as admission from "@/host/db/preparedDatabaseWriteAdmission";
import { nativeBindingEnv, sqliteAvailable } from "@/host/db/runtimeItems.testFixtures";
import { readSharedSettingsFile } from "@/host/sharedSettingsFile";
import { composeHeadlessSettingsAuthority } from "@/server/headlessSettingsAuthority";
import { BackendHostCore } from "./BackendHostCore";
import { createBackendSettingsAccess, type BackendSettingsAccess } from "./BackendSettingsService";
import { HostDataFence, HostDataFenceInUseError } from "./ownership/hostDataFence";
import { HostOwnerController } from "./ownership/HostOwnerController";
import { HostRootInUseError } from "./ownership/hostOwnerLease";

vi.mock("@/host/supervisor/SupervisorClient", () => ({
  SupervisorClient: class {
    dispose = async () => {};
  },
}));

if (nativeBindingEnv) process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = nativeBindingEnv;
let refuseClose = false;
registerBeforeDatabaseClose(() => {
  if (refuseClose) throw new Error("fixture close refused");
});

describe.skipIf(!sqliteAvailable)("Core prepared database settings admission", () => {
  let root: string;
  let core: BackendHostCore | undefined;
  let settings: BackendSettingsAccess | undefined;
  const original = '{"themeMode":"dark","futureField":{"retain":true}}\n';
  const onChanged = vi.fn<() => void>();
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "prepared-core-settings-"));
    writeFileSync(join(root, "settings.json"), original);
    onChanged.mockClear();
  });
  afterEach(async () => {
    refuseClose = false;
    await settings?.dispose();
    await core?.disposeSupervisor();
    core?.closeDatabase();
    closeDatabase();
    settings = undefined;
    core = undefined;
    vi.restoreAllMocks();
    rmSync(root, { recursive: true, force: true });
  });
  function options(dataRoot = root) {
    return {
      baseDir: dataRoot,
      dbPath: join(dataRoot, "state.sqlite"),
      supervisor: {
        appVersion: "test",
        isDev: false,
        supervisorPath: join(root, "unused-supervisor.cjs"),
        wslHelpersDir: join(root, "unused-wsl"),
        secretStorageKey: "fixture",
      },
      onEvent: () => {},
      onReset: () => {},
    };
  }
  function open(schemaMode: "migrate" | "validate" = "migrate") {
    core = new BackendHostCore({
      ...options(),
      databaseSchemaMode: schemaMode,
      dataFencePath: join(root, "state.host-data.sqlite"),
    });
    const owner = core;
    const custody = owner.getDataCustody()!;
    settings = createBackendSettingsAccess({
      settingsPath: () => join(root, "settings.json"),
      lease: () => ({ paths: { dataRoot: root }, ...custody }),
      assertPreparedDatabaseForWrite: () => owner.assertPreparedDatabaseForWrite(root),
      onChanged,
    });
    return settings;
  }
  function setSchema(value: string | null) {
    if (value === null)
      getSqlite().prepare("DELETE FROM app_state WHERE key = 'schema_version'").run();
    else
      getSqlite()
        .prepare("INSERT OR REPLACE INTO app_state (key, value) VALUES ('schema_version', ?)")
        .run(value);
  }
  async function expectRefused(service: BackendSettingsAccess) {
    const before = await service.call("settingsTransactionSnapshot", {});
    await expect(service.editSettingsField("themeMode", () => "light")).rejects.toThrow(
      admission.PreparedDatabaseUnavailableError,
    );
    expect(await service.call("settingsTransactionSnapshot", {})).toEqual(before);
    expect(readFileSync(join(root, "settings.json"), "utf8")).toBe(original);
    expect(readdirSync(root).filter((name) => name.endsWith(".tmp"))).toEqual([]);
    expect(onChanged).not.toHaveBeenCalled();
  }

  it("captures the actual successful handle and commits under its real fence", async () => {
    const capture = vi.spyOn(admission, "capturePreparedDatabaseWriteAdmission");
    const service = open();
    expect(capture).toHaveBeenCalledExactlyOnceWith(getSqlite(), root, join(root, "state.sqlite"));
    await expect(service.editSettingsField("themeMode", () => "light")).resolves.toMatchObject({
      status: "committed",
      sequence: 1,
    });
    expect(readSharedSettingsFile(join(root, "settings.json")).themeMode).toBe("light");
    expect(onChanged).toHaveBeenCalledOnce();
  });

  it.each([
    String(LATEST_SCHEMA_VERSION - 1),
    "malformed",
    `${LATEST_SCHEMA_VERSION}.0`,
    null,
    String(LATEST_SCHEMA_VERSION + 1),
  ])(
    "rechecks schema %s on the live prepared connection before any settings effect",
    async (version) => {
      const service = open();
      core!.assertPreparedDatabaseForWrite(root);
      setSchema(version);
      await expectRefused(service);
      setSchema(String(LATEST_SCHEMA_VERSION));
      await expect(service.editSettingsField("themeMode", () => "light")).resolves.toMatchObject({
        status: "committed",
        sequence: 1,
      });
    },
  );

  it("permits legacy reads after validate-only preparation but refuses a stale-schema commit", async () => {
    initDatabase(join(root, "state.sqlite"));
    setSchema(String(LATEST_SCHEMA_VERSION - 1));
    closeDatabase();
    const service = open("validate");
    expect((await service.call("getSharedSettings", {})).themeMode).toBe("dark");
    await expectRefused(service);
  });

  it("rejects a replacement current connection even while its original handle stays live", async () => {
    const service = open();
    const originalDatabase = getSqlite();
    try {
      initDatabase(join(root, "state.sqlite"), { schemaMode: "validate" });
      expect(originalDatabase.open).toBe(true);
      await expectRefused(service);
    } finally {
      await service.dispose();
      await core!.dispose();
      originalDatabase.close();
    }
  });

  it("rejects an externally closed connection before any settings effect", async () => {
    const service = open();
    closeDatabase();
    expect(() => core!.assertPreparedDatabaseForWrite(root)).toThrow(
      admission.PreparedDatabaseUnavailableError,
    );
    await expectRefused(service);
  });

  it("rejects a foreign settings root through the Core capability", () => {
    open();
    expect(() => core!.assertPreparedDatabaseForWrite(tmpdir())).toThrow(
      admission.PreparedDatabaseUnavailableError,
    );
  });

  it("asserts its active data fence on every Core admission", () => {
    const acquire = vi.spyOn(HostDataFence, "acquire");
    open();
    const fence = acquire.mock.results[0]!.value as HostDataFence;
    fence.release();
    expect(() => core!.assertPreparedDatabaseForWrite(root)).toThrow("no longer active");
  });

  it("retains proof and custody through refused close, invalidating only after actual close", async () => {
    const service = open();
    await core!.disposeSupervisor();
    refuseClose = true;
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => core!.closeDatabase()).toThrow("fixture close refused");
    expect(() => HostDataFence.acquire(join(root, "state.host-data.sqlite"))).toThrow(
      HostDataFenceInUseError,
    );
    await expect(service.editSettingsField("themeMode", () => "light")).resolves.toMatchObject({
      status: "committed",
    });
    refuseClose = false;
    core!.closeDatabase();
    expect(() => core!.assertPreparedDatabaseForWrite(root)).toThrow(
      admission.PreparedDatabaseUnavailableError,
    );
    const successor = HostDataFence.acquire(join(root, "state.host-data.sqlite"));
    successor.release();
  });

  it("never captures proof when initDatabase throws after opening its handle", () => {
    const capture = vi.spyOn(admission, "capturePreparedDatabaseWriteAdmission");
    expect(() => new BackendHostCore({ ...options(), databaseSchemaMode: "validate" })).toThrow(
      /schema|table/i,
    );
    expect(capture).not.toHaveBeenCalled();
    expect(() => getSqlite()).toThrow("Database not initialized");
  });

  it("headless settings require both the real outer lease and the live Core callback", async () => {
    const owner = HostOwnerController.acquire(join(root, "namespace"), "headless");
    const runtime = await owner.initialize({ mode: "session-only" });
    let headless: Awaited<ReturnType<typeof composeHeadlessSettingsAuthority>> | undefined;
    try {
      core = new BackendHostCore(options(runtime.paths.baseDir));
      const host = core;
      headless = await composeHeadlessSettingsAuthority(runtime, {
        readSettings: () => readSharedSettingsFile(runtime.paths.settingsPath),
        assertPreparedDatabaseForWrite: () =>
          host.assertPreparedDatabaseForWrite(runtime.paths.baseDir),
        readProject: () => null,
        writeProject: () => {},
        projectsChanged: () => {},
      });
      expect(core.getDataCustody()).toBeNull();
      expect(() => HostOwnerController.acquire(join(root, "namespace"), "desktop")).toThrow(
        HostRootInUseError,
      );
      await expect(headless.editSettingsField("themeMode", () => "light")).resolves.toMatchObject({
        status: "committed",
      });
      setSchema("malformed");
      await expect(headless.editSettingsField("themeMode", () => "dark")).rejects.toThrow(
        admission.PreparedDatabaseUnavailableError,
      );
      setSchema(String(LATEST_SCHEMA_VERSION));
      runtime.lease.release();
      expect(() => host.assertPreparedDatabaseForWrite(runtime.paths.baseDir)).not.toThrow();
      await expect(headless.editSettingsField("themeMode", () => "dark")).rejects.toThrow(
        "no longer active",
      );
      expect(readSharedSettingsFile(runtime.paths.settingsPath).themeMode).toBe("light");
    } finally {
      await headless?.dispose();
      await core?.dispose();
      await owner.close();
    }
  });
});
