import type { IPty } from "node-pty";
import { terminateProcessTree } from "@/shared/processTree";
import { managedPtyCustody } from "./managedPty";

interface DestroyableSocket {
  readable?: boolean;
  readonly destroyed?: boolean;
  destroy(): void;
}

interface WindowsConoutWorker {
  terminate(): Promise<number>;
}

interface WindowsConoutConnectionInternal {
  _isDisposed?: boolean;
  _drainTimeout?: ReturnType<typeof setTimeout> | undefined;
  _worker?: WindowsConoutWorker;
  dispose(): void;
}

interface WindowsPtyAgentInternal {
  _inSocket?: DestroyableSocket;
  _outSocket?: DestroyableSocket;
  _closeTimeout?: ReturnType<typeof setTimeout> | undefined;
  _conoutSocketWorker?: WindowsConoutConnectionInternal;
}

interface UnixWriteStreamInternal {
  dispose(): void;
}

interface NodePtyInternals {
  _agent?: WindowsPtyAgentInternal;
  _writeStream?: UnixWriteStreamInternal;
}

/**
 * Terminate an unmanaged `node-pty` instance without invoking `node-pty`'s
 * `conpty_console_list_agent` fork or `WindowsTerminal` signal/ready traps on Windows.
 *
 * On Windows:
 * 1. Terminates the full process tree via `taskkill /PID <pid> /T /F` while the
 *    root PID is still alive so descendants cannot escape tree termination.
 * 2. Starts `conoutSocketWorker.dispose()` so the worker thread drains final
 *    bytes and closes its pipe without cutting off `ready_datapipe` or `onExit`,
 *    and without touching `conpty.cc`'s unguarded `ptyHandles` vector concurrently
 *    with its native exit waiter thread.
 */
export function terminateNodePty(pty: IPty, signal?: string): void {
  if (managedPtyCustody(pty)) return;
  if (process.platform === "win32") {
    if (typeof pty.pid === "number" && pty.pid > 0) {
      terminateProcessTree(pty.pid);
    }
    const agent = (pty as unknown as NodePtyInternals)._agent;
    if (agent?._conoutSocketWorker) {
      try {
        agent._conoutSocketWorker.dispose();
      } catch {
        // Worker may already be terminating.
      }
    }
    return;
  }
  if (signal !== undefined) {
    pty.kill(signal);
  } else {
    pty.kill();
  }
}

/**
 * Reclaim internal `node-pty` sockets and worker threads after `pty.onExit` has fired.
 *
 * On Windows, `WindowsPtyAgent._cleanUpProcess` destroys `_outSocket` after exit
 * without destroying `_inSocket` or terminating its `worker_threads` isolate
 * (`conoutSocketWorker.js`), retaining ~12-15 MB of private commit, a `MessagePort`,
 * and an attached `conhost.exe --headless` process per exited terminal.
 */
export function disposeNodePtyAfterExit(pty: IPty | undefined): void {
  if (!pty || managedPtyCustody(pty)) return;
  const internals = pty as unknown as NodePtyInternals;
  if (process.platform === "win32") {
    const agent = internals._agent;
    if (!agent) return;
    if (agent._closeTimeout !== undefined) {
      clearTimeout(agent._closeTimeout);
      agent._closeTimeout = undefined;
    }
    if (agent._inSocket && !agent._inSocket.destroyed) {
      agent._inSocket.readable = false;
      agent._inSocket.destroy();
    }
    if (agent._outSocket && !agent._outSocket.destroyed) {
      agent._outSocket.readable = false;
      agent._outSocket.destroy();
    }
    const workerConn = agent._conoutSocketWorker;
    if (workerConn) {
      workerConn._isDisposed = true;
      if (workerConn._drainTimeout !== undefined) {
        clearTimeout(workerConn._drainTimeout);
        workerConn._drainTimeout = undefined;
      }
      if (workerConn._worker) {
        void workerConn._worker.terminate().catch(() => {
          // Post-exit worker termination is best effort.
        });
      }
    }
    return;
  }
  try {
    internals._writeStream?.dispose();
  } catch {
    // Best-effort cleanup of any pending EAGAIN setImmediate retry on POSIX.
  }
}
