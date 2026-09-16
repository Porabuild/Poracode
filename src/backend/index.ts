import { AsyncWorkTracker } from "@/shared/asyncWorkTracker";
import { startNodePerformanceDiagnostics } from "@/shared/diagnostics/nodePerformanceDiagnostics";
import { configureSecretStorageKey } from "@/shared/secretStorage";
import {
  BACKEND_HOST_PROTOCOL_VERSION,
  createBackendSupervisorRequest,
  isDirectRendererDatabaseProcedure,
  isDirectRendererServiceProcedure,
  isBackendHostRequest,
  type BackendRendererRequest,
  type BackendHostOutboundMessage,
  type BackendHostReply,
  type BackendHostRequest,
} from "@/shared/backendHostProtocol";
import {
  BackendEventRouter,
  BackendHostCore,
  filterSupervisorEventForInterests,
} from "./BackendHostCore";
import { BackendDesktopServices } from "./BackendDesktopServices";
import { BackendRendererStream } from "./BackendRendererStream";
import { RendererStreamOwnership } from "./RendererStreamOwnership";
import { BackendNativeRequests } from "./BackendNativeRequests";
import { createRendererEventPublication } from "./rendererEventPublication";
import { createBackendHostShedPolicy, createSupervisorEventRelay } from "./supervisorEventRelay";
import { planDesktopRelay } from "./supervisorEventFallback";
import { shutdownBackendHost } from "./shutdown";
import { joinRuntimeShutdown } from "./joinRuntimeShutdown";
import { callDatabaseRpc } from "@/main/db/databaseRpc";
import { SupervisorIpcSender } from "@/supervisor/supervisorIpcSender";
import type { LiveEventInterests } from "@/shared/liveEventInterests";
import { ipcProcedureMap, type IpcProcedureName, type SupervisorProcedureName } from "@/shared/ipc";

const performanceDiagnostics = startNodePerformanceDiagnostics("backend");
let backendHost: BackendHostCore | null = null;
let desktopServices: BackendDesktopServices | null = null;
let rendererStream: BackendRendererStream | null = null;
let supervisorExtraEnv: Record<string, string> = {};
const eventRouter = new BackendEventRouter();
// Desktop-window delivery ownership for the direct renderer stream. Lives at
// module scope like the IPC-copy event router so grants pushed by main apply
// before, between, and after renderer-stream (re)construction.
const rendererStreamOwnership = new RendererStreamOwnership();
let rendererEventInterests: LiveEventInterests = {
  terminalThreadIds: [],
  runtimeThreadIds: [],
  allRuntimeEvents: false,
};
let remoteEventInterests: LiveEventInterests = {
  terminalThreadIds: [],
  runtimeThreadIds: [],
  allRuntimeEvents: false,
};
const requests = new AsyncWorkTracker();
const initialization = new AsyncWorkTracker();
let shuttingDown = false;
let acceptingRequests = true;
let runtimeStop: Promise<void> | null = null;
let runtimeWorkJoined = false;

function stopRuntimeWork(): Promise<void> {
  if (runtimeStop) return runtimeStop;
  acceptingRequests = false;
  const barrier = Promise.withResolvers<void>();
  runtimeStop = barrier.promise;
  void (async () => {
    // Startup can create owned handles after an await. Its eventual owner
    // cancellation must run before this join, without releasing the root lease.
    await initialization.drain();
    try {
      // Stop producers before waiting for calls that need their cancellation.
      // Keep service references and SQLite alive through every continuation.
      await joinRuntimeShutdown([
        () => desktopServices?.dispose(),
        () => backendHost?.disposeSupervisor(),
        () => rendererStream?.dispose(),
        () => requests.drain(),
      ]);
    } finally {
      await nativeRequests.drain();
    }
    runtimeWorkJoined = true;
  })().then(barrier.resolve, barrier.reject);
  return runtimeStop;
}

// Shed logging is throttled because sheds arrive per enqueue during a burst —
// a line per shed would be stderr lines per frame exactly when I/O is worst.
let shedLogCount = 0;
let shedLogBytes = 0;
let shedLogAt = 0;

const sender = new SupervisorIpcSender<BackendHostOutboundMessage>({
  ...(performanceDiagnostics ? { queueDiagnostics: performanceDiagnostics.queueCapture } : {}),
  send: (message, callback) => {
    if (!process.connected || !process.send) {
      callback(new Error("Backend-host IPC channel is disconnected."));
      return true;
    }
    return process.send(message, callback);
  },
  onError: (error) => {
    if (process.connected) console.error("[backend-host] IPC send failed:", error);
  },
  onFatalError: () => {
    void shutdown(1, false);
  },
  // A stalled desktop consumer must not pause the shared supervisor. Bulk
  // renderer content may shed oldest-first — each shed batch inserts a
  // supervisor-event-gap signal ahead of the surviving traffic, and the
  // desktop relay rebuilds affected windows from persisted state. This
  // containment is per-traffic-class: a queue saturated by non-replayable
  // traffic alone (replies, thread-state, crossagent, native, errors) still
  // fails closed, so an arbitrary IPC stall is not fully isolated.
  backpressureTimeoutMs: null,
  shedPolicy: createBackendHostShedPolicy(),
  onMessagesShed: ({ count, bytes }) => {
    shedLogCount += count;
    shedLogBytes += bytes;
    const now = Date.now();
    if (shedLogAt !== 0 && now - shedLogAt < 5_000) return;
    shedLogAt = now;
    console.error(
      `[backend-host] shed ${shedLogCount} queued renderer events (${shedLogBytes} bytes) under desktop-IPC backpressure; gap recovery signals emitted.`,
    );
    shedLogCount = 0;
    shedLogBytes = 0;
  },
});
performanceDiagnostics?.observeIpcQueue("backend-to-main", () => sender.getQueueDiagnostics());

function send(message: BackendHostOutboundMessage): void {
  sender.sendMessage(message);
}

const nativeRequests = new BackendNativeRequests(send);

function reportError(
  error: unknown,
  tags?: import("@/shared/diagnostics/sentryPrivacy").PoracodeDiagnosticTags,
): void {
  send({
    version: BACKEND_HOST_PROTOCOL_VERSION,
    kind: "error",
    message: error instanceof Error ? error.message : String(error),
    ...(tags ? { tags } : {}),
  });
}

function syncEventInterests(): void {
  eventRouter.setInterests({
    terminalThreadIds: [
      ...new Set([
        ...rendererEventInterests.terminalThreadIds,
        ...remoteEventInterests.terminalThreadIds,
      ]),
    ],
    runtimeThreadIds: [
      ...new Set([
        ...rendererEventInterests.runtimeThreadIds,
        ...remoteEventInterests.runtimeThreadIds,
      ]),
    ],
    allRuntimeEvents:
      rendererEventInterests.allRuntimeEvents || remoteEventInterests.allRuntimeEvents,
  });
}

function requestNative(
  request: import("@/shared/backendHostProtocol").BackendNativeRequest,
): Promise<unknown> {
  return nativeRequests.request(request);
}

function replySuccess(replyTo: string, data: unknown = null): void {
  send({
    version: BACKEND_HOST_PROTOCOL_VERSION,
    kind: "reply",
    replyTo,
    ok: true,
    data,
  });
}

function replyFailure(replyTo: string, error: unknown): void {
  const reply: BackendHostReply = {
    version: BACKEND_HOST_PROTOCOL_VERSION,
    kind: "reply",
    replyTo,
    ok: false,
    error: error instanceof Error ? error.message : String(error),
  };
  send(reply);
}

// Gate 4 §5.4 (F10): per-renderer congestion isolation. A slow renderer
// exhausts ONLY its bounded delivery/recovery budget in the renderer stream
// (per-client budget doubling to 1 MiB, then a 1013 close with a
// generation-fenced recovery barrier through the ordered desktop-IPC
// fallback). Renderer congestion is never forwarded upstream as
// supervisor-wide output backpressure: that signal would shed rebuildable
// terminal output at the source for healthy clients too.
const relaySupervisorEvent = createSupervisorEventRelay({
  publishToRendererStream: createRendererEventPublication({
    getStream: () => rendererStream,
  }),
  observeEvent: (event) => desktopServices?.observeSupervisorEvent(event),
  // The backend is the authoritative direct/fallback selector: it plans
  // per-window targeted copies for windows that need the desktop-IPC
  // fallback and a sequence-less shell remainder for main's own consumers.
  // Bulk content can cross only inside targeted copies.
  planDesktopRelay: (event) =>
    planDesktopRelay({
      event,
      ownershipArmed: rendererStreamOwnership.isArmed(),
      fallbackWindows: rendererStreamOwnership.fallbackWindows(),
      isTerminalBootstrapRetainedFor: (windowId, threadId) =>
        eventRouter.isTerminalBootstrapRetainedFor(windowId, threadId),
      filterEventForInterests: (filtered, interests) =>
        filterSupervisorEventForInterests(filtered, interests),
      filterShellEvent: (shell) => eventRouter.filter(shell),
    }),
  sendToMain: send,
});

async function initialize(
  request: Extract<BackendHostRequest, { operation: "initialize" }>,
): Promise<unknown> {
  if (backendHost) throw new Error("Backend host is already initialized.");
  const { baseDir, dbPath, supervisor } = request.payload;
  configureSecretStorageKey(supervisor.secretStorageKey);
  backendHost = new BackendHostCore({
    baseDir,
    dbPath,
    databaseSchemaMode: "migrate",
    markLiveThreadsInactiveOnOpen: true,
    // Desktop main resolves the fence from the same canonical root mapping as
    // the owner lease; the child holds it for its lifetime so an orphaned
    // backend (killed main) keeps excluding a successor owner from the data.
    ...(request.payload.desktop?.dataFencePath
      ? { dataFencePath: request.payload.desktop.dataFencePath }
      : {}),
    supervisor: {
      ...supervisor,
      resolveExtraEnv: () => ({
        ...supervisorExtraEnv,
        ...desktopServices?.getSupervisorExtraEnv(),
      }),
      reportError,
    },
    onEvent: (event) => {
      relaySupervisorEvent(event);
    },
    onSupervisorOutputShed: (threadIds) => {
      // The supervisor shed terminal-output batches in transit; the events
      // never persisted, so windows must rebuild those threads' output from
      // the supervisor's authoritative scrollback via their gap recovery.
      rendererStream?.broadcastResyncRequired(threadIds);
      reportError?.(
        new Error(
          `supervisor shed terminal output for ${threadIds.length} thread(s) under IPC backpressure`,
        ),
      );
    },
    onReset: () => {
      // Match the headless host: no `thread-exited` is emitted for sessions
      // that died with the old supervisor, so the desktop remote server must
      // also drop its cached background-task levels here.
      desktopServices?.handleSupervisorReset();
      for (const event of desktopServices?.markLiveThreadsInactive() ?? []) {
        relaySupervisorEvent(event);
      }
      send({
        version: BACKEND_HOST_PROTOCOL_VERSION,
        kind: "supervisor-reset",
      });
    },
  });
  desktopServices = new BackendDesktopServices({
    initialize: request.payload,
    host: backendHost,
    requestNative,
    reportError,
    emitNativeEvent: (event) =>
      send({ version: BACKEND_HOST_PROTOCOL_VERSION, kind: "native-event", event }),
    setRemoteEventInterests: (interests) => {
      remoteEventInterests = interests;
      syncEventInterests();
    },
  });
  rendererStream = new BackendRendererStream({
    onSlowClient: ({ bufferedBytes, budgetBytes }) =>
      reportError(
        new Error(
          `Renderer event stream exceeded its ${budgetBytes}-byte budget (${bufferedBytes} bytes buffered).`,
        ),
        { "poracode.feature_area": "renderer-event-stream" },
      ),
    onRequest: handleRendererRequest,
    ownership: rendererStreamOwnership,
    // Owner revocation recovery: generation-fenced barriers through the
    // ordered desktop-IPC fallback, ahead of any later fallback copy.
    onStreamRecovery: (revocations) => {
      for (const revocation of revocations) {
        send({
          version: BACKEND_HOST_PROTOCOL_VERSION,
          kind: "renderer-stream-recovery",
          windowId: revocation.windowId,
          generation: revocation.generation,
          fromSequence: revocation.fromSequence,
          toSequence: revocation.toSequence,
          ...(revocation.threadIds ? { threadIds: revocation.threadIds } : {}),
        });
      }
    },
  });
  const rendererStreamInfo = await rendererStream.start();
  if (!acceptingRequests) throw new Error("Backend host is shutting down.");
  return { rendererStream: rendererStreamInfo };
}

/** Validated authenticated origin window of a call-supervisor request, or undefined. */
function readCallOriginWindowId(request: { originWindowId?: unknown }): number | undefined {
  const value = request.originWindowId;
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : undefined;
}

async function handleRendererRequest(
  request: BackendRendererRequest,
  origin?: { windowId: number },
): Promise<unknown> {
  const procedure = ipcProcedureMap[request.name as IpcProcedureName];
  if (!procedure) throw new Error(`Unknown renderer procedure: ${request.name}`);
  const payload = procedure.payloadSchema.parse(request.payload);
  if (request.operation === "supervisor") {
    if (procedure.transport !== "supervisor") {
      throw new Error(`Procedure ${request.name} is not owned by the supervisor.`);
    }
    return handleRequest(
      createBackendSupervisorRequest(
        request.id,
        request.name as SupervisorProcedureName,
        payload as never,
        origin?.windowId,
      ),
    );
  }
  if (request.operation === "database") {
    if (!isDirectRendererDatabaseProcedure(request.name)) {
      throw new Error(`Procedure ${request.name} is not a direct renderer database operation.`);
    }
    return handleRequest({
      version: BACKEND_HOST_PROTOCOL_VERSION,
      id: request.id,
      operation: "call-database",
      payload: { name: request.name, payload } as never,
    });
  }
  if (request.operation === "revert-checkpoint") {
    if (request.name !== "revertCheckpoint") {
      throw new Error(`Procedure ${request.name} is not the compound checkpoint revert.`);
    }
    return handleRequest({
      version: BACKEND_HOST_PROTOCOL_VERSION,
      id: request.id,
      operation: "revert-checkpoint",
      payload: { name: request.name, payload } as never,
    });
  }
  if (!isDirectRendererServiceProcedure(request.name)) {
    throw new Error(`Procedure ${request.name} is not a direct renderer service operation.`);
  }
  return handleRequest({
    version: BACKEND_HOST_PROTOCOL_VERSION,
    id: request.id,
    operation: "call-service",
    payload: { name: request.name, payload } as never,
  });
}

function handleRequest(request: BackendHostRequest): Promise<unknown> {
  // Control replies must bypass both normal admission and its work tracker:
  // admitted calls may need them to settle, and dispose must not join itself.
  if (request.operation === "resolve-native-request") {
    nativeRequests.resolve(request.payload);
    return Promise.resolve(null);
  }
  if (request.operation === "dispose") return disposeRuntime();
  if (!acceptingRequests) return Promise.reject(new Error("Backend host is shutting down."));
  return requests.run(() =>
    request.operation === "initialize"
      ? initialization.run(() => initialize(request))
      : executeRequest(request),
  );
}

async function disposeRuntime(): Promise<null> {
  await stopRuntimeWork();
  desktopServices = null;
  rendererStream = null;
  backendHost?.closeDatabase();
  backendHost = null;
  return null;
}

async function executeRequest(
  request: Exclude<
    BackendHostRequest,
    { operation: "initialize" | "dispose" | "resolve-native-request" }
  >,
): Promise<unknown> {
  const host = backendHost;
  if (!host) throw new Error("Backend host is not initialized.");

  switch (request.operation) {
    case "start-supervisor":
      supervisorExtraEnv = request.payload.extraEnv;
      await desktopServices?.prepareSupervisor();
      await host.startSupervisor();
      await desktopServices?.startBackgroundServices();
      return null;
    case "restart-supervisor":
      supervisorExtraEnv = request.payload.extraEnv;
      await desktopServices?.prepareSupervisor();
      await host.restartSupervisor();
      await desktopServices?.startBackgroundServices();
      return null;
    case "call-supervisor": {
      // SupervisorClient.call autostarts the child on first use; it must not
      // spawn before the ingress is up or it would start without the
      // app-controls MCP env. Same single-flight gate as start/restart —
      // after the first success this await is a resolved promise.
      await desktopServices?.prepareSupervisor();
      const supervisorRequest = request.payload;
      const payload = supervisorRequest.payload as { shellId?: string; threadId?: string };
      const bootstrapThreadId =
        supervisorRequest.type === "startShell"
          ? payload.shellId
          : supervisorRequest.type === "startThread"
            ? payload.threadId
            : undefined;
      // The start's authenticated origin window (main-assigned from the IPC
      // sender, or the backend-validated stream bind). Originless starts —
      // server, remote, background — widen no window's bootstrap retention.
      const originWindowId = readCallOriginWindowId(supervisorRequest);
      if (bootstrapThreadId) {
        eventRouter.retainTerminalBootstrap(bootstrapThreadId, originWindowId);
        rendererStream?.retainTerminalBootstrap(bootstrapThreadId, originWindowId);
      }
      if (supervisorRequest.type === "closeThread" && payload.threadId) {
        eventRouter.clearTerminalBootstrap(payload.threadId);
        rendererStream?.clearTerminalBootstrap(payload.threadId);
      }
      try {
        return await host.supervisorClient.call(
          supervisorRequest.type,
          supervisorRequest.payload as never,
        );
      } catch (error) {
        if (bootstrapThreadId) {
          eventRouter.clearTerminalBootstrap(bootstrapThreadId);
          rendererStream?.clearTerminalBootstrap(bootstrapThreadId);
        }
        throw error;
      }
    }
    case "call-database": {
      // Truncate is intercepted at the request owner: locally-acting renderer
      // windows reach the truncate through this RPC, so it must flow through
      // the backend-owned operation (one DB mutation → one `runtime.truncated`
      // event) instead of the bare DB call, which would mutate silently and
      // never reach the other windows or remote clients. The RPC reply keeps
      // its public void shape; the anchors travel on the event.
      if (request.payload.name === "dbTruncateThreadRuntimeAfter") {
        host.truncateThreadRuntime(
          request.payload.payload.threadId,
          request.payload.payload.itemId,
        );
        return null;
      }
      const result = callDatabaseRpc(request.payload);
      desktopServices?.databaseChanged(request.payload);
      return result;
    }
    case "revert-checkpoint": {
      // WS2 stage 4: the compound checkpoint revert runs in the host —
      // provider rollback, file restore, transcript truncation and the single
      // canonical `runtime.truncated` publication are all owned here.
      return host.revertCheckpoint(request.payload.payload);
    }
    case "call-service":
      if (!desktopServices) throw new Error("Backend desktop services are not initialized.");
      return desktopServices.call(request.payload.name, request.payload.payload as never);
    case "set-event-interests":
      rendererEventInterests = request.payload;
      syncEventInterests();
      return null;
    case "set-renderer-stream-ownership":
      // Main's authoritative per-window delivery table (grant + interests).
      // Applies even while the stream is being (re)constructed: the registry
      // is injected into every stream instance. A malformed entry throws so
      // the push fails loudly instead of silently dropping a consumer; an
      // entry without a live owner keeps the per-window IPC fallback.
      rendererStreamOwnership.setWindows(request.payload.windows);
      return null;
    case "browser-event":
      desktopServices?.publishBrowserEvent(request.payload);
      return null;
  }
}

process.on("message", (message: unknown) => {
  if (!isBackendHostRequest(message)) {
    send({
      version: BACKEND_HOST_PROTOCOL_VERSION,
      kind: "error",
      message: "Rejected an invalid or incompatible backend-host IPC request.",
    });
    return;
  }

  if (message.operation === "browser-event") {
    if (!acceptingRequests) return;
    void handleRequest(message).catch(reportError);
    return;
  }

  void handleRequest(message).then(
    async (data) => {
      replySuccess(message.id, data);
      if (message.operation === "dispose") await shutdown(0, true);
    },
    (error: unknown) => {
      replyFailure(message.id, error);
    },
  );
});

async function shutdown(exitCode: number, flush: boolean): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  acceptingRequests = false;
  eventRouter.dispose();
  nativeRequests.cancel(new Error("Backend host is shutting down."));
  await shutdownBackendHost({
    steps: [
      async () => {
        await stopRuntimeWork();
        desktopServices = null;
        rendererStream = null;
      },
      async () => {
        if (flush && process.connected) await sender.flushAndWait(1_000);
      },
      () => {
        if (backendHost && !runtimeWorkJoined)
          throw new Error("Cannot close the database before durable runtime work has joined.");
        backendHost?.closeDatabase();
        backendHost = null;
      },
      () => performanceDiagnostics?.stop(),
    ],
    exitCode,
    reportError: (error) => console.error("[backend] shutdown failed:", error),
    exit: (code) => process.exit(code),
  });
}

process.on("disconnect", () => {
  void shutdown(0, false);
});

process.on("SIGINT", () => {
  void shutdown(0, true);
});

process.on("SIGTERM", () => {
  void shutdown(0, true);
});
