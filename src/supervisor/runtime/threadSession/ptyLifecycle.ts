import { setTimeout as sleep } from "node:timers/promises";
import { terminateProcessTree } from "@/shared/processTree";
import type { SessionRuntime, ShellSessionRuntime } from "../sessionTypes";

/**
 * Tracks PTY process exit for agent and shell sessions and performs
 * platform-correct best-effort kills. Owns the per-session exit
 * promise/resolver bookkeeping so the manager can await a clean teardown
 * without spinning if the process already exited.
 */
export class PtyLifecycle {
  private static readonly CLOSE_TIMEOUT_MS = 2_000;
  private readonly exitPromises = new WeakMap<object, Promise<void>>();
  private readonly exitResolvers = new WeakMap<object, () => void>();

  track(session: SessionRuntime | ShellSessionRuntime): void {
    if (session.ptyExited || this.exitPromises.has(session)) {
      return;
    }
    let resolve!: () => void;
    const promise = new Promise<void>((done) => {
      resolve = done;
    });
    this.exitPromises.set(session, promise);
    this.exitResolvers.set(session, resolve);
  }

  resolveExit(session: SessionRuntime | ShellSessionRuntime): void {
    session.ptyExited = true;
    this.exitResolvers.get(session)?.();
    this.exitResolvers.delete(session);
    this.exitPromises.delete(session);
  }

  async waitForExit(session: SessionRuntime | ShellSessionRuntime): Promise<void> {
    if (session.ptyExited) {
      return;
    }
    const exitPromise = this.exitPromises.get(session);
    if (!exitPromise) {
      return;
    }
    await Promise.race([exitPromise, sleep(PtyLifecycle.CLOSE_TIMEOUT_MS).then(() => undefined)]);
  }

  kill(session: SessionRuntime): void {
    if (!session.pty) {
      return;
    }
    if (session.ptyExited) {
      return;
    }
    if (process.platform === "win32") {
      terminateProcessTree(session.pty.pid);
      return;
    }
    try {
      process.kill(session.pty.pid, 0);
    } catch {
      return;
    }
    session.pty.kill();
  }

  killShell(session: ShellSessionRuntime): void {
    if (session.ptyExited) {
      return;
    }
    if (process.platform === "win32") {
      terminateProcessTree(session.pty.pid);
      return;
    }
    try {
      process.kill(session.pty.pid, 0);
    } catch {
      return;
    }
    session.pty.kill();
  }
}
