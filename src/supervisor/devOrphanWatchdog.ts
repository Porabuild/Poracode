/**
 * Dev-only guard: self-exit when the Electron main process that forked this
 * supervisor disappears (crash, force-quit, `kill -9`, electronmon restart).
 * macOS/Linux have no Job Object equivalent, so an orphaned supervisor is
 * reparented to launchd/init and otherwise runs forever — sometimes at 100%
 * CPU when the event loop is stuck in an exception storm.
 *
 * The watchdog polls cheap liveness signals and, after two consecutive
 * confirmations, requests a graceful shutdown with a hard `process.exit`
 * deadline so a wedged dispose can never block the exit. Packaged builds
 * never install it.
 */

export interface DevOrphanWatchdogOptions {
  pollMs?: number;
  /** Consecutive orphan detections required before acting. */
  confirmations?: number;
  /** Grace period for a graceful shutdown before the hard exit fires. */
  hardExitMs?: number;
  requestShutdown(): void;
  exit?(code: number): void;
  isConnected?(): boolean;
  getParentPid?(): number;
  pidExists?(pid: number): boolean;
}

export interface DevOrphanWatchdogHandle {
  stop(): void;
}

const DEFAULT_POLL_MS = 2_000;
const DEFAULT_CONFIRMATIONS = 2;
const DEFAULT_HARD_EXIT_MS = 2_000;

function defaultPidExists(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM means the process exists but belongs to another user; only a
    // delivery failure (ESRCH-style) proves it is gone.
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

export function startDevOrphanWatchdog(options: DevOrphanWatchdogOptions): DevOrphanWatchdogHandle {
  const pollMs = options.pollMs ?? DEFAULT_POLL_MS;
  const confirmations = Math.max(1, options.confirmations ?? DEFAULT_CONFIRMATIONS);
  const hardExitMs = options.hardExitMs ?? DEFAULT_HARD_EXIT_MS;
  const isConnected = options.isConnected ?? (() => Boolean(process.connected));
  const getParentPid = options.getParentPid ?? (() => process.ppid);
  const pidExists = options.pidExists ?? defaultPidExists;
  const exit = options.exit ?? ((code: number) => process.exit(code));

  const initialParentPid = getParentPid();
  let consecutiveMisses = 0;
  let fired = false;

  const isParentGone = (): boolean => {
    // IPC EOF is the strongest signal: the fork contract closes the channel
    // even when the parent dies hard. PID reuse cannot fool it.
    if (!isConnected()) {
      return true;
    }
    // Reparented to init/launchd after the parent died. Skip the heuristic
    // when we legitimately started under pid 1 (e.g. container inits).
    if (initialParentPid !== 1 && getParentPid() === 1) {
      return true;
    }
    return !pidExists(initialParentPid);
  };

  const timer = setInterval(() => {
    if (fired) {
      return;
    }
    if (!isParentGone()) {
      consecutiveMisses = 0;
      return;
    }
    consecutiveMisses += 1;
    if (consecutiveMisses < confirmations) {
      return;
    }
    fired = true;
    clearInterval(timer);
    console.error(
      `[supervisor] dev orphan watchdog: parent pid ${initialParentPid} is gone; shutting down`,
    );
    // Hard deadline first: the graceful shutdown below must never be able to
    // wedge the exit path.
    const hardExit = setTimeout(() => exit(1), hardExitMs);
    hardExit.unref?.();
    options.requestShutdown();
  }, pollMs);
  timer.unref?.();

  return {
    stop() {
      clearInterval(timer);
    },
  };
}
