/**
 * Signal handling for the launcher's supervised server child.
 *
 * POSIX: every terminating signal is forwarded to the child, which drains and
 * exits; the launcher then re-raises the child's signal on itself so a shell
 * sees the conventional signal exit status.
 *
 * Windows has no real signals. `child.kill("SIGTERM")` is `TerminateProcess`
 * (an immediate hard kill with no drain), and Ctrl+C is delivered by the
 * console to every process in the group, child included. So on win32:
 * - SIGINT is a no-op here (the console already reached the child),
 * - SIGTERM / SIGBREAK / SIGHUP (window close, logoff, Ctrl+Break) ask the
 *   server to drain through its own `stop` command, then hard-kill the child
 *   only if it is still alive after the drain deadline plus a margin,
 * - the launcher exits with a code instead of killing itself.
 *
 * The graceful `stop` addresses the profile's running owner, so it is only
 * requested when the child is itself a `serve` invocation. Every other
 * subcommand (doctor, status, backup, upgrade, ...) is a short-lived client:
 * a console signal must end that child alone and never drain an unrelated
 * running daemon. The launcher cannot cheaply tell whether a `serve` child won
 * ownership or lost it to an existing daemon, so that case still asks the
 * owner to stop (a documented limitation, bounded by the server's own auth).
 */
import { spawn } from "node:child_process";
import { constants as osConstants } from "node:os";

export const POSIX_FORWARDED_SIGNALS = ["SIGINT", "SIGTERM", "SIGHUP"];
export const WIN32_FORWARDED_SIGNALS = ["SIGINT", "SIGTERM", "SIGBREAK", "SIGHUP"];

/** Mirrors the server's default `PORACODE_SHUTDOWN_DRAIN_DEADLINE_MS`. */
const DEFAULT_DRAIN_DEADLINE_MS = 10_000;
/** Grace on top of the drain deadline before the child is hard-killed. */
export const WIN32_STOP_MARGIN_MS = 5_000;

/**
 * Mirrors the server's command parsing: no arguments, `serve`, or a leading
 * `--flag` runs the long-lived server (bare `--help`/`--version` do not).
 */
export function isServeInvocation(args) {
  if (args.length === 0) return true;
  if (
    args.length === 1 &&
    ["--help", "-h", "help", "--version", "-v", "version"].includes(args[0])
  ) {
    return false;
  }
  return args[0] === "serve" || args[0].startsWith("--");
}

export function forwardedSignals(platform = process.platform) {
  return platform === "win32" ? WIN32_FORWARDED_SIGNALS : POSIX_FORWARDED_SIGNALS;
}

/** How long a win32 launcher waits for a requested stop before hard-killing. */
export function windowsHardKillDeadlineMs(env = process.env) {
  const configured = Number.parseInt(env.PORACODE_SHUTDOWN_DRAIN_DEADLINE_MS ?? "", 10);
  const drain =
    Number.isSafeInteger(configured) && configured > 0 ? configured : DEFAULT_DRAIN_DEADLINE_MS;
  return drain + WIN32_STOP_MARGIN_MS;
}

/**
 * Ask the running server to drain: `node <server entry> stop`. Resolves with
 * the stop command's exit code (null when it could not be run). Never rejects:
 * a failed stop simply leaves the hard-kill deadline to do its job.
 */
export function runServerStop({ entry, env, timeoutMs, spawnImpl = spawn, execPath }) {
  return new Promise((done) => {
    let child;
    try {
      child = spawnImpl(execPath ?? process.execPath, [entry, "stop"], {
        stdio: "ignore",
        env,
        windowsHide: true,
      });
    } catch {
      done(null);
      return;
    }
    const timer = setTimeout(() => {
      try {
        child.kill();
      } catch {
        // Already gone.
      }
    }, timeoutMs);
    timer.unref?.();
    child.on("error", () => {
      clearTimeout(timer);
      done(null);
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      done(code);
    });
  });
}

/** Exit code the launcher reports when the child died from `signal`. */
export function signalExitCode(signal) {
  const number = osConstants.signals[signal];
  return typeof number === "number" ? 128 + number : 1;
}

/**
 * Install the platform's signal behavior for `child`. Returns a cleanup that
 * removes every handler and pending timer.
 */
export function attachChildSignalHandling({
  child,
  platform = process.platform,
  processImpl = process,
  stop,
  gracefulStop = true,
  hardKillDeadlineMs,
  setTimeoutImpl = setTimeout,
  clearTimeoutImpl = clearTimeout,
}) {
  const handlers = new Map();
  let hardKillTimer = null;
  const killChild = (signal) => {
    try {
      child.kill(signal);
    } catch {
      // The child already exited.
    }
  };
  if (platform !== "win32") {
    for (const signal of POSIX_FORWARDED_SIGNALS) handlers.set(signal, () => killChild(signal));
  } else {
    let stopping = false;
    const requestStop = () => {
      if (stopping) return;
      stopping = true;
      if (!gracefulStop) {
        // Not the serve owner: terminate only this child.
        killChild();
        return;
      }
      hardKillTimer = setTimeoutImpl(() => killChild(), hardKillDeadlineMs);
      hardKillTimer?.unref?.();
      Promise.resolve()
        .then(() => stop())
        .catch(() => {
          // The hard-kill deadline is the fallback for a failed stop.
        });
    };
    for (const signal of WIN32_FORWARDED_SIGNALS) {
      handlers.set(signal, signal === "SIGINT" ? () => {} : requestStop);
    }
  }
  for (const [signal, handler] of handlers) processImpl.on(signal, handler);
  return () => {
    for (const [signal, handler] of handlers) processImpl.off(signal, handler);
    if (hardKillTimer !== null) clearTimeoutImpl(hardKillTimer);
  };
}
