import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StartThreadPayload, Thread } from "@/shared/contracts";
import { createHeadlessRemoteHost, resolveLocalProxyBase } from "./createHeadlessRemoteHost";

// Mutable state shared with the hoisted vi.mock factories.
const h = vi.hoisted(() => ({
  tmpBase: "",
  capturedOnEvent: undefined as ((event: unknown) => void) | undefined,
  capturedPrepareStartThread: undefined as
    | ((payload: StartThreadPayload) => StartThreadPayload)
    | undefined,
  supervisorStart: vi.fn<(baseDir: string) => void>(),
  supervisorDispose: vi.fn<() => void>(),
  supervisorCall: vi.fn<() => Promise<unknown>>(async () => ({})),
  initDatabase: vi.fn<(dbPath: string) => void>(),
  closeDatabase: vi.fn<() => void>(),
  dbUpsertThread: vi.fn<(thread: Thread, sortOrder?: number) => void>(),
  dbDeleteThread: vi.fn<(threadId: string) => void>(),
  projects: [] as unknown[],
  threads: [] as Thread[],
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
  dbGetThreads: vi.fn<() => Thread[]>(() => h.threads),
  dbGetThread: vi.fn<(threadId: string) => Thread | null>(
    (threadId) => h.threads.find((thread) => thread.id === threadId) ?? null,
  ),
  dbGetThreadRuntimeItems: vi.fn<() => unknown[]>(() => []),
  dbGetThreadCompletedTurns: vi.fn<() => unknown[]>(() => []),
  dbGetThreadContextUsage: vi.fn<() => unknown>(() => null),
  dbGetLatestThreadRuntimeAnchorItemId: vi.fn<() => null>(() => null),
  dbAppendThreadCompletedTurn: vi.fn<() => void>(),
  dbApplyThreadRuntimeEvents: vi.fn<() => void>(),
  dbClaimRemoteCommand: vi.fn<() => { state: "claimed" }>(() => ({ state: "claimed" })),
  dbCompleteRemoteCommand: vi.fn<() => void>(),
  dbFailRemoteCommand: vi.fn<() => void>(),
  dbReplaceThreadRuntimeSnapshot: vi.fn<() => void>(),
  dbUpsertThread: (thread: Thread, sortOrder?: number) => h.dbUpsertThread(thread, sortOrder),
  dbMarkLiveThreadsInactive: vi.fn<() => void>(),
  dbDeleteThread: (threadId: string) => h.dbDeleteThread(threadId),
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
    constructor(options: {
      onEvent: (event: unknown) => void;
      prepareStartThread?: (payload: StartThreadPayload) => StartThreadPayload;
    }) {
      h.capturedOnEvent = options.onEvent;
      h.capturedPrepareStartThread = options.prepareStartThread;
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
    h.capturedPrepareStartThread = undefined;
    h.supervisorStart.mockReset();
    h.supervisorDispose.mockReset();
    h.initDatabase.mockReset();
    h.closeDatabase.mockReset();
    h.supervisorCall.mockReset();
    h.supervisorCall.mockResolvedValue({});
    h.dbUpsertThread.mockReset();
    h.dbDeleteThread.mockReset();
    h.projects = [];
    h.threads = [];
    h.sharedSettings = { mcpServers: [], disabledBuiltInMcpServers: {} };
  });

  afterEach(() => {
    rmSync(h.tmpBase, { recursive: true, force: true });
  });

  it("opens the database and forks the supervisor on start", async () => {
    const host = await makeHost();
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
    const host = await makeHost();
    await host.start();
    await host.start();
    expect(h.supervisorStart).toHaveBeenCalledTimes(1);
    await host.dispose();
  });

  it("routes supervisor events to the server event stream", async () => {
    const host = await makeHost();
    await host.start();
    const publish = vi.spyOn(host.server, "publishSupervisorEvent");

    expect(h.capturedOnEvent).toBeTypeOf("function");
    h.capturedOnEvent?.({ type: "thread-status" });

    expect(publish).toHaveBeenCalledWith({ type: "thread-status" });
    await host.dispose();
  });

  it("derives child recursion invariants from the persisted thread row", async () => {
    h.threads = [{ id: "child-thread", parentThreadId: "parent-thread" } as Thread];
    const host = await makeHost();
    const payload: StartThreadPayload = {
      threadId: "child-thread",
      projectLocation: { kind: "posix", path: "/repo" },
      agentKind: "codex",
      config: { model: "test" },
      prompt: "Inspect this.",
      initialSize: { cols: 120, rows: 40 },
    };

    expect(h.capturedPrepareStartThread?.(payload)).toMatchObject({
      invariantDisabledBuiltInMcpServerIds: ["subagents"],
    });
    await host.dispose();
  });

  it("consumes orchestrator child events and launches the persisted child", async () => {
    h.threads = [{ id: "parent-thread", projectId: "project-1" } as Thread];
    const host = await makeHost();
    const publish = vi.spyOn(host.server, "publishSupervisorEvent");
    const start: StartThreadPayload = {
      threadId: "child-thread",
      projectLocation: { kind: "posix", path: "/repo" },
      agentKind: "codex",
      config: { model: "test" },
      prompt: "Inspect this.",
      initialSize: { cols: 120, rows: 40 },
      invariantDisabledBuiltInMcpServerIds: ["subagents"],
    };
    const event = {
      type: "orchestrator-thread-created",
      parentThreadId: "parent-thread",
      thread: {
        id: "child-thread",
        title: "Inspect this.",
        agentKind: "codex",
        config: { model: "test" },
        status: "launching",
        attention: "none",
        canResumeWithConfig: false,
        archived: false,
        done: false,
        starred: false,
        presentationMode: "gui",
        parentThreadId: "parent-thread",
        createdAt: "2026-07-15T00:00:00.000Z",
        updatedAt: "2026-07-15T00:00:00.000Z",
      },
      start,
    };

    h.capturedOnEvent?.(event);
    await vi.waitFor(() =>
      expect(h.dbUpsertThread).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "child-thread",
          projectId: "project-1",
          parentThreadId: "parent-thread",
        }),
        expect.any(Number),
      ),
    );
    expect(h.supervisorCall).toHaveBeenCalledWith("startThread", start);
    expect(publish).not.toHaveBeenCalledWith(event);
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

    const host = await makeHost();
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
    const host = await makeHost();
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
