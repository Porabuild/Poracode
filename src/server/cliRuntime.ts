import { writeSync } from "node:fs";

/**
 * Shared boilerplate for the standalone server/relay CLI entrypoints: idempotent
 * signal-driven shutdown with a bounded drain, process-fatal error handlers,
 * and a fatal-startup-error reporter. `prefix` is the log tag (e.g.
 * `[poracode-server]`).
 */

/** Default SIGTERM drain deadline (plan item 4.9, finding H7): signal-driven
 * disposal gets this long before the process force-exits. Documented in
 * docs/STANDALONE_SERVER.md and overridable per deployment via
 * `PORACODE_SHUTDOWN_DRAIN_DEADLINE_MS` / the server config file. */
export const DEFAULT_SHUTDOWN_DRAIN_DEADLINE_MS = 10_000;

/** Exit successfully only after confirmed disposal. A failed join sets failure
 * status without forcing exit while resources may still be active. When
 * `drainDeadlineMs` is set, a disposal that exceeds the deadline force-exits
 * the process (status 1): the owner lease's kernel lock is released by the
 * exit itself, so the lease is always free within the deadline — a hung
 * runtime must never hold the profile hostage against `kill -TERM`. */
export function installShutdown(
  prefix: string,
  dispose: () => Promise<void>,
  options: { readonly drainDeadlineMs?: number } = {},
): () => void {
  let shuttingDown = false;
  const shutdown = (signal: string): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log("\n%s %s received, shutting down…", prefix, signal);
    const drainDeadlineMs = options.drainDeadlineMs ?? DEFAULT_SHUTDOWN_DRAIN_DEADLINE_MS;
    let forced = false;
    const deadline = setTimeout(() => {
      forced = true;
      writeSync(
        2,
        `${prefix} shutdown drain exceeded its ${drainDeadlineMs}ms deadline; forcing exit. ` +
          "The owner lease is released by this exit.\n",
      );
      process.exit(1);
    }, drainDeadlineMs);
    try {
      // Close startup/runtime admission within the signal callback itself.
      void dispose().then(
        () => {
          if (forced) return;
          clearTimeout(deadline);
          process.exit(0);
        },
        (error: unknown) => {
          if (forced) return;
          clearTimeout(deadline);
          reportUnconfirmedShutdown(prefix, error);
        },
      );
    } catch (error) {
      clearTimeout(deadline);
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

export interface FatalErrorHandlersOptions {
  /** Called before the forced exit so a log sink can mirror the entry
   * (synchronous implementations only — the process exits right after). */
  readonly onFatal?: (level: "error", message: string, error: unknown) => void;
  /** Sync drain (audit log, etc.) immediately before `process.exit`. */
  readonly flushSync?: () => void;
  /** Install `unhandledRejection` handling too (default true). Node's default
   * already turns unhandled rejections into crashes; handling them here keeps
   * one structured report + stderr line as the single exit path. */
  readonly rejections?: boolean;
}

export interface FatalErrorHandlersHandle {
  uninstall(): void;
}

/**
 * Process-fatal error handlers for a long-running server process (plan item
 * 4.9): `uncaughtException` (and by default `unhandledRejection`) report one
 * structured entry + one stderr line and force-exit 1. An owner lease's
 * kernel lock is released by the exit; hanging around with corrupted state is
 * never the better option for a host.
 */
export function installFatalErrorHandlers(
  prefix: string,
  options: FatalErrorHandlersOptions = {},
): FatalErrorHandlersHandle {
  const report = (what: string, error: unknown): void => {
    const detail = error instanceof Error ? (error.stack ?? error.message) : String(error);
    options.onFatal?.("error", `${prefix} ${what}`, error);
    writeSync(2, `${prefix} ${what}:\n${detail}\n`);
  };
  const uncaughtException = (error: unknown): void => {
    report("uncaught exception", error);
    try {
      options.flushSync?.();
    } catch {
      // last-resort drain must never mask the fatal exit
    }
    process.exit(1);
  };
  const unhandledRejection = (reason: unknown): void => {
    report("unhandled rejection", reason);
    try {
      options.flushSync?.();
    } catch {
      // last-resort drain must never mask the fatal exit
    }
    process.exit(1);
  };
  process.on("uncaughtException", uncaughtException);
  if (options.rejections !== false) process.on("unhandledRejection", unhandledRejection);
  return {
    uninstall(): void {
      process.off("uncaughtException", uncaughtException);
      if (options.rejections !== false) process.off("unhandledRejection", unhandledRejection);
    },
  };
}
