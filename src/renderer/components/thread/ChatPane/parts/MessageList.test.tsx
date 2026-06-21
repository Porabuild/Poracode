import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAppStore } from "@/renderer/state/appStore";
import {
  ChatPaneActionsContext,
  useChatPaneActions,
  type ChatPaneActions,
} from "../chatPaneActionsContext";
import { MessageList } from "./MessageList";

type MockVirtualRow = {
  key: string;
  index: number;
  start: number;
};

type MockVirtualizer = {
  getVirtualItems: () => MockVirtualRow[];
  getTotalSize: () => number;
  measure: () => void;
  measureElement: (element: HTMLDivElement | null) => void;
  resizeItem: (index: number, size: number) => void;
  options: { measureElement: (element: Element, entry: undefined, instance: unknown) => number };
  scrollToIndex: (index: number, options?: { align?: "start" | "center" | "end" | "auto" }) => void;
  shouldAdjustScrollPositionOnItemSizeChange?: (
    item: { start: number; size: number },
    delta: number,
    instance: { isScrolling: boolean; scrollDirection: "forward" | "backward" | null },
  ) => boolean;
};

type MockVirtualizerOptions = {
  count: number;
  getScrollElement: () => Element | null;
  useFlushSync?: boolean;
  useAnimationFrameWithResizeObserver?: boolean;
};

const {
  useVirtualizerMock,
  measureMock,
  measureElementMock,
  resizeItemMock,
  optionsMeasureElementMock,
  scrollToIndexMock,
  getVirtualItemsMock,
  getTotalSizeMock,
} = vi.hoisted(() => ({
  useVirtualizerMock: vi.fn<(options: MockVirtualizerOptions) => MockVirtualizer>(),
  measureMock: vi.fn<() => void>(),
  measureElementMock: vi.fn<(element: HTMLDivElement | null) => void>(),
  resizeItemMock: vi.fn<(index: number, size: number) => void>(),
  optionsMeasureElementMock:
    vi.fn<(element: Element, entry: undefined, instance: unknown) => number>(),
  scrollToIndexMock:
    vi.fn<(index: number, options?: { align?: "start" | "center" | "end" | "auto" }) => void>(),
  getVirtualItemsMock: vi.fn<() => MockVirtualRow[]>(),
  getTotalSizeMock: vi.fn<() => number>(),
}));

const { isIosTouchScrollMock } = vi.hoisted(() => ({
  isIosTouchScrollMock: vi.fn<() => boolean>(() => false),
}));

vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: useVirtualizerMock,
}));

vi.mock("@/renderer/utils/iosScroll", () => ({
  isIosTouchScroll: isIosTouchScrollMock,
}));

vi.mock("./items/ChatItemRow", () => ({
  ChatItemRow: (props: { entry: { id: string } }) => {
    const actions = useChatPaneActions();
    return (
      <button type="button" onClick={() => actions?.onContentHeightChange()}>
        {props.entry.id}
      </button>
    );
  },
}));

describe("MessageList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default to the non-iOS (desktop) path; iOS-specific tests opt in.
    // `clearAllMocks` resets call history but not the return value, so reset here.
    isIosTouchScrollMock.mockReturnValue(false);
    useAppStore.setState((state) => ({
      ...state,
      runtimeItemIdsByThread: {},
      runtimeItemsByIdByThread: {},
      runtimeItemChildrenByParentByThread: {},
      runtimeCompletedTurnsByThread: {},
    }));
    getVirtualItemsMock.mockReturnValue([
      { key: "row-2", index: 1, start: 96 },
      { key: "row-3", index: 2, start: 192 },
    ]);
    getTotalSizeMock.mockReturnValue(384);
    optionsMeasureElementMock.mockReturnValue(96);
    useVirtualizerMock.mockReturnValue({
      getVirtualItems: getVirtualItemsMock,
      getTotalSize: getTotalSizeMock,
      measure: measureMock,
      measureElement: measureElementMock,
      resizeItem: resizeItemMock,
      options: { measureElement: optionsMeasureElementMock },
      scrollToIndex: scrollToIndexMock,
    });
  });

  it("renders only the visible virtual rows", () => {
    const scrollElement = document.createElement("div");
    const actions = {
      openProjectRelativePath: vi.fn<(path: string, lineNumber?: number) => void>(),
      revealProjectFolderInTree: vi.fn<(path: string) => void>(),
      showProjectEntryInExplorer: vi.fn<(path: string) => void>(),
      onContentHeightChange: vi.fn<() => void>(),
      projectLocation: { kind: "windows" as const, path: "C:\\repo" },
      projectRootNames: new Set<string>(),
    };

    const threadId = "thread-1";
    useAppStore.getState().applyRuntimeEvent(threadId, {
      type: "item.started",
      threadId,
      itemId: "item-4",
      itemType: "assistant_message",
    });

    render(
      <ChatPaneActionsContext.Provider value={actions}>
        <MessageList
          threadId={threadId}
          entries={makeEntries(["item-1", "item-2", "item-3", "item-4"])}
          scrollElement={scrollElement}
        />
      </ChatPaneActionsContext.Provider>,
    );

    expect(useVirtualizerMock).toHaveBeenCalledOnce();
    const virtualizerOptions = useVirtualizerMock.mock.calls[0]![0];
    expect(virtualizerOptions.count).toBe(4);
    expect(virtualizerOptions.getScrollElement()).toBe(scrollElement);
    expect(virtualizerOptions.useFlushSync).toBe(true);
    expect(virtualizerOptions.useAnimationFrameWithResizeObserver).toBe(true);
    expect(screen.queryByText("item-1")).not.toBeInTheDocument();
    expect(screen.getByText("item-2")).toBeInTheDocument();
    expect(screen.getByText("item-3")).toBeInTheDocument();
    expect(screen.queryByText("item-4")).not.toBeInTheDocument();
    expect(document.querySelectorAll("[data-chat-virtual-row='true']")).toHaveLength(2);
    const virtualSizeBox = document.querySelector("[data-chat-virtual-size-box='true']");
    expect(virtualSizeBox).toHaveClass("overflow-hidden");
    expect(virtualSizeBox).toHaveAttribute("data-bottom-fade-visible", "true");
    expect(virtualSizeBox).toHaveStyle({
      height: "384px",
      maskImage:
        "linear-gradient(to bottom, black calc(100% - 14px), rgb(0 0 0 / var(--lc-chat-bottom-mask-end-alpha, 0)))",
    });
    expect(document.querySelector("[data-chat-virtual-block='true']")).toHaveStyle({
      transform: "translateY(96px)",
    });
    expect(document.querySelector("[data-item-id='item-2']")).not.toHaveAttribute("style");
  });

  it("never lets TanStack adjust scroll itself and compensates rows fully above the viewport on the next commit", () => {
    const { scrollElement, shouldAdjust, commit } = renderCompensationList();

    expect(shouldAdjust({ start: 0, size: 80 }, 40, idleVirtualizer)).toBe(false);

    commit();
    expect(scrollElement.scrollTop).toBe(200);
  });

  it("does not compensate rows that overlap or sit below the viewport", () => {
    const { scrollElement, shouldAdjust, commit } = renderCompensationList();

    expect(shouldAdjust({ start: 96, size: 100 }, 40, idleVirtualizer)).toBe(false);

    commit();
    expect(scrollElement.scrollTop).toBe(160);
  });

  it("compensates rows above the viewport during active upward scroll", () => {
    const { scrollElement, shouldAdjust, commit } = renderCompensationList();

    scrollElement.scrollTop = 120;
    expect(
      shouldAdjust({ start: 0, size: 80 }, -40, {
        isScrolling: true,
        scrollDirection: "backward",
      }),
    ).toBe(false);

    commit();
    expect(scrollElement.scrollTop).toBe(80);
  });

  it("defers above-viewport upward-scroll compensation on iOS until scrollend", () => {
    isIosTouchScrollMock.mockReturnValue(true);
    const { scrollElement, shouldAdjust, commit } = renderCompensationList();

    scrollElement.scrollTop = 120;
    expect(
      shouldAdjust({ start: 0, size: 80 }, -40, {
        isScrolling: true,
        scrollDirection: "backward",
      }),
    ).toBe(false);

    commit();
    // Buffered, not written: a mid-momentum scrollTop write would cancel the
    // iOS inertial scroll.
    expect(scrollElement.scrollTop).toBe(120);

    // Once the scroll settles, the buffered delta lands in a single write.
    scrollElement.dispatchEvent(new Event("scrollend"));
    expect(scrollElement.scrollTop).toBe(80);
  });

  it("flushes the deferred iOS compensation once the scroll idles", () => {
    vi.useFakeTimers();
    isIosTouchScrollMock.mockReturnValue(true);
    try {
      const { scrollElement, shouldAdjust, commit } = renderCompensationList();

      scrollElement.scrollTop = 120;
      shouldAdjust({ start: 0, size: 80 }, -40, {
        isScrolling: true,
        scrollDirection: "backward",
      });
      commit();
      expect(scrollElement.scrollTop).toBe(120);

      // Each scroll tick re-arms the settle timer; it fires only once momentum
      // stops emitting scroll events.
      scrollElement.dispatchEvent(new Event("scroll"));
      vi.advanceTimersByTime(149);
      expect(scrollElement.scrollTop).toBe(120);
      vi.advanceTimersByTime(1);
      expect(scrollElement.scrollTop).toBe(80);
    } finally {
      vi.useRealTimers();
    }
  });

  it("still writes the bottom-sticky compensation immediately on iOS", () => {
    isIosTouchScrollMock.mockReturnValue(true);
    const actions = {
      openProjectRelativePath: vi.fn<(path: string, lineNumber?: number) => void>(),
      revealProjectFolderInTree: vi.fn<(path: string) => void>(),
      showProjectEntryInExplorer: vi.fn<(path: string) => void>(),
      onContentHeightChange: vi.fn<() => void>(),
      isStickToBottom: vi.fn<() => boolean>().mockReturnValue(true),
      projectLocation: { kind: "windows" as const, path: "C:\\repo" },
      projectRootNames: new Set<string>(),
    };
    const { scrollElement, shouldAdjust, commit } = renderCompensationList(actions);

    // Below-viewport streaming row while pinned: never deferred (no upward
    // momentum at the bottom), so the pin stays tight.
    expect(
      shouldAdjust({ start: 96, size: 100 }, 24, {
        isScrolling: true,
        scrollDirection: "forward",
      }),
    ).toBe(false);

    commit();
    expect(scrollElement.scrollTop).toBe(184);
  });

  it("compensates streaming row height changes when bottom-sticky", () => {
    const actions = {
      openProjectRelativePath: vi.fn<(path: string, lineNumber?: number) => void>(),
      revealProjectFolderInTree: vi.fn<(path: string) => void>(),
      showProjectEntryInExplorer: vi.fn<(path: string) => void>(),
      onContentHeightChange: vi.fn<() => void>(),
      isStickToBottom: vi.fn<() => boolean>().mockReturnValue(true),
      projectLocation: { kind: "windows" as const, path: "C:\\repo" },
      projectRootNames: new Set<string>(),
    };
    const { scrollElement, shouldAdjust, commit } = renderCompensationList(actions);

    expect(shouldAdjust({ start: 96, size: 100 }, 24, idleVirtualizer)).toBe(false);

    commit();
    expect(scrollElement.scrollTop).toBe(184);
  });

  it("measures newly mounted rows synchronously so the size correction lands in the mount commit", () => {
    const scrollElement = document.createElement("div");
    optionsMeasureElementMock.mockReturnValue(132);

    render(
      <MessageList
        threadId="thread-1"
        entries={makeEntries(["item-1", "item-2", "item-3", "item-4"])}
        scrollElement={scrollElement}
      />,
    );

    expect(resizeItemMock).toHaveBeenCalledWith(1, 132);
    expect(resizeItemMock).toHaveBeenCalledWith(2, 132);
  });

  it("registers TanStack scrollToIndex as the bottom scroll handler", () => {
    const registerVirtualScrollToBottom = vi.fn<(handler: (() => void) | null) => void>();
    const actions = {
      openProjectRelativePath: vi.fn<(path: string, lineNumber?: number) => void>(),
      revealProjectFolderInTree: vi.fn<(path: string) => void>(),
      showProjectEntryInExplorer: vi.fn<(path: string) => void>(),
      onContentHeightChange: vi.fn<() => void>(),
      registerVirtualScrollToBottom,
      projectLocation: { kind: "windows" as const, path: "C:\\repo" },
      projectRootNames: new Set<string>(),
    };

    const { unmount } = render(
      <ChatPaneActionsContext.Provider value={actions}>
        <MessageList
          threadId="thread-1"
          entries={makeEntries(["item-1", "item-2", "item-3", "item-4"])}
          scrollElement={document.createElement("div")}
        />
      </ChatPaneActionsContext.Provider>,
    );

    const handler = registerVirtualScrollToBottom.mock.calls.find(
      (call): call is [() => void] => typeof call[0] === "function",
    )?.[0];
    expect(handler).toEqual(expect.any(Function));

    handler?.();

    expect(scrollToIndexMock).toHaveBeenCalledWith(3, { align: "end" });

    unmount();

    expect(registerVirtualScrollToBottom).toHaveBeenLastCalledWith(null);
  });

  it("coalesces live row remeasurement to one animation frame while text streams", async () => {
    vi.useFakeTimers();
    const scrollElement = document.createElement("div");
    const threadId = "thread-1";
    useAppStore.getState().applyRuntimeEvent(threadId, {
      type: "item.started",
      threadId,
      itemId: "assistant-1",
      itemType: "assistant_message",
    });

    try {
      render(
        <MessageList
          threadId={threadId}
          entries={makeEntries(["item-1", "item-2", "assistant-1"])}
          scrollElement={scrollElement}
        />,
      );

      measureElementMock.mockClear();

      act(() => {
        useAppStore.getState().applyRuntimeEvent(threadId, {
          type: "content.delta",
          threadId,
          itemId: "assistant-1",
          stream: "assistant_text",
          delta: "new streamed line",
        });
        useAppStore.getState().applyRuntimeEvent(threadId, {
          type: "content.delta",
          threadId,
          itemId: "assistant-1",
          stream: "assistant_text",
          delta: " more text",
        });
      });

      expect(measureElementMock).not.toHaveBeenCalled();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(16);
      });

      expect(measureElementMock).toHaveBeenCalledTimes(1);
      expect(measureElementMock.mock.calls[0]?.[0]).toBe(
        document.querySelector("[data-item-id='assistant-1']"),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("hides the bottom overflow fade when the last timeline item is not an assistant message", () => {
    const threadId = "thread-1";
    useAppStore.getState().applyRuntimeEvent(threadId, {
      type: "item.started",
      threadId,
      itemId: "user-1",
      itemType: "user_message",
    });

    render(
      <MessageList
        threadId={threadId}
        entries={makeEntries(["assistant-1", "user-1"])}
        scrollElement={document.createElement("div")}
      />,
    );

    const virtualSizeBox = document.querySelector("[data-chat-virtual-size-box='true']");
    expect(virtualSizeBox).toHaveAttribute("data-bottom-fade-visible", "false");
    expect(
      (virtualSizeBox as HTMLElement).style.getPropertyValue("--lc-chat-bottom-mask-end-alpha"),
    ).toBe("1");
  });

  it("shows the bottom overflow fade only when the last timeline item is an assistant message", () => {
    const threadId = "thread-1";
    useAppStore.getState().applyRuntimeEvent(threadId, {
      type: "item.started",
      threadId,
      itemId: "assistant-1",
      itemType: "assistant_message",
    });

    render(
      <MessageList
        threadId={threadId}
        entries={makeEntries(["user-1", "assistant-1"])}
        scrollElement={document.createElement("div")}
      />,
    );

    const virtualSizeBox = document.querySelector("[data-chat-virtual-size-box='true']");
    expect(virtualSizeBox).toHaveAttribute("data-bottom-fade-visible", "true");
    expect(
      (virtualSizeBox as HTMLElement).style.getPropertyValue("--lc-chat-bottom-mask-end-alpha"),
    ).toBe("0");
  });

  it("hides the bottom overflow fade when the last timeline item is reasoning", () => {
    const threadId = "thread-1";
    useAppStore.getState().applyRuntimeEvent(threadId, {
      type: "item.started",
      threadId,
      itemId: "reasoning-1",
      itemType: "reasoning",
    });

    render(
      <MessageList
        threadId={threadId}
        entries={makeEntries(["assistant-1", "reasoning-1"])}
        scrollElement={document.createElement("div")}
      />,
    );

    const virtualSizeBox = document.querySelector("[data-chat-virtual-size-box='true']");
    expect(virtualSizeBox).toHaveAttribute("data-bottom-fade-visible", "false");
    expect(
      (virtualSizeBox as HTMLElement).style.getPropertyValue("--lc-chat-bottom-mask-end-alpha"),
    ).toBe("1");
  });

  it("reports virtual total size changes to parent actions", () => {
    const onContentHeightChange = vi.fn<() => void>();
    const actions = {
      openProjectRelativePath: vi.fn<(path: string, lineNumber?: number) => void>(),
      revealProjectFolderInTree: vi.fn<(path: string) => void>(),
      showProjectEntryInExplorer: vi.fn<(path: string) => void>(),
      onContentHeightChange,
      projectLocation: { kind: "windows" as const, path: "C:\\repo" },
      projectRootNames: new Set<string>(),
    };
    const scrollElement = document.createElement("div");
    const { rerender } = render(
      <ChatPaneActionsContext.Provider value={actions}>
        <MessageList
          threadId="thread-1"
          entries={makeEntries(["item-1", "item-2", "item-3", "item-4"])}
          scrollElement={scrollElement}
        />
      </ChatPaneActionsContext.Provider>,
    );

    expect(onContentHeightChange).toHaveBeenCalledOnce();

    getTotalSizeMock.mockReturnValue(288);
    rerender(
      <ChatPaneActionsContext.Provider value={actions}>
        <MessageList
          threadId="thread-1"
          entries={makeEntries(["item-1", "item-2", "item-3", "item-4"])}
          scrollElement={scrollElement}
        />
      </ChatPaneActionsContext.Provider>,
    );

    expect(onContentHeightChange).toHaveBeenCalledTimes(2);
  });

  it("delegates height change to parent actions without calling virtualizer.measure()", () => {
    const onContentHeightChange = vi.fn<() => void>();
    const actions = {
      openProjectRelativePath: vi.fn<(path: string, lineNumber?: number) => void>(),
      revealProjectFolderInTree: vi.fn<(path: string) => void>(),
      showProjectEntryInExplorer: vi.fn<(path: string) => void>(),
      onContentHeightChange,
      projectLocation: { kind: "windows" as const, path: "C:\\repo" },
      projectRootNames: new Set<string>(),
    };

    render(
      <ChatPaneActionsContext.Provider value={actions}>
        <MessageList
          threadId="thread-1"
          entries={makeEntries(["item-1", "item-2", "item-3", "item-4"])}
          scrollElement={document.createElement("div")}
        />
      </ChatPaneActionsContext.Provider>,
    );
    onContentHeightChange.mockClear();
    measureElementMock.mockClear();

    fireEvent.click(screen.getByText("item-2"));

    // The row-action path remeasures mounted rows with measureElement.
    // Calling virtualizer.measure() (no args) resets the entire size cache
    // which causes translateY gaps — so it must NOT be called here.
    expect(measureElementMock).toHaveBeenCalled();
    expect(measureMock).not.toHaveBeenCalled();
    expect(onContentHeightChange).toHaveBeenCalledOnce();
  });
});

function makeEntries(itemIds: readonly string[]) {
  return itemIds.map((id) => ({ kind: "item" as const, id }));
}

const idleVirtualizer = { isScrolling: false, scrollDirection: null } as const;

/**
 * Renders a MessageList wired for the scroll-compensation tests and returns
 * the intercepted size-change predicate plus a `commit` that re-renders so the
 * pending compensation layout effect applies.
 */
function renderCompensationList(actions?: ChatPaneActions) {
  const scrollElement = document.createElement("div");
  scrollElement.scrollTop = 160;
  const entries = makeEntries(["item-1", "item-2", "item-3", "item-4"]);
  // A fresh element per render: re-passing the identical element would let
  // React bail out and skip the commit the compensation effect runs in.
  const makeUi = () => {
    const list = (
      <MessageList threadId="thread-1" entries={entries} scrollElement={scrollElement} />
    );
    return actions ? (
      <ChatPaneActionsContext.Provider value={actions}>{list}</ChatPaneActionsContext.Provider>
    ) : (
      list
    );
  };
  const { rerender } = render(makeUi());
  const virtualizer = useVirtualizerMock.mock.results[0]!.value;
  return {
    scrollElement,
    shouldAdjust: virtualizer.shouldAdjustScrollPositionOnItemSizeChange!,
    commit: () => rerender(makeUi()),
  };
}
