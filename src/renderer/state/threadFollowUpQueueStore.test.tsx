import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ThreadFollowUpQueueState } from "@/shared/contracts";
import {
  captureThreadFollowUpQueueSnapshot,
  isThreadFollowUpQueueSnapshotCurrent,
  useThreadFollowUpQueue,
  useThreadFollowUpQueueStore,
} from "./threadFollowUpQueueStore";

const bridge = vi.hoisted(() => ({
  getThreadFollowUpQueue: vi.fn<() => Promise<ThreadFollowUpQueueState | null>>(),
}));
vi.mock("@/renderer/bridge", () => ({ readBridge: () => bridge }));
const queued: ThreadFollowUpQueueState = {
  items: [{ id: "one", prompt: "Next task", stagedAt: 1 }],
  paused: false,
};

describe("follow-up queue snapshots", () => {
  beforeEach(() => {
    useThreadFollowUpQueueStore.setState({ byThread: {} });
    bridge.getThreadFollowUpQueue.mockReset();
  });

  it("hydrates the queue after opening a thread", async () => {
    bridge.getThreadFollowUpQueue.mockResolvedValue(queued);
    const { result } = renderHook(() => useThreadFollowUpQueue("thread"));
    await waitFor(() => expect(result.current).toEqual(queued));
    expect(bridge.getThreadFollowUpQueue).toHaveBeenCalledWith({ threadId: "thread" });
  });

  it("does not resurrect a queue cleared while its snapshot was loading", async () => {
    const snapshot = Promise.withResolvers<ThreadFollowUpQueueState | null>();
    bridge.getThreadFollowUpQueue.mockReturnValue(snapshot.promise);
    const { result } = renderHook(() => useThreadFollowUpQueue("thread"));
    act(() => useThreadFollowUpQueueStore.getState().setQueue("thread", null));
    await act(async () => snapshot.resolve(queued));
    expect(result.current).toBeNull();
  });

  it("ignores an old thread's snapshot after switching away", async () => {
    const snapshot = Promise.withResolvers<ThreadFollowUpQueueState | null>();
    bridge.getThreadFollowUpQueue.mockReturnValueOnce(snapshot.promise).mockResolvedValue(null);
    const { result, rerender } = renderHook(({ id }) => useThreadFollowUpQueue(id), {
      initialProps: { id: "first" },
    });
    rerender({ id: "second" });
    await act(async () => snapshot.resolve(queued));
    expect(result.current).toBeNull();
    expect(useThreadFollowUpQueueStore.getState().byThread.first).toBeUndefined();
  });

  it("ignores an in-flight snapshot across a remote desktop reset", async () => {
    const snapshot = Promise.withResolvers<ThreadFollowUpQueueState | null>();
    bridge.getThreadFollowUpQueue.mockReturnValue(snapshot.promise);
    const { result } = renderHook(() => useThreadFollowUpQueue("thread"));
    act(() => useThreadFollowUpQueueStore.getState().reset());
    await act(async () => snapshot.resolve(queued));
    expect(result.current).toBeNull();
    expect(useThreadFollowUpQueueStore.getState().byThread).toEqual({});
  });

  it("invalidates a history guard only when that thread's queue changes", () => {
    const guard = captureThreadFollowUpQueueSnapshot("thread");
    act(() => useThreadFollowUpQueueStore.getState().setQueue("other", queued));
    expect(isThreadFollowUpQueueSnapshotCurrent("thread", guard)).toBe(true);

    act(() => useThreadFollowUpQueueStore.getState().setQueue("thread", null));
    expect(isThreadFollowUpQueueSnapshotCurrent("thread", guard)).toBe(false);
  });
});
