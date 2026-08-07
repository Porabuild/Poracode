import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startDevOrphanWatchdog, type DevOrphanWatchdogOptions } from "./devOrphanWatchdog";

type WatchdogContext = {
  stop(): void;
  requestShutdown: ReturnType<typeof vi.fn>;
  exit: ReturnType<typeof vi.fn>;
  isConnected: ReturnType<typeof vi.fn<() => boolean>>;
  getParentPid: ReturnType<typeof vi.fn<() => number>>;
  pidExists: ReturnType<typeof vi.fn<(pid: number) => boolean>>;
};

const POLL_MS = 1_000;
const HARD_EXIT_MS = 500;

describe("startDevOrphanWatchdog", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function start(overrides: Partial<DevOrphanWatchdogOptions> = {}): WatchdogContext {
    const requestShutdown = vi.fn<() => void>();
    const exit = vi.fn<(code: number) => void>();
    const isConnected = vi.fn<() => boolean>(() => true);
    const getParentPid = vi.fn<() => number>(() => 4242);
    const pidExists = vi.fn<(pid: number) => boolean>(() => true);
    const handle = startDevOrphanWatchdog({
      pollMs: POLL_MS,
      confirmations: 2,
      hardExitMs: HARD_EXIT_MS,
      requestShutdown,
      exit,
      isConnected,
      getParentPid,
      pidExists,
      ...overrides,
    });
    return {
      stop: () => handle.stop(),
      requestShutdown,
      exit,
      isConnected,
      getParentPid,
      pidExists,
    };
  }

  it("does not fire while the parent is alive", () => {
    const ctx = start();
    vi.advanceTimersByTime(POLL_MS * 10);
    expect(ctx.requestShutdown).not.toHaveBeenCalled();
    expect(ctx.exit).not.toHaveBeenCalled();
    ctx.stop();
  });

  it("shuts down after the parent disconnects on two consecutive polls", () => {
    const ctx = start();
    ctx.isConnected.mockReturnValue(false);

    vi.advanceTimersByTime(POLL_MS);
    expect(ctx.requestShutdown).not.toHaveBeenCalled();

    vi.advanceTimersByTime(POLL_MS);
    expect(ctx.requestShutdown).toHaveBeenCalledTimes(1);
    expect(ctx.exit).not.toHaveBeenCalled();

    vi.advanceTimersByTime(HARD_EXIT_MS);
    expect(ctx.exit).toHaveBeenCalledWith(1);
    expect(ctx.exit).toHaveBeenCalledTimes(1);
    ctx.stop();
  });

  it("treats reparenting to pid 1 as orphaned", () => {
    const ctx = start();
    ctx.getParentPid.mockReturnValue(1);
    vi.advanceTimersByTime(POLL_MS * 2);
    expect(ctx.requestShutdown).toHaveBeenCalledTimes(1);
    ctx.stop();
  });

  it("treats a missing parent pid as orphaned", () => {
    const ctx = start();
    ctx.pidExists.mockReturnValue(false);
    vi.advanceTimersByTime(POLL_MS * 2);
    expect(ctx.requestShutdown).toHaveBeenCalledTimes(1);
    ctx.stop();
  });

  it("ignores a single transient miss", () => {
    const ctx = start();
    ctx.isConnected.mockReturnValue(false);
    vi.advanceTimersByTime(POLL_MS);
    ctx.isConnected.mockReturnValue(true);
    vi.advanceTimersByTime(POLL_MS * 5);
    expect(ctx.requestShutdown).not.toHaveBeenCalled();
    expect(ctx.exit).not.toHaveBeenCalled();
    ctx.stop();
  });

  it("fires only once and stops polling", () => {
    const ctx = start();
    ctx.isConnected.mockReturnValue(false);
    vi.advanceTimersByTime(POLL_MS * 2 + HARD_EXIT_MS);
    expect(ctx.requestShutdown).toHaveBeenCalledTimes(1);
    expect(ctx.exit).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(POLL_MS * 10 + HARD_EXIT_MS * 10);
    expect(ctx.requestShutdown).toHaveBeenCalledTimes(1);
    expect(ctx.exit).toHaveBeenCalledTimes(1);
    ctx.stop();
  });

  it("does not flag reparenting when launched under pid 1", () => {
    const getParentPid = vi.fn<() => number>(() => 1);
    const pidExists = vi.fn<(pid: number) => boolean>(() => true);
    const requestShutdown = vi.fn<() => void>();
    const handle = startDevOrphanWatchdog({
      pollMs: POLL_MS,
      confirmations: 1,
      requestShutdown,
      isConnected: () => true,
      getParentPid,
      pidExists,
    });
    vi.advanceTimersByTime(POLL_MS * 5);
    expect(requestShutdown).not.toHaveBeenCalled();
    handle.stop();
  });

  it("uses live ppid and pid probes by default", () => {
    // Real probes against the live test runner: its parent exists, so the
    // watchdog must stay quiet.
    const requestShutdown = vi.fn<() => void>();
    const handle = startDevOrphanWatchdog({
      pollMs: POLL_MS,
      confirmations: 1,
      requestShutdown,
      isConnected: () => true,
    });
    vi.advanceTimersByTime(POLL_MS * 3);
    expect(requestShutdown).not.toHaveBeenCalled();
    handle.stop();
  });

  it("treats EPERM from the default pid probe as alive", () => {
    vi.spyOn(process, "kill").mockImplementation(((pid: number, signal?: number | string) => {
      if (signal === 0 || signal === undefined) {
        const error = new Error("EPERM: operation not permitted") as NodeJS.ErrnoException;
        error.code = "EPERM";
        throw error;
      }
      return true;
    }) as typeof process.kill);

    const requestShutdown = vi.fn<() => void>();
    const handle = startDevOrphanWatchdog({
      pollMs: POLL_MS,
      confirmations: 1,
      requestShutdown,
      isConnected: () => true,
    });
    vi.advanceTimersByTime(POLL_MS * 3);
    expect(requestShutdown).not.toHaveBeenCalled();
    handle.stop();
  });
});
