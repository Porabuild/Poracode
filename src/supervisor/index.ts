import type { SupervisorReply, SupervisorRequest } from "@/shared/ipc";
import {
  captureSupervisorException,
  flushSupervisorSentry,
  initializeSupervisorSentry,
} from "./diagnostics/sentry";
import { createSupervisorIpcHandlers } from "./ipcHandlers";
import { SupervisorRuntime } from "./runtime";
import { configureSecretStorageKey } from "./secretStorage";

initializeSupervisorSentry({
  appVersion: process.env.LIGHTCODE_APP_VERSION ?? process.env.npm_package_version ?? "dev",
  isDev: process.env.LIGHTCODE_IS_DEV === "1" || Boolean(process.env.VITE_DEV_SERVER_URL),
});
configureSecretStorageKey(process.env.LIGHTCODE_SECRET_STORAGE_KEY);
delete process.env.LIGHTCODE_SECRET_STORAGE_KEY;

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

process.on("message", async (message: SupervisorRequest) => {
  const reply = await handleRequest(message)
    .then(
      (data): SupervisorReply => ({
        replyTo: message.id,
        ok: true,
        data,
      }),
    )
    .catch((error: unknown): SupervisorReply => {
      captureSupervisorException(error, { "lightcode.feature_area": "supervisor-ipc" });
      return {
        replyTo: message.id,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
    });

  process.send?.(reply);
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
  captureSupervisorException(error, { "lightcode.feature_area": "supervisor" });
  void flushSupervisorSentry();
});

process.on("unhandledRejection", (reason) => {
  console.error("[supervisor] unhandled rejection:", reason);
  captureSupervisorException(reason, { "lightcode.feature_area": "supervisor" });
  void flushSupervisorSentry();
});
