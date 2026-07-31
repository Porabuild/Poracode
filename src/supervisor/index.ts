import type { SupervisorReply, SupervisorRequest } from "@/shared/ipc";
import {
  captureSupervisorException,
  flushSupervisorSentry,
  initializeSupervisorSentry,
} from "./diagnostics/sentry";
import { handleSupervisorIpcFailure } from "./ipcFailure";
import { createSupervisorIpcHandlers } from "./ipcHandlers";
import { SupervisorRuntime } from "./supervisorRuntime";
import { configureSecretStorageKey } from "./secretStorage";

initializeSupervisorSentry({
  appVersion: process.env.PORACODE_APP_VERSION ?? process.env.npm_package_version ?? "dev",
  isDev: process.env.PORACODE_IS_DEV === "1" || Boolean(process.env.VITE_DEV_SERVER_URL),
});
configureSecretStorageKey(process.env.PORACODE_SECRET_STORAGE_KEY);
delete process.env.PORACODE_SECRET_STORAGE_KEY;

const runtime = new SupervisorRuntime((event) => {
  process.send?.(event);
});

const handlers = createSupervisorIpcHandlers(runtime);

let isShuttingDown = false;
const SUPERVISOR_SHUTDOWN_TIMEOUT_MS = 5_000;

async function shutdownSupervisor(exitCode = 0): Promise<void> {
  if (isShuttingDown) {
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

process.on("uncaughtException", (error) => {
  console.error("[supervisor] uncaught exception:", error);
  captureSupervisorException(error, { "poracode.feature_area": "supervisor" });
  void flushSupervisorSentry();
});

process.on("unhandledRejection", (reason) => {
  console.error("[supervisor] unhandled rejection:", reason);
  captureSupervisorException(reason, { "poracode.feature_area": "supervisor" });
  void flushSupervisorSentry();
});
