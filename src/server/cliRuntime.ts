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

/** Exit successfully only after confirmed disposal. A failed join — thrown
 * synchronously or rejected asynchronously — reports failure and keeps exit
 * status 1, but it must not disarm the hard deadline: surviving handles may
 * hold the owner lease only until the declared bound. When `drainDeadlineMs`
 * is set, a disposal that exceeds the deadline force-exits the process
 * (status 1): the owner lease's kernel lock is released by the exit itself, so
 * the lease is always free within the deadline — a failed or hung runtime must
 * never hold the profile hostage against `kill -TERM`.
 *
 * A fatal startup failure takes the same path via
 * {@link ShutdownControl.armFatalStartup} /
 * {@link ShutdownControl.failStartup}: its cleanup join is bounded before it
 * is awaited, so a partial runtime that hangs or retains a referenced handle
 * cannot live indefinitely without a signal. That deadline timer is unref'd —
 * it bounds an already-hung process but never keeps one alive by itself.
 *
 * The deadline is an in-process timer, so it only bounds asynchronous hangs
 * while the event loop is serviceable; it cannot preempt a synchronous wedge
 * inside disposal. A hard wall-clock guarantee against a blocked loop needs an
 * external parent/service watchdog (systemd `TimeoutStopSec`, launchd stop, or
 * a supervising wrapper), whose kill releases the lease by the exit itself.
 * Direct foreground CLI runs have no such watchdog: their only bound is the
 * in-process deadline. The managed host owns its client-facing stop
 * announcement inside its own disposal (a going-away close frame bounded by
 * the same transport grace that terminates non-cooperating sockets); nothing
 * is announced here.
 *
 * {@link ShutdownControl.uninstall} disarms signal admission and any pending
 * forced exit; production calls it only before a shutdown has started. */
export interface ShutdownControl {
  /**
   * Disarms signal admission and any pending forced exit. A caller that
   * uninstalls shutdown takes lifecycle ownership back, so this is only for a
   * startup failure whose cleanup already confirmed.
   */
  uninstall(): void;
  /**
   * Observe a startup failure before its cleanup join is awaited. Marks exit
   * status 1 and arms the same hard deadline as a signal, without reporting
   * yet: cleanup may still confirm. Idempotent; the first call owns the bound
   * and a later signal neither restarts disposal nor extends it. The deadline
   * timer is unref'd, so a process with nothing left to hold it exits
   * naturally at 1 instead of waiting out the bound.
   */
  armFatalStartup(): void;
  /**
   * Report a fatal startup whose cleanup already ran and could not confirm.
   * Never announces ready and never releases the owner: it emits the
   * size-bounded unconfirmed summary once, keeps exit status 1, and keeps the
   * armed deadline (arming it defensively when a caller skipped
   * {@link armFatalStartup}).
   */
  failStartup(error: unknown): void;
}

export function installShutdown(
  prefix: string,
  dispose: () => Promise<void>,
  options: { readonly drainDeadlineMs?: number } = {},
): ShutdownControl {
  let shuttingDown = false;
  let forced = false;
  let failureReported = false;
  let deadline: ReturnType<typeof setTimeout> | undefined;
  const drainDeadlineMs = options.drainDeadlineMs ?? DEFAULT_SHUTDOWN_DRAIN_DEADLINE_MS;
  // Armed before disposal starts and deliberately not cleared by a disposal
  // failure: the deadline is the hard bound on how long surviving handles
  // may keep the owner lease. Only a confirmed disposal clears it and exits 0.
  const armDeadline = (retainLoop: boolean): void => {
    if (deadline !== undefined) return;
    const timer = setTimeout(() => {
      forced = true;
      writeSync(
        2,
        `${prefix} shutdown drain exceeded its ${drainDeadlineMs}ms deadline; forcing exit. ` +
          "The owner lease is released by this exit. An in-process deadline cannot fire " +
          "while the event loop is blocked; service managers must enforce an external " +
          "stop timeout.\n",
      );
      process.exit(1);
    }, drainDeadlineMs);
    // A signal-driven drain must itself be able to wait out the deadline; a
    // fatal-startup deadline only bounds an already-hung process and must
    // never be the reason it stays alive.
    if (!retainLoop) unrefTimer(timer);
    deadline = timer;
  };
  const unconfirmed = (error: unknown): void => {
    if (forced) return;
    reportUnconfirmedShutdown(prefix, error);
    // The error summary and this line are both size-bounded, so the whole
    // failure diagnostic stays small however large the thrown value is.
    writeSync(
      2,
      `${prefix} cleanup did not confirm; the ${drainDeadlineMs}ms hard deadline stays armed.\n`,
    );
  };
  const armFatalStartup = (): void => {
    // A startup that reached its catch has already failed: the process must
    // exit 1 even if nothing holds the loop and the deadline never gets to
    // fire.
    process.exitCode = 1;
    if (shuttingDown) return;
    shuttingDown = true;
    armDeadline(false);
  };
  const shutdown = (signal: string): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log("\n%s %s received, shutting down…", prefix, signal);
    armDeadline(true);
    try {
      // Close startup/runtime admission within the signal callback itself.
      void dispose().then(() => {
        if (forced) return;
        clearTimeout(deadline);
        process.exit(0);
      }, unconfirmed);
    } catch (error) {
      unconfirmed(error);
    }
  };
  const interrupt = () => shutdown("SIGINT");
  const terminate = () => shutdown("SIGTERM");
  process.on("SIGINT", interrupt);
  process.on("SIGTERM", terminate);
  return {
    uninstall(): void {
      // A caller that uninstalls shutdown takes lifecycle ownership back, so a
      // pending forced exit is disarmed. Production calls this only before any
      // shutdown has started (a startup failure whose cleanup confirmed); a
      // failed drain that keeps its deadline is never followed by uninstall.
      process.off("SIGINT", interrupt);
      process.off("SIGTERM", terminate);
      if (deadline !== undefined) {
        clearTimeout(deadline);
        deadline = undefined;
      }
    },
    armFatalStartup,
    failStartup(error: unknown): void {
      armFatalStartup();
      if (failureReported || forced) return;
      failureReported = true;
      unconfirmed(error);
    },
  };
}

/** Unref a timer when the runtime exposes the Node timeout object. The DOM
 * `setTimeout` typing does not have `unref`, so the check is structural. */
function unrefTimer(timer: ReturnType<typeof setTimeout>): void {
  if (typeof timer === "object" && timer !== null && "unref" in timer) {
    (timer as { unref(): void }).unref();
  }
}

/** Character bound for one unconfirmed-shutdown error summary. */
const MAX_UNCONFIRMED_ERROR_CHARS = 512;
/** Stack-line bound for one unconfirmed-shutdown error summary. */
const MAX_UNCONFIRMED_ERROR_STACK_LINES = 5;

/**
 * Bounded text for the unconfirmed-shutdown diagnostic. An arbitrary thrown
 * value can carry an unbounded message/stack or be a cyclic object graph, and
 * passing it to `console.error` inspects the whole object; this keeps the
 * error name, code, message and a few leading stack lines only.
 */
export function summarizeUnconfirmedError(error: unknown): string {
  if (error instanceof Error) {
    const code = (error as { readonly code?: unknown }).code;
    const codeSuffix =
      typeof code === "string" || typeof code === "number" ? ` (code ${String(code)})` : "";
    const stack = (
      typeof error.stack === "string" && error.stack.length > 0 ? error.stack : error.message
    ).slice(0, MAX_UNCONFIRMED_ERROR_CHARS);
    const lines = stack.split("\n");
    const shown = lines.slice(0, MAX_UNCONFIRMED_ERROR_STACK_LINES).join("\n");
    const stackTruncated = lines.length > MAX_UNCONFIRMED_ERROR_STACK_LINES ? "\n…" : "";
    return boundUnconfirmedDiagnostic(`${error.name}${codeSuffix}: ${shown}${stackTruncated}`);
  }
  if (typeof error === "string") return boundUnconfirmedDiagnostic(error);
  if (error === null) return "null";
  if (error === undefined) return "undefined";
  switch (typeof error) {
    case "number":
    case "bigint":
    case "boolean":
    case "symbol":
      return String(error);
    default:
      // Never inspect an arbitrary object graph (potentially huge, cyclic or
      // getter-ridden); the type tag is enough to identify the thrown value.
      return Object.prototype.toString.call(error);
  }
}

function boundUnconfirmedDiagnostic(text: string): string {
  return text.length <= MAX_UNCONFIRMED_ERROR_CHARS
    ? text
    : `${text.slice(0, MAX_UNCONFIRMED_ERROR_CHARS)}…[truncated]`;
}

/** Keep live resource handles and their owner lease intact after a failed
 * join. This never exits early and never releases anything: the caller's hard
 * deadline (when armed) remains the bound on how long the retention lasts.
 * The reported error is reduced to a size-bounded summary
 * ({@link summarizeUnconfirmedError}). */
export function reportUnconfirmedShutdown(prefix: string, error: unknown): void {
  process.exitCode = 1;
  console.error("%s shutdown remains unconfirmed: %s", prefix, summarizeUnconfirmedError(error));
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
