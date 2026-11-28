/**
 * How long a stop that is still running when its owner signals keeps its claim
 * on the process. The desktop asks for a graceful `dispose` and sends SIGTERM
 * once that drain outlived its own graceful window; from then on the remaining
 * joins have this long to settle before everything but the database commit is
 * abandoned. It ends before the owner's own forced kill, so a stop whose
 * supervisor already joined still commits instead of being cut off.
 */
export const LATE_SHUTDOWN_EXIT_MS = 2_000;

export interface ShutdownEscalationOptions {
  /** True once a graceful stop was requested and has not completed. */
  readonly isStopping: () => boolean;
  /** Begin the graceful stop: the first signal reached an idle process. */
  readonly stop: () => void;
  /** The stop is still running one grace after the owner signalled again. */
  readonly onGraceElapsed: () => void;
}

export interface ShutdownEscalation {
  /** True once a signal escalated an in-flight stop. */
  isLate(): boolean;
  /** Apply one SIGINT/SIGTERM. */
  receive(): void;
}

/**
 * A signal must never be a no-op. Ignoring a repeated one leaves the owner no
 * choice but to wait for its own SIGKILL deadline, which ends the stop without
 * a database close; escalating bounds the wait and keeps the close reachable.
 */
export function createShutdownEscalation(options: ShutdownEscalationOptions): ShutdownEscalation {
  let lateTimer: ReturnType<typeof setTimeout> | null = null;
  return {
    isLate: () => lateTimer !== null,
    receive() {
      if (!options.isStopping()) {
        options.stop();
        return;
      }
      // Repeated signals never restart or shorten the grace.
      if (lateTimer) return;
      lateTimer = setTimeout(options.onGraceElapsed, LATE_SHUTDOWN_EXIT_MS);
    },
  };
}
