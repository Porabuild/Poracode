import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BackendDatabaseCaller } from "@/shared/backendHostProtocol";
import { BackendStateStore } from "./BackendStateStore";
import { closeDesktopBackend, SHELL_STATE_QUIT_DRAIN_MS } from "./desktopBackendShutdown";

beforeEach(() => vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] }));
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("desktop shell save/backend quit dependency", () => {
  it("retires the backend at once when the final save never settles", async () => {
    const closed = Promise.withResolvers<void>();
    const backend = {
      disposeAsync: vi.fn<(options: { timeoutMs?: number }) => Promise<void>>(async () => {}),
    };
    const closing = closeDesktopBackend({ close: () => closed.promise }, backend, 10_000);
    try {
      await vi.advanceTimersByTimeAsync(SHELL_STATE_QUIT_DRAIN_MS - 1);
      expect(backend.disposeAsync).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      // No second wait for a backend that already failed to answer.
      expect(backend.disposeAsync).toHaveBeenCalledExactlyOnceWith({ timeoutMs: 0 });
      closed.resolve();
      await closing;
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      closed.resolve();
      await closing;
    }
  });

  it("grants a save that settles inside the window the retirement time that is left", async () => {
    const closed = Promise.withResolvers<void>();
    const backend = {
      disposeAsync: vi.fn<(options: { timeoutMs?: number }) => Promise<void>>(async () => {}),
    };
    const closing = closeDesktopBackend({ close: () => closed.promise }, backend, 10_000);
    try {
      await vi.advanceTimersByTimeAsync(SHELL_STATE_QUIT_DRAIN_MS - 1);
      closed.resolve();
      await closing;
      expect(vi.getTimerCount()).toBe(0);
      const [{ timeoutMs }] = backend.disposeAsync.mock.calls[0]!;
      expect(timeoutMs).toBeGreaterThan(10_000 - SHELL_STATE_QUIT_DRAIN_MS - 1);
      expect(timeoutMs).toBeLessThanOrEqual(10_000 - (SHELL_STATE_QUIT_DRAIN_MS - 1));
    } finally {
      closed.resolve();
      await closing;
    }
  });

  it("never waits for the saves longer than the caller's budget", async () => {
    const closed = Promise.withResolvers<void>();
    const backend = {
      disposeAsync: vi.fn<(options: { timeoutMs?: number }) => Promise<void>>(async () => {}),
    };
    const closing = closeDesktopBackend({ close: () => closed.promise }, backend, 500);
    try {
      await vi.advanceTimersByTimeAsync(499);
      expect(backend.disposeAsync).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      expect(backend.disposeAsync).toHaveBeenCalledExactlyOnceWith({ timeoutMs: 0 });
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
