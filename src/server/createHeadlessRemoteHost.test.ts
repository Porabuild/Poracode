import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHeadlessRemoteHost } from "./createHeadlessRemoteHost";

// Mutable state shared with the hoisted vi.mock factories.
const h = vi.hoisted(() => ({
  tmpBase: "",
  capturedOnEvent: undefined as ((event: unknown) => void) | undefined,
  supervisorStart: vi.fn<(baseDir: string) => void>(),
  supervisorDispose: vi.fn<() => void>(),
  supervisorCall: vi.fn<() => Promise<unknown>>(async () => ({})),
  initDatabase: vi.fn<(dbPath: string) => void>(),
  closeDatabase: vi.fn<() => void>(),
}));

// `../db` (used by RemoteAccessServer) and `@/main/db` resolve to the same
// file, so this mock covers both importers. Native better-sqlite3 never loads.
vi.mock("@/main/db", () => ({
  initDatabase: (dbPath: string) => h.initDatabase(dbPath),
  closeDatabase: () => h.closeDatabase(),
  dbGetProjects: vi.fn<() => unknown[]>(() => []),
  dbGetThreads: vi.fn<() => unknown[]>(() => []),
  dbGetThreadRuntimeItems: vi.fn<() => unknown[]>(() => []),
  dbGetThreadCompletedTurns: vi.fn<() => unknown[]>(() => []),
  dbGetThreadContextUsage: vi.fn<() => unknown>(() => null),
  dbUpsertThread: vi.fn<() => void>(),
  dbDeleteThread: vi.fn<() => void>(),
}));

vi.mock("@/main/supervisor/SupervisorClient", () => ({
  SupervisorClient: class {
    start = h.supervisorStart;
    dispose = h.supervisorDispose;
    call = h.supervisorCall;
    constructor(options: { onEvent: (event: unknown) => void }) {
      h.capturedOnEvent = options.onEvent;
    }
  },
}));

vi.mock("@/main/lightcodeData", () => ({
  prepareLightcodeDataRoot: () => {
    const base = h.tmpBase;
    return {
      baseDir: base,
      dbPath: join(base, "state.sqlite"),
      settingsPath: join(base, "settings.json"),
    };
  },
}));

vi.mock("@/main/sharedSettingsFile", () => ({
  readSharedSettingsFile: () => ({}),
  patchSharedSettingsFile: () => ({}),
}));

function makeHost() {
  return createHeadlessRemoteHost({
    appVersion: "9.9.9-test",
    baseDir: h.tmpBase,
    supervisorPath: "/dev/null/supervisor.cjs",
    wslHelpersDir: "/dev/null/wsl",
    secretStorageKey: Buffer.alloc(32, 7).toString("base64"),
    // Loopback + ephemeral port: no LAN probing, no port conflicts.
    host: "127.0.0.1",
    advertisedHost: "127.0.0.1",
    port: 0,
  });
}

describe("createHeadlessRemoteHost", () => {
  beforeEach(() => {
    h.tmpBase = mkdtempSync(join(tmpdir(), "lc-headless-"));
    h.capturedOnEvent = undefined;
    h.supervisorStart.mockReset();
    h.supervisorDispose.mockReset();
    h.initDatabase.mockReset();
    h.closeDatabase.mockReset();
  });

  afterEach(() => {
    rmSync(h.tmpBase, { recursive: true, force: true });
  });

  it("opens the database and forks the supervisor on start", async () => {
    const host = makeHost();
    const info = await host.start();

    expect(h.initDatabase).toHaveBeenCalledWith(join(h.tmpBase, "state.sqlite"));
    expect(h.supervisorStart).toHaveBeenCalledWith(h.tmpBase);
    expect(info.httpBaseUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/$/);
    expect(info.wsBaseUrl).toMatch(/^ws:\/\/127\.0\.0\.1:\d+\/$/);
    // The startup pairing link is minted against the advertised loopback host.
    expect(info.pairingUrl).toContain("token=");

    await host.dispose();
  });

  it("forks the supervisor only once across repeated start() calls", async () => {
    const host = makeHost();
    await host.start();
    await host.start();
    expect(h.supervisorStart).toHaveBeenCalledTimes(1);
    await host.dispose();
  });

  it("routes supervisor events to the server event stream", async () => {
    const host = makeHost();
    await host.start();
    const publish = vi.spyOn(host.server, "publishSupervisorEvent");

    expect(h.capturedOnEvent).toBeTypeOf("function");
    h.capturedOnEvent?.({ type: "thread-status" });

    expect(publish).toHaveBeenCalledWith({ type: "thread-status" });
    await host.dispose();
  });

  it("tears down the supervisor and database on dispose", async () => {
    const host = makeHost();
    await host.start();
    await host.dispose();

    expect(h.supervisorDispose).toHaveBeenCalledTimes(1);
    expect(h.closeDatabase).toHaveBeenCalledTimes(1);
  });
});
