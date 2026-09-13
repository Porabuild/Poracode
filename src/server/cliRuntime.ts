import { writeSync } from "node:fs";

/**
 * Shared boilerplate for the standalone server/relay CLI entrypoints: idempotent
 * signal-driven shutdown and a fatal-startup-error reporter. `prefix` is the log
 * tag (e.g. `[poracode-server]`).
 */

/**
 * Exit successfully only after confirmed disposal. A failed join sets failure
 * status without forcing exit while resources may still be active.
 */
export function installShutdown(prefix: string, dispose: () => Promise<void>): () => void {
  let shuttingDown = false;
  const shutdown = (signal: string): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log("\n%s %s received, shutting down…", prefix, signal);
    try {
      // Close startup/runtime admission within the signal callback itself.
      void dispose().then(
        () => process.exit(0),
        (error: unknown) => reportUnconfirmedShutdown(prefix, error),
      );
    } catch (error) {
      reportUnconfirmedShutdown(prefix, error);
    }
  };
  const interrupt = () => shutdown("SIGINT");
  const terminate = () => shutdown("SIGTERM");
  process.on("SIGINT", interrupt);
  process.on("SIGTERM", terminate);
  return () => {
    process.off("SIGINT", interrupt);
    process.off("SIGTERM", terminate);
  };
}

/** Keep live resource handles and their owner lease intact after a failed join. */
export function reportUnconfirmedShutdown(prefix: string, error: unknown): void {
  process.exitCode = 1;
  console.error("%s shutdown remains unconfirmed:", prefix, error);
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
