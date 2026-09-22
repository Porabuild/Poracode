import { WebSocket as NodeWebSocket } from "ws";
import "fake-indexeddb/auto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ElectronHostBridge } from "@/shared/clientRuntime";
import { PORACODE_CLIENT_RUNTIME_VERSION } from "@/shared/clientRuntime";
import type { SupervisorEvent } from "@/shared/ipc";
import { IPC_PROCEDURE_MAP_VERSION } from "@/shared/ipc";
import { agentStatusSchema, type ScheduledTask, type TerminalSnapshot } from "@/shared/contracts";
import type { SshConnectPayload, SshConnectResult } from "@/shared/ssh";
import type { RemoteAccessServerOptions } from "@/host/remote/RemoteAccessServer";
import { RemoteAccessServer } from "@/host/remote/RemoteAccessServer";
import { RemoteAuthStore } from "@/host/remote/auth";
import { composeHostEnvironments } from "@/host/environments/composeHostEnvironments";
import type { EnvironmentTrustAuthority } from "@/host/environments/environmentTrustAuthority";
import { environmentRemoteAccessOptions } from "@/host/remote/environments/environmentRemoteAccessOptions";
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
  getManagedParentAuthorityState,
  isManagedLoopbackRequestRoutingActive,
  subscribeManagedParentAuthority,
} from "./state/remoteServers/managedLoopbackOwner";
import { __resetRendererEventInterestsForTest } from "./state/rendererEventInterests";
import {
  readManagedLoopbackActivation,
  retryManagedParentDescriptor,
  subscribeManagedLoopbackActivation,
} from "./hostTransport/loopbackHttpWsTransport";
import {
  __resetRuntimeHistoryNoticeCapabilityForTest,
  hostSupportsRuntimeHistoryNoticesForConnection,
} from "./state/remote/historyNoticeCapability";
import {
  readRegisteredRemoteProcedureHost,
  registerRemoteProcedureHost,
  remoteTerminalOwner,
  type RemoteProcedureHost,
} from "./remoteProcedureRouter";
import {
  __resetRemoteServersStoreForTest,
  useRemoteServersStore,
} from "./state/remoteServersStore";
import { useEnvironmentManagementStore } from "./state/remoteServers/environmentManagement";
import {
  connectionRefreshSubject,
  hydrateRefreshTokens,
  managedEnvironmentRefreshSubject,
  refreshTokenForSubject,
  __forgetRefreshTokenForTest,
  __resetRefreshTokensForTest,
} from "./state/remoteServers/refreshTokens";
import { setDesktopToken } from "./state/remoteServers/tokenVault";
import { remoteConnectionKey } from "./state/remoteServers/types";
import {
  DesktopLoopbackIntake,
  parsePairingCredential,
} from "./state/remoteServers/desktopLoopbackIntake";
import { PreloadIpcTransport, requestActiveHost } from "./hostTransport";
import { readBridge } from "./bridge";
import type { RemoteDesktopClient } from "@/shared/remote/client";

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

vi.mock("./state/remoteServers/remoteHttpBridgeClient", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("./state/remoteServers/remoteHttpBridgeClient")>();
  return {
    ...actual,
    // The fixture's environment proxy is plain loopback HTTP: the off-main
    // Electron bridge facade is not installed in jsdom, so render the same
    // bytes through the global fetch the fixture itself serves.
    remoteHttpBridgeFetch: (url: string, init?: unknown) =>
      globalThis.fetch(url, init as RequestInit),
  };
});

type AnyFn = (...args: unknown[]) => unknown;

vi.mock("@/host/db", () => ({
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
const environmentCompositions: Array<Awaited<ReturnType<typeof composeHostEnvironments>>> = [];
const fixtureDataRoots: string[] = [];
const supervisorListeners = new Set<(event: SupervisorEvent, rendererSequence?: number) => void>();

/** Answer for the IPC-fallback readProjectFile (distinct from the HTTP one). */
let ipcReadProjectFileResult: { path: string; content: string } | null = null;
/** Holds the in-flight HTTP readProjectFile until released (sever-mid-request). */
let holdReadProjectFile: ((release: () => void) => void) | null = null;
/** Extra supervisor behavior installed per-test (large replies). */
let callSupervisorOverride:
  | ((procedure: string, payload: Record<string, unknown>) => Promise<unknown>)
  | null = null;
/** Every procedure the fixture server forwarded to its supervisor this test. */
const supervisorCalls: Array<{ procedure: string; payload: Record<string, unknown> }> = [];
/** Every procedure main's preload IPC answered this test (data-plane spy). */
const preloadCalls: string[] = [];

async function fixtureCallSupervisor(
  procedure: string,
  payload: Record<string, unknown>,
): Promise<unknown> {
  supervisorCalls.push({ procedure, payload });
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

async function startFixtureServer(
  options: {
    readonly desktopId?: string;
    readonly port?: number;
    readonly hostMode?: "desktop" | "helper";
  } = {},
): Promise<RemoteAccessServer> {
  const server = new RemoteAccessServer({
    truncateThreadRuntime: () => {},
    appVersion: "1.0.0",
    identity: {
      desktopId: options.desktopId ?? "desktop-loopback-fixture",
      label: "Fixture",
    },
    host: "127.0.0.1",
    port: options.port ?? 0,
    tls: null,
    ownsSupervisorPersistence: false,
    ...(options.hostMode === undefined ? {} : { hostMode: options.hostMode }),
    onEventInterestsChanged: vi.fn<() => void>(),
    callSupervisor: fixtureCallSupervisor as unknown as RemoteAccessServerOptions["callSupervisor"],
    schedules: fixtureSchedules(),
  });
  servers.push(server);
  await server.start();
  return server;
}

function fixtureSchedules(): NonNullable<RemoteAccessServerOptions["schedules"]> {
  return {
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
  };
}

/** B1 opt-in: the durable gap/notice port whose presence alone makes the
 * descriptor advertise `capabilities.runtimeHistoryNotices`. No fixture route
 * exercises the reads; the acknowledgement path is never reached. */
function fixtureRuntimeHistoryGap(): NonNullable<RemoteAccessServerOptions["runtimeHistoryGap"]> {
  return {
    read: () => null,
    readNotice: () => null,
    lookupNotice: () => ({ kind: "clean" }),
    acknowledge: async () => {
      throw new Error("not used by the unification fixture");
    },
  };
}

/** Declared child trust for the environment fixture: never touches real SSH. */
function fixtureTrustAuthority(): EnvironmentTrustAuthority {
  const observation = {
    keyType: "ssh-ed25519",
    keyBlob: "ZmFrZQ==",
    fingerprint: `SHA256:${"A".repeat(43)}`,
    hostField: "127.0.0.1",
  };
  const resolved = { host: "127.0.0.1", port: 22, lookupName: "fixture-child" };
  return {
    resolveTarget: async () => {
      return resolved;
    },
    probe: async () => {
      return { target: resolved, observations: [observation], preferred: observation };
    },
    readSystemTrust: async () => {
      return { lookupName: "fixture-child", observations: [observation] };
    },
    knownHostsLine: () => "127.0.0.1 ssh-ed25519 ZmFrZQ==",
    writeKnownHostsFile: async () => undefined,
  };
}

interface EnvironmentFixture {
  readonly server: RemoteAccessServer;
  readonly child: RemoteAccessServer;
  readonly environments: Awaited<ReturnType<typeof composeHostEnvironments>>;
  readonly dataRoot: string;
  readonly desktopId: string;
}

/**
 * The managed desktop journey fixture: a REAL loopback `RemoteAccessServer`
 * composed with the REAL environment runtime service (durable `EnvironmentStore`
 * + management + proxy), whose declared SSH transport points at a REAL child
 * `RemoteAccessServer`. No Electron launch, no real SSH, no root/dist.
 */
async function startEnvironmentFixtureServer(
  options: {
    readonly desktopId?: string;
    readonly port?: number;
    readonly dataRoot?: string;
    readonly child?: RemoteAccessServer;
    /** Advertise `capabilities.runtimeHistoryNotices` in the descriptor (B1). */
    readonly noticesCapability?: boolean;
  } = {},
): Promise<EnvironmentFixture> {
  const dataRoot = options.dataRoot ?? (await mkdtemp(join(tmpdir(), "poracode-managed-parent-")));
  if (options.dataRoot === undefined) fixtureDataRoots.push(dataRoot);
  // The child owner always advertises helper mode: the parent's descriptor
  // probe accepts only a helper-hosted child.
  const child = options.child ?? (await startFixtureServer({ hostMode: "helper" }));
  const childInfo = child.getInfo();
  if (!childInfo) throw new Error("child fixture not started");
  const childPort = Number(new URL(childInfo.localHttpBaseUrl).port);
  const environments = await composeHostEnvironments({
    lease: { paths: { dataRoot }, generation: "fixture", assertActive() {} },
    baseDir: dataRoot,
    inputs: { mainBundleDir: dataRoot, agentPluginsDir: dataRoot, wslHelpersDir: dataRoot },
    runtimeProvider: async () => ({ hash: "a".repeat(64) }),
    credentials: { resolve: async () => ({ kind: "system" }) },
    trust: fixtureTrustAuthority(),
    createSshManager: () => ({
      connect: async (payload: SshConnectPayload): Promise<SshConnectResult> => {
        const pairingCredential = payload.issuePairingCredential
          ? (parsePairingCredential(child.issuePairingUrl("managed-fixture")) ?? undefined)
          : undefined;
        return {
          // The runtime verifies that the transport result describes the
          // exact connection it requested.
          connectionId: payload.connection.id,
          endpoint: childInfo.httpBaseUrl,
          remotePort: childPort,
          ...(pairingCredential !== undefined ? { pairingCredential } : {}),
        };
      },
      disconnect: async () => undefined,
      dispose: async () => undefined,
    }),
  });
  environmentCompositions.push(environments);
  const auth = new RemoteAuthStore();
  let server!: RemoteAccessServer;
  const configured = environmentRemoteAccessOptions(environments.runtimeService, auth, () => {
    const info = server.getInfo();
    if (!info) throw new Error("fixture server not started");
    return info;
  });
  const desktopId = options.desktopId ?? "managed-parent-fixture";
  server = new RemoteAccessServer({
    truncateThreadRuntime: () => {},
    appVersion: "1.0.0",
    identity: { desktopId, label: "Fixture" },
    host: "127.0.0.1",
    port: options.port ?? 0,
    tls: null,
    ownsSupervisorPersistence: false,
    authStore: auth,
    onEventInterestsChanged: vi.fn<() => void>(),
    callSupervisor: fixtureCallSupervisor as unknown as RemoteAccessServerOptions["callSupervisor"],
    schedules: fixtureSchedules(),
    ...(options.noticesCapability === true
      ? { runtimeHistoryGap: fixtureRuntimeHistoryGap() }
      : {}),
    ...configured,
  });
  servers.push(server);
  await server.start();
  return { server, child, environments, dataRoot, desktopId };
}

let socketLog: string[] =
  []; /** Every live client socket, so a test can sever the leg without killing the
 * server (transport-class recovery vs credential/bootstrap recovery). */
const liveSockets: NodeWebSocket[] = [];

/** Schedules gateway spy: proves desktop-scoped calls reach the SERVER. */
const fixtureSchedulesList = vi.fn<() => ScheduledTask[]>(() => []);

function wsSocketFactory(url: string) {
  const socket = new NodeWebSocket(url);
  liveSockets.push(socket);
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
    onBackendSupervisorReset: () => () => {},
    ipcProcedureMapVersion: IPC_PROCEDURE_MAP_VERSION,
    invokeProcedure: (async (name: string, args: unknown[]) => {
      preloadCalls.push(name);
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
  liveSockets.splice(0);
  ipcReadProjectFileResult = null;
  holdReadProjectFile = null;
  callSupervisorOverride = null;
  bootstrapAnswer = null;
  supervisorCalls.splice(0);
  preloadCalls.splice(0);
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(async () => {
  resetDesktopLoopbackIntakeForTest();
  __resetManagedLoopbackOwnerForTest();
  __setDesktopLoopbackIntakeTestSeamsForTest({
    descriptorRetryMs: 5_000,
    preflightTimeoutMs: 1_000,
  });
  resetClientRuntimeForTest();
  Reflect.deleteProperty(window, "poracode");
  Reflect.deleteProperty(window, "poracodeHost");
  await Promise.all(servers.splice(0).map((server) => server.dispose()));
  await Promise.all(environmentCompositions.splice(0).map((env) => env.dispose()));
  await Promise.all(
    fixtureDataRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
  __resetRemoteServersStoreForTest();
  useEnvironmentManagementStore.getState().__resetForTest();
  __resetRefreshTokensForTest();
  __resetRendererEventInterestsForTest();
  localStorage.clear();
  supervisorListeners.clear();
  vi.restoreAllMocks();
});

/** The (mock) main bootstrap answer, re-pointable for server restarts. */
let bootstrapAnswer: { endpoint: string; pairingUrl: string } | null = null;

async function bootUnified(
  initialServer: RemoteAccessServer,
  seams: { readonly descriptorRetryMs?: number; readonly preflightTimeoutMs?: number } = {},
): Promise<void> {
  bootstrapAnswer = bootstrapPayloadFor(initialServer);
  const host = electronHost(() => bootstrapAnswer);
  window.poracodeHost = host;
  installElectronClientRuntime(host);
  __setDesktopLoopbackIntakeTestSeamsForTest({
    socketFactory: wsSocketFactory,
    retryDelayMs: 50,
    discoveryRetryMs: 80,
    preflightTimeoutMs: 1_000,
    ...seams,
  });
  void startDesktopLoopbackEventIntake();
  // Generous timeout: under a loaded full-suite run the intake's WS connect
  // can exceed vi.waitFor's 1s default.
  await vi.waitFor(() => expect(isDesktopLoopbackIntakeActive()).toBe(true), { timeout: 10_000 });
}

async function waitForManagedAuthority(): Promise<{
  readonly hostDesktopId: string;
  readonly sshEnvironments: boolean;
  readonly generation: number;
}> {
  await vi.waitFor(() => expect(getManagedParentAuthorityState().status).toBe("ready"), {
    timeout: 10_000,
  });
  const state = getManagedParentAuthorityState();
  if (state.status !== "ready") throw new Error("authority not ready");
  return {
    hostDesktopId: state.authority.ref.hostDesktopId,
    sshEnvironments: state.authority.sshEnvironments,
    generation: state.authority.generation,
  };
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

    // A1: terminal watches stay distinct — no loopback upgrade ever declared a
    // terminal id as a runtime item interest.
    const openedUrls = socketLog
      .filter((entry) => entry.startsWith("open:"))
      .map((entry) => new URL(entry.slice("open:".length)));
    expect(openedUrls.length).toBeGreaterThanOrEqual(2);
    for (const url of openedUrls) {
      expect(url.searchParams.get("threadItemInterests") ?? "").not.toContain("term-2");
    }

    unsubscribeProbe();
    unsubscribe();
  });
});

describe("managed loopback health and recovery (A4)", () => {
  it("reconnects a severed leg locally without re-resolving the bootstrap", async () => {
    const server = await startFixtureServer();
    let bootstrapAsks = 0;
    bootstrapAnswer = bootstrapPayloadFor(server);
    const host = electronHost(() => {
      bootstrapAsks += 1;
      return bootstrapAnswer;
    });
    window.poracodeHost = host;
    installElectronClientRuntime(host);
    __setDesktopLoopbackIntakeTestSeamsForTest({
      socketFactory: wsSocketFactory,
      retryDelayMs: 50,
      discoveryRetryMs: 80,
    });
    void startDesktopLoopbackEventIntake();
    await vi.waitFor(() => expect(isDesktopLoopbackIntakeActive()).toBe(true), { timeout: 10_000 });
    expect(bootstrapAsks).toBe(1);

    // Sever only the socket (server still healthy): the intake must retry the
    // retained bearer locally instead of asking main for a new bootstrap.
    const socketCount = liveSockets.length;
    const startedAt = Date.now();
    liveSockets.at(-1)!.close();
    await vi.waitFor(() => expect(liveSockets.length).toBeGreaterThan(socketCount), {
      timeout: 5_000,
    });
    await vi.waitFor(() => expect(isDesktopLoopbackIntakeActive()).toBe(true), { timeout: 5_000 });
    expect(bootstrapAsks).toBe(1);
    // The first retry is bounded local backoff, never the old unconditional
    // 30 s discovery pause.
    expect(Date.now() - startedAt).toBeLessThan(5_000);
  });

  it("re-resolves the bootstrap when the pairing credential was already spent", async () => {
    const server = await startFixtureServer();
    const info = server.getInfo()!;
    const spentUrl = server.issuePairingUrl("spent");
    const spentToken = parsePairingCredential(spentUrl);
    expect(spentToken).toBeTruthy();
    // Spend the credential before the renderer ever exchanges it.
    const spend = await fetch(new URL("/oauth/token", info.httpBaseUrl), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        grantType: "pairing-token",
        credential: spentToken,
        scopes: ["session:read"],
        client: { label: "test", deviceType: "desktop" },
      }),
    });
    expect(spend.status).toBe(200);

    let bootstrapAsks = 0;
    const host = electronHost(() => {
      bootstrapAsks += 1;
      if (bootstrapAsks === 1) {
        return { endpoint: info.localHttpBaseUrl, pairingUrl: spentUrl };
      }
      // Main mints a fresh single-use credential per ask (always-on guarantee).
      return {
        endpoint: info.localHttpBaseUrl,
        pairingUrl: server.issuePairingUrl("recovered"),
      };
    });
    window.poracodeHost = host;
    installElectronClientRuntime(host);
    __setDesktopLoopbackIntakeTestSeamsForTest({
      socketFactory: wsSocketFactory,
      retryDelayMs: 50,
      discoveryRetryMs: 80,
    });
    void startDesktopLoopbackEventIntake();
    await vi.waitFor(() => expect(isDesktopLoopbackIntakeActive()).toBe(true), { timeout: 10_000 });
    // The spent credential escalated to a fresh bootstrap instead of retrying
    // the same exchange forever.
    expect(bootstrapAsks).toBeGreaterThanOrEqual(2);
    expect(getManagedLoopbackOwnerRow()?.endpoint).toBe(info.localHttpBaseUrl);
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

    const release: { current: (() => void) | null } = { current: null };
    holdReadProjectFile = (releaseFn) => {
      release.current = releaseFn;
    };
    ipcReadProjectFileResult = { path: "/fixture/one", content: "IPC" };

    const pending = readBridge().readProjectFile({
      projectLocation: { kind: "posix", path: "/fixture" },
      path: "/fixture/one",
    }) as Promise<{ content: string }>;
    // Observe rejection immediately: shutdown may settle the request before
    // the socket-state wait below completes. Also prove the fixture actually
    // received it, rather than merely racing a fetch against a closed port.
    const outcome = pending.then(
      (value) => ({ kind: "resolved" as const, value }),
      (error: unknown) => ({ kind: "rejected" as const, error }),
    );
    await vi.waitFor(() => expect(release.current).not.toBeNull());

    // Sever the leg while the request is in flight: the HTTP connection dies
    // and V6 B.6 does not retry over preload IPC.
    const disposal = server.dispose();
    try {
      expect(await outcome).toMatchObject({ kind: "rejected" });
      await vi.waitFor(() => expect(isDesktopLoopbackIntakeActive()).toBe(false));
    } finally {
      // The server retains handler custody after closing the connection. Join
      // that work only once the fixture has allowed its supervisor call to end.
      release.current?.();
      await disposal;
    }
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

describe("app-owned managed terminal routing (A0 correction)", () => {
  it("routes the deferred shell's start and every later write/resize/close over loopback HTTP, never preload IPC", async () => {
    const server = await startFixtureServer();
    await bootUnified(server);
    const activation = readManagedLoopbackActivation();
    expect(activation).not.toBeNull();

    const bridge = readBridge();
    const shellId = "shell:managed-routing-1";
    await bridge.startShell({
      shellId,
      projectLocation: { kind: "posix", path: "/fixture" },
    });

    const startCall = supervisorCalls.find((call) => call.procedure === "startShell");
    expect(startCall?.payload).toMatchObject({ shellId });
    expect(preloadCalls).not.toContain("startShell");

    // A surface that mounts AFTER the shell started (panel remount) must bind
    // to the managed feed, not to a feed keyed by the internal routing
    // identity: only the managed feed carries this window's terminal-watch
    // frames.
    snapshotsByThread.set(shellId, {
      generation: "gen-managed-routing",
      fromCursor: 0,
      toCursor: 6,
      data: "ROUTED",
      processState: "running",
      terminalSize: { cols: 100, rows: 31 },
    });
    const feedSnapshots: string[] = [];
    const unsubscribeFeed = watchManagedTerminal(shellId, {
      onOutput: () => {},
      onReset: () => {},
      onExited: () => {},
      onSnapshot: (snapshot) => feedSnapshots.push(snapshot.data),
    } satisfies ManagedTerminalListener);
    await vi.waitFor(() => expect(feedSnapshots).toContain("ROUTED"));
    unsubscribeFeed();

    await bridge.writeTerminal({ threadId: shellId, data: "echo a0\r" });
    await bridge.resizeTerminal({ threadId: shellId, cols: 100, rows: 31 });

    const writeCall = supervisorCalls.find((call) => call.procedure === "writeTerminal");
    expect(writeCall?.payload).toMatchObject({ threadId: shellId, data: "echo a0\r" });
    const resizeCall = supervisorCalls.find((call) => call.procedure === "resizeTerminal");
    expect(resizeCall?.payload).toMatchObject({ threadId: shellId, cols: 100, rows: 31 });
    expect(preloadCalls).not.toContain("writeTerminal");
    expect(preloadCalls).not.toContain("resizeTerminal");

    // The internal loopback routing identity is not a feed key: the managed
    // terminal keeps riding the managed feed (owned by this renderer).
    expect(remoteTerminalOwner(shellId)).toBeUndefined();
    // One activation, one client: the accessor's client is the same instance
    // that served start/write/resize (token rotation updates it in place).
    expect(readManagedLoopbackActivation()?.client).toBe(activation?.client);
    expect(readManagedLoopbackActivation()?.endpoint).toBe(activation?.endpoint);

    await bridge.closeThread({ threadId: shellId });
    expect(supervisorCalls.some((call) => call.procedure === "closeThread")).toBe(true);
    expect(preloadCalls).not.toContain("closeThread");
    expect(remoteTerminalOwner(shellId)).toBeUndefined();
  }, 30_000);

  it("never captures a persisted owner whose desktop id reads like the internal routing identity", async () => {
    // The desktop bridge intercepts a persisted owner before the transport, so
    // the ambiguity only shows on the installed runtime's procedure bridge
    // (`runtime.procedures.*`), which reaches the active transport directly.
    // A persisted owner must keep routing through the persisted plane there.
    const previousHost = readRegisteredRemoteProcedureHost();
    const persistedStartShell = vi.fn<RemoteDesktopClient["startShell"]>(async () => {});
    const persistedWriteTerminal = vi.fn<RemoteDesktopClient["writeTerminal"]>(async () => {});
    const persistedCloseShell = vi.fn<RemoteDesktopClient["closeShell"]>(async () => {});
    const persistedClient = {
      startShell: persistedStartShell,
      writeTerminal: persistedWriteTerminal,
      closeShell: persistedCloseShell,
    } as unknown as RemoteDesktopClient;
    const collisionDesktopId = "managed-loopback";
    const collisionHost: RemoteProcedureHost = {
      resolveThreadOwner: () => undefined,
      resolveProjectOwner: () => undefined,
      resolveDesktopOwner: () => ({ desktopId: collisionDesktopId }),
      withClient: async (desktopId, invoke) => {
        expect(desktopId).toBe(collisionDesktopId);
        return invoke(persistedClient);
      },
    };
    registerRemoteProcedureHost(collisionHost);
    try {
      const server = await startFixtureServer();
      await bootUnified(server);

      const shellId = "shell:collision-transport";
      await requestActiveHost("startShell", [
        {
          shellId,
          projectLocation: {
            kind: "posix",
            path: "/remote",
            remoteServerId: collisionDesktopId,
          },
        },
      ]);
      expect(persistedStartShell).toHaveBeenCalledWith({
        shellId,
        projectLocation: { kind: "posix", path: "/remote" },
      });
      expect(supervisorCalls.some((call) => call.procedure === "startShell")).toBe(false);

      await requestActiveHost("writeTerminal", [{ threadId: shellId, data: "x" }]);
      expect(persistedWriteTerminal).toHaveBeenCalledWith({ threadId: shellId, data: "x" });
      expect(supervisorCalls.some((call) => call.procedure === "writeTerminal")).toBe(false);
    } finally {
      registerRemoteProcedureHost(previousHost);
    }
  }, 30_000);

  it("publishes the activation client once per activation and reports teardown as null", async () => {
    const server = await startFixtureServer();
    await bootUnified(server);
    const first = readManagedLoopbackActivation();
    expect(first).not.toBeNull();
    const seen: Array<{ seq: number; endpoint: string } | null> = [];
    const unsubscribe = subscribeManagedLoopbackActivation((next) => {
      seen.push(next ? { seq: next.seq, endpoint: next.endpoint } : null);
    });

    // Same activation: the accessor keeps the exact client identity.
    expect(readManagedLoopbackActivation()?.client).toBe(first?.client);

    resetDesktopLoopbackIntakeForTest();
    expect(readManagedLoopbackActivation()).toBeNull();
    expect(seen.at(-1)).toBeNull();
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

describe("managed parent authority publication (C1 managed parent)", () => {
  function urlOf(input: RequestInfo | URL): string {
    if (typeof input === "string") return input;
    return input instanceof URL ? input.toString() : input.url;
  }

  it("keeps local routing and reports a truthful retry after a descriptor failure", async () => {
    const server = await startEnvironmentFixtureServer();
    const realFetch = globalThis.fetch.bind(globalThis);
    // One preflight descriptor read before the socket plus the activation
    // resolution's three bounded attempts: four failures reach `failed`.
    let remainingFailures = 4;
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      if (urlOf(input).includes("/.well-known/poracode/environment") && remainingFailures > 0) {
        remainingFailures -= 1;
        return new Response(JSON.stringify({ error: "unavailable" }), {
          status: 500,
          headers: { "content-type": "application/json" },
        });
      }
      return realFetch(input as RequestInfo, init as RequestInit);
    });
    await bootUnified(server.server, { descriptorRetryMs: 10 });

    await vi.waitFor(() => expect(getManagedParentAuthorityState().status).toBe("failed"), {
      timeout: 10_000,
    });
    // Local routing and the owner row survive the descriptor failure.
    expect(isManagedLoopbackRequestRoutingActive()).toBe(true);
    expect(getManagedLoopbackOwnerRow()).not.toBeNull();

    fetchSpy.mockRestore();
    retryManagedParentDescriptor();
    const authority = await waitForManagedAuthority();
    expect(authority.sshEnvironments).toBe(true);
    expect(isManagedLoopbackRequestRoutingActive()).toBe(true);
  }, 30_000);

  it("single-flights concurrent manual retries so a successful run is never clobbered", async () => {
    const server = await startEnvironmentFixtureServer();
    const realFetch = globalThis.fetch.bind(globalThis);
    let descriptorCalls = 0;
    let releaseHeld: (() => void) | null = null;
    const heldGate = new Promise<void>((resolve) => {
      releaseHeld = resolve;
    });
    const failing = (): Response =>
      new Response(JSON.stringify({ error: "unavailable" }), {
        status: 500,
        headers: { "content-type": "application/json" },
      });
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      if (urlOf(input).includes("/.well-known/poracode/environment")) {
        descriptorCalls += 1;
        // Boot: one preflight descriptor read plus the resolution's three
        // bounded attempts, all failing -> truthful failed state.
        if (descriptorCalls <= 4) return failing();
        // The retry run's first attempt is held until both clicks have landed.
        if (descriptorCalls === 5) {
          await heldGate;
          return realFetch(input as RequestInfo, init as RequestInit);
        }
        // A competing second run would issue call #6 here.
        return failing();
      }
      return realFetch(input as RequestInfo, init as RequestInit);
    });

    const transitions: string[] = [];
    subscribeManagedParentAuthority(() =>
      transitions.push(getManagedParentAuthorityState().status),
    );
    await bootUnified(server.server, { descriptorRetryMs: 10 });
    await vi.waitFor(() => expect(getManagedParentAuthorityState().status).toBe("failed"), {
      timeout: 10_000,
    });

    // A double-click: the second retry joins the single in-flight run, and the
    // failure surface reports the retry instead of opening a competing loop.
    retryManagedParentDescriptor();
    retryManagedParentDescriptor();
    await vi.waitFor(() => expect(descriptorCalls).toBe(5), { timeout: 5_000 });
    expect(getManagedParentAuthorityState()).toMatchObject({ status: "failed", retrying: true });
    // Give a competing loop time to reach the wire; single-flight means none.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(descriptorCalls).toBe(5);

    releaseHeld!();
    const authority = await waitForManagedAuthority();
    expect(authority.sshEnvironments).toBe(true);
    // The successful run stays published: no stale terminal failure follows.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(getManagedParentAuthorityState().status).toBe("ready");
    expect(transitions.lastIndexOf("ready")).toBeGreaterThan(transitions.lastIndexOf("failed"));
    expect(isManagedLoopbackRequestRoutingActive()).toBe(true);
  }, 30_000);

  it("discards a stale descriptor from a retired activation on the same port", async () => {
    const first = await startFixtureServer({ desktopId: "managed-host-a" });
    const port = Number(new URL(first.getInfo()!.localHttpBaseUrl).port);

    const realFetch = globalThis.fetch.bind(globalThis);
    let descriptorCalls = 0;
    let releaseStale: (() => void) | null = null;
    const staleGate = new Promise<void>((resolve) => {
      releaseStale = resolve;
    });
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const response = await realFetch(input as RequestInfo, init as RequestInit);
      if (urlOf(input).includes("/.well-known/poracode/environment")) {
        descriptorCalls += 1;
        // Hold the ACTIVATION's descriptor response (call 1 is the preflight
        // that shapes the upgrade) until after the replacement server
        // published its own authority on the same port.
        if (descriptorCalls === 2) await staleGate;
      }
      return response;
    });

    await bootUnified(first);
    expect(isManagedLoopbackRequestRoutingActive()).toBe(true);
    expect(getManagedParentAuthorityState().status).toBe("idle");

    // Retire activation A and its server, then run replacement B on the SAME
    // port with a different host identity. The live intake rediscovers through
    // the re-pointed bootstrap after its recovery budget exhausts.
    await first.dispose();
    const replacement = await startFixtureServer({ desktopId: "managed-host-b", port });
    repointBootstrap(replacement);
    const authority = await waitForManagedAuthority();
    expect(authority.hostDesktopId).toBe("managed-host-b");

    // The delayed response from the retired activation resolves now: it must
    // not reinstall the retired endpoint/identity.
    releaseStale!();
    await new Promise((resolve) => setTimeout(resolve, 50));
    const afterRelease = await waitForManagedAuthority();
    expect(afterRelease.hostDesktopId).toBe("managed-host-b");
    expect(isManagedLoopbackRequestRoutingActive()).toBe(true);
  }, 30_000);
});

describe("managed root notice-authority teardown on leg replacement (B1)", () => {
  it("forgets the retired activation's notice capability and makes the replacement leg re-prove it", async () => {
    __resetRuntimeHistoryNoticeCapabilityForTest();
    const fixture = await startEnvironmentFixtureServer({ noticesCapability: true });
    const realFetch = globalThis.fetch.bind(globalThis);
    let descriptorCalls = 0;
    let releaseHeld: (() => void) | null = null;
    const heldGate = new Promise<void>((resolve) => {
      releaseHeld = resolve;
    });
    // Descriptor reads through the loopback HTTP leg: call 1 is the boot
    // preflight, call 2 the first activation's resolution. After the socket
    // sever and the local retry, call 3 is the re-activation preflight and
    // call 4 the replacement activation's resolution — held until the test has
    // observed the handover state.
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      if (urlOfDescriptor(input).includes("/.well-known/poracode/environment")) {
        descriptorCalls += 1;
        if (descriptorCalls === 4) await heldGate;
      }
      return realFetch(input as RequestInfo, init as RequestInit);
    });

    await bootUnified(fixture.server, { descriptorRetryMs: 10 });
    const first = readManagedLoopbackActivation();
    expect(first).not.toBeNull();
    const retiredKey = first!.authority;
    await waitForManagedAuthority();
    // The first leg's own descriptor proved the capability under ITS authority.
    expect(hostSupportsRuntimeHistoryNoticesForConnection(retiredKey)).toBe(true);

    // Replace the leg: sever the socket; the intake retries locally and the
    // retry publishes a NEW activation (fresh per-activation authority).
    const seqBefore = first!.seq;
    liveSockets.at(-1)!.close();
    await vi.waitFor(() => {
      expect(readManagedLoopbackActivation()?.seq).toBeGreaterThan(seqBefore);
    });
    const nextKey = readManagedLoopbackActivation()!.authority;
    expect(nextKey).not.toBe(retiredKey);

    // While the replacement's own descriptor read is still in flight, the
    // retired capability must be FORGOTTEN (it never survives the leg it was
    // minted for) and the successor must have inherited nothing.
    await vi.waitFor(() => expect(descriptorCalls).toBe(4), { timeout: 5_000 });
    expect(hostSupportsRuntimeHistoryNoticesForConnection(retiredKey)).toBe(false);
    expect(hostSupportsRuntimeHistoryNoticesForConnection(nextKey)).toBe(false);

    // The successor re-proves the capability from its OWN descriptor.
    releaseHeld!();
    await vi.waitFor(() =>
      expect(hostSupportsRuntimeHistoryNoticesForConnection(nextKey)).toBe(true),
    );
    expect(getManagedParentAuthorityState().status).toBe("ready");
  }, 30_000);

  function urlOfDescriptor(input: RequestInfo | URL): string {
    if (typeof input === "string") return input;
    return input instanceof URL ? input.toString() : input.url;
  }
});

describe("managed desktop environments through its own server (C1 managed parent)", () => {
  it("creates, lists, and pairs an environment without any self-pairing or parent token", async () => {
    const fixture = await startEnvironmentFixtureServer();
    await bootUnified(fixture.server);
    const authority = await waitForManagedAuthority();
    expect(authority.sshEnvironments).toBe(true);
    // jsdom has no DOM WebSocket realm; the real `ws` client keeps the child
    // event stream on the same real loopback sockets as every other fixture.
    useRemoteServersStore.getState().setSocketFactory(wsSocketFactory);
    // A real desktop session always stores its own host access token first,
    // which creates the shared vault key record; warm it so the child grant
    // below persists through the same custody.
    await setDesktopToken("vault-warmup", "warm");
    const ref = { kind: "managed", hostDesktopId: authority.hostDesktopId } as const;

    const created = await useEnvironmentManagementStore
      .getState()
      .createEnvironment(ref, { label: "Build box", target: "dev@example.test" });
    const listed = await useEnvironmentManagementStore.getState().refreshEnvironments(ref);
    expect(listed.map((environment) => environment.environmentId)).toContain(created.environmentId);
    await useEnvironmentManagementStore
      .getState()
      .updateEnvironment(ref, created.environmentId, { desired: "enabled" });

    const record = await useEnvironmentManagementStore
      .getState()
      .pairEnvironmentDevice(ref, created.environmentId);
    expect(record.transport).toMatchObject({
      kind: "environment",
      managedHostDesktopId: authority.hostDesktopId,
      environmentId: created.environmentId,
    });
    expect(
      (record.transport as { readonly parentConnectionId?: string }).parentConnectionId,
    ).toBeUndefined();
    expect(record.endpoint).toBe(
      new URL(
        `/api/environments/${created.environmentId}/proxy/`,
        getManagedLoopbackOwnerRow()!.endpoint,
      ).toString(),
    );

    // The child grant persisted to the REAL vault at the managed root.
    const subject = managedEnvironmentRefreshSubject(
      authority.hostDesktopId,
      created.environmentId,
    );
    await vi.waitFor(
      async () => {
        __forgetRefreshTokenForTest(subject);
        await hydrateRefreshTokens({ subjects: [subject] });
        expect(refreshTokenForSubject(subject)).toBeTruthy();
      },
      { timeout: 5_000 },
    );

    // No persisted parent: no row for the authority host, no `refresh.<host>`
    // parent token slot, and the persisted child carries no parent connection.
    const persistedServers = useRemoteServersStore.getState().servers;
    const parentRows = persistedServers.filter(
      (entry) => entry.desktopId === authority.hostDesktopId,
    );
    expect(parentRows).toHaveLength(0);
    __forgetRefreshTokenForTest(connectionRefreshSubject(authority.hostDesktopId));
    await hydrateRefreshTokens({ subjects: [connectionRefreshSubject(authority.hostDesktopId)] });
    expect(
      refreshTokenForSubject(connectionRefreshSubject(authority.hostDesktopId)),
    ).toBeUndefined();
  }, 30_000);

  it("reconnects a durable managed child after the parent restarts on a changed port", async () => {
    const fixture = await startEnvironmentFixtureServer();
    await bootUnified(fixture.server);
    const authority = await waitForManagedAuthority();
    useRemoteServersStore.getState().setSocketFactory(wsSocketFactory);
    await setDesktopToken("vault-warmup", "warm");
    const ref = { kind: "managed", hostDesktopId: authority.hostDesktopId } as const;

    const created = await useEnvironmentManagementStore
      .getState()
      .createEnvironment(ref, { label: "Build box", target: "dev@example.test" });
    await useEnvironmentManagementStore
      .getState()
      .updateEnvironment(ref, created.environmentId, { desired: "enabled" });
    const record = await useEnvironmentManagementStore
      .getState()
      .pairEnvironmentDevice(ref, created.environmentId);
    const childKey = record.connectionId!;
    await vi.waitFor(
      () => expect(useRemoteServersStore.getState().runtime[childKey]?.status).toBe("online"),
      { timeout: 15_000 },
    );
    const grantSubject = managedEnvironmentRefreshSubject(
      authority.hostDesktopId,
      created.environmentId,
    );
    const grantBefore = refreshTokenForSubject(grantSubject);
    expect(grantBefore).toBeTruthy();

    // Restart the parent server on a CHANGED port with the same identity and
    // durable data root. The child record and its grant must survive: no
    // re-pairing, no grant reuse against a different root.
    const oldEnvironments = fixture.environments;
    await fixture.server.dispose();
    await oldEnvironments.dispose();
    const replacement = await startEnvironmentFixtureServer({
      desktopId: fixture.desktopId,
      dataRoot: fixture.dataRoot,
      child: fixture.child,
    });
    await replacement.environments.start();
    repointBootstrap(replacement.server);

    const newAuthority = await waitForManagedAuthority();
    expect(newAuthority.hostDesktopId).toBe(fixture.desktopId);
    expect(newAuthority.generation).toBeGreaterThan(authority.generation);

    await vi.waitFor(
      () => expect(useRemoteServersStore.getState().runtime[childKey]?.status).toBe("online"),
      { timeout: 20_000 },
    );
    const retained = useRemoteServersStore
      .getState()
      .servers.filter((entry) => remoteConnectionKey(entry) === childKey);
    expect(retained).toHaveLength(1);
    expect(retained[0]!.transport).toMatchObject({
      managedHostDesktopId: fixture.desktopId,
      environmentId: created.environmentId,
    });
    __forgetRefreshTokenForTest(grantSubject);
    await hydrateRefreshTokens({ subjects: [grantSubject] });
    expect(refreshTokenForSubject(grantSubject)).toBeTruthy();
  }, 60_000);
});
