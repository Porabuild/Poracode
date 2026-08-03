import { extractOscEventsFromPtyStream } from "@/shared/osc";
import { readBridge } from "@/renderer/bridge";
import { watchRoutedTerminal } from "@/renderer/state/remoteTerminalFeed";

const REMOTE_SHELL_QUIET_READY_MS = 250;
const REMOTE_SHELL_QUERY_FALLBACK_MS = 12_000;

interface RoutedShellSessionOptions {
  readonly shellId: string;
  readonly data: string;
  readonly remoteServerId?: string;
  readonly onOutput?: (output: string) => void;
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
  let outputBuffer = "";
  let oscCarry = "";
  let timer = 0;
  let disposed = false;
  let unsubscribe: () => void = () => undefined;

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
    armed = true;
    outputBuffer = "";
    oscCarry = "";
    clearTimer();
    options.onReset?.();
  };
  const onOutput = (output: string) => {
    if (!armed) {
      options.onOutput?.(output);
      return;
    }
    if (!options.remoteServerId) {
      write();
      return;
    }
    outputBuffer = `${outputBuffer}${output}`.slice(-2048);
    const extracted = extractOscEventsFromPtyStream(oscCarry, output);
    oscCarry = extracted.carryOut;
    if (extracted.shell.some((event) => event.code === 133 && event.kind === "prompt-end")) {
      write();
      return;
    }
    clearTimer();
    const sawTerminalQuery =
      outputBuffer.includes("\u001B[0c") || outputBuffer.includes("\u001B[6n");
    timer = window.setTimeout(
      write,
      sawTerminalQuery ? REMOTE_SHELL_QUERY_FALLBACK_MS : REMOTE_SHELL_QUIET_READY_MS,
    );
  };

  unsubscribe = watchRoutedTerminal(
    options.shellId,
    {
      onReset: reset,
      onOutput,
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
