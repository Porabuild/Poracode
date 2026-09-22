import {
  isSupervisorFlowControl,
  SUPERVISOR_EVENT_BACKPRESSURE_VERSION,
  type SupervisorFlowControlCapabilities,
  type SupervisorOutputShedSignal,
  type SupervisorReply,
  type SupervisorRequest,
} from "@/shared/ipc";
import { startNodePerformanceDiagnostics } from "@/shared/diagnostics/nodePerformanceDiagnostics";
import {
  captureSupervisorException,
  flushSupervisorSentry,
  initializeSupervisorSentry,
} from "./diagnostics/sentry";
import { startDevOrphanWatchdog } from "./devOrphanWatchdog";
import { createUncaughtStormDetector } from "./devUncaughtStorm";
import { handleSupervisorIpcFailure } from "./ipcFailure";
import { createSupervisorIpcHandlers } from "./ipcHandlers";
import { createSupervisorOutputShedPolicy } from "./supervisorShedPolicy";
import { SupervisorRuntime } from "./supervisorRuntime";
import { configureSecretStorageKey } from "./secretStorage";
import { RUNTIME_EVENT_MAX_SINGLE_EVENT_BYTES } from "./runtime/threadSession/runtimeEventBuffer";
import { SupervisorIpcSender } from "./supervisorIpcSender";

const performanceDiagnostics = startNodePerformanceDiagnostics("supervisor");
const isDev = process.env.PORACODE_IS_DEV === "1" || Boolean(process.env.VITE_DEV_SERVER_URL);

initializeSupervisorSentry({
  appVersion: process.env.PORACODE_APP_VERSION ?? process.env.npm_package_version ?? "dev",
  isDev,
});
configureSecretStorageKey(process.env.PORACODE_SECRET_STORAGE_KEY);
delete process.env.PORACODE_SECRET_STORAGE_KEY;

// The backend host is a replaceable consumer: a transient stall there must
// never kill the supervisor (and with it every agent process). Terminal-output
// batches — the only traffic the supervisor can authoritatively re-serve — are
// shed oldest-first under overflow, announced by a supervisor-output-shed
// signal the backend turns into client resyncs; all other traffic stays
// fail-closed, and the fatal backpressure timer is disabled outright because
// a dead backend host is already handled by the disconnect path. Downstream
// pressure (P1-2) sheds those batches at the source instead of pausing PTYs:
// pausing would block agent processes on a full kernel PTY buffer, while the
// shed + recovery signal lets every client converge from authoritative state.
let shedLogCount = 0;
let shedLogBytes = 0;
let shedLogAt = 0;
let canonicalDroppedCount = 0;
let canonicalDroppedBytes = 0;
const ipcSender = new SupervisorIpcSender<
  SupervisorOutputShedSignal | SupervisorFlowControlCapabilities
>({
  ...(performanceDiagnostics ? { queueDiagnostics: performanceDiagnostics.queueCapture } : {}),
  send: (message, callback) => {
    if (!process.connected || !process.send) {
      callback(new Error("Supervisor IPC channel is disconnected."));
      return true;
    }
    return process.send(message, callback);
  },
  onError: (error) => {
    if (process.connected) console.error("[supervisor] IPC send failed:", error);
  },
  onFatalError: () => {
    void shutdownSupervisor(1);
  },
  backpressureTimeoutMs: null,
  shedPolicy: createSupervisorOutputShedPolicy(),
  onMessagesShed: ({ count, bytes }) => {
    shedLogCount += count;
    shedLogBytes += bytes;
    const now = Date.now();
    if (shedLogAt !== 0 && now - shedLogAt < 5_000) return;
    shedLogAt = now;
    console.error(
      `[supervisor] shed ${shedLogCount} queued terminal-output batches (${shedLogBytes} bytes) under backend-IPC backpressure; output-shed recovery signals emitted.`,
    );
    shedLogCount = 0;
    shedLogBytes = 0;
  },
  // B1: canonical runtime envelopes must not kill every session on the host's
  // IPC overflow. Stop only the affected producers; the explicit stop plus the
  // dropped-envelope diagnostic is the reported failure.
  onCanonicalOverflow: (error, message) => {
    console.error(
      `[supervisor] canonical runtime envelope overflow: ${error.message}; stopping affected sessions.`,
    );
    runtime.threadSessionManager.handleCanonicalSenderOverflow(message);
  },
  onCanonicalDropped: ({ bytes, type }) => {
    canonicalDroppedCount += 1;
    canonicalDroppedBytes += bytes;
    if (canonicalDroppedCount === 1 || canonicalDroppedCount % 100 === 0) {
      console.error(
        `[supervisor] dropped ${canonicalDroppedCount} canonical envelope(s) (${canonicalDroppedBytes} bytes) after stopping their producers; last type "${type}".`,
      );
    }
  },
  // Credit/ack changed (grant, ack, local drop, channel drain): producers held
  // by an exhausted window flush exactly the bytes that now fit.
  onCanonicalCapacityChange: (remainingBytes) => {
    if (!runtimeReady) return;
    runtime.threadSessionManager.setCanonicalCreditCapacity(remainingBytes);
  },
});
performanceDiagnostics?.observeIpcQueue("supervisor-to-host", () =>
  ipcSender.getQueueDiagnostics(),
);
let runtimeReady = false;
const runtime = new SupervisorRuntime((event, meta) => ipcSender.emit(event, meta), {
  canonicalCapacity: () => ipcSender.canonicalCreditRemaining(),
});
runtimeReady = true;

// B1 compatibility boundary: advertise the flow-control vocabulary this build
// understands before the host may send `set-event-backpressure`. The host only
// sends that control to a peer that advertised version 1, so a legacy
// supervisor never misreads it as terminal-output pressure. The canonical
// fields describe the true retained bound for the host's pause arithmetic and
// the credit-accounting capability; the boot generation fences stale acks.
const senderLimits = ipcSender.configuredLimits;
ipcSender.sendMessage({
  kind: "supervisor-flow-control-capabilities",
  versions: [SUPERVISOR_EVENT_BACKPRESSURE_VERSION],
  maxInFlightBytes:
    senderLimits.bulkBytes +
    senderLimits.controlReserveBytes +
    RUNTIME_EVENT_MAX_SINGLE_EVENT_BYTES,
  maxEnvelopeBytes: RUNTIME_EVENT_MAX_SINGLE_EVENT_BYTES,
  supportsCanonicalCredit: true,
  canonicalFlowGeneration: ipcSender.getCanonicalFlowGeneration(),
});

const handlers = createSupervisorIpcHandlers(runtime);

let isShuttingDown = false;
const SUPERVISOR_SHUTDOWN_TIMEOUT_MS = 5_000;
const SUPERVISOR_IPC_FLUSH_TIMEOUT_MS = 1_000;
const DEV_SHUTDOWN_REPEAT_FORCE_EXIT_MS = 250;

async function shutdownSupervisor(exitCode = 0): Promise<void> {
  if (isShuttingDown) {
    if (isDev) {
      // Dev-only: a repeated disconnect/signal means the first shutdown has
      // not finished yet. Force the exit instead of no-opping so a soft kill
      // can never look hung.
      setTimeout(() => process.exit(exitCode), DEV_SHUTDOWN_REPEAT_FORCE_EXIT_MS).unref();
    }
    return;
  }
  isShuttingDown = true;
  let finalExitCode = exitCode;
  try {
    await Promise.race([
      runtime.disposeAsync(),
      new Promise<void>((resolve) => setTimeout(resolve, SUPERVISOR_SHUTDOWN_TIMEOUT_MS)),
    ]);
  } catch (error) {
    finalExitCode = 1;
    console.error("[supervisor] shutdown was not confirmed:", error);
  } finally {
    if (process.connected) {
      const drained = await ipcSender.flushAndWait(SUPERVISOR_IPC_FLUSH_TIMEOUT_MS);
      if (!drained) console.error("[supervisor] IPC queue did not drain before shutdown.");
    }
    await performanceDiagnostics?.stop();
    process.exit(finalExitCode);
  }
}

async function handleRequest(request: SupervisorRequest): Promise<unknown> {
  const handler = handlers[request.type];
  return handler(request.payload as never);
}

process.on("message", (message: SupervisorRequest | unknown) => {
  if (isSupervisorFlowControl(message)) {
    switch (message.control) {
      case "set-output-backpressure":
        // P1-2: downstream pressure sheds rebuildable terminal output at the
        // source; PTYs keep running so agent processes never stall on a full
        // kernel buffer behind a slow consumer.
        ipcSender.setEagerShed(message.paused);
        return;
      case "set-event-backpressure":
        // B1: host persistence health. Canonical runtime envelopes are held in
        // the bounded per-thread buffer; sessions whose buffer reaches its cap
        // stop explicitly (no silent drop, no whole-supervisor failure).
        if (message.canonicalCreditBytes !== undefined) {
          ipcSender.setCanonicalCredit({
            windowBytes: message.canonicalCreditBytes,
            ...(message.canonicalAckSeq !== undefined &&
            message.canonicalFlowGeneration !== undefined
              ? { ackSeq: message.canonicalAckSeq, generation: message.canonicalFlowGeneration }
              : {}),
          });
        } else if (
          message.canonicalAckSeq !== undefined &&
          message.canonicalFlowGeneration !== undefined
        ) {
          ipcSender.acknowledgeCanonicalFlow(
            message.canonicalAckSeq,
            message.canonicalFlowGeneration,
          );
        }
        runtime.threadSessionManager.setCanonicalEventBackpressure(
          message.paused,
          message.threadIds,
        );
        return;
      case "ack-canonical-flow":
        // Only sent to a credit-capable peer; a generation mismatch ignores the
        // ack rather than freeing ledger bytes this boot never emitted.
        ipcSender.acknowledgeCanonicalFlow(message.ackSeq, message.generation);
        return;
      default:
        // Unknown control from a newer parent: ignore rather than misapply.
        return;
    }
  }
  if (
    typeof message !== "object" ||
    message === null ||
    !("id" in message) ||
    !("type" in message)
  ) {
    return;
  }
  const request = message as SupervisorRequest;
  void handleRequest(request)
    .then((data): SupervisorReply => ({
      replyTo: request.id,
      ok: true,
      data,
    }))
    .catch((error: unknown): SupervisorReply => {
      return handleSupervisorIpcFailure(error, request.type, request.id);
    })
    .then((reply) => ipcSender.reply(reply));
});

process.on("disconnect", () => {
  void shutdownSupervisor(0);
});

process.on("SIGINT", () => {
  void shutdownSupervisor(0);
});

process.on("SIGTERM", () => {
  void shutdownSupervisor(0);
});

if (isDev) {
  startDevOrphanWatchdog({
    requestShutdown: () => {
      void shutdownSupervisor(1);
    },
  });
}

const devUncaughtStorm = createUncaughtStormDetector({ limit: 3, windowMs: 10_000 });

process.on("uncaughtException", (error) => {
  console.error("[supervisor] uncaught exception:", error);
  captureSupervisorException(error, { "poracode.feature_area": "supervisor" });
  // Dev-only: a rapid burst of uncaught exceptions means the event loop is
  // stuck re-throwing (observed wedging orphaned dev supervisors at 100%
  // CPU). Exit instead of lingering; the main-process client restarts
  // non-zero exits, surfacing the failure in the dev console.
  if (isDev && devUncaughtStorm.record(Date.now())) {
    console.error("[supervisor] uncaught exception storm detected; exiting");
    setTimeout(() => process.exit(1), 1_500).unref();
    void flushSupervisorSentry(750).finally(() => process.exit(1));
    return;
  }
  void flushSupervisorSentry();
});

process.on("unhandledRejection", (reason) => {
  console.error("[supervisor] unhandled rejection:", reason);
  captureSupervisorException(reason, { "poracode.feature_area": "supervisor" });
  void flushSupervisorSentry();
});
