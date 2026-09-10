import { randomUUID } from "node:crypto";
import {
  BACKEND_HOST_PROTOCOL_VERSION,
  isDirectRendererDatabaseProcedure,
  isDirectRendererServiceProcedure,
  isBackendHostRequest,
  type BackendRendererRequest,
  type BackendHostOutboundMessage,
  type BackendHostReply,
  type BackendHostRequest,
} from "@/shared/backendHostProtocol";
import { BackendEventRouter, BackendHostCore } from "./BackendHostCore";
import { BackendDesktopServices } from "./BackendDesktopServices";
import { BackendRendererStream } from "./BackendRendererStream";
import { createBackendHostShedPolicy, createSupervisorEventRelay } from "./supervisorEventRelay";
import { shutdownBackendHost } from "./shutdown";
import { callDatabaseRpc } from "@/main/db/databaseRpc";
import { SupervisorIpcSender } from "@/supervisor/supervisorIpcSender";
import type { LiveEventInterests } from "@/shared/liveEventInterests";
import { ipcProcedureMap, type IpcProcedureName } from "@/shared/ipc";

let backendHost: BackendHostCore | null = null;
let desktopServices: BackendDesktopServices | null = null;
let rendererStream: BackendRendererStream | null = null;
let supervisorExtraEnv: Record<string, string> = {};
const eventRouter = new BackendEventRouter();
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
const pendingNativeRequests = new Map<
  string,
  {
    resolve(value: unknown): void;
    reject(reason: unknown): void;
    timeout: ReturnType<typeof setTimeout>;
  }
>();
let shuttingDown = false;

// Shed logging is throttled because sheds arrive per enqueue during a burst —
// a line per shed would be stderr lines per frame exactly when I/O is worst.
let shedLogCount = 0;
let shedLogBytes = 0;
let shedLogAt = 0;

const sender = new SupervisorIpcSender<BackendHostOutboundMessage>({
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

function send(message: BackendHostOutboundMessage): void {
  sender.sendMessage(message);
}

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
  const id = randomUUID();
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pendingNativeRequests.delete(id);
      reject(new Error(`Native request "${request.operation}" timed out.`));
    }, 60_000);
    timeout.unref?.();
    pendingNativeRequests.set(id, { resolve, reject, timeout });
    send({ version: BACKEND_HOST_PROTOCOL_VERSION, kind: "native-request", id, request });
  });
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

// WS5 P1-2: renderer-stream pressure (a slow renderer window) flows to the
// supervisor as flow control, which sheds rebuildable terminal output at the
// source instead of letting the queue grow until overflow shedding kicks in.
let supervisorBackpressured = false;
const relaySupervisorEvent = createSupervisorEventRelay({
  publishToRendererStream: (event) => {
    const result = rendererStream?.publish(event);
    if (rendererStream) {
      const pressured = rendererStream.isBackpressured();
      if (pressured !== supervisorBackpressured) {
        supervisorBackpressured = pressured;
        backendHost?.setSupervisorOutputBackpressured(pressured);
      }
    }
    return result;
  },
  observeEvent: (event) => desktopServices?.observeSupervisorEvent(event),
  filterForIpcConsumers: (event) => eventRouter.filter(event),
  sendToMain: send,
});

async function initialize(
  request: Extract<BackendHostRequest, { operation: "initialize" }>,
): Promise<unknown> {
  if (backendHost) throw new Error("Backend host is already initialized.");
  const { baseDir, dbPath, supervisor } = request.payload;
  backendHost = new BackendHostCore({
    baseDir,
    dbPath,
    databaseSchemaMode: "migrate",
    markLiveThreadsInactiveOnOpen: true,
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
      rendererStream?.broadcastResyncRequired();
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
  });
  const rendererStreamInfo = await rendererStream.start();
  return { rendererStream: rendererStreamInfo };
}

async function handleRendererRequest(request: BackendRendererRequest): Promise<unknown> {
  const procedure = ipcProcedureMap[request.name as IpcProcedureName];
  if (!procedure) throw new Error(`Unknown renderer procedure: ${request.name}`);
  const payload = procedure.payloadSchema.parse(request.payload);
  if (request.operation === "supervisor") {
    if (procedure.transport !== "supervisor") {
      throw new Error(`Procedure ${request.name} is not owned by the supervisor.`);
    }
    return handleRequest({
      version: BACKEND_HOST_PROTOCOL_VERSION,
      id: request.id,
      operation: "call-supervisor",
      payload: { id: request.id, type: request.name, payload } as never,
    });
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

async function handleRequest(request: BackendHostRequest): Promise<unknown> {
  if (request.operation === "initialize") {
    return initialize(request);
  }

  const host = backendHost;
  if (!host) throw new Error("Backend host is not initialized.");

  switch (request.operation) {
    case "start-supervisor":
      supervisorExtraEnv = request.payload.extraEnv;
      await desktopServices?.prepareSupervisor();
      host.startSupervisor();
      await desktopServices?.startBackgroundServices();
      return null;
    case "restart-supervisor":
      supervisorExtraEnv = request.payload.extraEnv;
      await desktopServices?.prepareSupervisor();
      host.restartSupervisor();
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
      if (bootstrapThreadId) {
        eventRouter.retainTerminalBootstrap(bootstrapThreadId);
        rendererStream?.retainTerminalBootstrap(bootstrapThreadId);
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
    case "resolve-native-request": {
      const pending = pendingNativeRequests.get(request.payload.requestId);
      if (!pending) return null;
      pendingNativeRequests.delete(request.payload.requestId);
      clearTimeout(pending.timeout);
      if (request.payload.ok) pending.resolve(request.payload.data);
      else pending.reject(new Error(request.payload.error));
      return null;
    }
    case "browser-event":
      desktopServices?.publishBrowserEvent(request.payload);
      return null;
    case "dispose":
      await desktopServices?.dispose();
      desktopServices = null;
      await rendererStream?.dispose();
      rendererStream = null;
      host.dispose();
      backendHost = null;
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
    void handleRequest(message);
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
  eventRouter.dispose();
  for (const pending of pendingNativeRequests.values()) {
    clearTimeout(pending.timeout);
    pending.reject(new Error("Backend host is shutting down."));
  }
  pendingNativeRequests.clear();
  await shutdownBackendHost({
    steps: [
      async () => {
        await desktopServices?.dispose();
        desktopServices = null;
      },
      async () => {
        await rendererStream?.dispose();
        rendererStream = null;
      },
      () => backendHost?.disposeSupervisor(),
      async () => {
        if (flush && process.connected) await sender.flushAndWait(1_000);
      },
      () => {
        backendHost?.closeDatabase();
        backendHost = null;
      },
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
