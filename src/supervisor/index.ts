import type { SupervisorReply, SupervisorRequest } from "@/shared/ipc";
import {
  captureSupervisorException,
  flushSupervisorSentry,
  initializeSupervisorSentry,
} from "./diagnostics/sentry";
import { startDevOrphanWatchdog } from "./devOrphanWatchdog";
import { createUncaughtStormDetector } from "./devUncaughtStorm";
import { handleSupervisorIpcFailure } from "./ipcFailure";
import { createSupervisorIpcHandlers } from "./ipcHandlers";
import { SupervisorRuntime } from "./supervisorRuntime";
import { configureSecretStorageKey } from "./secretStorage";

const isDev = process.env.PORACODE_IS_DEV === "1" || Boolean(process.env.VITE_DEV_SERVER_URL);

initializeSupervisorSentry({
  appVersion: process.env.PORACODE_APP_VERSION ?? process.env.npm_package_version ?? "dev",
  isDev,
});
configureSecretStorageKey(process.env.PORACODE_SECRET_STORAGE_KEY);
delete process.env.PORACODE_SECRET_STORAGE_KEY;

const runtime = new SupervisorRuntime((event) => {
  process.send?.(event);
});

const handlers = createSupervisorIpcHandlers(runtime);

let isShuttingDown = false;
const SUPERVISOR_SHUTDOWN_TIMEOUT_MS = 5_000;
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
    process.exit(exitCode);
  }
}

async function handleRequest(request: SupervisorRequest): Promise<unknown> {
  const handler = handlers[request.type];
  return handler(request.payload as never);
}

process.on("message", (message: SupervisorRequest) => {
  void handleRequest(message)
    .then(
      (data): SupervisorReply => ({
        replyTo: message.id,
        ok: true,
        data,
      }),
    )
    .catch((error: unknown): SupervisorReply => {
      return handleSupervisorIpcFailure(error, message.type, message.id);
    })
    .then((reply) => process.send?.(reply));
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
