import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BackendDatabaseCaller } from "@/shared/backendHostProtocol";
import { BackendStateStore } from "./BackendStateStore";
import { closeDesktopBackend } from "./desktopBackendShutdown";

beforeEach(() => vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] }));
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("desktop shell save/backend quit dependency", () => {
  it("begins backend retirement before the outer quit deadline when a save hangs", async () => {
    const closed = Promise.withResolvers<void>();
    const backend = {
      disposeAsync: vi.fn<(options: { timeoutMs?: number }) => Promise<void>>(async () => {}),
    };
    const closing = closeDesktopBackend({ close: () => closed.promise }, backend, 10_000);
    try {
      await vi.advanceTimersByTimeAsync(3_999);
      expect(backend.disposeAsync).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      expect(backend.disposeAsync).toHaveBeenCalledExactlyOnceWith({ timeoutMs: 6_000 });
      closed.resolve();
      await closing;
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      closed.resolve();
      await closing;
    }
  });
  it("keeps the backend available until the admitted final bounds write settles", async () => {
    const write = Promise.withResolvers<never>();
    const unavailable = new Error("Backend host is shutting down.");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const callDatabase = vi.fn<BackendDatabaseCaller["callDatabase"]>(() => write.promise);
    const shell = new BackendStateStore({ callDatabase });
    shell.set("window-bounds", "final bounds");
    const backend = {
      disposeAsync: vi.fn<(options: { timeoutMs?: number }) => Promise<void>>(async () => {
        write.reject(unavailable);
      }),
    };
    const closing = closeDesktopBackend(shell, backend, 10_000);
    try {
      shell.set("window-bounds", "late close event");
      expect(callDatabase).toHaveBeenCalledOnce();
      expect(backend.disposeAsync).not.toHaveBeenCalled();
      write.resolve(undefined as never);
      await closing;
      expect(backend.disposeAsync).toHaveBeenCalledExactlyOnceWith({ timeoutMs: 10_000 });
      expect(warn).not.toHaveBeenCalled();
      expect(shell.get("window-bounds")).toBe("final bounds");
    } finally {
      write.resolve(undefined as never);
      await closing;
    }
  });

  it("waits for a failed state drain, still disposes the backend, and retains both failures", async () => {
    const closed = Promise.withResolvers<void>();
    const stateError = new Error("state drain failed"),
      backendError = new Error("backend join failed");
    const shell = { close: vi.fn<() => Promise<void>>(() => closed.promise) };
    const backend = {
      disposeAsync: vi.fn<(options: { timeoutMs?: number }) => Promise<void>>(async () => {
        throw backendError;
      }),
    };
    const closing = closeDesktopBackend(shell, backend, 10_000);
    const settled = closing.catch((error: unknown) => error);
    try {
      expect(backend.disposeAsync).not.toHaveBeenCalled();
      closed.reject(stateError);
      expect(await settled).toMatchObject({ errors: [stateError, backendError] });
      expect(backend.disposeAsync).toHaveBeenCalledExactlyOnceWith({ timeoutMs: 10_000 });
    } finally {
      closed.reject(stateError);
      await settled;
    }
  });
});
