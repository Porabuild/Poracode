import { writeSync } from "node:fs";

/**
 * Shared boilerplate for the standalone server/relay CLI entrypoints: idempotent
 * signal-driven shutdown and a fatal-startup-error reporter. `prefix` is the log
 * tag (e.g. `[lightcode-server]`).
 */

/**
 * Register idempotent SIGINT/SIGTERM handlers that dispose `dispose`, then run
 * `onExit` (if any) and exit 0. Callers may register extra handlers on top.
 */
export function installShutdown(
  prefix: string,
  dispose: () => Promise<void>,
  onExit?: () => void,
): void {
  let shuttingDown = false;
  const shutdown = (signal: string): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log("\n%s %s received, shutting down…", prefix, signal);
    void dispose()
      .catch((error) => console.error("%s shutdown error:", prefix, error))
      .finally(() => {
        onExit?.();
        process.exit(0);
      });
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

/**
 * Report a fatal startup error and exit 1. Writes synchronously to fd 2: a piped
 * stderr flushes asynchronously, so a console.error() immediately followed by
 * process.exit() drops the message.
 */
export function reportFatalStartupError(prefix: string, error: unknown): never {
  const detail = error instanceof Error ? (error.stack ?? error.message) : String(error);
  writeSync(2, `${prefix} failed to start: ${detail}\n`);
  process.exit(1);
}
