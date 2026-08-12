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
  onBackpressureChange: (paused) => {
    backendHost?.supervisorClient.setOutputBackpressured(paused);
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
      const rendererDelivery = rendererStream?.publish(event);
      const rendererDeliveredDirect = rendererDelivery?.delivered ?? false;
      desktopServices?.observeSupervisorEvent(event);
      const filtered = eventRouter.filter(event);
      if (!filtered) return;
      if (rendererDeliveredDirect && isBulkRendererEvent(filtered)) return;
      send({
        version: BACKEND_HOST_PROTOCOL_VERSION,
        kind: "supervisor-event",
        event: filtered,
        ...(rendererDelivery ? { rendererSequence: rendererDelivery.sequence } : {}),
        ...(rendererDeliveredDirect ? { rendererDeliveredDirect: true } : {}),
      });
    },
    onReset: () => {
      for (const event of desktopServices?.markLiveThreadsInactive() ?? []) {
        const filtered = eventRouter.filter(event);
        if (filtered) {
          const rendererDelivery = rendererStream?.publish(filtered);
          const rendererDeliveredDirect = rendererDelivery?.delivered ?? false;
          send({
            version: BACKEND_HOST_PROTOCOL_VERSION,
            kind: "supervisor-event",
            event: filtered,
            ...(rendererDelivery ? { rendererSequence: rendererDelivery.sequence } : {}),
            ...(rendererDeliveredDirect ? { rendererDeliveredDirect: true } : {}),
          });
        }
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
      const result = callDatabaseRpc(request.payload);
      desktopServices?.databaseChanged(request.payload);
      return result;
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
  await desktopServices?.dispose();
  desktopServices = null;
  await rendererStream?.dispose();
  rendererStream = null;
  backendHost?.disposeSupervisor();
  if (flush && process.connected) await sender.flushAndWait(1_000);
  backendHost?.closeDatabase();
  backendHost = null;
  process.exit(exitCode);
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

function isBulkRendererEvent(event: import("@/shared/ipc").SupervisorEvent): boolean {
  return (
    event.type === "thread-output" ||
    event.type === "thread-runtime-event" ||
    event.type === "thread-runtime-events" ||
    event.type === "thread-runtime-events-multi"
  );
}
