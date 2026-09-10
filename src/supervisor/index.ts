import type {
  SupervisorFlowControl,
  SupervisorOutputShedSignal,
  SupervisorReply,
  SupervisorRequest,
} from "@/shared/ipc";
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
import { SupervisorIpcSender } from "./supervisorIpcSender";

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
const ipcSender = new SupervisorIpcSender<SupervisorOutputShedSignal>({
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
});
const runtime = new SupervisorRuntime((event) => ipcSender.emit(event));

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
  try {
    await Promise.race([
      runtime.disposeAsync(),
      new Promise<void>((resolve) => setTimeout(resolve, SUPERVISOR_SHUTDOWN_TIMEOUT_MS)),
    ]);
  } finally {
    if (process.connected) {
      const drained = await ipcSender.flushAndWait(SUPERVISOR_IPC_FLUSH_TIMEOUT_MS);
      if (!drained) console.error("[supervisor] IPC queue did not drain before shutdown.");
    }
    process.exit(exitCode);
  }
}

async function handleRequest(request: SupervisorRequest): Promise<unknown> {
  const handler = handlers[request.type];
  return handler(request.payload as never);
}

process.on("message", (message: SupervisorRequest | SupervisorFlowControl) => {
  if ("control" in message) {
    // P1-2: downstream pressure sheds rebuildable terminal output at the
    // source; PTYs keep running so agent processes never stall on a full
    // kernel buffer behind a slow consumer.
    ipcSender.setEagerShed(message.paused);
    return;
  }
  void handleRequest(message)
    .then((data): SupervisorReply => ({
      replyTo: message.id,
      ok: true,
      data,
    }))
    .catch((error: unknown): SupervisorReply => {
      return handleSupervisorIpcFailure(error, message.type, message.id);
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
