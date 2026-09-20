import { WebSocket as NodeWebSocket } from "ws";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ElectronHostBridge } from "@/shared/clientRuntime";
import { PORACODE_CLIENT_RUNTIME_VERSION } from "@/shared/clientRuntime";
import type { SupervisorEvent } from "@/shared/ipc";
import { IPC_PROCEDURE_MAP_VERSION } from "@/shared/ipc";
import { agentStatusSchema, type ScheduledTask, type TerminalSnapshot } from "@/shared/contracts";
import type { RemoteAccessServerOptions } from "@/host/remote/RemoteAccessServer";
import { RemoteAccessServer } from "@/host/remote/RemoteAccessServer";
import type { ManagedTerminalListener } from "./state/remoteTerminalFeed";
import {
  installElectronClientRuntime,
  isDesktopLoopbackIntakeActive,
  resetClientRuntimeForTest,
  resetDesktopLoopbackIntakeForTest,
  startDesktopLoopbackEventIntake,
  __setDesktopLoopbackIntakeTestSeamsForTest,
} from "./clientRuntime";
import {
  managedTerminalFeedId,
  watchManagedTerminal,
  watchRemoteTerminal,
} from "./state/remoteTerminalFeed";
import {
  __resetManagedLoopbackOwnerForTest,
  getManagedLoopbackOwnerRow,
  isManagedLoopbackRequestRoutingActive,
} from "./state/remoteServers/managedLoopbackOwner";
import {
  DesktopLoopbackIntake,
  parsePairingCredential,
} from "./state/remoteServers/desktopLoopbackIntake";
import { PreloadIpcTransport } from "./hostTransport";
import { readBridge } from "./bridge";

/**
 * V5 plan 2.5 completion — the managed desktop on the unified loopback path:
 *
 * - the terminal UI consumes PTY bytes through the loopback session's
 *   `terminal-watch` machinery (baseline + live, byte-exact) instead of the
 *   relay's `thread-output`;
 * - managed remote-routable requests ride the loopback HTTP leg, including a
 *   32 MiB large reply;
 * - severing the leg falls back to relay/IPC without data loss and the leg
 *   resumes through a fresh bootstrap after the server comes back.
 *
 * Everything runs against a REAL co-located RemoteAccessServer on loopback —
 * no mocked client, no mocked terminal machinery.
 */

type AnyFn = (...args: unknown[]) => unknown;

vi.mock("@/main/db", () => ({
  dbAppendThreadCompletedTurn: vi.fn<AnyFn>(),
  dbApplyThreadRuntimeEvents: vi.fn<AnyFn>(),
  dbClaimRemoteCommand: vi.fn<() => { state: "claimed" }>(() => ({ state: "claimed" })),
  dbCompleteRemoteCommand: vi.fn<AnyFn>(),
  dbFailRemoteCommand: vi.fn<AnyFn>(),
  dbDeleteThread: vi.fn<AnyFn>(),
  dbGetProject: vi.fn<() => null>(() => null),
  dbGetProjectNotes: vi.fn<() => null>(() => null),
  dbGetProjects: vi.fn<() => never[]>(() => []),
  dbGetThread: vi.fn<() => null>(() => null),
  dbGetThreadCompletedTurns: vi.fn<() => never[]>(() => []),
  dbGetThreadContextUsage: vi.fn<() => null>(() => null),
  dbGetThreadRuntimeItem: vi.fn<() => undefined>(() => undefined),
  dbGetThreadRuntimeItems: vi.fn<() => never[]>(() => []),
  dbGetThreadRuntimeItemsPage: vi.fn<() => { items: never[]; nextCursor: null }>(() => ({
    items: [],
    nextCursor: null,
  })),
  dbGetThreadRuntimeSummaries: vi.fn<() => Record<string, never>>(() => ({})),
  dbGetThreadTerminalScrollback: vi.fn<() => string>(() => ""),
  dbGetThreadTerminalScrollbackRecord: vi.fn<() => null>(() => null),
  dbGetThreads: vi.fn<() => never[]>(() => []),
  dbGetState: vi.fn<() => null>(() => null),
  dbSetState: vi.fn<AnyFn>(),
  dbReplaceThreadRuntimeSnapshot: vi.fn<AnyFn>(),
  dbUpdateProject: vi.fn<AnyFn>(),
  dbUpsertProject: vi.fn<AnyFn>(),
  dbUpsertThread: vi.fn<AnyFn>(),
  dbTruncateThreadRuntimeAfter: vi.fn<AnyFn>(),
}));

const snapshotsByThread = new Map<string, TerminalSnapshot>();
const servers: RemoteAccessServer[] = [];
const supervisorListeners = new Set<(event: SupervisorEvent, rendererSequence?: number) => void>();

/** Answer for the IPC-fallback readProjectFile (distinct from the HTTP one). */
let ipcReadProjectFileResult: { path: string; content: string } | null = null;
/** Holds the in-flight HTTP readProjectFile until released (sever-mid-request). */
let holdReadProjectFile: ((release: () => void) => void) | null = null;
/** Extra supervisor behavior installed per-test (large replies). */
let callSupervisorOverride:
  | ((procedure: string, payload: Record<string, unknown>) => Promise<unknown>)
  | null = null;

async function fixtureCallSupervisor(
  procedure: string,
  payload: Record<string, unknown>,
): Promise<unknown> {
  if (callSupervisorOverride) return callSupervisorOverride(procedure, payload);
  if (procedure === "readTerminalSnapshot") {
    const snapshot = snapshotsByThread.get(String(payload.threadId));
    if (!snapshot) return Promise.reject(new Error("not-found"));
    return Promise.resolve(snapshot);
  }
  if (procedure === "readProjectFile") {
    const path = String(payload.path);
    const hold = holdReadProjectFile;
    if (hold) {
      return new Promise((resolve) => {
        hold(() => resolve({ path, status: "ready", modifiedAtMs: 1, content: "" }));
      });
    }
    return Promise.resolve({ path, status: "ready", modifiedAtMs: 1, content: "HTTP" });
  }
  return Promise.resolve({ ok: true });
}

async function startFixtureServer(): Promise<RemoteAccessServer> {
  const server = new RemoteAccessServer({
    truncateThreadRuntime: () => {},
    appVersion: "1.0.0",
    identity: { desktopId: "desktop-loopback-fixture", label: "Fixture" },
    host: "127.0.0.1",
    port: 0,
    tls: null,
    ownsSupervisorPersistence: false,
    onEventInterestsChanged: vi.fn<() => void>(),
    callSupervisor: fixtureCallSupervisor as unknown as RemoteAccessServerOptions["callSupervisor"],
    schedules: {
      list: fixtureSchedulesList,
      runs: () => [],
      create: () => {
        throw new Error("not used by the unification fixture");
      },
      update: () => {
        throw new Error("not used by the unification fixture");
      },
      delete: () => {},
      runNow: () => {
        throw new Error("not used by the unification fixture");
      },
    },
  });
  servers.push(server);
  await server.start();
  return server;
}

let socketLog: string[] = [];

/** Schedules gateway spy: proves desktop-scoped calls reach the SERVER. */
const fixtureSchedulesList = vi.fn<() => ScheduledTask[]>(() => []);

function wsSocketFactory(url: string) {
  const socket = new NodeWebSocket(url);
  socketLog.push(`open:${url}`);
  socket.on("error", () => {
    // The intake models transport errors as close.
  });
  let onopen: (() => void) | null = null;
  let onmessage: ((event: { readonly data: unknown }) => void) | null = null;
  let onclose: (() => void) | null = null;
  socket.on("open", () => onopen?.());
  socket.on("message", (data) =>
    onmessage?.({ data: (socketLog.push(`in:${data.toString().slice(0, 60)}`), data.toString()) }),
  );
  socket.on("close", () => onclose?.());
  return {
    close: () => socket.close(),
    send: (data: string) => {
      socketLog.push(`out:${data.slice(0, 80)}`);
      socket.send(data);
    },
    get onopen() {
      return onopen;
    },
    set onopen(handler: (() => void) | null) {
      onopen = handler;
    },
    get onmessage() {
      return onmessage;
    },
    set onmessage(handler: ((event: { readonly data: unknown }) => void) | null) {
      onmessage = handler;
    },
    get onclose() {
      return onclose;
    },
    set onclose(handler: (() => void) | null) {
      onclose = handler;
    },
  };
}

function bootstrapPayloadFor(server: RemoteAccessServer): {
  endpoint: string;
  pairingUrl: string;
} {
  const info = server.getInfo();
  if (!info) throw new Error("fixture server not started");
  const pairingToken = new URLSearchParams(new URL(info.pairingUrl).hash.slice(1)).get("token");
  if (!pairingToken) throw new Error("fixture server has no startup credential");
  return {
    endpoint: info.localHttpBaseUrl,
    pairingUrl: `${info.localHttpBaseUrl}/#token=${pairingToken}`,
  };
}

function electronHost(
  getBootstrap: () => { endpoint: string; pairingUrl: string } | null,
): ElectronHostBridge {
  return {
    clientRuntimeVersion: PORACODE_CLIENT_RUNTIME_VERSION,
    arch: "x64",
    platform: "darwin",
    onSupervisorEvent: (listener: (event: SupervisorEvent, sequence?: number) => void) => {
      supervisorListeners.add(listener);
      return () => supervisorListeners.delete(listener);
    },
    onSupervisorEventGap: () => () => {},
    onBackendSupervisorReset: () => () => {},
    ipcProcedureMapVersion: IPC_PROCEDURE_MAP_VERSION,
    invokeProcedure: (async (name: string, args: unknown[]) => {
      if (name === "getManagedLoopbackBootstrap") return getBootstrap();
      if (name === "setRendererEventInterests") return null;
      if (name === "readProjectFile") {
        if (!ipcReadProjectFileResult) {
          throw new Error("IPC fallback reached with no stubbed answer");
        }
        const path = String((args[0] as { path: string }).path);
        return { ...ipcReadProjectFileResult, path };
      }
      throw new Error(`unexpected IPC procedure ${name}`);
    }) as ElectronHostBridge["invokeProcedure"],
  } as unknown as ElectronHostBridge;
}

const emitRelay = (event: SupervisorEvent, sequence?: number): void => {
  for (const listener of [...supervisorListeners]) listener(event, sequence);
};

beforeEach(() => {
  resetClientRuntimeForTest();
  Reflect.deleteProperty(window, "poracode");
  Reflect.deleteProperty(window, "poracodeHost");
  snapshotsByThread.clear();
  ipcReadProjectFileResult = null;
  holdReadProjectFile = null;
  callSupervisorOverride = null;
  bootstrapAnswer = null;
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(async () => {
  resetDesktopLoopbackIntakeForTest();
  __resetManagedLoopbackOwnerForTest();
  __setDesktopLoopbackIntakeTestSeamsForTest({});
  resetClientRuntimeForTest();
  Reflect.deleteProperty(window, "poracode");
  Reflect.deleteProperty(window, "poracodeHost");
  await Promise.all(servers.splice(0).map((server) => server.dispose()));
  supervisorListeners.clear();
  vi.restoreAllMocks();
});

/** The (mock) main bootstrap answer, re-pointable for server restarts. */
let bootstrapAnswer: { endpoint: string; pairingUrl: string } | null = null;

async function bootUnified(initialServer: RemoteAccessServer): Promise<void> {
  bootstrapAnswer = bootstrapPayloadFor(initialServer);
  const host = electronHost(() => bootstrapAnswer);
  window.poracodeHost = host;
  installElectronClientRuntime(host);
  __setDesktopLoopbackIntakeTestSeamsForTest({
    socketFactory: wsSocketFactory,
    retryDelayMs: 50,
    discoveryRetryMs: 80,
  });
  void startDesktopLoopbackEventIntake();
  // Generous timeout: under a loaded full-suite run the intake's WS connect
  // can exceed vi.waitFor's 1s default.
  await vi.waitFor(() => expect(isDesktopLoopbackIntakeActive()).toBe(true), { timeout: 10_000 });
}

/** Re-points the (mock) main bootstrap answer at a replacement server. */
function repointBootstrap(server: RemoteAccessServer): void {
  bootstrapAnswer = bootstrapPayloadFor(server);
}

describe("desktop terminal on terminal-watch (unified loopback path)", () => {
  it("delivers the baseline and live PTY bytes byte-exactly, and reset/exit, with the relay suppressed", async () => {
    snapshotsByThread.set("term-1", {
      generation: "gen-1",
      fromCursor: 0,
      toCursor: 8,
      data: "BASELINE",
      processState: "running",
      terminalSize: { cols: 120, rows: 30 },
    });
    const server = await startFixtureServer();
    await bootUnified(server);

    const outputs: string[] = [];
    let resets = 0;
    let exited: number | null | undefined;
    let snapshotText: string | null = null;
    const unsubscribe = watchManagedTerminal("term-1", {
      onOutput: (data) => outputs.push(data),
      onReset: () => {
        resets += 1;
      },
      onExited: (code) => {
        exited = code;
      },
      onSnapshot: (snapshot) => {
        snapshotText = snapshot.data;
      },
    } satisfies ManagedTerminalListener);

    // Baseline from the retained tail (the real readTerminalSnapshot round
    // trip through callSupervisor), then live bytes byte-exact. The live
    // event's `outputLength` continues the snapshot's absolute cursor (8).
    await vi.waitFor(() => expect(snapshotText).toBe("BASELINE"));
    server.publishSupervisorEvent({
      type: "thread-output",
      threadId: "term-1",
      data: "LIVE",
      outputLength: 12,
      terminalInstanceId: "gen-1",
    });
    await vi.waitFor(() => expect(outputs.join("")).toBe("LIVE"));

    // Terminal lifecycle rides the event stream into the feed.
    server.publishSupervisorEvent({ type: "thread-reset", threadId: "term-1" });
    await vi.waitFor(() => expect(resets).toBeGreaterThanOrEqual(1));
    server.publishSupervisorEvent({ type: "thread-exited", threadId: "term-1", exitCode: 7 });
    await vi.waitFor(() => expect(exited).toBe(7));

    // While the leg serves, IPC `thread-output` no longer reaches the
    // surface (V6 B.6: there is no event relay).
    emitRelay({
      type: "thread-output",
      threadId: "term-1",
      data: "RELAY",
      outputLength: 5,
      terminalInstanceId: "gen-1",
    });
    expect(outputs.join("")).not.toContain("RELAY");

    unsubscribe();
  });

  it("does not fall back to the IPC relay on leg severing, and resumes after re-bootstrap", async () => {
    snapshotsByThread.set("term-2", {
      generation: "gen-2",
      fromCursor: 0,
      toCursor: 0,
      data: "",
      processState: "running",
      terminalSize: { cols: 120, rows: 30 },
    });
    const server = await startFixtureServer();
    await bootUnified(server);
    const outputs: string[] = [];
    let resyncs = 0;
    let snapshots = 0;
    const unsubscribe = watchManagedTerminal("term-2", {
      onOutput: (data) => outputs.push(data),
      onReset: () => {},
      onExited: () => {},
      onResync: () => {
        resyncs += 1;
      },
      onSnapshot: () => {
        snapshots += 1;
      },
    } satisfies ManagedTerminalListener);

    // The watch is armed once its first baseline lands; from then on the
    // server tags and forwards live PTY bytes for this connection.
    await vi.waitFor(() => expect(snapshots).toBeGreaterThanOrEqual(1));

    // Live bytes over the loopback leg.
    server.publishSupervisorEvent({
      type: "thread-output",
      threadId: "term-2",
      data: "BEFORE",
      outputLength: 6,
      terminalInstanceId: "gen-2",
    });
    await vi.waitFor(() => expect(outputs.join("")).toBe("BEFORE"));

    // Sever the leg: the watches close and the transport rebuilds. V6 B.6:
    // IPC thread-output is not a data plane, so live bytes wait for resume.
    await server.dispose();
    await vi.waitFor(() => {
      expect(isDesktopLoopbackIntakeActive()).toBe(false);
      expect(resyncs).toBeGreaterThanOrEqual(1);
      expect(isManagedLoopbackRequestRoutingActive()).toBe(false);
      expect(getManagedLoopbackOwnerRow()).toBeNull();
    });
    emitRelay({
      type: "thread-output",
      threadId: "term-2",
      data: "AFTER",
      outputLength: 5,
      terminalInstanceId: "gen-2",
    });
    expect(outputs.join("")).toBe("BEFORE");

    // The server comes back (fresh port + fresh credential): the intake
    // re-bootstraps through main and the leg resumes serving the same watcher.
    const replacement = await startFixtureServer();
    repointBootstrap(replacement);
    await vi.waitFor(() => {
      expect(isDesktopLoopbackIntakeActive()).toBe(true);
      expect(isManagedLoopbackRequestRoutingActive()).toBe(true);
    });
    // A fresh watch arms on the replacement server (fresh baseline): a probe
    // watcher joining mid-session receives the active cache once it exists.
    let probeSnapshots = 0;
    const unsubscribeProbe = watchRemoteTerminal(managedTerminalFeedId(), "term-2", {
      onOutput: () => {},
      onReset: () => {},
      onExited: () => {},
      onSnapshot: () => {
        probeSnapshots += 1;
      },
    });
    await vi.waitFor(() => expect(probeSnapshots).toBeGreaterThanOrEqual(1));
    replacement.publishSupervisorEvent({
      type: "thread-output",
      threadId: "term-2",
      data: "RESUMED",
      outputLength: 7,
      terminalInstanceId: "gen-2",
    });
    await vi.waitFor(() => expect(outputs.join("")).toBe("BEFORERESUMED"));

    unsubscribeProbe();
    unsubscribe();
  });
});

describe("managed requests on the loopback HTTP leg", () => {
  it("rotates an expired managed token while its event socket stays connected", async () => {
    const server = await startFixtureServer();
    await bootUnified(server);
    const originalToken = getManagedLoopbackOwnerRow()!.accessToken;
    const socketCount = socketLog.length;
    const future = Date.now() + 25 * 60 * 60 * 1000;
    vi.spyOn(Date, "now").mockReturnValue(future);

    await expect(
      Promise.all([readBridge().getSchedules(), readBridge().getSchedules()]),
    ).resolves.toEqual([[], []]);
    expect(getManagedLoopbackOwnerRow()!.accessToken).not.toBe(originalToken);
    expect(isDesktopLoopbackIntakeActive()).toBe(true);
    expect(socketLog).toHaveLength(socketCount);
    await expect(readBridge().getSchedules()).resolves.toEqual([]);
  });

  it("carries a 32 MiB readProjectFile reply byte-exactly over loopback HTTP", async () => {
    const server = await startFixtureServer();
    await bootUnified(server);
    expect(isManagedLoopbackRequestRoutingActive()).toBe(true);
    expect(getManagedLoopbackOwnerRow()?.endpoint.startsWith("http://127.0.0.1:")).toBe(true);

    const LARGE = 32 * 1024 * 1024;
    const blob = "x".repeat(1024).repeat(LARGE / 1024);
    expect(blob.length).toBe(LARGE);
    const seen: Array<{ procedure: string; path: string }> = [];
    callSupervisorOverride = async (procedure, payload) => {
      if (procedure === "readProjectFile") {
        seen.push({ procedure, path: String(payload.path) });
        return { path: String(payload.path), status: "ready", modifiedAtMs: 1, content: blob };
      }
      return { ok: true };
    };

    const result = (await readBridge().readProjectFile({
      projectLocation: { kind: "posix", path: "/fixture" },
      path: "/fixture/large.txt",
    })) as { content: string };
    expect(seen).toEqual([{ procedure: "readProjectFile", path: "/fixture/large.txt" }]);
    expect(result.content.length).toBe(LARGE);
    expect(result.content).toBe(blob);
  }, 60_000);

  it("routes desktop-scoped schedule reads over loopback HTTP, never preload IPC (V6 B.2)", async () => {
    const server = await startFixtureServer();
    await bootUnified(server);
    fixtureSchedulesList.mockClear();

    // The bridge's desktop-scoped call must reach the co-located server's
    // schedules gateway over the loopback HTTP leg. The preload stub throws
    // `unexpected IPC procedure getSchedules` on any IPC fallback, so a green
    // result here is itself the no-fallback proof.
    const rows = (await readBridge().getSchedules()) as unknown[];
    expect(fixtureSchedulesList).toHaveBeenCalledOnce();
    expect(rows).toEqual([]);
  }, 30_000);

  it("does not fall back to preload IPC when the leg dies mid-request", async () => {
    const server = await startFixtureServer();
    await bootUnified(server);

    const release = { current: () => {} };
    holdReadProjectFile = (releaseFn) => {
      release.current = releaseFn;
    };
    ipcReadProjectFileResult = { path: "/fixture/one", content: "IPC" };

    const pending = readBridge().readProjectFile({
      projectLocation: { kind: "posix", path: "/fixture" },
      path: "/fixture/one",
    }) as Promise<{ content: string }>;

    // Sever the leg while the request is in flight: the HTTP connection dies
    // and V6 B.6 does not retry over preload IPC.
    await server.dispose();
    await vi.waitFor(() => expect(isDesktopLoopbackIntakeActive()).toBe(false));
    release.current();
    await expect(pending).rejects.toBeTruthy();
  }, 30_000);

  it("delivers live agent status to the runtime bridge over loopback WS", async () => {
    const server = await startFixtureServer();
    await bootUnified(server);
    const seen: SupervisorEvent[] = [];
    const unsubscribe = readBridge().onSupervisorEvent((event) => {
      seen.push(event);
    });
    server.publishSupervisorEvent({
      type: "windows-agent-statuses",
      statuses: [
        agentStatusSchema.parse({
          kind: "claude",
          label: "Claude",
          installed: true,
          authState: "authenticated",
          capabilities: {},
        }),
      ],
    });
    await vi.waitFor(() =>
      expect(seen.some((event) => event.type === "windows-agent-statuses")).toBe(true),
    );
    unsubscribe();
  }, 30_000);
});

describe("quick composer live status on its own loopback session (V6 B.6)", () => {
  const agentStatus = () =>
    agentStatusSchema.parse({
      kind: "claude",
      label: "Claude",
      installed: true,
      authState: "authenticated",
      capabilities: {},
    });

  it("delivers agent status to a second window's own loopback session with no preload event plane", async () => {
    const server = await startFixtureServer();
    await bootUnified(server);
    const mainSeen: SupervisorEvent[] = [];
    const unsubscribeMain = readBridge().onSupervisorEvent((event) => {
      mainSeen.push(event);
    });

    // The quick composer is a second renderer process running the SAME
    // managed bootstrap (installElectronClientRuntime +
    // startDesktopLoopbackEventIntake): its own loopback session and event
    // surface, built here from the same pieces the wiring uses. Its mock
    // preload still exposes onSupervisorEvent, but nothing in main fires it
    // since V6 B.6 deleted the relay — the loopback intake is the only live
    // path.
    const composerTransport = new PreloadIpcTransport({
      onBackendSupervisorReset: () => () => {},
      onSupervisorEvent: () => () => {},
      invokeProcedure: async () => null,
    } as unknown as ElectronHostBridge);
    const composerSeen: SupervisorEvent[] = [];
    composerTransport.subscribeEvents((event) => composerSeen.push(event));
    // Per-window bootstrap: main mints this window's own single-use
    // credential, exactly what getManagedLoopbackBootstrap does per ask.
    const composerPairing = parsePairingCredential(server.issuePairingUrl("quick-composer"));
    expect(composerPairing).toBeTruthy();
    const composerIntake = new DesktopLoopbackIntake({
      endpoint: bootstrapAnswer!.endpoint,
      pairingToken: composerPairing!,
      socketFactory: wsSocketFactory,
      dispatch: (event, seq, space) =>
        composerTransport.dispatchSequencedEvent(event, seq, space ?? "loopback"),
      requestRebuild: () => composerTransport.rebuildSubscribedState(),
      onActiveChanged: (active) => composerTransport.setLoopbackActive(active),
    });
    await expect(composerIntake.activate()).resolves.toBe(true);
    expect(composerIntake.isActive()).toBe(true);

    // The deleted preload relay is inert: firing it delivers nothing to
    // either window's live surface.
    emitRelay({ type: "windows-agent-statuses", statuses: [agentStatus()] });
    expect(composerSeen).toEqual([]);
    expect(mainSeen).toEqual([]);

    // Host-published live agent status reaches BOTH windows through their own
    // loopback intakes.
    server.publishSupervisorEvent({ type: "windows-agent-statuses", statuses: [agentStatus()] });
    await vi.waitFor(() =>
      expect(composerSeen.some((event) => event.type === "windows-agent-statuses")).toBe(true),
    );
    await vi.waitFor(() =>
      expect(mainSeen.some((event) => event.type === "windows-agent-statuses")).toBe(true),
    );

    composerIntake.dispose();
    unsubscribeMain();
  }, 30_000);
});
