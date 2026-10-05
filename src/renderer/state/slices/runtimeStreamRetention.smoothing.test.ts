import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { create } from "zustand";
import { useSmoothStreamedText } from "@/renderer/hooks/useSmoothStreamedText";
import { useWindowedAssistantText } from "@/renderer/components/thread/ChatPane/parts/items/useWindowedAssistantText";
import { PLAIN_TEXT_WINDOW_CHARS } from "@/renderer/components/thread/ChatPane/parts/items/longPlainText";
import { assistantDisplayText } from "@/shared/assistantMessageText";
import { HEAD_CHARS, TAIL_CHARS } from "@/shared/runtimeStreamRetentionPolicy";
import { createRuntimeEventSlice, type RuntimeEventSlice } from "./runtimeEventSlice";

describe("bounded reducer streams with smoothing", () => {
  let frames: Map<number, FrameRequestCallback>;

  beforeEach(() => {
    frames = new Map();
    let nextId = 0;
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      const id = ++nextId;
      frames.set(id, callback);
      return id;
    });
    vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
    vi.spyOn(window, "matchMedia").mockImplementation((query) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn<MediaQueryList["addListener"]>(),
      removeListener: vi.fn<MediaQueryList["removeListener"]>(),
      addEventListener: vi.fn<MediaQueryList["addEventListener"]>(),
      removeEventListener: vi.fn<MediaQueryList["removeEventListener"]>(),
      dispatchEvent: vi.fn<MediaQueryList["dispatchEvent"]>(() => false),
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("snaps to each new head/notice/tail projection, cancels stale reveal and survives remount", () => {
    const store = create<RuntimeEventSlice>()((set, get, api) =>
      createRuntimeEventSlice(set as never, get as never, api as never),
    );
    store.getState().applyRuntimeEvents("thread", [
      { type: "item.started", threadId: "thread", itemId: "item", itemType: "assistant_message" },
      {
        type: "content.delta",
        threadId: "thread",
        itemId: "item",
        stream: "assistant_text",
        delta: "A",
      },
    ]);
    const readItem = () => store.getState().runtimeItemsByIdByThread.thread!.item!;
    const append = (delta: string, replace = false) =>
      act(() => {
        store.getState().applyRuntimeEvent("thread", {
          type: "content.delta",
          threadId: "thread",
          itemId: "item",
          stream: "assistant_text",
          delta,
          replace,
        });
      });
    const useSmoothedItem = () => {
      const item = store((state) => state.runtimeItemsByIdByThread.thread!.item!);
      return useSmoothStreamedText(item.streams.assistant_text!, item.state !== "completed", 1_000);
    };
    const firstMount = renderHook(useSmoothedItem);
    append("x".repeat(HEAD_CHARS + TAIL_CHARS - 1));
    expect(firstMount.result.current).toBe("A");
    expect(frames.size).toBe(1);

    append("first tail");
    expect(readItem().streamRetention).toBeDefined();
    expect(firstMount.result.current).toBe(readItem().streams.assistant_text);
    expect(firstMount.result.current.endsWith("first tail")).toBe(true);
    expect(frames.size).toBe(0);
    const firstProjection = firstMount.result.current;
    append(" next tail");
    expect(readItem().streams.assistant_text!.length).toBe(firstProjection.length);
    expect(readItem().streams.assistant_text!.startsWith(firstProjection)).toBe(false);
    expect(firstMount.result.current).toBe(readItem().streams.assistant_text);
    expect(firstMount.result.current.endsWith(" next tail")).toBe(true);
    expect(frames.size).toBe(0);

    firstMount.unmount();
    const remounted = renderHook(useSmoothedItem);
    expect(remounted.result.current).toBe(readItem().streams.assistant_text);
    append(" fresh", true);
    expect(remounted.result.current).toBe(" fresh");
    append(" pending reveal");
    expect(frames.size).toBe(1);
    act(() =>
      store.getState().applyRuntimeEvent("thread", {
        type: "item.completed",
        threadId: "thread",
        itemId: "item",
      }),
    );
    expect(remounted.result.current).toBe(" fresh pending reveal");
    expect(frames.size).toBe(0);
    remounted.unmount();
  });

  it("keeps reducer-backed reader pages fixed while copy text converges, with no reader animation frames", () => {
    const store = create<RuntimeEventSlice>()((set, get, api) =>
      createRuntimeEventSlice(set as never, get as never, api as never),
    );
    store.getState().applyRuntimeEvents("thread", [
      { type: "item.started", threadId: "thread", itemId: "item", itemType: "assistant_message" },
      {
        type: "content.delta",
        threadId: "thread",
        itemId: "item",
        stream: "assistant_text",
        delta: `${"h".repeat(HEAD_CHARS)}${"m".repeat(1_000)}${"t".repeat(TAIL_CHARS)}`,
      },
    ]);
    const append = (delta: string, replace = false) =>
      act(() => {
        store.getState().applyRuntimeEvent("thread", {
          type: "content.delta",
          threadId: "thread",
          itemId: "item",
          stream: "assistant_text",
          delta,
          replace,
        });
      });
    const { result, unmount } = renderHook(() => {
      const item = store((state) => state.runtimeItemsByIdByThread.thread!.item!);
      const text = assistantDisplayText(item);
      return {
        body: useWindowedAssistantText(
          text,
          item.state !== "completed",
          item.streamRetention?.assistant_text,
        ),
        copyText: text,
      };
    });
    act(() => result.current.body.showEarlier());
    const selected = result.current.body.window;
    const projectedLength = result.current.copyText.length;
    for (const delta of [" new one", " new two", " new three"]) {
      append(delta);
      expect(result.current.copyText.length).toBe(projectedLength);
      expect(result.current.copyText.endsWith(delta)).toBe(true);
      expect(result.current.body.window).toBe(selected);
      expect(frames.size).toBe(0);
    }
    // Same retained head with more elision is still a new source when replace=true.
    append(`${"h".repeat(HEAD_CHARS)}${"m".repeat(20_000)}${"r".repeat(TAIL_CHARS)}`, true);
    expect(result.current.body.isBrowsingEarlier).toBe(false);
    expect(result.current.body.window?.text).toBe("r".repeat(PLAIN_TEXT_WINDOW_CHARS));
    act(() => result.current.body.showEarlier());
    append("h".repeat(PLAIN_TEXT_WINDOW_CHARS * 3), true);
    expect(result.current.body.isBrowsingEarlier).toBe(false);
    act(() => result.current.body.showEarlier());
    append("", true);
    expect(result.current.body.isBrowsingEarlier).toBe(false);
    expect(result.current.body.window).toBeNull();
    expect(frames.size).toBe(0);
    unmount();
    expect(frames.size).toBe(0);
  });
});
