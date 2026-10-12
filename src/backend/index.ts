import { AsyncWorkTracker } from "@/shared/asyncWorkTracker";
import { startNodePerformanceDiagnostics } from "@/shared/diagnostics/nodePerformanceDiagnostics";
import { configureSecretStorageKey } from "@/shared/secretStorage";
import {
  BACKEND_HOST_PROTOCOL_VERSION,
  isBackendHostRequest,
  type BackendHostOutboundMessage,
  type BackendHostReply,
  type BackendHostRequest,
} from "@/shared/backendHostProtocol";
import { BackendHostCore } from "./BackendHostCore";
import { BackendDesktopServices } from "./BackendDesktopServices";
import { composeBackendEnvironments } from "./BackendEnvironments";
import type { ComposedHostEnvironments } from "@/host/environments/composeHostEnvironments";
import { BackendNativeRequests } from "./BackendNativeRequests";
import { createNativeThreadActivityProjection } from "./nativeThreadActivity";
import { shutdownBackendHost } from "./shutdown";
import { joinRuntimeShutdown } from "./joinRuntimeShutdown";
import { callDatabaseRpc } from "@/host/db/databaseRpc";
import { getRuntimePersistenceSample } from "@/host/db/runtimePersistenceRuntime";
import { SupervisorIpcSender } from "@/supervisor/supervisorIpcSender";
import type { SupervisorEvent } from "@/shared/ipc";

/** Bare wholesale-replace RPCs refused at the mutation owner (see the
 * `call-database` case); the host-internal DB functions stay available to the
 * compositions that own their database in-process. */
const WHOLESALE_RUNTIME_REPLACE_RPC: ReadonlySet<string> = new Set([
  "dbReplaceThreadRuntimeItems",
  "dbReplaceThreadCompletedTurns",
  "dbReplaceThreadRuntimeSnapshot",
]);

const performanceDiagnostics = startNodePerformanceDiagnostics("backend", process.env, {
  // B1: additive bounded-persistence evidence on the existing sample lines.
  sampleRuntimePersistence: () => getRuntimePersistenceSample(),
});
let backendHost: BackendHostCore | null = null;
let desktopServices: BackendDesktopServices | null = null;
let environments: ComposedHostEnvironments | null = null;
let supervisorExtraEnv: Record<string, string> = {};
const requests = new AsyncWorkTracker();
const initialization = new AsyncWorkTracker();
let shuttingDown = false;
let acceptingRequests = true;
let runtimeStop: Promise<void> | null = null;
let runtimeWorkJoined = false;

function stopRuntimeWork(): Promise<void> {
  if (runtimeStop) return runtimeStop;
  acceptingRequests = false;
  nativeThreadActivity.dispose();
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
        () => environments?.dispose(),
        () => backendHost?.disposeSupervisor(),
        () => requests.drain(),
      ]);
    } finally {
      await nativeRequests.drain();
    }
    runtimeWorkJoined = true;
  })().then(barrier.resolve, barrier.reject);
  return runtimeStop;
}

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
  // A2: nothing bulk crosses this channel anymore, so there is nothing to shed
  // oldest-first. The default sender policy is fail-closed: a stalled main is
  // reported as an error instead of silently discarding native state. Main-IPC
  // congestion can no longer pause the shared supervisor (no producer
  // backpressure is derived from this channel), and remote clients keep being
  // served by the host's own server.
  backpressureTimeoutMs: null,
});

/**
 * Single observe path for supervisor events inside the backend host. Durable
 * and remote observers keep their interests; the only state that crosses to
 * main is the bounded, coalesced native activity projection (A2). The former
 * desktop-IPC bulk relay and its interest router are gone.
 */
function observeSupervisorEvent(event: SupervisorEvent): void {
  desktopServices?.observeSupervisorEvent(event);
  nativeThreadActivity.observe(event);
}

const nativeThreadActivity = createNativeThreadActivityProjection({
  emit: (changes) =>
    send({ version: BACKEND_HOST_PROTOCOL_VERSION, kind: "native-thread-activity", changes }),
});
performanceDiagnostics?.observeIpcQueue("backend-to-main", () => sender.getQueueDiagnostics());

// ── Diagnostics exposure (Gate 4 Batch 1, G1) ────────────────────
// Read-only, opt-in describe handle. The harness reads it two ways, both
// dev/opt-in only:
//   1. CDP on the backend inspector: globalThis.__poracodeBackendDiagnostics
//   2. a `{ kind: "backend-diagnostics-describe", id }` dev IPC message,
//      intercepted BEFORE the strict backend-host protocol gate below.
// With PORACODE_BACKEND_DIAGNOSTICS unset (every production and normal dev
// run) neither surface exists and the message path is byte-identical to
// before. The payload is counters and process identity only — never tokens,
// URLs, message content, or paths. (The renderer-stream health counters that
// this handle originally exposed left with the deleted stream leg, V5 2.5.)
const diagnosticsDescribeEnabled = process.env.PORACODE_BACKEND_DIAGNOSTICS === "1";

function describeBackendDiagnostics(): Record<string, unknown> {
  return {
    role: "backend",
    pid: process.pid,
    perfRecorderActive: performanceDiagnostics !== undefined,
  };
}

if (diagnosticsDescribeEnabled) {
  (globalThis as Record<string, unknown>).__poracodeBackendDiagnostics = {
    describe: describeBackendDiagnostics,
  };
}

function isBackendDiagnosticsDescribe(message: unknown): message is { id: string } {
  if (typeof message !== "object" || message === null) return false;
  const input = message as Record<string, unknown>;
  return (
    input.kind === "backend-diagnostics-describe" &&
    input.version === BACKEND_HOST_PROTOCOL_VERSION &&
    typeof input.id === "string"
  );
}

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
      observeSupervisorEvent(event);
    },
    onSupervisorOutputShed: (threadIds) => {
      // The supervisor shed terminal-output batches in transit; the events
      // never persisted. Remote clients must resynchronize those threads from
      // the supervisor's authoritative PTY scrollback over the WS
      // `resync-required` path (headless parity). The old `thread-scrollback-
      // resync` supervisor event targeted a main consumer that no longer
      // existed after V6 B.6 and is deleted with the relay (A2).
      desktopServices?.handleSupervisorOutputShed();
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
        observeSupervisorEvent(event);
      }
      send({
        version: BACKEND_HOST_PROTOCOL_VERSION,
        kind: "supervisor-reset",
      });
    },
    onRuntimeGapAcknowledged: (threadId) => {
      // B1 durable-gap acknowledgement committed: publication-only recovery
      // (the local renderer already gets `thread-reset` through `onEvent`, and
      // remote clients resync). This must never re-enter supervisor-event
      // persistence, which would erase committed transcript bytes.
      desktopServices?.handleRuntimeGapAcknowledged(threadId);
    },
  });
  environments = await composeBackendEnvironments(request.payload, backendHost);
  desktopServices = new BackendDesktopServices({
    initialize: request.payload,
    host: backendHost,
    ...(environments ? { environments: environments.runtimeService } : {}),
    requestNative,
    reportError,
    emitNativeEvent: (event) =>
      send({ version: BACKEND_HOST_PROTOCOL_VERSION, kind: "native-event", event }),
  });
  if (!acceptingRequests) throw new Error("Backend host is shutting down.");
  return null;
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
  environments = null;
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
      // A2 removed the relay whose terminal-bootstrap interest window this
      // request origin used to widen; terminal delivery is `terminal-watch`-
      // scoped on the loopback WS, so there is no backend-side bootstrap
      // retention left to scope. The desktop composition additionally guards
      // the experiment worktree preparation at this existing call boundary
      // (stale-ownership refusal + in-flight coordination with project
      // removal); every other procedure passes straight through.
      return await (desktopServices
        ? desktopServices.callSupervisor(supervisorRequest.type, supervisorRequest.payload as never)
        : host.supervisorClient.call(supervisorRequest.type, supervisorRequest.payload as never));
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
      // Wholesale runtime replacement is likewise intercepted at the request
      // owner — and refused, because unlike a truncate it has no truthful
      // broadcast: a replace can rewrite arbitrary positions, and the runtime
      // event contract has no `replaced` variant (fabricating item events or a
      // lying `runtime.truncated` would desync every other window and remote
      // client). Nothing in the product calls these RPCs (the remote path
      // serves its runtime mirror locally; the compound checkpoint revert owns
      // rollbacks), so the bare call loud-rejects instead of bypassing the
      // per-thread mutation owner and resurrecting a truncated tail mid-revert.
      if (WHOLESALE_RUNTIME_REPLACE_RPC.has(request.payload.name)) {
        throw new Error(
          `Database RPC '${request.payload.name}' is not served: the backend host owns ` +
            "thread runtime mutations. Roll back through the checkpoint revert operation; " +
            "runtime state arrives through runtime events, not wholesale client replaces.",
        );
      }
      const result = await callDatabaseRpc(request.payload);
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
    case "browser-event":
      desktopServices?.publishBrowserEvent(request.payload);
      return null;
  }
}

process.on("message", (message: unknown) => {
  // Opt-in dev describe handle (see the diagnostics exposure region above).
  if (diagnosticsDescribeEnabled && isBackendDiagnosticsDescribe(message)) {
    replySuccess(message.id, describeBackendDiagnostics());
    return;
  }
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
  nativeRequests.cancel(new Error("Backend host is shutting down."));
  await shutdownBackendHost({
    steps: [
      async () => {
        await stopRuntimeWork();
        desktopServices = null;
        environments = null;
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
