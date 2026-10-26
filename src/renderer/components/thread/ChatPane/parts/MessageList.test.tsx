import { act, fireEvent, screen } from "@testing-library/react";
import { createRef } from "react";
import type { AnchoredEndSpaceConfig } from "@legendapp/list/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import type { ChatTimelineEntry } from "../chatPaneSelectors";
import {
  ChatPaneActionsContext,
  useChatPaneActions,
  type ChatPaneActions,
} from "../chatPaneActionsContext";
import { useAppStore } from "@/renderer/state/appStore";
import { MessageList } from "./MessageList";
import { clearTimelineMeasurementCache } from "./timelineMeasurementCache";

type MockLegendProps = {
  data: readonly ChatTimelineEntry[];
  dataKey: string;
  contentInsetEndAdjustment?: number;
  drawDistance?: number;
  estimatedItemSize: number;
  getFixedItemSize: (item: ChatTimelineEntry, index: number, type: string) => number | undefined;
  getItemType: (item: ChatTimelineEntry, index: number) => string;
  initialScrollAtEnd: boolean;
  maintainScrollAtEnd: unknown;
  anchoredEndSpace?: AnchoredEndSpaceConfig;
  maintainScrollAtEndThreshold: number;
  maintainVisibleContentPosition: unknown;
  onStartReached?: () => void;
  onStartReachedThreshold?: number;
  recycleItems: boolean;
  renderItem: (input: { item: ChatTimelineEntry; index: number }) => React.ReactNode;
  keyExtractor: (item: ChatTimelineEntry, index: number) => string;
  ListHeaderComponent?: React.ReactNode;
  ListEmptyComponent?: React.ReactNode;
  ListFooterComponent?: React.ReactNode;
  className?: string;
  contentContainerClassName?: string;
  contentContainerStyle?: React.CSSProperties;
  onContentSizeCommit?: (info: { size: number; horizontal: boolean }) => void;
  onLoad?: () => void;
  onWheelCapture?: React.WheelEventHandler<HTMLDivElement>;
  onPointerDownCapture?: React.PointerEventHandler<HTMLDivElement>;
  onKeyDownCapture?: React.KeyboardEventHandler<HTMLDivElement>;
  style?: React.CSSProperties;
};

const {
  legendDomReflowMode,
  latestLegendProps,
  legendSizes,
  totalSizeListener,
  scrollToEndMock,
  scrollToIndexMock,
  setItemSizeMock,
  unsubscribeMock,
} = vi.hoisted(() => ({
  legendDomReflowMode: { current: "sync" as "sync" | "deferred" },
  latestLegendProps: { current: null as unknown },
  legendSizes: new Map<string, number>(),
  totalSizeListener: { current: null as null | (() => void) },
  scrollToEndMock: vi.fn<() => Promise<void>>(() => Promise.resolve()),
  scrollToIndexMock: vi.fn<() => Promise<void>>(() => Promise.resolve()),
  setItemSizeMock: vi.fn<(itemKey: string, size: { width: number; height: number }) => void>(),
  unsubscribeMock: vi.fn<() => void>(),
}));

const MOCK_ROW_SIZE = 100;

vi.mock("@legendapp/list/react", async () => {
  const React = await import("react");
  return {
    LegendList: React.forwardRef(function MockLegendList(
      props: MockLegendProps,
      forwardedRef: React.ForwardedRef<unknown>,
    ) {
      // Published for assertions via an effect so the mock never writes the
      // shared box during render.
      React.useEffect(() => {
        latestLegendProps.current = props;
      });
      const scrollRef = React.useRef<HTMLDivElement>(null);
      const onLoadRef = React.useRef(props.onLoad);
      const setScrollRef = React.useCallback(
        (element: HTMLDivElement | null) => {
          scrollRef.current = element;
          if (element) {
            Object.defineProperty(element, "clientWidth", { configurable: true, value: 500 });
          }
        },
        [scrollRef],
      );
      React.useImperativeHandle(forwardedRef, () => ({
        getScrollableNode: () => scrollRef.current,
        getState: () => ({
          sizes: legendSizes,
          positionAtIndex: (index: number) =>
            props.data
              .slice(0, index)
              .reduce(
                (top, item, itemIndex) =>
                  top + (legendSizes.get(props.keyExtractor(item, itemIndex)) ?? MOCK_ROW_SIZE),
                0,
              ),
          positionByKey: (key: string) => {
            const index = props.data.findIndex((entry) => entry.id === key);
            return index < 0 ? undefined : index * MOCK_ROW_SIZE;
          },
          sizeAtIndex: (index: number) => {
            const item = props.data[index];
            return item
              ? (legendSizes.get(props.keyExtractor(item, index)) ?? MOCK_ROW_SIZE)
              : Number.NaN;
          },
          listen: (name: string, listener: () => void) => {
            if (name === "totalSize") totalSizeListener.current = listener;
            return unsubscribeMock;
          },
        }),
        scrollToEnd: scrollToEndMock,
        scrollToIndex: scrollToIndexMock,
        setItemSize: (itemKey: string, size: { width: number; height: number }) => {
          legendSizes.set(itemKey, size.height);
          setItemSizeMock(itemKey, size);
          if (legendDomReflowMode.current === "sync") {
            const content = scrollRef.current?.querySelector(".legend-list-content-container");
            let top = 0;
            for (let index = 0; index < props.data.length; index += 1) {
              const item = props.data[index]!;
              const key = props.keyExtractor(item, index);
              const container = Array.from(content?.children ?? []).find(
                (element) =>
                  element instanceof HTMLElement && element.dataset.mockLegendKey === key,
              );
              if (container instanceof HTMLElement) container.style.top = `${top}px`;
              top += legendSizes.get(key) ?? MOCK_ROW_SIZE;
            }
          }
        },
      }));
      React.useLayoutEffect(() => {
        onLoadRef.current?.();
      }, []);
      return (
        <div
          ref={setScrollRef}
          className={props.className}
          data-poracode-chat-scroller="true"
          onKeyDownCapture={props.onKeyDownCapture}
          onPointerDownCapture={props.onPointerDownCapture}
          onWheelCapture={props.onWheelCapture}
          style={props.style}
        >
          <div
            className={`legend-list-content-container ${props.contentContainerClassName ?? ""}`}
            style={props.contentContainerStyle}
          >
            {props.ListHeaderComponent}
            {props.data.length === 0 ? props.ListEmptyComponent : null}
            {/* Mirror LegendList's absolutely positioned per-row containers so
                row code that reads/writes sibling offsets is exercised. */}
            {props.data.map((item, index) => (
              <div
                key={props.keyExtractor(item, index)}
                data-mock-legend-key={props.keyExtractor(item, index)}
                style={{
                  position: "absolute",
                  top: `${props.data
                    .slice(0, index)
                    .reduce(
                      (top, preceding, precedingIndex) =>
                        top +
                        (legendSizes.get(props.keyExtractor(preceding, precedingIndex)) ??
                          MOCK_ROW_SIZE),
                      0,
                    )}px`,
                }}
              >
                {props.renderItem({ item, index })}
              </div>
            ))}
            {props.ListFooterComponent}
          </div>
        </div>
      );
    }),
  };
});

vi.mock("./items/ChatItemRow", () => ({
  ChatItemRow: (props: {
    entry: { id: string };
    onHeightChange?: () => void;
    isReasoningLive?: boolean;
  }) => {
    const actions = useChatPaneActions();
    return (
      <button
        type="button"
        data-reasoning-live={props.isReasoningLive}
        onClick={() => {
          props.onHeightChange?.();
          actions?.onContentHeightChange?.();
        }}
      >
        {props.entry.id}
      </button>
    );
  },
}));

describe("MessageList", () => {
  it("reports initial measured layout independently from later content-size commits", () => {
    const onInitialLayoutReady = vi.fn<() => void>();
    render(
      <MessageList threadId="thread-1" entries={[]} onInitialLayoutReady={onInitialLayoutReady} />,
    );
    expect(onInitialLayoutReady).toHaveBeenCalledOnce();
    act(() =>
      (latestLegendProps.current as MockLegendProps).onContentSizeCommit?.({
        size: 200,
        horizontal: false,
      }),
    );
    expect(onInitialLayoutReady).toHaveBeenCalledOnce();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    legendDomReflowMode.current = "sync";
    legendSizes.clear();
    totalSizeListener.current = null;
    clearTimelineMeasurementCache();
    useAppStore.setState((state) => ({
      ...state,
      runtimeItemIdsByThread: {},
      runtimeItemsByIdByThread: {},
      runtimeItemChildrenByParentByThread: {},
      runtimeCompletedTurnsByThread: {},
      chatScrollToPromptRequests: {},
      chatPromptAnchorIds: {},
      chatScrollToBottomTokens: {},
    }));
  });

  it.each([false, true])(
    "scrolls the submitted prompt to the top with trailing space, reduced motion=%s",
    (reducedMotion) => {
      const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
      const matchMedia = vi.spyOn(window, "matchMedia").mockReturnValue({
        matches: reducedMotion,
        media: mediaQuery.media,
        onchange: null,
        addListener: () => undefined,
        removeListener: () => undefined,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        dispatchEvent: () => false,
      });
      vi.useFakeTimers();
      try {
        seedCompletedItem("thread-1", "old-prompt", "user_message");
        seedCompletedItem("thread-1", "answer", "assistant_message");
        const onNewPrompt = vi.fn<() => void>();
        const onPromptScrollWrite = vi.fn<(top: number) => void>();
        const { rerender, container } = render(
          <MessageList
            threadId="thread-1"
            entries={makeEntries(["old-prompt", "answer"])}
            onNewPrompt={onNewPrompt}
            onPromptScrollWrite={onPromptScrollWrite}
          />,
        );
        act(() => {
          useAppStore.getState().requestChatScrollToPrompt("thread-1");
        });
        expect((latestLegendProps.current as MockLegendProps).anchoredEndSpace).toBeUndefined();
        expect(onNewPrompt).not.toHaveBeenCalled();
        act(() => seedCompletedItem("thread-1", "new-prompt", "user_message"));
        rerender(
          <MessageList
            threadId="thread-1"
            entries={makeEntries(["old-prompt", "answer", "new-prompt"])}
            onNewPrompt={onNewPrompt}
            onPromptScrollWrite={onPromptScrollWrite}
          />,
        );
        const props = latestLegendProps.current as MockLegendProps;
        expect(onNewPrompt).toHaveBeenCalledOnce();
        expect(props.maintainScrollAtEnd).toBe(false);
        expect(props.anchoredEndSpace).toMatchObject({ anchorIndex: 2, anchorOffset: 0 });
        const scroller = container.querySelector<HTMLElement>("[data-poracode-chat-scroller]")!;
        act(() => props.anchoredEndSpace?.onSizeChanged?.(400));
        expect(scroller.dataset.chatEndSpaceSize).toBe("400");
        act(() =>
          props.anchoredEndSpace?.onReady?.({ anchorIndex: 2, anchorKey: "new-prompt", size: 400 }),
        );
        act(() => {
          vi.advanceTimersByTime(80);
        });
        expect(scroller.scrollTop).toBeGreaterThan(0);
        expect(scroller.scrollTop).toBeLessThanOrEqual(200);
        expect(scroller.scrollTop === 200).toBe(reducedMotion);
        act(() => {
          vi.advanceTimersByTime(128);
        });
        expect(scroller.scrollTop).toBe(200);
        expect(onPromptScrollWrite).toHaveBeenLastCalledWith(200);
        act(() => props.anchoredEndSpace?.onSizeChanged?.(120));
        expect(scroller.dataset.chatEndSpaceSize).toBe("120");
        act(() => {
          useAppStore.getState().requestChatScrollToBottom("thread-1");
        });
        expect((latestLegendProps.current as MockLegendProps).anchoredEndSpace).toMatchObject({
          anchorIndex: 2,
        });
        act(() => {
          useAppStore.getState().clearChatPromptAnchor("thread-1");
        });
        expect((latestLegendProps.current as MockLegendProps).anchoredEndSpace).toBeUndefined();
        expect(scroller.dataset.chatEndSpaceSize).toBeUndefined();
      } finally {
        vi.useRealTimers();
        matchMedia.mockRestore();
      }
    },
  );

  it.each(["manual scroll", "return to bottom"])("cancels the prompt animation on %s", (action) => {
    vi.useFakeTimers();
    try {
      seedCompletedItem("thread-1", "old-prompt", "user_message");
      const { rerender, container } = render(
        <MessageList
          threadId="thread-1"
          entries={makeEntries(["old-prompt"])}
          onStartReached={() => undefined}
        />,
      );
      act(() => {
        useAppStore.getState().requestChatScrollToPrompt("thread-1");
      });
      act(() => seedCompletedItem("thread-1", "new-prompt", "user_message"));
      rerender(
        <MessageList
          threadId="thread-1"
          entries={makeEntries(["old-prompt", "new-prompt"])}
          onStartReached={() => undefined}
        />,
      );
      const props = latestLegendProps.current as MockLegendProps;
      const scroller = container.querySelector<HTMLElement>("[data-poracode-chat-scroller]")!;
      act(() =>
        props.anchoredEndSpace?.onReady?.({ anchorIndex: 1, anchorKey: "new-prompt", size: 400 }),
      );
      act(() => {
        vi.advanceTimersByTime(80);
      });
      if (action === "manual scroll") fireEvent.wheel(scroller, { deltaY: -40 });
      else
        act(() => {
          useAppStore.getState().clearChatPromptAnchor("thread-1");
        });
      const stoppedAt = scroller.scrollTop;
      act(() => {
        vi.advanceTimersByTime(200);
      });
      expect(scroller.scrollTop).toBe(stoppedAt);
    } finally {
      vi.useRealTimers();
    }
  });

  it("honors manual navigation before a queued prompt arrives", () => {
    seedCompletedItem("thread-1", "old-prompt", "user_message");
    const { rerender, container } = render(
      <MessageList
        threadId="thread-1"
        entries={makeEntries(["old-prompt"])}
        onStartReached={() => undefined}
      />,
    );
    act(() => {
      useAppStore.getState().requestChatScrollToPrompt("thread-1", true);
    });
    fireEvent.wheel(container.querySelector("[data-poracode-chat-scroller]")!, { deltaY: -40 });
    act(() => {
      seedCompletedItem("thread-1", "queued-prompt", "user_message");
    });
    rerender(
      <MessageList
        threadId="thread-1"
        entries={makeEntries(["old-prompt", "queued-prompt"])}
        onStartReached={() => undefined}
      />,
    );
    expect((latestLegendProps.current as MockLegendProps).anchoredEndSpace).toBeUndefined();
  });

  it("anchors each queued prompt and consumes requests across a remount", () => {
    seedCompletedItem("thread-1", "old-prompt", "user_message");
    const { rerender, unmount } = render(
      <MessageList threadId="thread-1" entries={makeEntries(["old-prompt"])} />,
    );
    act(() => {
      useAppStore.getState().requestChatScrollToPrompt("thread-1", true);
      useAppStore.getState().requestChatScrollToPrompt("thread-1", true);
      seedCompletedItem("thread-1", "queued-1", "user_message");
    });
    rerender(<MessageList threadId="thread-1" entries={makeEntries(["old-prompt", "queued-1"])} />);
    expect((latestLegendProps.current as MockLegendProps).anchoredEndSpace?.anchorIndex).toBe(1);
    act(() => {
      seedCompletedItem("thread-1", "queued-2", "user_message");
    });
    const entries = makeEntries(["old-prompt", "queued-1", "queued-2"]);
    rerender(<MessageList threadId="thread-1" entries={entries} />);
    expect((latestLegendProps.current as MockLegendProps).anchoredEndSpace?.anchorIndex).toBe(2);
    expect(useAppStore.getState().chatScrollToPromptRequests["thread-1"]).toBeUndefined();
    unmount();
    render(<MessageList threadId="thread-1" entries={entries} />);
    expect((latestLegendProps.current as MockLegendProps).anchoredEndSpace).toMatchObject({
      anchorIndex: 2,
    });
  });

  it.each([false, true])(
    "restores reserved space after a remount with delayed history=%s",
    (delayed) => {
      vi.useFakeTimers();
      seedCompletedItem("thread-1", "old-prompt", "user_message");
      const original = render(
        <MessageList threadId="thread-1" entries={makeEntries(["old-prompt"])} />,
      );
      act(() => {
        useAppStore.getState().requestChatScrollToPrompt("thread-1");
        seedCompletedItem("thread-1", "new-prompt", "user_message");
      });
      const entries = makeEntries(["old-prompt", "new-prompt"]);
      original.rerender(<MessageList threadId="thread-1" entries={entries} />);
      original.unmount();
      const other = render(<MessageList threadId="thread-2" entries={[]} />);
      expect((latestLegendProps.current as MockLegendProps).anchoredEndSpace).toBeUndefined();
      other.unmount();
      act(() => {
        // Opening the thread again re-arms its bottom pin without dropping the anchor.
        useAppStore.getState().requestChatScrollToBottom("thread-1");
      });

      const onNewPrompt = vi.fn<() => void>();
      const restored = render(
        <MessageList
          threadId="thread-1"
          entries={delayed ? [] : entries}
          onNewPrompt={onNewPrompt}
        />,
      );
      if (delayed)
        restored.rerender(
          <MessageList threadId="thread-1" entries={entries} onNewPrompt={onNewPrompt} />,
        );
      const props = latestLegendProps.current as MockLegendProps;
      expect(props.anchoredEndSpace?.anchorIndex).toBe(1);
      expect(useAppStore.getState().chatScrollToPromptRequests["thread-1"]).toBeUndefined();
      act(() =>
        props.anchoredEndSpace?.onReady?.({ anchorIndex: 1, anchorKey: "new-prompt", size: 400 }),
      );
      act(() => {
        vi.advanceTimersByTime(16);
      });
      expect(
        restored.container.querySelector<HTMLElement>("[data-poracode-chat-scroller]")!.scrollTop,
      ).toBe(100);
      expect(onNewPrompt).toHaveBeenCalled();
      restored.unmount();

      // A reply that filled its space while away leaves the reader at its tail.
      const onFilledNewPrompt = vi.fn<() => void>();
      const filled = render(
        <MessageList threadId="thread-1" entries={entries} onNewPrompt={onFilledNewPrompt} />,
      );
      act(() =>
        (latestLegendProps.current as MockLegendProps).anchoredEndSpace?.onReady?.({
          anchorIndex: 1,
          anchorKey: "new-prompt",
          size: 0,
        }),
      );
      act(() => {
        vi.advanceTimersByTime(16);
      });
      expect(useAppStore.getState().chatPromptAnchorIds["thread-1"]).toBeUndefined();
      expect((latestLegendProps.current as MockLegendProps).anchoredEndSpace).toBeUndefined();
      expect(onFilledNewPrompt).not.toHaveBeenCalled();
      expect(
        filled.container.querySelector<HTMLElement>("[data-poracode-chat-scroller]")!.scrollTop,
      ).toBe(0);
      vi.useRealTimers();
    },
  );

  it("retargets the prompt by identity when history is prepended during its animation", () => {
    vi.useFakeTimers();
    try {
      seedCompletedItem("thread-1", "old-prompt", "user_message");
      const { rerender, container } = render(
        <MessageList threadId="thread-1" entries={makeEntries(["old-prompt"])} />,
      );
      act(() => {
        useAppStore.getState().requestChatScrollToPrompt("thread-1");
        seedCompletedItem("thread-1", "new-prompt", "user_message");
      });
      rerender(
        <MessageList threadId="thread-1" entries={makeEntries(["old-prompt", "new-prompt"])} />,
      );
      act(() => {
        (latestLegendProps.current as MockLegendProps).anchoredEndSpace?.onReady?.({
          anchorIndex: 1,
          anchorKey: "new-prompt",
          size: 400,
        });
      });
      act(() => {
        vi.advanceTimersByTime(80);
      });
      rerender(
        <MessageList
          threadId="thread-1"
          entries={makeEntries(["older", "old-prompt", "new-prompt"])}
        />,
      );
      act(() => {
        vi.advanceTimersByTime(128);
      });
      expect(container.querySelector<HTMLElement>("[data-poracode-chat-scroller]")!.scrollTop).toBe(
        200,
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("configures LegendList anchoring and dynamic-size preservation", () => {
    const onStartReached = vi.fn<() => void>();
    render(
      <MessageList
        threadId="thread-1"
        entries={makeEntries(["item-1", "item-2"])}
        onStartReached={onStartReached}
      />,
    );

    const props = latestLegendProps.current as MockLegendProps;
    expect(props.dataKey).toBe("thread-1");
    expect(props.drawDistance).toBeUndefined();
    expect(props.estimatedItemSize).toBe(59);
    expect(props.initialScrollAtEnd).toBe(true);
    expect(props.maintainScrollAtEnd).toEqual({
      animated: false,
      on: { dataChange: true, footerLayout: true, itemLayout: true, layout: true },
    });
    expect(props.maintainScrollAtEndThreshold).toBe(0);
    expect(props.maintainVisibleContentPosition).toEqual({ data: true, size: true });
    expect(props.onStartReachedThreshold).toBe(0.75);
    props.onStartReached?.();
    expect(onStartReached).toHaveBeenCalledOnce();
    expect(props.recycleItems).toBe(false);
    expect(props.onContentSizeCommit).toEqual(expect.any(Function));
    expect(totalSizeListener.current).toBeNull();
  });

  it.each([undefined, { maskImage: "linear-gradient(black, transparent)" }])(
    "keeps the scroll viewport at parent width while preserving fade styles %s",
    (scrollStyle) => {
      const view = render(
        <MessageList
          threadId="thread-1"
          entries={makeEntries(["item-1", "item-2"])}
          {...(scrollStyle ? { scrollStyle } : {})}
        />,
      );

      const scrollElement = view.container.querySelector<HTMLElement>(
        "[data-poracode-chat-scroller]",
      )!;
      expect(scrollElement.style.width).toBe("100%");
      expect(scrollElement.style.maskImage).toBe(scrollStyle?.maskImage ?? "");
    },
  );

  it("passes an overlaying composer inset to LegendList's end-inset math", () => {
    const view = render(<MessageList threadId="thread-1" entries={makeEntries(["item-1"])} />);
    expect(
      (latestLegendProps.current as MockLegendProps).contentInsetEndAdjustment,
    ).toBeUndefined();

    view.rerender(
      <MessageList threadId="thread-1" entries={makeEntries(["item-1"])} bottomInset={140} />,
    );

    expect((latestLegendProps.current as MockLegendProps).contentInsetEndAdjustment).toBe(140);
  });

  it("keeps long assistant rows out of short-message size estimates", () => {
    seedStartedItem("thread-1", "short", "assistant_message");
    useAppStore.getState().applyRuntimeEvent("thread-1", {
      type: "content.delta",
      threadId: "thread-1",
      itemId: "short",
      stream: "assistant_text",
      delta: "Done.",
    });
    seedStartedItem("thread-1", "long", "assistant_message");
    useAppStore.getState().applyRuntimeEvent("thread-1", {
      type: "content.delta",
      threadId: "thread-1",
      itemId: "long",
      stream: "assistant_text",
      delta: "x".repeat(3_000),
    });
    const entries = makeEntries(["short", "long"]);
    render(<MessageList threadId="thread-1" entries={entries} />);

    const props = latestLegendProps.current as MockLegendProps;
    expect(props.getItemType(entries[0]!, 0)).toBe("assistant_message:short");
    expect(props.getItemType(entries[1]!, 1)).toBe("assistant_message:long");
  });

  it("marks only the current empty thought as live while the turn is active", () => {
    const threadId = "thread-1";
    seedStartedItem(threadId, "old-thought", "reasoning");
    seedCompletedItem(threadId, "assistant", "assistant_message");
    seedStartedItem(threadId, "current-thought", "reasoning");
    const entries = makeEntries(["old-thought", "assistant", "current-thought"]);
    const view = render(<MessageList threadId={threadId} entries={entries} isTurnActive />);

    expect(view.container.querySelectorAll('[data-reasoning-live="true"]')).toHaveLength(1);
    expect(screen.getByText("current-thought")).toHaveAttribute("data-reasoning-live", "true");
    expect(screen.getByText("old-thought")).toHaveAttribute("data-reasoning-live", "false");

    view.rerender(<MessageList threadId={threadId} entries={entries} isTurnActive={false} />);

    expect(view.container.querySelector('[data-reasoning-live="true"]')).toBeNull();
  });

  it("does not read list geometry when estimating ordinary streamed rows", () => {
    seedStartedItem("thread-1", "assistant-1", "assistant_message");
    const entries = makeEntries(["assistant-1"]);
    const view = render(<MessageList threadId="thread-1" entries={entries} />);
    const scroller = view.container.querySelector("[data-poracode-chat-scroller]");
    const readWidth = vi.fn<() => number>(() => 500);
    Object.defineProperty(scroller, "clientWidth", { configurable: true, get: readWidth });
    const props = latestLegendProps.current as MockLegendProps;
    expect(props.getFixedItemSize(entries[0]!, 0, "assistant_message:live")).toBeUndefined();
    expect(readWidth).not.toHaveBeenCalled();
  });

  it("uses browser-supplied resize geometry and retains the observer across callback changes", () => {
    const resize = installResizeObserverHarness();
    try {
      seedStartedItem("thread-1", "assistant-1", "assistant_message");
      const entries = makeEntries(["assistant-1"]);
      const oldLayout = vi.fn<() => void>();
      const nextLayout = vi.fn<() => void>();
      const view = render(
        <MessageList
          threadId="thread-1"
          entries={entries}
          onLiveVirtualizerLayoutChange={oldLayout}
        />,
      );
      const row = getVirtualRow(view.container, "assistant-1");
      const observer = resize.records.find((record) => record.target === row)!;
      view.rerender(
        <MessageList
          threadId="thread-1"
          entries={entries}
          onLiveVirtualizerLayoutChange={nextLayout}
        />,
      );
      expect(observer.active).toBe(true);
      expect(resize.records.filter((record) => record.target === row)).toHaveLength(1);
      setElementSize(
        row,
        () => {
          throw new Error("forced height read");
        },
        () => {
          throw new Error("forced width read");
        },
      );
      setItemSizeMock.mockClear();
      oldLayout.mockClear();
      nextLayout.mockClear();
      act(() =>
        observer.callback(
          [
            {
              target: row,
              borderBoxSize: [{ blockSize: 118, inlineSize: 500 }],
            } as unknown as ResizeObserverEntry,
          ],
          {} as ResizeObserver,
        ),
      );
      expect(setItemSizeMock).toHaveBeenCalledWith("assistant-1", { height: 118, width: 500 });
      expect(oldLayout).not.toHaveBeenCalled();
      expect(nextLayout).toHaveBeenCalledOnce();
      // The same painted size must not trigger a second reconciliation.
      act(() =>
        observer.callback(
          [
            {
              target: row,
              borderBoxSize: [{ blockSize: 118, inlineSize: 500 }],
            } as unknown as ResizeObserverEntry,
          ],
          {} as ResizeObserver,
        ),
      );
      expect(setItemSizeMock).toHaveBeenCalledTimes(1);
    } finally {
      resize.restore();
    }
  });

  it.each([
    { cached: 200, delivered: 100, following: 200 },
    { cached: 100, delivered: 180, following: 180 },
    { cached: 100, delivered: 100, following: 100 },
  ])(
    "uses the library baseline on first delivery ($cached → $delivered)",
    ({ cached, delivered, following }) => {
      const resize = installResizeObserverHarness();
      try {
        legendDomReflowMode.current = "deferred";
        seedCompletedItem("thread-1", "assistant-1", "assistant_message");
        seedCompletedItem("thread-1", "user-1", "user_message");
        legendSizes.set("assistant-1", cached);
        const view = render(
          <MessageList threadId="thread-1" entries={makeEntries(["assistant-1", "user-1"])} />,
        );
        const row = getVirtualRow(view.container, "assistant-1");
        const next = row.parentElement!.nextElementSibling as HTMLElement;
        expect(Number.parseFloat(next.style.top)).toBe(cached);
        const observer = resize.records.find((record) => record.target === row)!;
        act(() =>
          observer.callback(
            [
              {
                target: row,
                borderBoxSize: [{ blockSize: delivered, inlineSize: 500 }],
              } as unknown as ResizeObserverEntry,
            ],
            {} as ResizeObserver,
          ),
        );
        expect(Number.parseFloat(next.style.top)).toBe(following);
        // A first shrink stays deferred, including when the library delivered
        // its observation first. Only actual growth mirrors positions pre-paint.
      } finally {
        resize.restore();
        legendDomReflowMode.current = "sync";
      }
    },
  );

  it("provides a stable initial size for intrinsic inline images", () => {
    useAppStore.getState().applyRuntimeEvent("thread-1", {
      type: "item.started",
      threadId: "thread-1",
      itemId: "image",
      itemType: "image_view",
      payload: {
        name: "imageGeneration",
        status: "success",
        result:
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAQUBAScY42YAAAAASUVORK5CYII=",
      },
    });
    const entries = makeEntries(["image"]);
    render(<MessageList threadId="thread-1" entries={entries} />);

    const props = latestLegendProps.current as MockLegendProps;
    expect(props.getFixedItemSize(entries[0]!, 0, "image_view")).toBe(28);
  });

  it("exposes LegendList's scroll node and content node to the shared chat controls", () => {
    const setScrollContainer = vi.fn<(element: HTMLDivElement | null) => void>();
    const scrollContentRef = createRef<HTMLDivElement>();

    const { container, unmount } = render(
      <MessageList
        threadId="thread-1"
        entries={makeEntries(["item-1"])}
        setScrollContainer={setScrollContainer}
        scrollContentRef={scrollContentRef}
      />,
    );

    const scroller = container.querySelector("[data-poracode-chat-scroller='true']");
    const content = container.querySelector(".legend-list-content-container");
    expect(setScrollContainer).toHaveBeenCalledWith(scroller);
    expect(scrollContentRef.current).toBe(content);
    expect(content).toHaveAttribute("data-chat-virtual-size-box", "true");

    unmount();
    expect(setScrollContainer).toHaveBeenLastCalledWith(null);
    expect(scrollContentRef.current).toBeNull();
  });

  it("keeps optional header content inside LegendList's measured content box", () => {
    const { container } = render(
      <MessageList
        threadId="thread-1"
        entries={makeEntries(["item-1"])}
        header={<div data-testid="virtual-header">Header</div>}
      />,
    );

    const content = container.querySelector("[data-chat-virtual-size-box='true']");
    expect(content).toContainElement(screen.getByTestId("virtual-header"));
  });

  it("delegates bottom and find navigation to LegendList", () => {
    let scrollToBottom: (() => void) | null = null;
    let scrollToIndex:
      | ((index: number, options?: { align?: "start" | "center" | "end" }) => void)
      | null = null;
    render(
      <MessageList
        threadId="thread-1"
        entries={makeEntries(["item-1", "item-2"])}
        registerVirtualScrollToBottom={(handler) => {
          scrollToBottom = handler;
        }}
        registerScrollToIndex={(handler) => {
          scrollToIndex = handler;
        }}
      />,
    );

    act(() => scrollToBottom?.());
    expect(scrollToEndMock).toHaveBeenCalledWith({ animated: false });

    act(() => scrollToIndex?.(1, { align: "end" }));
    expect(scrollToIndexMock).toHaveBeenCalledWith({ animated: false, index: 1, viewPosition: 1 });
  });

  it("restores stable measured rows when the same thread remounts at the same width", () => {
    useAppStore.getState().createThread({
      threadId: "thread-1",
      projectId: "project",
      agentKind: "test-agent",
      config: { model: "auto" },
      prompt: "Measurement owner",
      focus: false,
      suppressHostCreateIntent: true,
    });
    seedCompletedItem("thread-1", "assistant-1", "assistant_message");
    legendSizes.set("assistant-1", 184);
    const first = render(
      <MessageList threadId="thread-1" entries={makeEntries(["assistant-1"])} />,
    );
    first.unmount();
    setItemSizeMock.mockClear();

    const second = render(<MessageList threadId="thread-1" entries={[]} />);
    expect(setItemSizeMock).not.toHaveBeenCalled();
    second.rerender(<MessageList threadId="thread-1" entries={makeEntries(["assistant-1"])} />);

    expect(setItemSizeMock).toHaveBeenCalledWith("assistant-1", { height: 184, width: 500 });
  });

  it("does not restore expansion-dependent row measurements", () => {
    seedCompletedItem("thread-1", "user-1", "user_message");
    legendSizes.set("user-1", 240);
    const first = render(<MessageList threadId="thread-1" entries={makeEntries(["user-1"])} />);
    first.unmount();
    setItemSizeMock.mockClear();

    render(<MessageList threadId="thread-1" entries={makeEntries(["user-1"])} />);

    expect(setItemSizeMock).not.toHaveBeenCalled();
  });

  it("remeasures a toggled row through LegendList before parent pinning", () => {
    const onContentHeightChange = vi.fn<() => void>();
    const beginVirtualizerLayoutChange = vi.fn<() => void>();
    render(
      <ChatPaneActionsContext.Provider value={makeActions({ onContentHeightChange })}>
        <MessageList
          threadId="thread-1"
          entries={makeEntries(["item-1"])}
          onVirtualizerLayoutChange={beginVirtualizerLayoutChange}
        />
      </ChatPaneActionsContext.Provider>,
    );
    onContentHeightChange.mockClear();
    const row = screen.getByText("item-1").closest("[data-chat-virtual-row='true']");
    if (!(row instanceof HTMLDivElement)) throw new Error("missing virtual row");
    Object.defineProperties(row, {
      offsetHeight: { configurable: true, value: 123 },
      offsetWidth: { configurable: true, value: 500 },
    });

    fireEvent.click(screen.getByText("item-1"));

    expect(setItemSizeMock).toHaveBeenCalledWith("item-1", { height: 123, width: 500 });
    expect(beginVirtualizerLayoutChange).toHaveBeenCalledOnce();
    expect(beginVirtualizerLayoutChange.mock.invocationCallOrder[0]!).toBeLessThan(
      setItemSizeMock.mock.invocationCallOrder[0]!,
    );
    expect(onContentHeightChange).toHaveBeenCalledOnce();
  });

  it("requests underfilled history when committed data arrives and preserves height notifications", () => {
    const onStartReached = vi.fn<() => void>();
    const onContentHeightChange = vi.fn<() => void>();
    const view = render(
      <MessageList
        threadId="thread-1"
        entries={[]}
        onStartReached={onStartReached}
        onContentHeightChange={onContentHeightChange}
      />,
    );
    const scroller = view.container.querySelector("[data-poracode-chat-scroller]");
    expect(scroller).not.toBeNull();
    Object.defineProperties(scroller!, {
      clientHeight: { configurable: true, value: 776 },
      scrollHeight: { configurable: true, value: 776 },
    });
    onContentHeightChange.mockClear();
    const commit = () => {
      const props = latestLegendProps.current as MockLegendProps;
      expect(props.onStartReached).toEqual(expect.any(Function));
      act(() => props.onContentSizeCommit?.({ size: 100, horizontal: false }));
    };
    commit();
    expect(onStartReached).not.toHaveBeenCalled();
    view.rerender(
      <MessageList
        threadId="thread-1"
        entries={makeEntries(["tail"])}
        onStartReached={onStartReached}
        onContentHeightChange={onContentHeightChange}
      />,
    );
    commit();
    commit();
    expect(onStartReached).toHaveBeenCalledOnce();
    expect(onContentHeightChange).toHaveBeenCalledTimes(3);
    view.rerender(
      <MessageList
        threadId="thread-1"
        entries={makeEntries(["older", "tail"])}
        onStartReached={onStartReached}
        onContentHeightChange={onContentHeightChange}
      />,
    );
    commit();
    expect(onStartReached).toHaveBeenCalledTimes(2);
    expect(onContentHeightChange).toHaveBeenCalledTimes(4);
  });

  it("retries a failed underfilled boundary only on unhandled public upward intent", async () => {
    const onStartReached = vi.fn<() => Promise<boolean>>().mockResolvedValue(false);
    const onWheelCapture = vi.fn<React.WheelEventHandler<HTMLDivElement>>((event) => {
      if (event.deltaY === -2) event.preventDefault();
    });
    const onKeyDownCapture = vi.fn<React.KeyboardEventHandler<HTMLDivElement>>((event) => {
      if (event.key === "Home") event.preventDefault();
    });
    const view = render(
      <MessageList
        threadId="thread-1"
        entries={makeEntries(["tail"])}
        onStartReached={onStartReached}
        onWheelCapture={onWheelCapture}
        onKeyDownCapture={onKeyDownCapture}
      />,
    );
    const scroller = view.container.querySelector("[data-poracode-chat-scroller]")!;
    Object.defineProperties(scroller, {
      clientHeight: { configurable: true, value: 776 },
      scrollHeight: { configurable: true, value: 776 },
    });
    fireEvent.wheel(scroller, { deltaY: -1 });
    expect(onStartReached).not.toHaveBeenCalled();
    const props = latestLegendProps.current as MockLegendProps;
    await act(async () => props.onContentSizeCommit?.({ size: 100, horizontal: false }));
    for (let count = 0; count < 20; count++) {
      act(() => props.onContentSizeCommit?.({ size: 100, horizontal: false }));
    }
    expect(onStartReached).toHaveBeenCalledOnce();
    await act(async () => fireEvent.wheel(scroller, { deltaY: -1 }));
    expect(onStartReached).toHaveBeenCalledTimes(2);
    fireEvent.keyDown(scroller, { key: "PageDown" });
    fireEvent.keyDown(scroller, { key: "Home" });
    fireEvent.wheel(scroller, { deltaY: -2 });
    for (const tag of ["input", "textarea", "button", "div"] as const) {
      const target = document.createElement(tag);
      if (tag === "div") target.setAttribute("contenteditable", "true");
      scroller.appendChild(target);
      fireEvent.keyDown(target, { key: "PageUp" });
      fireEvent.wheel(target, { deltaY: -1 });
      target.remove();
    }
    expect(onStartReached).toHaveBeenCalledTimes(2);
    await act(async () => fireEvent.keyDown(scroller, { key: "PageUp" }));
    expect(onStartReached).toHaveBeenCalledTimes(3);
    expect(onWheelCapture).toHaveBeenCalledTimes(7);
    expect(onKeyDownCapture).toHaveBeenCalledTimes(7);
  });

  it("retries an overflowing transcript at the top after its edge request fails", async () => {
    const onStartReached = vi.fn<() => Promise<boolean>>().mockResolvedValue(false);
    const view = render(
      <MessageList
        threadId="thread-1"
        entries={makeEntries(["tail"])}
        onStartReached={onStartReached}
      />,
    );
    const scroller = view.container.querySelector<HTMLElement>("[data-poracode-chat-scroller]")!;
    Object.defineProperties(scroller, {
      clientHeight: { configurable: true, value: 776 },
      scrollHeight: { configurable: true, value: 4000 },
    });
    const props = latestLegendProps.current as MockLegendProps;
    await act(async () => props.onStartReached?.());
    expect(onStartReached).toHaveBeenCalledOnce();
    // No native scroll event follows another upward gesture at scrollTop zero.
    fireEvent.wheel(scroller, { deltaY: 1 });
    scroller.scrollTop = 100;
    fireEvent.wheel(scroller, { deltaY: -1 });
    expect(onStartReached).toHaveBeenCalledOnce();
    scroller.scrollTop = 0;
    await act(async () => fireEvent.wheel(scroller, { deltaY: -1 }));
    expect(onStartReached).toHaveBeenCalledTimes(2);
    await act(async () => fireEvent.keyDown(scroller, { key: "PageUp" }));
    expect(onStartReached).toHaveBeenCalledTimes(3);
    const input = document.createElement("textarea");
    scroller.appendChild(input);
    fireEvent.wheel(input, { deltaY: -1 });
    fireEvent.keyDown(input, { key: "Home" });
    expect(onStartReached).toHaveBeenCalledTimes(3);
    act(() => props.onContentSizeCommit?.({ size: 4000, horizontal: false }));
    expect(onStartReached).toHaveBeenCalledTimes(3);
  });

  it.each([false, true])(
    "measures inline completion unless unmounted before its frame: %s",
    async (unmountBeforeFrame) => {
      vi.useFakeTimers();
      try {
        const threadId = "thread-1";
        const assistantItemId = "assistant-1";
        const beginVirtualizerLayoutChange = vi.fn<() => void>();
        seedCompletedItem(threadId, assistantItemId, "assistant_message");
        seedCompletedItem(threadId, "user-1", "user_message");
        useAppStore.getState().hydrateThreadCompletedTurns(threadId, [
          {
            startedAt: new Date("2026-05-01T12:00:00.000Z").getTime(),
            endedAt: new Date("2026-05-01T12:01:15.000Z").getTime(),
            anchorItemId: assistantItemId,
          },
        ]);
        const entries = makeEntries([assistantItemId, "user-1"]);
        const { rerender, unmount } = render(
          <MessageList
            threadId={threadId}
            entries={entries}
            suppressInlineTurnAnchorId={assistantItemId}
            onVirtualizerLayoutChange={beginVirtualizerLayoutChange}
          />,
        );
        const anchorRow = screen
          .getByText(assistantItemId)
          .closest("[data-chat-virtual-row='true']");
        if (!(anchorRow instanceof HTMLDivElement)) throw new Error("missing anchor row");
        Object.defineProperties(anchorRow, {
          offsetHeight: { configurable: true, value: 91 },
          offsetWidth: { configurable: true, value: 500 },
        });
        setItemSizeMock.mockClear();
        beginVirtualizerLayoutChange.mockClear();

        rerender(
          <MessageList
            threadId={threadId}
            entries={entries}
            suppressInlineTurnAnchorId={null}
            onVirtualizerLayoutChange={beginVirtualizerLayoutChange}
          />,
        );

        expect(screen.getByText("Worked for 1m 15s")).toBeInTheDocument();
        expect(setItemSizeMock).not.toHaveBeenCalled();
        if (unmountBeforeFrame) {
          unmount();
        }
        await act(async () => vi.advanceTimersByTimeAsync(16));
        expect(setItemSizeMock.mock.calls).toEqual(
          unmountBeforeFrame ? [] : [[assistantItemId, { height: 91, width: 500 }]],
        );
        expect(beginVirtualizerLayoutChange).toHaveBeenCalledOnce();
        expect(beginVirtualizerLayoutChange.mock.invocationCallOrder[0]!).toBeLessThan(
          setItemSizeMock.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY,
        );
      } finally {
        vi.useRealTimers();
      }
    },
  );

  it("pushes the rows below down when a mid-list row grows, before LegendList reflows", () => {
    legendDomReflowMode.current = "deferred";
    const observed: Array<{ target: Element; callback: () => void }> = [];
    const originalResizeObserver = globalThis.ResizeObserver;
    globalThis.ResizeObserver = class {
      constructor(private readonly callback: () => void) {}
      observe(target: Element) {
        observed.push({ target, callback: this.callback });
      }
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;

    try {
      const threadId = "thread-1";
      seedCompletedItem(threadId, "assistant-1", "assistant_message");
      seedCompletedItem(threadId, "user-1", "user_message");
      render(<MessageList threadId={threadId} entries={makeEntries(["assistant-1", "user-1"])} />);

      const row = screen.getByText("assistant-1").closest("[data-chat-virtual-row='true']");
      if (!(row instanceof HTMLDivElement)) throw new Error("missing anchor row");
      const nextContainer = row.parentElement?.nextElementSibling;
      if (!(nextContainer instanceof HTMLDivElement)) throw new Error("missing following row");
      const resize = observed.find((entry) => entry.target === row);
      if (!resize) throw new Error("row is not observed");

      const grow = (height: number) => {
        Object.defineProperties(row, {
          offsetHeight: { configurable: true, value: height },
          offsetWidth: { configurable: true, value: 500 },
        });
        act(() => resize.callback());
      };

      grow(120);
      const topAfterBaseline = Number.parseFloat(nextContainer.style.top);
      setItemSizeMock.mockClear();

      grow(180);

      expect(setItemSizeMock).toHaveBeenCalledWith("assistant-1", { height: 180, width: 500 });
      // The 60px the row gained is handed to the following row immediately, so a
      // prompt appended under a still-working row cannot paint over its last line
      // (the "Worked for X" record) while LegendList catches up next frame.
      expect(Number.parseFloat(nextContainer.style.top)).toBe(topAfterBaseline + 60);
    } finally {
      globalThis.ResizeObserver = originalResizeObserver;
    }
  });

  it("does not shift following rows again when LegendList already reflowed them", () => {
    const observed: Array<{ target: Element; callback: () => void }> = [];
    const originalResizeObserver = globalThis.ResizeObserver;
    globalThis.ResizeObserver = class {
      constructor(private readonly callback: () => void) {}
      observe(target: Element) {
        observed.push({ target, callback: this.callback });
      }
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;

    try {
      const threadId = "thread-1";
      seedCompletedItem(threadId, "assistant-1", "assistant_message");
      seedCompletedItem(threadId, "user-1", "user_message");
      render(<MessageList threadId={threadId} entries={makeEntries(["assistant-1", "user-1"])} />);

      const row = screen.getByText("assistant-1").closest("[data-chat-virtual-row='true']");
      if (!(row instanceof HTMLDivElement)) throw new Error("missing anchor row");
      const container = row.parentElement;
      const nextContainer = container?.nextElementSibling;
      if (!(container instanceof HTMLDivElement)) throw new Error("missing anchor container");
      if (!(nextContainer instanceof HTMLDivElement)) throw new Error("missing following row");
      const resize = observed.find((entry) => entry.target === row);
      if (!resize) throw new Error("row is not observed");

      let rowHeight = 120;
      Object.defineProperties(row, {
        offsetHeight: { configurable: true, get: () => rowHeight },
        offsetWidth: { configurable: true, value: 500 },
      });
      act(() => resize.callback());

      rowHeight = 180;
      const ownTop = Number.parseFloat(container.style.top);
      const reflowedTop = ownTop + rowHeight;
      setItemSizeMock.mockClear();

      act(() => resize.callback());

      expect(setItemSizeMock).toHaveBeenCalledWith("assistant-1", { height: 180, width: 500 });
      expect(Number.parseFloat(nextContainer.style.top)).toBe(reflowedTop);
    } finally {
      globalThis.ResizeObserver = originalResizeObserver;
    }
  });

  it("keeps measuring a row while it changes from the tail to a completed mid-list row", () => {
    const observed: Array<{ target: Element; callback: () => void; active: boolean }> = [];
    const originalResizeObserver = globalThis.ResizeObserver;
    globalThis.ResizeObserver = class {
      private records: Array<{ target: Element; callback: () => void; active: boolean }> = [];

      constructor(private readonly callback: () => void) {}
      observe(target: Element) {
        const record = { target, callback: this.callback, active: true };
        this.records.push(record);
        observed.push(record);
      }
      unobserve() {}
      disconnect() {
        for (const record of this.records) record.active = false;
      }
    } as unknown as typeof ResizeObserver;

    try {
      const threadId = "thread-1";
      seedStartedItem(threadId, "assistant-1", "assistant_message");
      useAppStore.getState().applyRuntimeEvent(threadId, {
        type: "content.delta",
        threadId,
        itemId: "assistant-1",
        stream: "assistant_text",
        delta: "answer",
      });
      seedCompletedItem(threadId, "user-1", "user_message");
      const view = render(
        <MessageList threadId={threadId} entries={makeEntries(["assistant-1"])} />,
      );
      const row = screen.getByText("assistant-1").closest("[data-chat-virtual-row='true']");
      if (!(row instanceof HTMLDivElement)) throw new Error("missing anchor row");
      let rowHeight = 120;
      Object.defineProperties(row, {
        offsetHeight: { configurable: true, get: () => rowHeight },
        offsetWidth: { configurable: true, value: 500 },
      });
      const initialObserver = observed.find((entry) => entry.target === row && entry.active);
      if (!initialObserver) throw new Error("row is not observed");
      act(() => initialObserver.callback());

      // Complete the actually active item after the initial observer baseline.
      // Final rendering can grow later, without another provider delta.
      act(() => {
        useAppStore.getState().applyRuntimeEvent(threadId, {
          type: "item.completed",
          threadId,
          itemId: "assistant-1",
        });
      });
      rowHeight = 180;
      view.rerender(
        <MessageList threadId={threadId} entries={makeEntries(["assistant-1", "user-1"])} />,
      );
      const nextContainer = row.parentElement?.nextElementSibling;
      if (!(nextContainer instanceof HTMLDivElement)) throw new Error("missing following row");
      const topBeforeCompletionResize = Number.parseFloat(nextContainer.style.top);
      const activeObserver = observed.find((entry) => entry.target === row && entry.active);
      if (!activeObserver) throw new Error("row observation was dropped");

      act(() => activeObserver.callback());

      // Completing the turn and appending the prompt happen in one render. The
      // observer must retain its pre-completion baseline so the prompt moves by
      // the assistant row's late 60px growth instead of covering that content.
      expect(Number.parseFloat(nextContainer.style.top)).toBe(topBeforeCompletionResize + 60);
    } finally {
      globalThis.ResizeObserver = originalResizeObserver;
    }
  });

  it.each(["item", "tool_call_group"] as const)(
    "does not measure unchanged %s geometry for streamed store deltas",
    async (kind) => {
      vi.useFakeTimers();
      try {
        const threadId = "thread-1";
        const onLiveVirtualizerLayoutChange = vi.fn<() => void>();
        useAppStore.getState().applyRuntimeEvent(threadId, {
          type: "item.started",
          threadId,
          itemId: "assistant-1",
          itemType: kind === "item" ? "assistant_message" : "reasoning",
        });
        const rowId = kind === "item" ? "assistant-1" : "group-1";
        const entries: ChatTimelineEntry[] =
          kind === "item"
            ? makeEntries(["assistant-1"])
            : [{ kind, id: rowId, itemIds: ["assistant-1"] }];
        const view = render(
          <MessageList
            threadId={threadId}
            entries={entries}
            onLiveVirtualizerLayoutChange={onLiveVirtualizerLayoutChange}
          />,
        );
        const row = getVirtualRow(view.container, rowId);
        const readHeight = vi.fn<() => number>(() => 100);
        const readWidth = vi.fn<() => number>(() => 500);
        setElementSize(row, readHeight, readWidth);
        setItemSizeMock.mockClear();
        onLiveVirtualizerLayoutChange.mockClear();

        for (let index = 0; index < 100; index += 1) {
          act(() => {
            useAppStore.getState().applyRuntimeEvent(threadId, {
              type: "content.delta",
              threadId,
              itemId: "assistant-1",
              stream: "assistant_text",
              delta: "more text",
            });
          });
          await act(async () => vi.advanceTimersByTimeAsync(16));
        }

        expect(setItemSizeMock).not.toHaveBeenCalled();
        await act(async () => vi.advanceTimersByTimeAsync(16));
        expect(readHeight).not.toHaveBeenCalled();
        expect(readWidth).not.toHaveBeenCalled();
        expect(setItemSizeMock).not.toHaveBeenCalled();
        expect(onLiveVirtualizerLayoutChange).not.toHaveBeenCalled();
      } finally {
        vi.useRealTimers();
      }
    },
  );

  it("remeasures live DOM growth before paint even without another provider delta", () => {
    const resizeCallbacks: ResizeObserverCallback[] = [];
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(callback: ResizeObserverCallback) {
          resizeCallbacks.push(callback);
        }
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );

    const threadId = "thread-1";
    const onLiveVirtualizerLayoutChange = vi.fn<() => void>();
    seedStartedItem(threadId, "assistant-1", "assistant_message");
    const view = render(
      <MessageList
        threadId={threadId}
        entries={makeEntries(["assistant-1"])}
        onLiveVirtualizerLayoutChange={onLiveVirtualizerLayoutChange}
      />,
    );

    try {
      const row = view.container.querySelector<HTMLElement>(
        "[data-chat-virtual-row='true'][data-item-id='assistant-1']",
      );
      expect(row).not.toBeNull();
      Object.defineProperties(row!, {
        offsetHeight: { configurable: true, value: 118 },
        offsetWidth: { configurable: true, value: 500 },
      });
      setItemSizeMock.mockClear();
      onLiveVirtualizerLayoutChange.mockClear();

      act(() => {
        for (const callback of resizeCallbacks) {
          callback([{ target: row! } as unknown as ResizeObserverEntry], {} as ResizeObserver);
        }
      });

      expect(onLiveVirtualizerLayoutChange).toHaveBeenCalledOnce();
      expect(setItemSizeMock).toHaveBeenCalledWith("assistant-1", {
        height: 118,
        width: 500,
      });
    } finally {
      view.unmount();
      vi.unstubAllGlobals();
    }
  });

  it("keeps every following row aligned through repeated grow, shrink, and regrow cycles", () => {
    const resize = installResizeObserverHarness();
    try {
      seedCompletedItem("thread-1", "assistant-1", "assistant_message");
      seedCompletedItem("thread-1", "user-1", "user_message");
      seedCompletedItem("thread-1", "assistant-2", "assistant_message");
      const view = render(
        <MessageList
          threadId="thread-1"
          entries={makeEntries(["assistant-1", "user-1", "assistant-2"])}
        />,
      );
      const row = getVirtualRow(view.container, "assistant-1");
      let height = 100;
      setElementSize(
        row,
        () => height,
        () => 500,
      );

      resize.notify(row);
      expect(mockLegendTops(view.container)).toEqual([0, 100, 200]);

      height = 180;
      resize.notify(row);
      expect(mockLegendTops(view.container)).toEqual([0, 180, 280]);

      height = 90;
      resize.notify(row);
      expect(mockLegendTops(view.container)).toEqual([0, 90, 190]);

      height = 140;
      resize.notify(row);
      expect(mockLegendTops(view.container)).toEqual([0, 140, 240]);
      expect(setItemSizeMock.mock.calls.map((call) => call[1].height)).toEqual([100, 180, 90, 140]);
    } finally {
      resize.restore();
    }
  });

  it("aligns multiple downstream rows before a deferred LegendList DOM commit", () => {
    legendDomReflowMode.current = "deferred";
    const resize = installResizeObserverHarness();
    try {
      for (const itemId of ["item-0", "item-1", "item-2", "item-3"]) {
        seedCompletedItem("thread-1", itemId, "assistant_message");
      }
      const view = render(
        <MessageList
          threadId="thread-1"
          entries={makeEntries(["item-0", "item-1", "item-2", "item-3"])}
        />,
      );
      const row = getVirtualRow(view.container, "item-1");
      let height = 170;
      setElementSize(
        row,
        () => height,
        () => 500,
      );

      resize.notify(row);
      expect(mockLegendTops(view.container)).toEqual([0, 100, 270, 370]);

      height = 220;
      resize.notify(row);
      expect(mockLegendTops(view.container)).toEqual([0, 100, 320, 420]);
    } finally {
      resize.restore();
    }
  });

  it("leaves deferred shrink positioning to LegendList while still reporting the new size", () => {
    legendDomReflowMode.current = "deferred";
    const resize = installResizeObserverHarness();
    try {
      seedCompletedItem("thread-1", "assistant-1", "assistant_message");
      seedCompletedItem("thread-1", "user-1", "user_message");
      const view = render(
        <MessageList threadId="thread-1" entries={makeEntries(["assistant-1", "user-1"])} />,
      );
      const row = getVirtualRow(view.container, "assistant-1");
      let height = 180;
      setElementSize(
        row,
        () => height,
        () => 500,
      );
      resize.notify(row);
      expect(mockLegendTops(view.container)).toEqual([0, 180]);

      setItemSizeMock.mockClear();
      height = 100;
      resize.notify(row);

      expect(setItemSizeMock).toHaveBeenCalledWith("assistant-1", {
        height: 100,
        width: 500,
      });
      // LegendList intentionally confirms web shrinks on its next animation
      // frame. Our growth-only pre-paint optimization must not race that path.
      expect(mockLegendTops(view.container)).toEqual([0, 180]);
    } finally {
      resize.restore();
    }
  });

  it("deduplicates ResizeObserver work after an explicit row measurement", () => {
    const resize = installResizeObserverHarness();
    try {
      const onVirtualizerLayoutChange = vi.fn<() => void>();
      const onLiveVirtualizerLayoutChange = vi.fn<() => void>();
      seedCompletedItem("thread-1", "assistant-1", "assistant_message");
      seedCompletedItem("thread-1", "user-1", "user_message");
      const view = render(
        <MessageList
          threadId="thread-1"
          entries={makeEntries(["assistant-1", "user-1"])}
          onVirtualizerLayoutChange={onVirtualizerLayoutChange}
          onLiveVirtualizerLayoutChange={onLiveVirtualizerLayoutChange}
        />,
      );
      const row = getVirtualRow(view.container, "assistant-1");
      setElementSize(
        row,
        () => 180,
        () => 500,
      );

      fireEvent.click(screen.getByText("assistant-1"));
      expect(setItemSizeMock).toHaveBeenCalledOnce();
      expect(onVirtualizerLayoutChange).toHaveBeenCalledOnce();
      expect(mockLegendTops(view.container)).toEqual([0, 180]);

      setItemSizeMock.mockClear();
      onVirtualizerLayoutChange.mockClear();
      onLiveVirtualizerLayoutChange.mockClear();
      resize.notify(row);

      expect(setItemSizeMock).not.toHaveBeenCalled();
      expect(onVirtualizerLayoutChange).not.toHaveBeenCalled();
      expect(onLiveVirtualizerLayoutChange).not.toHaveBeenCalled();
      expect(mockLegendTops(view.container)).toEqual([0, 180]);
    } finally {
      resize.restore();
    }
  });

  it("deduplicates width-only observer updates after the height is known", () => {
    const resize = installResizeObserverHarness();
    try {
      const onLiveVirtualizerLayoutChange = vi.fn<() => void>();
      seedCompletedItem("thread-1", "assistant-1", "assistant_message");
      const view = render(
        <MessageList
          threadId="thread-1"
          entries={makeEntries(["assistant-1"])}
          onLiveVirtualizerLayoutChange={onLiveVirtualizerLayoutChange}
        />,
      );
      const row = getVirtualRow(view.container, "assistant-1");
      let width = 400;
      setElementSize(
        row,
        () => 120,
        () => width,
      );
      resize.notify(row);

      setItemSizeMock.mockClear();
      onLiveVirtualizerLayoutChange.mockClear();
      width = 500;
      resize.notify(row);

      expect(setItemSizeMock).not.toHaveBeenCalled();
      expect(onLiveVirtualizerLayoutChange).not.toHaveBeenCalled();
    } finally {
      resize.restore();
    }
  });

  it("disconnects row observation on unmount after streamed store deltas", async () => {
    vi.useFakeTimers();
    const resize = installResizeObserverHarness();
    try {
      seedStartedItem("thread-1", "assistant-1", "assistant_message");
      const view = render(
        <MessageList threadId="thread-1" entries={makeEntries(["assistant-1"])} />,
      );
      const row = getVirtualRow(view.container, "assistant-1");
      setElementSize(
        row,
        () => 120,
        () => 500,
      );
      setItemSizeMock.mockClear();

      act(() => {
        useAppStore.getState().applyRuntimeEvent("thread-1", {
          type: "content.delta",
          threadId: "thread-1",
          itemId: "assistant-1",
          stream: "assistant_text",
          delta: "queued growth",
        });
      });
      view.unmount();
      await act(async () => vi.advanceTimersByTimeAsync(16));

      expect(setItemSizeMock).not.toHaveBeenCalled();
      expect(resize.records.some((record) => record.target === row && record.active)).toBe(false);
    } finally {
      resize.restore();
      vi.useRealTimers();
    }
  });

  it("keeps the assistant-only bottom fade behavior on LegendList's content box", () => {
    seedStartedItem("thread-1", "assistant-1", "assistant_message");
    const { container, rerender } = render(
      <MessageList threadId="thread-1" entries={makeEntries(["assistant-1"])} />,
    );
    const content = container.querySelector("[data-chat-virtual-size-box='true']");
    expect(content).toHaveAttribute("data-bottom-fade-visible", "true");
    expect((content as HTMLElement).style.getPropertyValue("--lc-chat-bottom-mask-end-alpha")).toBe(
      "0",
    );

    seedStartedItem("thread-1", "user-1", "user_message");
    rerender(<MessageList threadId="thread-1" entries={makeEntries(["assistant-1", "user-1"])} />);
    expect(content).toHaveAttribute("data-bottom-fade-visible", "false");
    expect((content as HTMLElement).style.getPropertyValue("--lc-chat-bottom-mask-end-alpha")).toBe(
      "1",
    );
  });

  it.each([false, true])(
    "routes the committed-size signal through the explicit or parent pane handler: %s",
    (explicit) => {
      const onContentHeightChange = vi.fn<() => void>();
      const parentHeightChange = vi.fn<() => void>();
      render(
        <ChatPaneActionsContext.Provider
          value={makeActions({ onContentHeightChange: parentHeightChange })}
        >
          <MessageList
            threadId="thread-1"
            entries={makeEntries(["item-1"])}
            {...(explicit ? { onContentHeightChange } : {})}
          />
        </ChatPaneActionsContext.Provider>,
      );
      onContentHeightChange.mockClear();
      parentHeightChange.mockClear();
      const props = latestLegendProps.current as MockLegendProps;
      expect(totalSizeListener.current).toBeNull();

      act(() => props.onContentSizeCommit?.({ size: 180, horizontal: false }));

      expect(onContentHeightChange).toHaveBeenCalledTimes(explicit ? 1 : 0);
      expect(parentHeightChange).toHaveBeenCalledTimes(explicit ? 0 : 1);
    },
  );
});

function makeEntries(itemIds: string[]): ChatTimelineEntry[] {
  return itemIds.map((id) => ({ kind: "item", id }));
}

function makeActions(overrides: Partial<ChatPaneActions> = {}): ChatPaneActions {
  return {
    openProjectRelativePath: vi.fn<(path: string, lineNumber?: number) => Promise<void>>(),
    revealProjectFolderInTree: vi.fn<(path: string) => void>(),
    onContentHeightChange: vi.fn<() => void>(),
    projectLocation: { kind: "windows", path: "C:\\repo" },
    projectRootNames: new Set<string>(),
    ...overrides,
  };
}

function seedStartedItem(
  threadId: string,
  itemId: string,
  itemType: "assistant_message" | "user_message" | "reasoning",
) {
  useAppStore.getState().applyRuntimeEvent(threadId, {
    type: "item.started",
    threadId,
    itemId,
    itemType,
  });
}

function seedCompletedItem(
  threadId: string,
  itemId: string,
  itemType: "assistant_message" | "user_message",
) {
  seedStartedItem(threadId, itemId, itemType);
  if (itemType === "assistant_message") {
    // A completed assistant message with no content is filtered out of the
    // timeline, so give it text — otherwise the fixture models a row chat
    // would never render.
    useAppStore.getState().applyRuntimeEvent(threadId, {
      type: "content.delta",
      threadId,
      itemId,
      stream: "assistant_text",
      delta: "answer",
    });
  }
  useAppStore.getState().applyRuntimeEvent(threadId, {
    type: "item.completed",
    threadId,
    itemId,
  });
}

type ResizeObserverRecord = {
  target: Element;
  callback: ResizeObserverCallback;
  active: boolean;
};

function installResizeObserverHarness() {
  const originalResizeObserver = globalThis.ResizeObserver;
  const records: ResizeObserverRecord[] = [];
  globalThis.ResizeObserver = class {
    private records: ResizeObserverRecord[] = [];

    constructor(private readonly callback: ResizeObserverCallback) {}

    observe(target: Element) {
      const record = { target, callback: this.callback, active: true };
      this.records.push(record);
      records.push(record);
    }

    unobserve(target: Element) {
      for (const record of this.records) {
        if (record.target === target) record.active = false;
      }
    }

    disconnect() {
      for (const record of this.records) record.active = false;
    }
  } as unknown as typeof ResizeObserver;

  return {
    records,
    notify(target: Element) {
      const record = records.findLast(
        (candidate) => candidate.target === target && candidate.active,
      );
      if (!record) throw new Error("target is not actively observed");
      act(() => {
        record.callback([{ target } as unknown as ResizeObserverEntry], {} as ResizeObserver);
      });
    },
    restore() {
      globalThis.ResizeObserver = originalResizeObserver;
    },
  };
}

function getVirtualRow(container: HTMLElement, itemId: string): HTMLDivElement {
  const row = container.querySelector(`[data-chat-virtual-row='true'][data-item-id='${itemId}']`);
  if (!(row instanceof HTMLDivElement)) throw new Error(`missing virtual row ${itemId}`);
  return row;
}

function setElementSize(
  element: HTMLElement,
  readHeight: () => number,
  readWidth: () => number,
): void {
  Object.defineProperties(element, {
    offsetHeight: { configurable: true, get: readHeight },
    offsetWidth: { configurable: true, get: readWidth },
  });
}

function mockLegendTops(container: HTMLElement): number[] {
  return Array.from(container.querySelectorAll<HTMLElement>("[data-mock-legend-key]")).map(
    (element) => Number.parseFloat(element.style.top),
  );
}
