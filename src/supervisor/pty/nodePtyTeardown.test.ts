import { spawn as spawnPty, type IPty } from "node-pty";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as processTree from "@/shared/processTree";
import { registerManagedPty } from "./managedPty";
import { disposeNodePtyAfterExit, terminateNodePty } from "./nodePtyTeardown";

function countMessagePorts(): number {
  return process.getActiveResourcesInfo().filter((r) => r === "MessagePort").length;
}

describe("nodePtyTeardown", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("terminates a Windows node-pty tree and disposes conout worker without calling pty.kill", () => {
    vi.spyOn(process, "platform", "get").mockReturnValue("win32");
    const treeSpy = vi.spyOn(processTree, "terminateProcessTree").mockImplementation(() => {});
    const ptyKill = vi.fn<IPty["kill"]>();
    const workerDispose = vi.fn<() => void>();
    const pty = {
      pid: 9876,
      kill: ptyKill,
      _agent: {
        _conoutSocketWorker: {
          dispose: workerDispose,
        },
      },
    } as unknown as IPty;

    terminateNodePty(pty, "SIGKILL");

    expect(treeSpy).toHaveBeenCalledExactlyOnceWith(9876);
    expect(workerDispose).toHaveBeenCalledOnce();
    expect(ptyKill).not.toHaveBeenCalled();
  });

  it("forwards optional signal to pty.kill on POSIX", () => {
    vi.spyOn(process, "platform", "get").mockReturnValue("linux");
    const ptyKill = vi.fn<IPty["kill"]>();
    const pty = { pid: 1234, kill: ptyKill } as unknown as IPty;

    terminateNodePty(pty);
    terminateNodePty(pty, "SIGKILL");

    expect(ptyKill).toHaveBeenNthCalledWith(1);
    expect(ptyKill).toHaveBeenNthCalledWith(2, "SIGKILL");
  });

  it("disposes Windows sockets, timers, and worker isolate on exit", () => {
    vi.spyOn(process, "platform", "get").mockReturnValue("win32");
    const inDestroy = vi.fn<() => void>();
    const outDestroy = vi.fn<() => void>();
    const workerTerminate = vi.fn<() => Promise<number>>(async () => 0);
    const closeTimeout = setTimeout(() => {}, 60_000);
    const drainTimeout = setTimeout(() => {}, 60_000);

    const agent = {
      _closeTimeout: closeTimeout,
      _inSocket: { readable: true, destroyed: false, destroy: inDestroy },
      _outSocket: { readable: true, destroyed: false, destroy: outDestroy },
      _conoutSocketWorker: {
        _isDisposed: false,
        _drainTimeout: drainTimeout,
        _worker: { terminate: workerTerminate },
        dispose: vi.fn<() => void>(),
      },
    };
    const pty = { pid: 4321, _agent: agent } as unknown as IPty;

    disposeNodePtyAfterExit(pty);

    expect(agent._closeTimeout).toBeUndefined();
    expect(agent._inSocket.readable).toBe(false);
    expect(inDestroy).toHaveBeenCalledOnce();
    expect(agent._outSocket.readable).toBe(false);
    expect(outDestroy).toHaveBeenCalledOnce();
    expect(agent._conoutSocketWorker._isDisposed).toBe(true);
    expect(agent._conoutSocketWorker._drainTimeout).toBeUndefined();
    expect(workerTerminate).toHaveBeenCalledOnce();
  });

  it("leaves managed WindowsPty instances to their own custody owner", () => {
    vi.spyOn(process, "platform", "get").mockReturnValue("win32");
    const treeSpy = vi.spyOn(processTree, "terminateProcessTree").mockImplementation(() => {});
    const workerTerminate = vi.fn<() => Promise<number>>(async () => 0);
    const pty = {
      pid: 5555,
      kill: vi.fn<IPty["kill"]>(),
      _agent: {
        _conoutSocketWorker: {
          _worker: { terminate: workerTerminate },
          dispose: vi.fn<() => void>(),
        },
      },
    } as unknown as IPty;
    registerManagedPty(pty, {
      closed: Promise.resolve(),
      exitConfirmed: false,
      close: async () => {},
    });

    terminateNodePty(pty);
    disposeNodePtyAfterExit(pty);

    expect(treeSpy).not.toHaveBeenCalled();
    expect(workerTerminate).not.toHaveBeenCalled();
  });

  it("disposes POSIX CustomWriteStream immediate retry on exit", () => {
    vi.spyOn(process, "platform", "get").mockReturnValue("darwin");
    const writeDispose = vi.fn<() => void>();
    const pty = {
      pid: 2222,
      _writeStream: { dispose: writeDispose },
    } as unknown as IPty;

    disposeNodePtyAfterExit(pty);

    expect(writeDispose).toHaveBeenCalledOnce();
  });

  it.runIf(process.platform === "win32")(
    "reclaims real Windows node-pty conoutSocketWorker MessagePorts across natural exit and forced kill",
    async () => {
      const baselinePorts = countMessagePorts();

      // 1. Natural exit
      await new Promise<void>((resolve) => {
        const term = spawnPty("cmd.exe", ["/c", "echo done"], { cols: 80, rows: 24 });
        term.onExit(() => {
          disposeNodePtyAfterExit(term);
          resolve();
        });
      });

      // 2. Forced kill
      await new Promise<void>((resolve) => {
        const term = spawnPty("cmd.exe", ["/k", "echo ready"], { cols: 80, rows: 24 });
        let killed = false;
        term.onData((chunk) => {
          if (!killed && chunk.includes("ready")) {
            killed = true;
            terminateNodePty(term);
          }
        });
        term.onExit(() => {
          disposeNodePtyAfterExit(term);
          resolve();
        });
      });

      await vi.waitFor(
        () => {
          expect(countMessagePorts()).toBeLessThanOrEqual(baselinePorts);
        },
        { timeout: 3_000 },
      );
    },
    15_000,
  );
});
