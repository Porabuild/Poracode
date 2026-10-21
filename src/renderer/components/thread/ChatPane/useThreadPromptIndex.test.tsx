import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PersistedPromptIndex } from "@/shared/ipc";
import { useThreadPromptIndex } from "./useThreadPromptIndex";

const { readThreadPromptIndex } = vi.hoisted(() => ({
  readThreadPromptIndex:
    vi.fn<(threadId: string, signal?: AbortSignal) => Promise<PersistedPromptIndex | null>>(),
}));
vi.mock("@/renderer/state/threadPromptIndex", () => ({ readThreadPromptIndex }));

const INDEX: PersistedPromptIndex = {
  prompts: [{ itemId: "prompt-1", position: 2, text: "Hello" }],
  truncated: false,
};

const settle = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });

describe("useThreadPromptIndex", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    readThreadPromptIndex.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("reads nothing while the rail has no room", async () => {
    const { result } = renderHook(() => useThreadPromptIndex("thread-1", false));
    await settle(10_000);
    expect(readThreadPromptIndex).not.toHaveBeenCalled();
    expect(result.current).toBeNull();
  });

  it("does not read the index again when the rail hides and shows", async () => {
    readThreadPromptIndex.mockResolvedValue(INDEX);
    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) => useThreadPromptIndex("thread-1", enabled),
      { initialProps: { enabled: true } },
    );
    await settle(0);
    rerender({ enabled: false });
    rerender({ enabled: true });
    await settle(0);

    expect(readThreadPromptIndex).toHaveBeenCalledOnce();
    expect(result.current).toEqual(INDEX);
  });

  it("returns the index once it is read", async () => {
    readThreadPromptIndex.mockResolvedValue(INDEX);
    const { result } = renderHook(() => useThreadPromptIndex("thread-1", true));
    await settle(0);
    expect(result.current).toEqual(INDEX);
    expect(readThreadPromptIndex).toHaveBeenCalledOnce();
  });

  it("retries a failed read so one transient error does not cost the visit its history", async () => {
    readThreadPromptIndex.mockResolvedValueOnce(null).mockResolvedValueOnce(INDEX);
    const { result } = renderHook(() => useThreadPromptIndex("thread-1", true));

    await settle(0);
    expect(result.current).toBeNull();
    await settle(1_500);
    expect(result.current).toEqual(INDEX);
    expect(readThreadPromptIndex).toHaveBeenCalledTimes(2);
  });

  it("stops after a bounded number of retries when the host has no index", async () => {
    readThreadPromptIndex.mockResolvedValue(null);
    const { result } = renderHook(() => useThreadPromptIndex("thread-1", true));

    await settle(60_000);
    expect(result.current).toBeNull();
    expect(readThreadPromptIndex).toHaveBeenCalledTimes(3);
  });

  it("abandons a pending retry when the thread changes", async () => {
    readThreadPromptIndex.mockResolvedValueOnce(null).mockResolvedValue(INDEX);
    const { result, rerender } = renderHook(
      ({ threadId }: { threadId: string }) => useThreadPromptIndex(threadId, true),
      { initialProps: { threadId: "thread-1" } },
    );
    await settle(0);
    rerender({ threadId: "thread-2" });
    await settle(0);

    expect(readThreadPromptIndex.mock.calls.map(([threadId]) => threadId)).toEqual([
      "thread-1",
      "thread-2",
    ]);
    expect(result.current).toEqual(INDEX);
  });
});
