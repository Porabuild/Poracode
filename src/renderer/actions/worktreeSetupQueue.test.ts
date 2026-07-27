import { describe, expect, it, vi } from "vitest";
import { WorktreeSetupQueue } from "./worktreeSetupQueue";

describe("WorktreeSetupQueue", () => {
  it("runs setup jobs serially", async () => {
    const queue = new WorktreeSetupQueue();
    const started: string[] = [];
    let finishFirst!: () => void;
    const first = queue.enqueue(
      "first",
      () =>
        new Promise<void>((resolve) => {
          started.push("first");
          finishFirst = resolve;
        }),
    );
    const second = queue.enqueue("second", async () => {
      started.push("second");
    });

    await vi.waitFor(() => expect(started).toEqual(["first"]));
    finishFirst();
    await Promise.all([first, second]);

    expect(started).toEqual(["first", "second"]);
  });

  it("cancels queued work for a removed worktree", async () => {
    const queue = new WorktreeSetupQueue();
    let finishActive!: () => void;
    const active = queue.enqueue(
      "active",
      () =>
        new Promise<void>((resolve) => {
          finishActive = resolve;
        }),
    );
    const canceledRun = vi.fn<() => Promise<void>>(async () => undefined);
    const canceled = queue.enqueue("removed", canceledRun);

    await vi.waitFor(() => expect(finishActive).toBeTypeOf("function"));
    queue.cancelPending("removed");
    await canceled;
    expect(canceledRun).not.toHaveBeenCalled();

    finishActive();
    await active;
  });

  it("continues after an unexpected setup error", async () => {
    const queue = new WorktreeSetupQueue();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const nextRun = vi.fn<() => Promise<void>>(async () => undefined);

    await Promise.all([
      queue.enqueue("failed", async () => {
        throw new Error("failed");
      }),
      queue.enqueue("next", nextRun),
    ]);

    expect(nextRun).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalledWith("[renderer] worktree setup failed:", "failed");
    warn.mockRestore();
  });
});
