import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Thread } from "@/shared/contracts";
import type { RemoteDesktopClient } from "@/shared/remote/client";
import type { RemoteClientFactory, RemoteServersState } from "./types";
import {
  CLIENT_ENGINE_PROTOCOL_VERSION,
  type ClientEngineRequest,
  type ClientEngineResponse,
} from "@/renderer/state/remote/engine/protocol";
import { decodeRemoteSocketFrame } from "@/renderer/state/remote/engine/decode";
import {
  getRemoteSocketEngine,
  resetClientEngineHostForTests,
} from "@/renderer/state/remote/engine";
import {
  readBoundedHistoryTail,
  recordBoundedHistoryTail,
  __resetBoundedHistoryRegistryForTest,
} from "./catalog/boundedHistoryRegistry";
import {
  __resetEventSocketRegistryForTest,
  deleteRemoteServerEventSocketEntry,
  remoteServerSnapshotSeq,
} from "./eventSocketRegistry";
import {
  startRemoteServerEventStream,
  type StartRemoteServerEventStreamDeps,
} from "./eventSocketSession";
import {
  configureBoundedCatalogController,
  noteBoundedCatalogLegacy,
  __resetBoundedCatalogForTest,
  type BoundedCatalogDeps,
} from "./catalog/boundedCatalogController";
import {
  __resetBoundedCatalogChangesCapabilityForTest,
  noteBoundedCatalogChangesCapability,
} from "@/renderer/state/remote/boundedCatalogChangesCapability";
import type { TerminalConnectionCapabilities } from "./terminalCapabilities";

// ── Module seams under test ──────────────────────────────────────────
// The session's collaborators are heavy renderer stores; this suite stubs the
// store mutators and keeps the transport-side logic (cursor rules, gap
// detection, recovery queueing, engine integration) real.

const remoteState = vi.hoisted(() => ({
  applyThreadSnapshot: vi.fn<() => { installedAuthoritativeHistory: boolean }>(() => ({
    installedAuthoritativeHistory: true,
  })),
  dispatchRemoteSupervisorEvent: vi.fn<(...args: unknown[]) => void>(),
  collectRuntimeEventsFromSupervisoryMessage: (
    value: unknown,
  ): Array<{
    threadId: string;
    events: unknown[];
  }> => {
    if (!value || typeof value !== "object") return [];
    const record = value as {
      type?: unknown;
      threadId?: unknown;
      event?: unknown;
      events?: unknown;
      batches?: unknown;
    };
    if (record.type === "thread-runtime-event" && typeof record.threadId === "string") {
      return [{ threadId: record.threadId, events: [record.event] }];
    }
    if (record.type === "thread-runtime-events" && typeof record.threadId === "string") {
      return [
        { threadId: record.threadId, events: Array.isArray(record.events) ? record.events : [] },
      ];
    }
    if (record.type === "thread-runtime-events-multi" && Array.isArray(record.batches)) {
      return record.batches.map((batch) => {
        const b = batch as { threadId?: unknown; events?: unknown };
        return {
          threadId: typeof b.threadId === "string" ? b.threadId : "",
          events: Array.isArray(b.events) ? b.events : [],
        };
      });
    }
    return [];
  },
}));

vi.mock("@/renderer/state/remote", () => remoteState);

vi.mock("@/renderer/state/remote/truncateRecovery", () => ({
  finishTruncateReload: vi.fn<() => void>(),
  getTruncateNeededSeq: vi.fn<() => undefined>(),
  isTruncateCheckpointLoaded: vi.fn<() => boolean>(() => false),
  isTruncateReloadLeaseCurrent: vi.fn<() => boolean>(() => false),
  listPendingTruncateReloads: vi.fn<() => never[]>(() => []),
  noteTruncateNeeded: vi.fn<() => void>(),
  recordAuthoritativeHistoryInstall: vi.fn<() => void>(),
  resetTruncateRecoveryEpoch: vi.fn<() => void>(),
  resetTruncateReloadBackoff: vi.fn<() => void>(),
  shouldSuppressTruncatedReplay: vi.fn<() => boolean>(() => false),
  tryBeginTruncateReload: vi.fn<() => null>(() => null),
}));

vi.mock("@/renderer/state/appStore", () => ({
  useAppStore: {
    getState: () => ({ provisioningWorktreeThreadIds: {}, threads: [] }),
  },
}));

vi.mock("@/renderer/state/threadFollowUpQueueStore", () => ({
  captureThreadFollowUpQueueSnapshot: vi.fn<() => Record<string, never>>(() => ({})),
}));

vi.mock("@/renderer/state/remoteProjection", () => ({
  projectRemoteThreadEvent: (_desktopId: string, event: unknown) => event,
  projectRemoteThreadSnapshot: (_desktopId: string, snapshot: unknown) => snapshot,
  remoteThreadId: (desktopId: string, threadId: string) => `${desktopId}:${threadId}`,
}));

vi.mock("@/renderer/state/remoteTerminalFeed", () => ({
  emitRemoteTerminalExited: vi.fn<() => void>(),
  emitRemoteTerminalReset: vi.fn<() => void>(),
  handleRemoteTerminalServerMessage: vi.fn<() => boolean>(() => false),
  setRemoteTerminalSocketSender: vi.fn<() => void>(),
}));

vi.mock("@/renderer/utils/shellStartRegistry", () => ({
  noteShellExited: vi.fn<() => void>(),
}));

vi.mock("@/renderer/remoteProcedureRouter", () => ({
  releaseRemoteTerminal: vi.fn<() => void>(),
  remoteTerminalOwner: vi.fn<() => null>(() => null),
}));

vi.mock("@/renderer/browser/browserMirror", () => ({
  handleBrowserServerMessage: vi.fn<() => boolean>(() => false),
}));

vi.mock("./browserBridge", () => ({
  getDesktopBrowserMirrorSocket: vi.fn<() => null>(() => null),
  syncDesktopBrowserBridgeClient: vi.fn<() => void>(),
}));

vi.mock("./connectionRefresh", () => ({
  markRemoteServerRowResyncPending: vi.fn<() => void>(),
}));

vi.mock("./gitState", () => ({ syncRemoteGitStatePatch: vi.fn<() => void>() }));
vi.mock("./gitSummaries", () => ({ syncRemoteGitSummaries: vi.fn<() => void>() }));

// Real reconnect backoff starts at 1 s; collapse it so reconnect-driven tests
// stay fast without fake-timer gymnastics around the async connect chain.
vi.mock("@/shared/remote/socketPolicy", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/shared/remote/socketPolicy")>();
  return {
    ...actual,
    REMOTE_SOCKET_POLICY: {
      ...actual.REMOTE_SOCKET_POLICY,
      reconnectBaseMs: 1,
      reconnectMaxMs: 4,
    },
    RemoteSocketReconnectPolicy: class {
      nextDelay(): number {
        return 1;
      }

      reset(): void {}
    },
  };
});

// ── Fakes ────────────────────────────────────────────────────────────

class FakeEngineWorker {
  static instances: FakeEngineWorker[] = [];
  onmessage: ((event: MessageEvent<ClientEngineResponse>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  onmessageerror: ((event: MessageEvent) => void) | null = null;
  readonly posted: ClientEngineRequest[] = [];
  autoRespond = true;

  constructor(_url: URL | string, _options?: WorkerOptions) {
    FakeEngineWorker.instances.push(this);
  }

  postMessage(data: ClientEngineRequest): void {
    this.posted.push(data);
    if (!this.autoRespond) return;
    if (data.type !== "parse-json" && data.type !== "decode-remote") {
      return;
    }
    const base = {
      v: CLIENT_ENGINE_PROTOCOL_VERSION,
      generation: data.generation,
      id: data.id,
    };
    if (data.type === "parse-json") {
      try {
        this.respond({
          ...base,
          type: "parse-json",
          ok: true,
          value: JSON.parse(data.raw) as unknown,
        });
      } catch {
        this.respond({ ...base, type: "parse-json", ok: false, error: "invalid" });
      }
      return;
    }
    const result = decodeRemoteSocketFrame(data.raw);
    this.respond(
      result.ok
        ? { ...base, type: data.type, ok: true, message: result.message }
        : { ...base, type: data.type, ok: false, error: "invalid" },
    );
  }

  respond(data: ClientEngineResponse): void {
    this.onmessage?.({ data } as MessageEvent<ClientEngineResponse>);
  }

  terminate(): void {}
}

class FakeSocket {
  static instances: FakeSocket[] = [];
  readonly url: string;
  readyState = 1;
  closed = false;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onclose: ((event?: { readonly code?: number; readonly reason?: string }) => void) | null = null;

  constructor(url: string) {
    this.url = url;
    FakeSocket.instances.push(this);
  }

  close(): void {
    this.closed = true;
  }

  send(data: string): void {
    this.sent.push(data);
  }

  deliver(raw: string): void {
    this.onmessage?.({ data: raw });
  }
}

function runtimeEventFrame(seq: number, threadId = "t1"): string {
  return JSON.stringify({
    type: "event",
    seq,
    event: { type: "thread-runtime-event", threadId, event: { type: "item.delta", seq } },
  });
}

/** Answers every posted decode request with the real decode result, so a test
 * can hold the worker's responses and release them deterministically. */
function respondToDecodeRequests(worker: FakeEngineWorker): void {
  for (const request of worker.posted) {
    if (request.type !== "decode-remote") continue;
    const result = decodeRemoteSocketFrame(request.raw);
    worker.respond(
      result.ok
        ? {
            v: CLIENT_ENGINE_PROTOCOL_VERSION,
            generation: request.generation,
            id: request.id,
            type: "decode-remote",
            ok: true,
            message: result.message,
          }
        : {
            v: CLIENT_ENGINE_PROTOCOL_VERSION,
            generation: request.generation,
            id: request.id,
            type: "decode-remote",
            ok: false,
            error: "invalid",
          },
    );
  }
}

function lastSeenSeqOf(socket: FakeSocket): number | null {
  const match = /lastSeenSeq=(\d+)/.exec(socket.url);
  return match ? Number(match[1]) : null;
}

const flushAsync = async (ms = 15): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, ms));
};

/** Delivers one frame and lets the decode microtask chain settle before the
 * next synchronous assertion, mirroring the real event-loop pacing. */
const deliver = async (socket: FakeSocket, raw: string): Promise<void> => {
  socket.deliver(raw);
  await new Promise((resolve) => setTimeout(resolve, 0));
};

// ── Harness ──────────────────────────────────────────────────────────

const DESKTOP_ID = "d1";

interface Harness {
  deps: StartRemoteServerEventStreamDeps;
  store: Record<string, unknown>;
  dispatch: typeof remoteState.dispatchRemoteSupervisorEvent;
}

function makeHarness(
  desktopId: string = DESKTOP_ID,
  options: {
    readonly initialCapabilities?: TerminalConnectionCapabilities;
    /** Descriptor returned by automatic reconnects (the first socket uses the seed). */
    readonly environment?: () => Promise<Awaited<ReturnType<RemoteDesktopClient["environment"]>>>;
  } = {},
): Harness {
  const thread = { id: "t1" } as Thread;
  const store: Record<string, unknown> = {
    servers: [
      {
        desktopId,
        label: "host",
        endpoint: "https://host.test",
        accessToken: "tok",
        scopes: [],
      },
    ],
    runtime: { [desktopId]: { status: "connecting", projects: [], threads: [thread] } },
    openThread: { desktopId, threadId: "t1", thread },
    clientFactory: () => client,
    socketFactory: (url: string) => new FakeSocket(url) as unknown as never,
    scheduleServerRefresh: vi.fn<() => void>(),
  };
  const client = {
    websocketTicket: async () => "ticket-1",
    environment:
      options.environment ??
      (async () => ({}) as Awaited<ReturnType<RemoteDesktopClient["environment"]>>),
    threadHistory: vi.fn<
      () => Promise<{
        snapshotSeq: number;
        projects: never[];
        threads: never[];
        runtimeSummariesByThread: Record<string, never>;
      }>
    >(async () => ({
      snapshotSeq: 0,
      projects: [],
      threads: [],
      runtimeSummariesByThread: {},
    })),
    websocketUrl: (
      ticket: string,
      lastSeenSeq: number | null | undefined,
      urlOptions: { readonly threadItemInterests?: readonly string[] } = {},
    ) => {
      const params = new URLSearchParams({ ticket });
      if (typeof lastSeenSeq === "number" && lastSeenSeq >= 0) {
        params.set("lastSeenSeq", String(lastSeenSeq));
      }
      if (urlOptions.threadItemInterests) {
        params.set("threadItemInterests", JSON.stringify(urlOptions.threadItemInterests));
      }
      return `wss://host.test/ws?${params.toString()}`;
    },
    parseSocketMessage: (raw: string) => JSON.parse(raw) as unknown,
  } as unknown as RemoteDesktopClient;

  const set: StartRemoteServerEventStreamDeps["set"] = (partial) => {
    const patch =
      typeof partial === "function"
        ? partial(store as never as Parameters<typeof partial>[0])
        : partial;
    Object.assign(store, patch);
  };

  const deps: StartRemoteServerEventStreamDeps = {
    server: {
      desktopId,
      label: "host",
      endpoint: "https://host.test",
      accessToken: "tok",
      scopes: [],
    },
    initialCapabilities: options.initialCapabilities ?? {},
    options: {},
    set,
    get: () => store as unknown as RemoteServersState,
    setRemoteServerFailure: vi.fn<() => void>(),
    closeRemoteServerEventSocket: vi.fn<() => void>(),
    activateRemoteTerminalFeed: vi.fn<() => void>(),
    rememberTerminalConnection: vi.fn<() => void>(),
    // Mirror the production binding: whatever factory the store currently
    // holds wins, so a test can gate a specific client.
    clientForServer: (server) =>
      (store as unknown as RemoteServersState).clientFactory(
        server.endpoint,
        server.accessToken,
      ) as unknown as RemoteDesktopClient,
    buildOpenThread: (ownerDesktopId, snapshot) => ({
      desktopId: ownerDesktopId,
      threadId: "t1",
      thread: (snapshot.thread as unknown as Thread) ?? thread,
    }),
  };
  return {
    deps,
    store,
    dispatch: remoteState.dispatchRemoteSupervisorEvent,
  };
}

beforeEach(() => {
  FakeEngineWorker.instances.length = 0;
  FakeSocket.instances.length = 0;
  remoteState.dispatchRemoteSupervisorEvent.mockClear();
  remoteState.applyThreadSnapshot.mockClear();
  remoteState.applyThreadSnapshot.mockImplementation(() => ({
    installedAuthoritativeHistory: true,
  }));
  __resetEventSocketRegistryForTest();
  __resetBoundedHistoryRegistryForTest();
  __resetBoundedCatalogForTest();
  __resetBoundedCatalogChangesCapabilityForTest();
  deleteRemoteServerEventSocketEntry(DESKTOP_ID);
  deleteRemoteServerEventSocketEntry("d2");
  resetClientEngineHostForTests();
  vi.stubGlobal("Worker", FakeEngineWorker);
});

afterEach(async () => {
  vi.unstubAllGlobals();
  resetClientEngineHostForTests();
  deleteRemoteServerEventSocketEntry(DESKTOP_ID);
  deleteRemoteServerEventSocketEntry("d2");
  __resetEventSocketRegistryForTest();
});

// ── Tests ────────────────────────────────────────────────────────────

describe("remote event socket session (V5 2.1)", () => {
  it("advances the resume cursor only after frames are applied", async () => {
    const { deps, dispatch } = makeHarness();
    await startRemoteServerEventStream(deps);
    const socket = FakeSocket.instances[0]!;
    expect(lastSeenSeqOf(socket)).toBe(0);

    await deliver(socket, runtimeEventFrame(1));
    await deliver(socket, runtimeEventFrame(2));
    expect(dispatch).toHaveBeenCalledTimes(2);
    expect(remoteServerSnapshotSeq(DESKTOP_ID)).toBe(2);
  });

  it("injects an engine overflow mid-stream and loses no thread item after reconnect", async () => {
    const { deps, dispatch } = makeHarness();
    await startRemoteServerEventStream(deps);
    const socket1 = FakeSocket.instances[0]!;

    await deliver(socket1, runtimeEventFrame(1));
    // The engine spawns its worker lazily on the first frame.
    const worker = FakeEngineWorker.instances[0]!;
    await deliver(socket1, runtimeEventFrame(2));
    expect(remoteServerSnapshotSeq(DESKTOP_ID)).toBe(2);

    // The next frame is being decoded when the engine overflows: the frame is
    // dropped in flight and must NOT be swallowed.
    worker.autoRespond = false;
    await deliver(socket1, runtimeEventFrame(3));
    expect(dispatch).toHaveBeenCalledTimes(2);
    worker.respond({
      v: CLIENT_ENGINE_PROTOCOL_VERSION,
      generation: 0,
      type: "overflow",
    });
    await flushAsync();

    // The session detected the loss and reconnected; the resume cursor is the
    // last APPLIED seq (2), never past the dropped frame. A3: the overflow
    // retires the failed worker and re-probes on a bounded cadence, so the
    // replacement socket's frames are typed-rejected (never parsed on the UI)
    // until a fresh worker is serving.
    expect(socket1.closed).toBe(true);
    const socket2 = FakeSocket.instances[1]!;
    expect(lastSeenSeqOf(socket2)).toBe(2);
    await vi.waitFor(() => expect(FakeEngineWorker.instances.length).toBe(2), {
      timeout: 5_000,
    });
    const recoveredWorker = FakeEngineWorker.instances[1]!;
    recoveredWorker.autoRespond = true;

    // The server replays the dropped seq; the item reaches the reducer.
    await deliver(socket2, runtimeEventFrame(3));
    expect(dispatch).toHaveBeenCalledTimes(3);
    expect(dispatch.mock.calls[2]![0]).toMatchObject({
      type: "thread-runtime-events-multi",
      batches: [{ threadId: "t1", events: [{ type: "item.delta", seq: 3 }] }],
    });
    expect(remoteServerSnapshotSeq(DESKTOP_ID)).toBe(3);
    expect(socket2.closed).toBe(false);
  });

  it("detects a sequence gap and resyncs from the last applied seq", async () => {
    const { deps, dispatch } = makeHarness();
    await startRemoteServerEventStream(deps);
    const socket1 = FakeSocket.instances[0]!;

    await deliver(socket1, runtimeEventFrame(1));
    expect(remoteServerSnapshotSeq(DESKTOP_ID)).toBe(1);

    // Seq 2 never arrives: the jump to 3 is a client-detected gap.
    await deliver(socket1, runtimeEventFrame(3));
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(socket1.closed).toBe(true);
    expect(remoteServerSnapshotSeq(DESKTOP_ID)).toBe(1);

    await flushAsync();
    const socket2 = FakeSocket.instances[1]!;
    expect(lastSeenSeqOf(socket2)).toBe(1);
    await deliver(socket2, runtimeEventFrame(2));
    await deliver(socket2, runtimeEventFrame(3));
    expect(dispatch).toHaveBeenCalledTimes(3);
    expect(remoteServerSnapshotSeq(DESKTOP_ID)).toBe(3);
    expect(socket2.closed).toBe(false);
  });

  it("does not resync or advance the cursor on a malformed frame", async () => {
    const { deps, dispatch } = makeHarness();
    await startRemoteServerEventStream(deps);
    const socket = FakeSocket.instances[0]!;

    await deliver(socket, runtimeEventFrame(1));
    await deliver(socket, JSON.stringify({ type: "not-in-the-protocol", seq: 99 }));
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(remoteServerSnapshotSeq(DESKTOP_ID)).toBe(1);
    expect(socket.closed).toBe(false);
    expect(FakeSocket.instances).toHaveLength(1);
  });

  it("accepts a server resync-required restart without a false gap", async () => {
    const { deps, dispatch } = makeHarness();
    await startRemoteServerEventStream(deps);
    const socket = FakeSocket.instances[0]!;

    await deliver(socket, runtimeEventFrame(1));
    expect(remoteServerSnapshotSeq(DESKTOP_ID)).toBe(1);

    // The host restarted: its fresh event sequence is lower than ours.
    await deliver(
      socket,
      JSON.stringify({ type: "resync-required", seq: 0, reason: "Server event stream reset." }),
    );
    await flushAsync();
    expect(remoteServerSnapshotSeq(DESKTOP_ID)).toBe(0);

    // Fresh-stream events continue contiguously from the accepted cursor.
    await deliver(socket, runtimeEventFrame(1));
    await deliver(socket, runtimeEventFrame(2));
    expect(dispatch).toHaveBeenCalledTimes(3);
    expect(remoteServerSnapshotSeq(DESKTOP_ID)).toBe(2);
    expect(socket.closed).toBe(false);
  });

  it("holds recovery-queued frames out of the resume cursor until they are replayed", async () => {
    const { deps, dispatch } = makeHarness();
    let releaseHistory!: (value: unknown) => void;
    const client = deps.get().clientFactory;
    // Gate the authoritative snapshot so a recovery is in flight while frames
    // arrive.
    const gatedFactory: RemoteClientFactory = (endpoint, token) => {
      const real = client(endpoint, token);
      const gated = Object.create(real) as RemoteDesktopClient;
      gated.threadHistory = vi.fn<() => Promise<unknown>>(
        () =>
          new Promise((resolve) => {
            releaseHistory = resolve;
          }),
      ) as unknown as RemoteDesktopClient["threadHistory"];
      return gated;
    };
    deps.get().clientFactory = gatedFactory;

    const started = startRemoteServerEventStream({
      ...deps,
      options: { resyncInterestedThreads: true },
    });
    await flushAsync();
    const socket = FakeSocket.instances[0]!;
    expect(socket).toBeDefined();

    // Frames for the recovering thread park in the bounded recovery queue.
    await deliver(socket, runtimeEventFrame(1));
    await deliver(socket, runtimeEventFrame(2));
    expect(dispatch).not.toHaveBeenCalled();
    // Queued ≠ applied: the resume cursor must not have moved past them.
    expect(remoteServerSnapshotSeq(DESKTOP_ID)).toBe(0);

    releaseHistory({
      snapshotSeq: 5,
      projects: [],
      threads: [],
      runtimeSummariesByThread: {},
    });
    await started;
    await flushAsync();

    // The snapshot is authoritative through seq 5 and supersedes the queue.
    expect(remoteState.applyThreadSnapshot).toHaveBeenCalled();
    expect(remoteServerSnapshotSeq(DESKTOP_ID)).toBe(5);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("replays a queued recovery tail in order after the baseline (A3 budgeted replay)", async () => {
    const { deps, dispatch } = makeHarness();
    let releaseHistory!: (value: unknown) => void;
    const client = deps.get().clientFactory;
    const gatedFactory: RemoteClientFactory = (endpoint, token) => {
      const real = client(endpoint, token);
      const gated = Object.create(real) as RemoteDesktopClient;
      gated.threadHistory = vi.fn<() => Promise<unknown>>(
        () =>
          new Promise((resolve) => {
            releaseHistory = resolve;
          }),
      ) as unknown as RemoteDesktopClient["threadHistory"];
      return gated;
    };
    deps.get().clientFactory = gatedFactory;

    const started = startRemoteServerEventStream({
      ...deps,
      options: { resyncInterestedThreads: true },
    });
    await flushAsync();
    const socket = FakeSocket.instances[0]!;

    // Frames for the recovering thread park in the bounded recovery queue.
    await deliver(socket, runtimeEventFrame(1));
    await deliver(socket, runtimeEventFrame(2));
    expect(dispatch).not.toHaveBeenCalled();
    expect(remoteServerSnapshotSeq(DESKTOP_ID)).toBe(0);

    // A baseline BELOW the queued seqs leaves them replayable: they apply in
    // order and each replay is what advances the resume cursor.
    releaseHistory({
      snapshotSeq: 0,
      projects: [],
      threads: [],
      runtimeSummariesByThread: {},
    });
    await started;
    await flushAsync();

    expect(dispatch).toHaveBeenCalledTimes(2);
    expect(
      dispatch.mock.calls.map((call) => {
        const forward = call[0] as {
          batches: Array<{ events: Array<{ seq: number }> }>;
        };
        return forward.batches[0]!.events[0]!.seq;
      }),
    ).toEqual([1, 2]);
    expect(remoteServerSnapshotSeq(DESKTOP_ID)).toBe(2);
  });

  it("keeps host B online and ordered while host A floods its lane budget", async () => {
    const { deps } = makeHarness();
    const hostB = makeHarness("d2");
    // Materialize the shared engine worker before any frame so the test can
    // hold responses while the flood builds.
    const engine = getRemoteSocketEngine();
    expect(engine.isWorkerActive()).toBe(true);
    const worker = FakeEngineWorker.instances[0]!;
    worker.autoRespond = false;

    await startRemoteServerEventStream(deps);
    await startRemoteServerEventStream(hostB.deps);
    const socketA = FakeSocket.instances[0]!;
    const socketB = FakeSocket.instances[1]!;

    await deliver(socketA, runtimeEventFrame(1));
    await deliver(socketB, runtimeEventFrame(1));
    for (let seq = 2; seq <= 70; seq += 1) {
      await deliver(socketA, runtimeEventFrame(seq));
    }

    // Host A exceeded its lane budget: only A's socket is torn down and
    // force-reconnected; B is untouched.
    expect(socketA.closed).toBe(true);
    expect(socketB.closed).toBe(false);
    expect(remoteServerSnapshotSeq(DESKTOP_ID)).toBe(0);
    expect(remoteState.dispatchRemoteSupervisorEvent).not.toHaveBeenCalled();

    // B's in-flight frame decodes and applies while A's lane is already gone.
    respondToDecodeRequests(worker);
    await flushAsync();
    expect(remoteState.dispatchRemoteSupervisorEvent).toHaveBeenCalledTimes(1);
    expect(remoteState.dispatchRemoteSupervisorEvent.mock.calls[0]![0]).toMatchObject({
      type: "thread-runtime-events-multi",
      batches: [{ threadId: "t1", events: [{ type: "item.delta", seq: 1 }] }],
    });
    expect(socketB.closed).toBe(false);

    // A reconnects from the last APPLIED seq (0), not from its flood.
    await flushAsync();
    const replacementA = FakeSocket.instances.find(
      (socket) => socket !== socketA && socket !== socketB && lastSeenSeqOf(socket) === 0,
    );
    expect(replacementA).toBeDefined();
  });

  it("kills the worker at backlog without a UI parse burst and resyncs every host", async () => {
    const { deps } = makeHarness();
    const hostB = makeHarness("d2");
    const engine = getRemoteSocketEngine();
    expect(engine.isWorkerActive()).toBe(true);
    const worker = FakeEngineWorker.instances[0]!;
    worker.autoRespond = false;

    await startRemoteServerEventStream(deps);
    await startRemoteServerEventStream(hostB.deps);
    const socketA = FakeSocket.instances[0]!;
    const socketB = FakeSocket.instances[1]!;
    await deliver(socketA, runtimeEventFrame(1));
    await deliver(socketB, runtimeEventFrame(1));
    const postsBeforeKill = worker.posted.filter(
      (message) => message.type === "decode-remote",
    ).length;

    worker.onerror?.({} as ErrorEvent);
    await flushAsync();
    expect(socketA.closed).toBe(true);
    expect(socketB.closed).toBe(true);
    expect(remoteState.dispatchRemoteSupervisorEvent).not.toHaveBeenCalled();

    // Subsequent frames are typed-rejected while the worker is unavailable:
    // no new worker posts, no synchronous parse of the backlog.
    for (const socket of [socketA, socketB]) {
      await deliver(socket, runtimeEventFrame(2));
    }
    expect(worker.posted.filter((message) => message.type === "decode-remote").length).toBe(
      postsBeforeKill,
    );

    // The engine re-probes on its bounded cadence and both hosts recover.
    await vi.waitFor(() => expect(FakeEngineWorker.instances.length).toBe(2), {
      timeout: 5_000,
    });
    FakeEngineWorker.instances[1]!.autoRespond = true;
    const replacements = FakeSocket.instances.filter(
      (socket) => socket !== socketA && socket !== socketB,
    );
    expect(replacements).toHaveLength(2);
    for (const socket of replacements) await deliver(socket, runtimeEventFrame(1));
    await flushAsync();
    expect(remoteState.dispatchRemoteSupervisorEvent).toHaveBeenCalledTimes(2);
  });

  it("drops the truncated thread's bounded turn tail when the replay is applied", async () => {
    const { deps } = makeHarness();
    const boundedPage = (completedTurnsNextCursor: string) => ({
      snapshotSeq: 1,
      thread: { id: "t1" } as Thread,
      runtimeItems: [],
      completedTurns: [],
      completedTurnsNextCursor,
      contextUsage: null,
      reads: "bounded-v1" as const,
      updatedAt: "now",
    });
    recordBoundedHistoryTail({
      desktopId: DESKTOP_ID,
      threadId: "t1",
      page: boundedPage("ct1.10"),
    });
    recordBoundedHistoryTail({
      desktopId: DESKTOP_ID,
      threadId: "t2",
      page: boundedPage("ct1.4"),
    });
    await startRemoteServerEventStream(deps);
    const socket = FakeSocket.instances[0]!;

    await deliver(
      socket,
      JSON.stringify({
        type: "event",
        seq: 1,
        event: {
          type: "thread-runtime-event",
          threadId: "t1",
          event: { type: "runtime.truncated", itemId: "cp-1", seq: 1 },
        },
      }),
    );

    // The truncation renumbers this thread's completed turns: its old `ct1.`
    // proof is gone, while the untouched thread keeps its continuation.
    expect(readBoundedHistoryTail(`${DESKTOP_ID}:t1`)).toBeUndefined();
    expect(readBoundedHistoryTail(`${DESKTOP_ID}:t2`)).toBeDefined();
  });

  it("drops every bounded turn tail for the server on resync-required", async () => {
    const { deps } = makeHarness();
    recordBoundedHistoryTail({
      desktopId: DESKTOP_ID,
      threadId: "t1",
      page: {
        snapshotSeq: 1,
        thread: { id: "t1" } as Thread,
        runtimeItems: [],
        completedTurns: [],
        completedTurnsNextCursor: "ct1.10",
        contextUsage: null,
        reads: "bounded-v1",
        updatedAt: "now",
      },
    });
    await startRemoteServerEventStream(deps);
    const socket = FakeSocket.instances[0]!;

    await deliver(
      socket,
      JSON.stringify({ type: "resync-required", seq: 0, reason: "Server event stream reset." }),
    );
    await flushAsync();

    // A restarted host has a fresh sequence space: no old tail can survive.
    expect(readBoundedHistoryTail(`${DESKTOP_ID}:t1`)).toBeUndefined();
  });

  it("drops the bounded turn tail when a recovery installs an authoritative baseline", async () => {
    const { deps } = makeHarness();
    recordBoundedHistoryTail({
      desktopId: DESKTOP_ID,
      threadId: "t1",
      page: {
        snapshotSeq: 1,
        thread: { id: "t1" } as Thread,
        runtimeItems: [],
        completedTurns: [],
        completedTurnsNextCursor: "ct1.10",
        contextUsage: null,
        reads: "bounded-v1",
        updatedAt: "now",
      },
    });
    let releaseHistory!: (value: unknown) => void;
    const client = deps.get().clientFactory;
    const gatedFactory: RemoteClientFactory = (endpoint, token) => {
      const real = client(endpoint, token);
      const gated = Object.create(real) as RemoteDesktopClient;
      gated.threadHistory = vi.fn<() => Promise<unknown>>(
        () =>
          new Promise((resolve) => {
            releaseHistory = resolve;
          }),
      ) as unknown as RemoteDesktopClient["threadHistory"];
      return gated;
    };
    deps.get().clientFactory = gatedFactory;

    const started = startRemoteServerEventStream({
      ...deps,
      options: { resyncInterestedThreads: true },
    });
    await flushAsync();
    releaseHistory({
      snapshotSeq: 5,
      projects: [],
      threads: [],
      runtimeSummariesByThread: {},
    });
    await started;
    await flushAsync();

    // The rebuilt transcript may have renumbered turns: the old proof cannot
    // feed older pages into it.
    expect(readBoundedHistoryTail(`${DESKTOP_ID}:t1`)).toBeUndefined();
  });
});

describe("boundedCatalogChanges upgrade declaration", () => {
  const TEST_CONSUMER = { id: "event-socket-test", ownsConnection: () => true };
  const controllerDeps: BoundedCatalogDeps = {
    connectionIdentity: () => ({
      generation: 1,
      identity: "host.test",
      client: {} as RemoteDesktopClient,
    }),
    runtimeThreads: () => undefined,
    runtimeProjects: () => undefined,
    runtimeStatus: () => undefined,
    commitThreadRows: () => {},
    commitProjectRows: () => {},
    removeThreadRows: () => {},
    removeProjectRows: () => {},
    withClient: async (_key, invoke) => invoke({} as RemoteDesktopClient),
    reportProtocolError: () => {},
    appliedThreadSeq: () => undefined,
    connectionSeq: () => 0,
    bumpConnectionSeq: () => {},
    protectedThreadIds: () => new Set(),
    isForeground: () => true,
  };

  it("declares the signal form on the first upgrade when the descriptor advertised it", async () => {
    configureBoundedCatalogController(TEST_CONSUMER, controllerDeps);
    const { deps } = makeHarness(DESKTOP_ID, {
      initialCapabilities: { boundedCatalogChanges: true },
    });
    await startRemoteServerEventStream(deps);
    const socket = FakeSocket.instances[0]!;
    expect(new URL(socket.url).searchParams.get("catalogChanges")).toBe("bounded-v1");
  });

  it("never declares without the advertised capability", async () => {
    configureBoundedCatalogController(TEST_CONSUMER, controllerDeps);
    const { deps } = makeHarness(DESKTOP_ID, { initialCapabilities: {} });
    await startRemoteServerEventStream(deps);
    const socket = FakeSocket.instances[0]!;
    expect(new URL(socket.url).searchParams.has("catalogChanges")).toBe(false);
  });

  it("never declares for a connection known as a legacy catalog reader", async () => {
    configureBoundedCatalogController(TEST_CONSUMER, controllerDeps);
    noteBoundedCatalogLegacy(DESKTOP_ID);
    const { deps } = makeHarness(DESKTOP_ID, {
      initialCapabilities: { boundedCatalogChanges: true },
    });
    await startRemoteServerEventStream(deps);
    const socket = FakeSocket.instances[0]!;
    expect(new URL(socket.url).searchParams.has("catalogChanges")).toBe(false);
  });

  it("re-proves the capability on reconnect and drops a declaration the new descriptor no longer authorizes", async () => {
    configureBoundedCatalogController(TEST_CONSUMER, controllerDeps);
    const { deps } = makeHarness(DESKTOP_ID, {
      initialCapabilities: { boundedCatalogChanges: true },
      environment: async () => ({}) as Awaited<ReturnType<RemoteDesktopClient["environment"]>>,
    });
    await startRemoteServerEventStream(deps);
    const socket1 = FakeSocket.instances[0]!;
    expect(new URL(socket1.url).searchParams.get("catalogChanges")).toBe("bounded-v1");

    // The server drops the capability before the reconnect's fresh descriptor.
    socket1.onclose?.();
    await vi.waitFor(() => expect(FakeSocket.instances.length).toBeGreaterThan(1));
    const socket2 = FakeSocket.instances[1]!;
    expect(new URL(socket2.url).searchParams.has("catalogChanges")).toBe(false);
  });

  it("lets the current descriptor verdict override a stale recorded capability", async () => {
    configureBoundedCatalogController(TEST_CONSUMER, controllerDeps);
    noteBoundedCatalogChangesCapability(DESKTOP_ID, true);
    const { deps } = makeHarness(DESKTOP_ID, { initialCapabilities: {} });
    await startRemoteServerEventStream(deps);
    const socket = FakeSocket.instances[0]!;
    // The connect's own descriptor said unsupported (empty seed), so it
    // overwrites the stale record and the upgrade stays undeclared.
    expect(new URL(socket.url).searchParams.has("catalogChanges")).toBe(false);
  });
});
