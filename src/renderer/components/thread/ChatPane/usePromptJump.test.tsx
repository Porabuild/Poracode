import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ScrollToIndex } from "@/renderer/components/find/ChatFindBar";
import type { ChatTimelineEntry } from "./chatPaneSelectors";
import { usePromptJump } from "./usePromptJump";

const { loadRuntimeItemThroughHistory } = vi.hoisted(() => ({
  loadRuntimeItemThroughHistory: vi.fn<
    (threadId: string, itemId: string, isCurrent: () => boolean) => Promise<boolean>
  >(async () => true),
}));
vi.mock("./loadRuntimeItemThroughHistory", () => ({ loadRuntimeItemThroughHistory }));

const THREAD_ID = "thread-1";
const LOADED: ChatTimelineEntry[] = [
  { kind: "item", id: "prompt-5" },
  { kind: "item", id: "reply-5" },
];
const WITH_OLDER: ChatTimelineEntry[] = [
  { kind: "item", id: "prompt-1" },
  { kind: "item", id: "reply-1" },
  ...LOADED,
];

function setup(initialEntries: readonly ChatTimelineEntry[] = LOADED) {
  const scrollToIndex = vi.fn<ScrollToIndex>();
  const beforeScroll = vi.fn<() => void>();
  const onUnavailable = vi.fn<() => void>();
  const view = renderHook(
    ({ entries }: { entries: readonly ChatTimelineEntry[] }) =>
      usePromptJump({
        threadId: THREAD_ID,
        entries,
        scrollToIndexRef: { current: scrollToIndex },
        beforeScroll,
        onUnavailable,
      }),
    { initialProps: { entries: initialEntries } },
  );
  return { ...view, scrollToIndex, beforeScroll, onUnavailable };
}

const settle = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });

describe("usePromptJump", () => {
  beforeEach(() => {
    vi.useFakeTimers({
      toFake: ["requestAnimationFrame", "cancelAnimationFrame", "setTimeout", "clearTimeout"],
    });
    loadRuntimeItemThroughHistory.mockReset();
    loadRuntimeItemThroughHistory.mockResolvedValue(true);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("scrolls smoothly to a prompt that is already loaded", () => {
    const { result, scrollToIndex, beforeScroll } = setup();

    act(() => result.current.jumpToPrompt("reply-5"));

    expect(beforeScroll).toHaveBeenCalledOnce();
    expect(scrollToIndex).toHaveBeenCalledWith(1, { align: "start", animated: true });
    expect(loadRuntimeItemThroughHistory).not.toHaveBeenCalled();
    expect(result.current.frozenEntries).toBeNull();
  });

  it("holds the transcript still while an unloaded prompt is paged in, then lands on it instantly", async () => {
    const { result, rerender, scrollToIndex } = setup();
    const paging = Promise.withResolvers<boolean>();
    loadRuntimeItemThroughHistory.mockReturnValueOnce(paging.promise);

    act(() => result.current.jumpToPrompt("prompt-1"));
    expect(result.current.pendingId).toBe("prompt-1");
    expect(result.current.frozenEntries).toBe(LOADED);
    expect(result.current.hidden).toBe(false);

    // Older pages arrive; the transcript keeps its snapshot meanwhile.
    rerender({ entries: WITH_OLDER });
    expect(result.current.frozenEntries).toBe(LOADED);
    expect(scrollToIndex).not.toHaveBeenCalled();

    paging.resolve(true);
    await settle(0);
    expect(result.current.hidden).toBe(true);
    expect(result.current.frozenEntries).toBe(LOADED);

    await settle(150);
    expect(result.current.frozenEntries).toBeNull();

    await settle(100);
    expect(scrollToIndex).toHaveBeenCalledWith(0, { align: "start", animated: false });
    expect(result.current.pendingId).toBeNull();
    expect(result.current.hidden).toBe(false);
  });

  it("reports an unavailable prompt instead of jumping", async () => {
    loadRuntimeItemThroughHistory.mockResolvedValueOnce(false);
    const { result, scrollToIndex, onUnavailable } = setup();

    act(() => result.current.jumpToPrompt("gone"));
    await settle(0);

    expect(onUnavailable).toHaveBeenCalledOnce();
    expect(scrollToIndex).not.toHaveBeenCalled();
    expect(result.current.pendingId).toBeNull();
    expect(result.current.frozenEntries).toBeNull();
  });

  it("releases the frozen transcript before scrolling to a loaded prompt mid-jump", async () => {
    const { result, rerender, scrollToIndex } = setup();
    const paging = Promise.withResolvers<boolean>();
    loadRuntimeItemThroughHistory.mockReturnValueOnce(paging.promise);

    act(() => result.current.jumpToPrompt("prompt-1"));
    rerender({ entries: WITH_OLDER });
    expect(result.current.frozenEntries).toBe(LOADED);

    // `reply-5` is index 3 in the live list but index 1 in the frozen snapshot.
    act(() => result.current.jumpToPrompt("reply-5"));
    expect(scrollToIndex).not.toHaveBeenCalled();
    expect(result.current.frozenEntries).toBeNull();

    await settle(100);
    expect(scrollToIndex).toHaveBeenCalledExactlyOnceWith(3, { align: "start", animated: true });
  });

  it("drops an abandoned jump's frozen state when the thread changes and comes back", async () => {
    const paging = Promise.withResolvers<boolean>();
    loadRuntimeItemThroughHistory.mockReturnValueOnce(paging.promise);
    const scrollToIndex = vi.fn<ScrollToIndex>();
    const view = renderHook(
      ({ threadId }: { threadId: string }) =>
        usePromptJump({
          threadId,
          entries: LOADED,
          scrollToIndexRef: { current: scrollToIndex },
          beforeScroll: vi.fn<() => void>(),
          onUnavailable: vi.fn<() => void>(),
        }),
      { initialProps: { threadId: THREAD_ID } },
    );

    act(() => view.result.current.jumpToPrompt("prompt-1"));
    expect(view.result.current.frozenEntries).toBe(LOADED);

    view.rerender({ threadId: "thread-2" });
    view.rerender({ threadId: THREAD_ID });
    paging.resolve(true);
    await settle(500);

    expect(view.result.current.frozenEntries).toBeNull();
    expect(view.result.current.hidden).toBe(false);
    expect(view.result.current.pendingId).toBeNull();
    expect(scrollToIndex).not.toHaveBeenCalled();
  });

  it("keeps the first jump's snapshot when a second unloaded jump starts mid-paging", async () => {
    const { result, rerender } = setup();
    loadRuntimeItemThroughHistory.mockReturnValue(new Promise<boolean>(() => {}));

    act(() => result.current.jumpToPrompt("prompt-1"));
    rerender({ entries: WITH_OLDER });
    act(() => result.current.jumpToPrompt("prompt-0"));

    expect(result.current.frozenEntries).toBe(LOADED);
    expect(result.current.pendingId).toBe("prompt-0");
  });

  it("lets a newer jump supersede one still paging", async () => {
    const { result, scrollToIndex } = setup();
    const first = Promise.withResolvers<boolean>();
    loadRuntimeItemThroughHistory.mockReturnValueOnce(first.promise);

    act(() => result.current.jumpToPrompt("prompt-1"));
    act(() => result.current.jumpToPrompt("reply-5"));
    await settle(100);
    expect(scrollToIndex).toHaveBeenCalledWith(1, { align: "start", animated: true });

    first.resolve(true);
    await settle(500);
    expect(scrollToIndex).toHaveBeenCalledTimes(1);
    expect(result.current.frozenEntries).toBeNull();
  });
});
