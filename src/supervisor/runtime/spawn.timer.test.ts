import { EventEmitter } from "node:events";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  spawn: vi.fn<(...args: unknown[]) => unknown>(),
  terminate: vi.fn<(child: unknown) => void>(),
}));
vi.mock("node:child_process", () => ({ spawn: mocks.spawn }));
vi.mock("@/shared/processTree", () => ({ terminateChildProcessTree: mocks.terminate }));
import { spawnAndAwaitExit } from "./spawn";

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
});
afterEach(() => vi.useRealTimers());

it.each(["success", "nonzero", "spawn-error", "abort"] as const)(
  "clears the deadline after %s and never signals an already-settled child",
  async (completion) => {
    const child = Object.assign(new EventEmitter(), {
      pid: 123,
      stderr: new EventEmitter(),
      kill: vi.fn<(signal: string) => boolean>(),
    });
    mocks.spawn.mockReturnValue(child);
    const controller = new AbortController();
    const work = spawnAndAwaitExit("fixture", [], {
      timeoutMs: 1_000,
      signal: controller.signal,
    });
    const outcome = work.then(
      () => "resolved",
      () => "rejected",
    );
    if (completion === "abort") controller.abort();
    if (completion === "spawn-error") child.emit("error", new Error("ENOENT"));
    else child.emit("exit", completion === "success" ? 0 : 1);
    expect(await outcome).toBe(completion === "success" ? "resolved" : "rejected");
    const killsBeforeDeadline = mocks.terminate.mock.calls.length;
    expect(killsBeforeDeadline).toBe(completion === "abort" ? 1 : 0);
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(mocks.terminate).toHaveBeenCalledTimes(killsBeforeDeadline);
    expect(child.kill).not.toHaveBeenCalled();
  },
);
