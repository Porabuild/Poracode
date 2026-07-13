import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHeadlessRemoteHost, resolveLocalProxyBase } from "./createHeadlessRemoteHost";

// Mutable state shared with the hoisted vi.mock factories.
const h = vi.hoisted(() => ({
  tmpBase: "",
  capturedOnEvent: undefined as ((event: unknown) => void) | undefined,
  supervisorStart: vi.fn<(baseDir: string) => void>(),
  supervisorDispose: vi.fn<() => void>(),
  supervisorCall: vi.fn<() => Promise<unknown>>(async () => ({})),
  initDatabase: vi.fn<(dbPath: string) => void>(),
  closeDatabase: vi.fn<() => void>(),
  projects: [] as unknown[],
  sharedSettings: {
    mcpServers: [] as unknown[],
    disabledBuiltInMcpServers: {} as Record<string, boolean>,
  },
}));

// `../db` (used by RemoteAccessServer) and `@/main/db` resolve to the same
// file, so this mock covers both importers. Native better-sqlite3 never loads.
vi.mock("@/main/db", () => ({
  initDatabase: (dbPath: string) => h.initDatabase(dbPath),
  closeDatabase: () => h.closeDatabase(),
  dbGetProjects: vi.fn<() => unknown[]>(() => h.projects),
  dbGetProject: vi.fn<(projectId: string) => unknown>(
    (projectId) =>
      h.projects.find(
        (project) =>
          typeof project === "object" &&
          project !== null &&
          "id" in project &&
          project.id === projectId,
      ) ?? null,
  ),
  dbGetThreads: vi.fn<() => unknown[]>(() => []),
  dbGetThread: vi.fn<() => unknown>(() => null),
  dbGetThreadRuntimeItems: vi.fn<() => unknown[]>(() => []),
  dbGetThreadCompletedTurns: vi.fn<() => unknown[]>(() => []),
  dbGetThreadContextUsage: vi.fn<() => unknown>(() => null),
  dbUpsertThread: vi.fn<() => void>(),
  dbMarkLiveThreadsInactive: vi.fn<() => void>(),
  dbDeleteThread: vi.fn<() => void>(),
  dbGetSchedules: vi.fn<() => unknown[]>(() => []),
  dbGetSchedule: vi.fn<() => unknown>(() => null),
  dbUpsertSchedule: vi.fn<() => void>(),
  dbDeleteSchedule: vi.fn<() => void>(),
  dbInsertScheduleRun: vi.fn<() => void>(),
  dbUpdateScheduleRun: vi.fn<() => void>(),
  dbListScheduleRuns: vi.fn<() => unknown[]>(() => []),
  dbDeleteScheduleRuns: vi.fn<() => void>(),
  dbInterruptScheduleRuns: vi.fn<() => void>(),
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

vi.mock("@/main/poracodeData", () => ({
  preparePoracodeDataRoot: () => {
    const base = h.tmpBase;
    return {
      baseDir: base,
      dbPath: join(base, "state.sqlite"),
      settingsPath: join(base, "settings.json"),
    };
  },
}));

vi.mock("@/main/sharedSettingsFile", () => ({
  readSharedSettingsFile: () => h.sharedSettings,
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
    h.supervisorCall.mockReset();
    h.supervisorCall.mockResolvedValue({});
    h.projects = [];
    h.sharedSettings = { mcpServers: [], disabledBuiltInMcpServers: {} };
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

  it("resolves MCP launch settings from the headless settings file and project row", async () => {
    const globalServer = {
      id: "global-memory",
      name: "memory",
      description: "global",
      enabled: true,
      timeoutMs: 30_000,
      transport: { type: "stdio", command: "global-memory", args: [], env: {} },
    };
    const projectServer = {
      ...globalServer,
      id: "project-memory",
      name: "MEMORY",
      description: "project override",
      transport: { ...globalServer.transport, command: "project-memory" },
    };
    h.projects = [
      {
        id: "project-1",
        name: "Project",
        location: { kind: "posix", path: "/repo" },
        createdAt: "2026-01-01T00:00:00.000Z",
        mcpServers: [projectServer],
      },
    ];
    h.sharedSettings = {
      mcpServers: [globalServer],
      disabledBuiltInMcpServers: { chrome: true },
    };

    const host = makeHost();
    const resolver = (
      host.server as unknown as {
        options: {
          resolveMcpLaunchSnapshot?: (projectId: string) => unknown;
        };
      }
    ).options.resolveMcpLaunchSnapshot;

    expect(resolver?.("project-1")).toEqual({
      mcpServers: [projectServer],
      disabledBuiltInMcpServerIds: ["chrome"],
    });
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

describe("resolveLocalProxyBase", () => {
  it("uses 127.0.0.1 for wildcard bind hosts (server also listens on loopback)", () => {
    for (const wildcard of ["0.0.0.0", "::", "::0", "", "   ", undefined]) {
      expect(resolveLocalProxyBase(wildcard, "http://0.0.0.0:38987/")).toBe(
        "http://127.0.0.1:38987",
      );
    }
  });

  it("uses the specific IPv4 bind host so relay proxy reaches the actual listener", () => {
    // A Tailscale/VPN IP: the server does NOT listen on 127.0.0.1 here.
    expect(resolveLocalProxyBase("100.64.1.2", "http://100.64.1.2:38987/")).toBe(
      "http://100.64.1.2:38987",
    );
  });

  it("brackets IPv6 literal bind hosts", () => {
    expect(resolveLocalProxyBase("fd7a:115c:a1e0::1", "http://[fd7a:115c:a1e0::1]:38987/")).toBe(
      "http://[fd7a:115c:a1e0::1]:38987",
    );
    // Already-bracketed literals are left as-is.
    expect(resolveLocalProxyBase("[fd7a:115c:a1e0::1]", "http://[fd7a:115c:a1e0::1]:38987/")).toBe(
      "http://[fd7a:115c:a1e0::1]:38987",
    );
  });

  it("passes hostnames through unchanged", () => {
    expect(resolveLocalProxyBase("my-server.local", "http://my-server.local:38987/")).toBe(
      "http://my-server.local:38987",
    );
  });

  it("always takes the port from the actually-listening httpBaseUrl", () => {
    // Ephemeral-port bind (port 0 requested) resolves to a real port at listen.
    expect(resolveLocalProxyBase("0.0.0.0", "http://0.0.0.0:54321/")).toBe(
      "http://127.0.0.1:54321",
    );
  });
});
