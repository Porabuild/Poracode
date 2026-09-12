import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  setRendererEventInterests:
    vi.fn<
      (payload: { terminalThreadIds: string[]; runtimeThreadIds: string[] }) => Promise<void>
    >(),
  captureRendererException: vi.fn<() => void>(),
  remoteSession: false,
}));

vi.mock("@/renderer/bridge", () => ({
  readBridge: () => ({
    appVersion: mocks.remoteSession ? "remote" : "test",
    setRendererEventInterests: mocks.setRendererEventInterests,
  }),
}));
vi.mock("@/renderer/diagnostics/sentry", () => ({
  captureRendererException: mocks.captureRendererException,
}));

import { retainRendererEventInterest } from "./rendererEventInterests";

describe("rendererEventInterests", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.setRendererEventInterests.mockReset().mockResolvedValue(undefined);
    mocks.captureRendererException.mockReset();
    mocks.remoteSession = false;
  });

  afterEach(() => vi.useRealTimers());

  it("publishes ref-counted exact snapshots and delays final release for hand-offs", async () => {
    const first = retainRendererEventInterest("terminal", "terminal-1");
    const second = retainRendererEventInterest("terminal", "terminal-1");
    expect(first.continuous).toBe(false);
    expect(second.continuous).toBe(true);
    await first.ready;
    await second.ready;

    expect(mocks.setRendererEventInterests).toHaveBeenCalledExactlyOnceWith({
      terminalThreadIds: ["terminal-1"],
      runtimeThreadIds: [],
    });

    first.release();
    await vi.advanceTimersByTimeAsync(250);
    expect(mocks.setRendererEventInterests).toHaveBeenCalledTimes(1);

    second.release();
    await vi.advanceTimersByTimeAsync(249);
    expect(mocks.setRendererEventInterests).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await vi.waitFor(() => expect(mocks.setRendererEventInterests).toHaveBeenCalledTimes(2));
    expect(mocks.setRendererEventInterests).toHaveBeenLastCalledWith({
      terminalThreadIds: [],
      runtimeThreadIds: [],
    });
  });

  it("coalesces same-turn and in-flight interest changes while preserving readiness", async () => {
    let acknowledgeFirst!: () => void;
    let acknowledgeSecond!: () => void;
    mocks.setRendererEventInterests
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            acknowledgeFirst = resolve;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            acknowledgeSecond = resolve;
          }),
      );

    const terminal = retainRendererEventInterest("terminal", "terminal-1");
    const runtime = retainRendererEventInterest("runtime", "runtime-1");
    await vi.waitFor(() => expect(mocks.setRendererEventInterests).toHaveBeenCalledTimes(1));
    expect(mocks.setRendererEventInterests).toHaveBeenLastCalledWith({
      terminalThreadIds: ["terminal-1"],
      runtimeThreadIds: ["runtime-1"],
    });

    let trailingReady = false;
    const trailing = retainRendererEventInterest("terminal", "terminal-2");
    void trailing.ready.then(() => {
      trailingReady = true;
    });
    expect(mocks.setRendererEventInterests).toHaveBeenCalledTimes(1);

    acknowledgeFirst();
    await Promise.all([terminal.ready, runtime.ready]);
    expect(trailingReady).toBe(false);
    await vi.waitFor(() => expect(mocks.setRendererEventInterests).toHaveBeenCalledTimes(2));
    expect(mocks.setRendererEventInterests).toHaveBeenLastCalledWith({
      terminalThreadIds: ["terminal-1", "terminal-2"],
      runtimeThreadIds: ["runtime-1"],
    });

    acknowledgeSecond();
    await trailing.ready;
    expect(trailingReady).toBe(true);

    terminal.release();
    runtime.release();
    trailing.release();
    await vi.advanceTimersByTimeAsync(250);
    await vi.waitFor(() =>
      expect(mocks.setRendererEventInterests).toHaveBeenLastCalledWith({
        terminalThreadIds: [],
        runtimeThreadIds: [],
      }),
    );
    expect(mocks.setRendererEventInterests).toHaveBeenCalledTimes(3);
  });

  it("leaves remote-session interests to the remote socket coordinator", async () => {
    mocks.remoteSession = true;

    const lease = retainRendererEventInterest("runtime", "remote-thread");
    await lease.ready;
    lease.release();
    await vi.advanceTimersByTimeAsync(250);

    expect(mocks.setRendererEventInterests).not.toHaveBeenCalled();
  });
});
