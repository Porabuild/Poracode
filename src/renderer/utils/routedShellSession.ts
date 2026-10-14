import { createShellPromptGate } from "@/shared/shellPromptReady";
import { readBridge } from "@/renderer/bridge";
import { watchRoutedTerminal } from "@/renderer/state/remoteTerminalFeed";
import type { RemoteTerminalWatchResultReady } from "@/shared/remote/protocol";

interface RoutedShellSessionOptions {
  readonly shellId: string;
  readonly data: string;
  readonly remoteServerId?: string;
  readonly onOutput?: (output: string) => void;
  /** Inspect authoritative history separately from live output (e.g. a
   * current-token completion marker recovered after reconnect). */
  readonly onSnapshot?: (snapshot: RemoteTerminalWatchResultReady) => void;
  readonly onReset?: () => void;
  readonly onExited?: (exitCode: number | null) => void;
  readonly onWriteError?: (error: unknown) => void;
}

const activeSessions = new Map<string, () => void>();

export function disposeRoutedShellSession(shellId: string): void {
  activeSessions.get(shellId)?.();
}

/**
 * Owns the shared lifecycle for a local or remote background shell: wait until
 * the PTY is ready, write once per spawn, re-arm after a reset, and detach all
 * timers/listeners when the shell exits or its caller disposes the session.
 */
export function createRoutedShellSession(options: RoutedShellSessionOptions): () => void {
  disposeRoutedShellSession(options.shellId);
  let armed = true;
  let observedSpawnReset = false;
  let timer = 0;
  let disposed = false;
  let unsubscribe: () => void = () => undefined;
  const prompt = createShellPromptGate();

  const clearTimer = () => {
    if (timer === 0) return;
    window.clearTimeout(timer);
    timer = 0;
  };
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    clearTimer();
    unsubscribe();
    if (activeSessions.get(options.shellId) === dispose) activeSessions.delete(options.shellId);
  };
  const write = () => {
    if (!armed || disposed) return;
    armed = false;
    clearTimer();
    void readBridge()
      .writeTerminal({ threadId: options.shellId, data: options.data })
      .catch((error) => {
        dispose();
        options.onWriteError?.(error);
      });
  };
  const reset = () => {
    if (disposed) return;
    observedSpawnReset = true;
    armed = true;
    prompt.reset();
    clearTimer();
    options.onReset?.();
  };
  const armWrite = (output: string) => {
    if (prompt.push(output) === "ready") {
      write();
      return;
    }
    clearTimer();
    timer = window.setTimeout(write, prompt.delayMs());
  };
  const onOutput = (output: string) => {
    if (disposed) return;
    if (!armed) {
      options.onOutput?.(output);
      return;
    }
    // Local and remote shells share this gate. The first bytes are often a
    // device-attribute query, not a prompt; writing the command there leaves
    // an empty pane and skips `exit` because the script runs before PATH exists.
    armWrite(output);
  };

  unsubscribe = watchRoutedTerminal(
    options.shellId,
    {
      onReset: reset,
      onOutput,
      onSnapshot: (snapshot) => {
        if (disposed) return;
        options.onSnapshot?.(snapshot);
        // A new prompt may be wholly covered by the feed baseline. Only the
        // spawn this listener observed can arm readiness from history; later
        // reconnect snapshots must never rerun or report old command output.
        if (
          disposed ||
          !armed ||
          !observedSpawnReset ||
          snapshot.processState !== "running" ||
          snapshot.data.length === 0
        ) {
          return;
        }
        prompt.reset();
        armWrite(snapshot.data);
      },
      onExited: (exitCode) => {
        dispose();
        options.onExited?.(exitCode);
      },
    },
    options.remoteServerId,
  );
  if (disposed) unsubscribe();
  else activeSessions.set(options.shellId, dispose);
  return dispose;
}
