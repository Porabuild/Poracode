import { act, fireEvent, render, screen } from "@testing-library/react";
import { createRef } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
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
  drawDistance: number;
  estimatedItemSize: number;
  getFixedItemSize: (item: ChatTimelineEntry, index: number, type: string) => number | undefined;
  getItemType: (item: ChatTimelineEntry, index: number) => string;
  initialScrollAtEnd: boolean;
  maintainScrollAtEnd: unknown;
  maintainScrollAtEndThreshold: number;
  maintainVisibleContentPosition: unknown;
  onStartReached?: () => void;
  onStartReachedThreshold?: number;
  recycleItems: boolean;
  renderItem: (input: { item: ChatTimelineEntry; index: number }) => React.ReactNode;
  keyExtractor: (item: ChatTimelineEntry, index: number) => string;
  ListEmptyComponent?: React.ReactNode;
  ListFooterComponent?: React.ReactNode;
  className?: string;
  contentContainerClassName?: string;
  contentContainerStyle?: React.CSSProperties;
  onLoad?: () => void;
  onWheelCapture?: React.WheelEventHandler<HTMLDivElement>;
  onPointerDownCapture?: React.PointerEventHandler<HTMLDivElement>;
  onKeyDownCapture?: React.KeyboardEventHandler<HTMLDivElement>;
  style?: React.CSSProperties;
};

const {
  latestLegendProps,
  legendSizes,
  totalSizeListener,
  scrollToEndMock,
  scrollToIndexMock,
  setItemSizeMock,
  unsubscribeMock,
} = vi.hoisted(() => ({
  latestLegendProps: { current: null as unknown },
  legendSizes: new Map<string, number>(),
  totalSizeListener: { current: null as null | (() => void) },
  scrollToEndMock: vi.fn<() => Promise<void>>(() => Promise.resolve()),
  scrollToIndexMock: vi.fn<() => Promise<void>>(() => Promise.resolve()),
  setItemSizeMock: vi.fn<(itemKey: string, size: { width: number; height: number }) => void>(),
  unsubscribeMock: vi.fn<() => void>(),
}));

vi.mock("@legendapp/list/react", async () => {
  const React = await import("react");
  return {
    LegendList: React.forwardRef(function MockLegendList(
      props: MockLegendProps,
      forwardedRef: React.ForwardedRef<unknown>,
    ) {
      latestLegendProps.current = props;
      const scrollRef = React.useRef<HTMLDivElement>(null);
      const onLoadRef = React.useRef(props.onLoad);
      const setScrollRef = React.useCallback((element: HTMLDivElement | null) => {
        scrollRef.current = element;
        if (element) {
          Object.defineProperty(element, "clientWidth", { configurable: true, value: 500 });
        }
      }, []);
      React.useImperativeHandle(forwardedRef, () => ({
        getScrollableNode: () => scrollRef.current,
        getState: () => ({
          sizes: legendSizes,
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
            {props.data.length === 0 ? props.ListEmptyComponent : null}
            {props.data.map((item, index) => (
              <React.Fragment key={props.keyExtractor(item, index)}>
                {props.renderItem({ item, index })}
              </React.Fragment>
            ))}
            {props.ListFooterComponent}
          </div>
        </div>
      );
    }),
  };
});

vi.mock("./items/ChatItemRow", () => ({
  ChatItemRow: (props: { entry: { id: string }; onHeightChange?: () => void }) => {
    const actions = useChatPaneActions();
    return (
      <button
        type="button"
        onClick={() => {
          props.onHeightChange?.();
          actions?.onContentHeightChange();
        }}
      >
        {props.entry.id}
      </button>
    );
  },
}));

describe("MessageList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    legendSizes.clear();
    totalSizeListener.current = null;
    clearTimelineMeasurementCache();
    useAppStore.setState((state) => ({
      ...state,
      runtimeItemIdsByThread: {},
      runtimeItemsByIdByThread: {},
      runtimeItemChildrenByParentByThread: {},
      runtimeCompletedTurnsByThread: {},
    }));
  });

  it("configures LegendList 3.3.3 anchoring and dynamic-size preservation", () => {
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
    expect(props.drawDistance).toBe(1_000);
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

  it("delegates bottom and find navigation to LegendList", () => {
    let scrollToBottom: (() => void) | null = null;
    let scrollToIndex:
      | ((index: number, options?: { align?: "start" | "center" | "end" }) => void)
      | null = null;
    const actions = makeActions({
      registerVirtualScrollToBottom: (handler) => {
        scrollToBottom = handler;
      },
    });

    render(
      <ChatPaneActionsContext.Provider value={actions}>
        <MessageList
          threadId="thread-1"
          entries={makeEntries(["item-1", "item-2"])}
          registerScrollToIndex={(handler) => {
            scrollToIndex = handler;
          }}
        />
      </ChatPaneActionsContext.Provider>,
    );

    act(() => scrollToBottom?.());
    expect(scrollToEndMock).toHaveBeenCalledWith({ animated: false });

    act(() => scrollToIndex?.(1, { align: "end" }));
    expect(scrollToIndexMock).toHaveBeenCalledWith({ animated: false, index: 1, viewPosition: 1 });
  });

  it("restores stable measured rows when the same thread remounts at the same width", () => {
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
    render(
      <ChatPaneActionsContext.Provider value={makeActions({ onContentHeightChange })}>
        <MessageList threadId="thread-1" entries={makeEntries(["item-1"])} />
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
    expect(onContentHeightChange).toHaveBeenCalledOnce();
  });

  it("coalesces live streaming remeasurement to one animation frame", async () => {
    vi.useFakeTimers();
    try {
      const threadId = "thread-1";
      useAppStore.getState().applyRuntimeEvent(threadId, {
        type: "item.started",
        threadId,
        itemId: "assistant-1",
        itemType: "assistant_message",
      });
      render(<MessageList threadId={threadId} entries={makeEntries(["assistant-1"])} />);
      setItemSizeMock.mockClear();

      act(() => {
        useAppStore.getState().applyRuntimeEvent(threadId, {
          type: "content.delta",
          threadId,
          itemId: "assistant-1",
          stream: "assistant_text",
          delta: "more text",
        });
        useAppStore.getState().applyRuntimeEvent(threadId, {
          type: "content.delta",
          threadId,
          itemId: "assistant-1",
          stream: "assistant_text",
          delta: " and more",
        });
      });

      expect(setItemSizeMock).not.toHaveBeenCalled();
      await act(async () => vi.advanceTimersByTimeAsync(16));
      expect(setItemSizeMock).toHaveBeenCalledTimes(1);
    } finally {
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

  it("notifies shared scroll controls when LegendList's total size changes", () => {
    const onContentHeightChange = vi.fn<() => void>();
    render(
      <ChatPaneActionsContext.Provider value={makeActions({ onContentHeightChange })}>
        <MessageList threadId="thread-1" entries={makeEntries(["item-1"])} />
      </ChatPaneActionsContext.Provider>,
    );
    onContentHeightChange.mockClear();

    act(() => totalSizeListener.current?.());

    expect(onContentHeightChange).toHaveBeenCalledOnce();
  });
});

function makeEntries(itemIds: string[]): ChatTimelineEntry[] {
  return itemIds.map((id) => ({ kind: "item", id }));
}

function makeActions(overrides: Partial<ChatPaneActions> = {}): ChatPaneActions {
  return {
    openProjectRelativePath: vi.fn<(path: string, lineNumber?: number) => void>(),
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
  itemType: "assistant_message" | "user_message",
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
  useAppStore.getState().applyRuntimeEvent(threadId, {
    type: "item.completed",
    threadId,
    itemId,
  });
}
