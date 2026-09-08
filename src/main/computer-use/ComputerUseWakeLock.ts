import { powerSaveBlocker } from "electron";

const LOG_PREFIX = "[poracode] computerUseWakeLock:";

/**
 * The subset of Electron's `powerSaveBlocker` this module needs, so unit tests
 * can inject a fake without an Electron runtime.
 */
export interface ComputerUseWakeLockBlocker {
  start(type: "prevent-display-sleep"): number;
  stop(id: number): void;
  isStarted(id: number): boolean;
}

export interface ComputerUseWakeLockOptions {
  blocker?: ComputerUseWakeLockBlocker;
  /** Initial value of the user setting; defaults to enabled. */
  enabled?: boolean;
  logger?: (message: string) => void;
}

/**
 * Holds a display-sleep blocker while a computer-use session is active.
 *
 * A locked desktop cannot be controlled or observed at all (see
 * `.agents/docs/computer-use.md`), so an unattended agent session would die at
 * the idle lock. `prevent-display-sleep` maps to the IOKit
 * `PreventUserIdleDisplaySleep` assertion, which also holds off the idle
 * screensaver and the lock that follows it — on every OS Electron supports, not
 * just macOS. Manual locking is untouched.
 *
 * Exactly one blocker is held at a time and every transition is idempotent, so
 * repeated `setSessionActive`/`setEnabled` calls are free.
 */
export class ComputerUseWakeLock {
  private readonly blocker: ComputerUseWakeLockBlocker;
  private readonly log: (message: string) => void;
  private blockerId: number | null = null;
  private disposed = false;
  private enabled: boolean;
  private sessionActive = false;

  constructor(options: ComputerUseWakeLockOptions = {}) {
    this.blocker = options.blocker ?? powerSaveBlocker;
    this.log = options.logger ?? ((message: string) => console.warn(message));
    this.enabled = options.enabled ?? true;
  }

  /** Whether a computer-use session is currently running. */
  setSessionActive(active: boolean): void {
    if (this.sessionActive === active) return;
    this.sessionActive = active;
    this.apply();
  }

  /** Live user setting; turning it off releases an already-held blocker. */
  setEnabled(enabled: boolean): void {
    if (this.enabled === enabled) return;
    this.enabled = enabled;
    this.apply();
  }

  /** Whether the display is being kept awake right now. */
  isHeld(): boolean {
    return this.blockerId !== null;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.sessionActive = false;
    this.release();
  }

  private apply(): void {
    if (this.disposed) return;
    if (this.enabled && this.sessionActive) this.acquire();
    else this.release();
  }

  private acquire(): void {
    if (this.blockerId !== null) return;
    let id: number;
    try {
      id = this.blocker.start("prevent-display-sleep");
    } catch (error) {
      this.log(`${LOG_PREFIX} failed to start display blocker: ${describeError(error)}`);
      return;
    }
    if (!this.blocker.isStarted(id)) {
      this.log(`${LOG_PREFIX} powerSaveBlocker.start did not activate (id=${id})`);
    }
    this.blockerId = id;
  }

  private release(): void {
    const id = this.blockerId;
    if (id === null) return;
    this.blockerId = null;
    try {
      if (this.blocker.isStarted(id)) this.blocker.stop(id);
    } catch (error) {
      this.log(`${LOG_PREFIX} failed to stop display blocker: ${describeError(error)}`);
    }
  }
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
