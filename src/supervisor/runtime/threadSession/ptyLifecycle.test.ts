import { describe, expect, it, vi } from "vitest";
import type { IPty } from "node-pty";
import type { SessionRuntime, ShellSessionRuntime } from "../sessionTypes";
import { registerManagedPty } from "../../pty/managedPty";
import { PtyLifecycle } from "./ptyLifecycle";

function runtimeWithResize(resize: IPty["resize"]): SessionRuntime {
  return {
    pty: { resize } as IPty,
    ptyExited: false,
  } as SessionRuntime;
}

describe("PtyLifecycle.resize", () => {
  it.each(["Cannot resize a pty that has already exited", "ioctl(2) failed, ENOTTY"])(
    "treats the node-pty exit race as an expected outcome: %s",
    (message) => {
      const lifecycle = new PtyLifecycle();
      const session = runtimeWithResize(() => {
        throw new Error(message);
      });

      expect(() => lifecycle.resize(session, 120, 40)).not.toThrow();
      expect(session.ptyExited).toBe(true);
    },
  );

  it("does not call native resize after lifecycle teardown", () => {
    const resize = vi.fn<IPty["resize"]>();
    const lifecycle = new PtyLifecycle();
    const session = runtimeWithResize(resize);
    session.ignoreExit = true;

    lifecycle.resize(session, 120, 40);

    expect(resize).not.toHaveBeenCalled();
  });

  it("propagates unrelated native resize failures", () => {
    const lifecycle = new PtyLifecycle();
    const session = runtimeWithResize(() => {
      throw new Error("native resize invariant failed");
    });

    expect(() => lifecycle.resize(session, 120, 40)).toThrow("native resize invariant failed");
    expect(session.ptyExited).toBe(false);
  });
});

describe("PtyLifecycle shutdown", () => {
  it("keeps managed custody after a resize exit race and a stale exited flag", async () => {
    const lifecycle = new PtyLifecycle();
    const session = runtimeWithResize(() => {
      throw new Error("Cannot resize a pty that has already exited");
    });
    const joined = Promise.withResolvers<void>();
    const owner = {
      closed: joined.promise,
      exitConfirmed: false,
      close: vi.fn<() => Promise<void>>(async () => {}),
    };
    registerManagedPty(session.pty!, owner);
    lifecycle.track(session);
    lifecycle.resize(session, 120, 40);
    expect(session.ptyExited).toBe(false);
    session.ptyExited = true;
    let settled = false;
    const waiting = lifecycle.waitForExit(session).then((result) => {
      settled = true;
      return result;
    });
    await Promise.resolve();
    expect(settled).toBe(false);
    owner.exitConfirmed = true;
    joined.resolve();
    await expect(waiting).resolves.toBe(true);
  });

  it("closes the managed owner for thread and shell sessions without a PID kill", async () => {
    const lifecycle = new PtyLifecycle();
    const session = runtimeWithResize(() => {});
    const nativeKill = vi.fn<IPty["kill"]>();
    session.pty!.kill = nativeKill;
    const close = vi.fn<() => Promise<void>>(async () => {});
    registerManagedPty(session.pty!, {
      closed: Promise.resolve(),
      exitConfirmed: true,
      close,
    });
    session.ptyExited = true;
    lifecycle.kill(session);
    lifecycle.killShell(session as unknown as ShellSessionRuntime);
    await Promise.resolve();
    expect(close).toHaveBeenCalledTimes(2);
    expect(nativeKill).not.toHaveBeenCalled();
  });

  it("joins every tracked PTY until its exit callback resolves", async () => {
    const lifecycle = new PtyLifecycle();
    const first = runtimeWithResize(() => {});
    const second = runtimeWithResize(() => {});
    lifecycle.track(first);
    lifecycle.track(second);

    let settled = false;
    const waiting = lifecycle.waitForAllExits().then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);

    lifecycle.resolveExit(first);
    await Promise.resolve();
    expect(settled).toBe(false);
    lifecycle.resolveExit(second);
    await waiting;
    expect(settled).toBe(true);
  });

  it("reports an unconfirmed PTY instead of treating the deadline as an exit", async () => {
    vi.useFakeTimers();
    try {
      const lifecycle = new PtyLifecycle();
      const session = runtimeWithResize(() => {});
      lifecycle.track(session);

      const waiting = lifecycle.waitForAllExits();
      await vi.advanceTimersByTimeAsync(2_000);

      await expect(waiting).resolves.toBe(false);
      expect(session.ptyExited).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("disposes Windows node-pty worker on resolveExit but defers disposal during resize exit race", () => {
    const platform = vi.spyOn(process, "platform", "get").mockReturnValue("win32");
    try {
      const workerTerminate = vi.fn<() => Promise<number>>(async () => 0);
      const session = {
        pty: {
          pid: 7777,
          resize: () => {
            throw new Error("Cannot resize a pty that has already exited");
          },
          _agent: {
            _conoutSocketWorker: {
              _isDisposed: false,
              _worker: { terminate: workerTerminate },
              dispose: vi.fn<() => void>(),
            },
          },
        } as unknown as IPty,
        ptyExited: false,
      } as SessionRuntime;

      const lifecycle = new PtyLifecycle();
      lifecycle.track(session);

      // Resize race marks exit tracking settled without prematurely cutting off the 1s flush window
      lifecycle.resize(session, 100, 30);
      expect(session.ptyExited).toBe(true);
      expect(workerTerminate).not.toHaveBeenCalled();

      // Real onExit callback invokes resolveExit and reclaims the worker isolate
      lifecycle.resolveExit(session);
      expect(workerTerminate).toHaveBeenCalledOnce();
    } finally {
      platform.mockRestore();
    }
  });
});
