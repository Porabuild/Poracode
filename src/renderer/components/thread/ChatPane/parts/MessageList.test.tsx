import { act, fireEvent, render, screen } from "@testing-library/react";
import type { VirtualItem } from "@tanstack/react-virtual";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAppStore } from "@/renderer/state/appStore";
import {
  ChatPaneActionsContext,
  useChatPaneActions,
  type ChatPaneActions,
} from "../chatPaneActionsContext";
import { MessageList } from "./MessageList";
import { clearTimelineMeasurementCache } from "./timelineMeasurementCache";

type MockVirtualRow = Pick<VirtualItem, "key" | "index" | "start">;

type MockVirtualizer = {
  getVirtualItems: () => MockVirtualRow[];
  getTotalSize: () => number;
  takeSnapshot: () => VirtualItem[];
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
  estimateSize: (index: number) => number;
  getItemKey: (index: number) => string | number;
  overscan?: number;
  measureElement?: unknown;
  useFlushSync?: boolean;
  useAnimationFrameWithResizeObserver?: boolean;
  initialOffset?: () => number;
  initialMeasurementsCache?: VirtualItem[];
  anchorTo?: "start" | "end";
  followOnAppend?: boolean;
  scrollEndThreshold?: number;
};

const {
  useVirtualizerMock,
  measureMock,
  measureElementMock,
  resizeItemMock,
  takeSnapshotMock,
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
  takeSnapshotMock: vi.fn<() => VirtualItem[]>(),
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

const PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

describe("MessageList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearTimelineMeasurementCache();
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
    takeSnapshotMock.mockReturnValue([]);
    useVirtualizerMock.mockReturnValue({
      getVirtualItems: getVirtualItemsMock,
      getTotalSize: getTotalSizeMock,
      takeSnapshot: takeSnapshotMock,
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
    expect(virtualizerOptions.overscan).toBe(16);
    expect(virtualizerOptions.measureElement).toBeUndefined();
    expect(virtualizerOptions.useFlushSync).toBe(true);
    expect(virtualizerOptions.useAnimationFrameWithResizeObserver).toBe(true);
    expect(virtualizerOptions.anchorTo).toBe("end");
    expect(virtualizerOptions.followOnAppend).toBe(true);
    expect(virtualizerOptions.scrollEndThreshold).toBe(4);
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

  it("estimates inline image rows near their rendered height before measurement", () => {
    const threadId = "thread-1";
    useAppStore.getState().hydrateThreadRuntimeItems(threadId, [
      {
        id: "image-1",
        type: "image_view",
        state: "completed",
        payload: {
          name: "imageGeneration",
          status: "success",
          result: PNG_BASE64,
        },
        streams: {},
      },
      {
        id: "assistant-1",
        type: "assistant_message",
        state: "completed",
        payload: {
          content: [
            {
              kind: "image",
              mimeType: "image/png",
              dataUrl: `data:image/png;base64,${PNG_BASE64}`,
            },
          ],
        },
        streams: {},
      },
    ]);

    render(
      <MessageList
        threadId={threadId}
        entries={makeEntries(["image-1", "assistant-1"])}
        scrollElement={document.createElement("div")}
      />,
    );

    const virtualizerOptions = useVirtualizerMock.mock.calls[0]![0];
    expect(virtualizerOptions.estimateSize(0)).toBe(320);
    expect(virtualizerOptions.estimateSize(1)).toBe(384);
  });

  it("overshoots initialOffset so the first range starts at the transcript tail", () => {
    render(
      <MessageList
        threadId="thread-1"
        entries={makeEntries(["item-1", "item-2", "item-3"])}
        scrollElement={document.createElement("div")}
      />,
    );

    const virtualizerOptions = useVirtualizerMock.mock.calls[0]![0];
    expect(virtualizerOptions.initialOffset?.()).toBe(Number.MAX_SAFE_INTEGER);
  });

  it("restores cached measurements only at the same transcript width", () => {
    hydrateCompletedAssistantMessages("thread-1", ["item-3"]);
    const snapshot: VirtualItem[] = [
      { key: "item-3", index: 2, start: 210, size: 120, end: 330, lane: 0 },
    ];
    takeSnapshotMock.mockReturnValue(snapshot);
    const firstScrollElement = document.createElement("div");
    Object.defineProperty(firstScrollElement, "clientWidth", { configurable: true, value: 500 });
    const first = render(
      <MessageList
        threadId="thread-1"
        entries={makeEntries(["item-1", "item-2", "item-3"])}
        scrollElement={firstScrollElement}
      />,
    );

    first.unmount();

    const sameWidthScrollElement = document.createElement("div");
    Object.defineProperty(sameWidthScrollElement, "clientWidth", {
      configurable: true,
      value: 500,
    });
    const sameWidth = render(
      <MessageList
        threadId="thread-1"
        entries={makeEntries(["item-1", "item-2", "item-3"])}
        scrollElement={sameWidthScrollElement}
      />,
    );
    expect(useVirtualizerMock.mock.calls.at(-1)?.[0].initialMeasurementsCache).toEqual(snapshot);
    sameWidth.unmount();

    const differentWidthScrollElement = document.createElement("div");
    Object.defineProperty(differentWidthScrollElement, "clientWidth", {
      configurable: true,
      value: 600,
    });
    render(
      <MessageList
        threadId="thread-1"
        entries={makeEntries(["item-1", "item-2", "item-3"])}
        scrollElement={differentWidthScrollElement}
      />,
    );
    expect(useVirtualizerMock.mock.calls.at(-1)?.[0].initialMeasurementsCache).toEqual([]);
  });

  it("estimates collapsed tool, group, and reasoning rows near their one-line height", () => {
    const threadId = "thread-estimates";
    useAppStore.getState().hydrateThreadRuntimeItems(threadId, [
      { id: "tool-1", type: "tool_call", state: "completed", payload: {}, streams: {} },
      { id: "cmd-1", type: "command_execution", state: "completed", payload: {}, streams: {} },
      { id: "reason-1", type: "reasoning", state: "completed", payload: {}, streams: {} },
    ]);

    render(
      <MessageList
        threadId={threadId}
        entries={[
          { kind: "item", id: "tool-1" },
          { kind: "item", id: "cmd-1" },
          { kind: "item", id: "reason-1" },
          { kind: "tool_call_group", id: "group-1", itemIds: ["tool-2", "tool-3"] },
        ]}
        scrollElement={document.createElement("div")}
      />,
    );

    const virtualizerOptions = useVirtualizerMock.mock.calls[0]![0];
    // Collapsed accordion trigger (~27px), not the old 56/64 over-estimate.
    expect(virtualizerOptions.estimateSize(0)).toBe(28);
    expect(virtualizerOptions.estimateSize(1)).toBe(28);
    // Reasoning "Thought" toggle uses py-2, so ~32px.
    expect(virtualizerOptions.estimateSize(2)).toBe(32);
    // Collapsed tool-call group shares the accordion trigger.
    expect(virtualizerOptions.estimateSize(3)).toBe(28);
  });

  it("snapshots measured sizes on unmount and restores them on remount of the same thread", () => {
    const threadId = "thread-snapshot-restore";
    hydrateCompletedAssistantMessages(threadId, ["item-1", "item-2"]);
    const snapshot = [{ key: "item-1", index: 0, start: 0, end: 40, size: 40, lane: 0 }];
    takeSnapshotMock.mockReturnValue(snapshot);

    const { unmount } = render(
      <MessageList
        threadId={threadId}
        entries={makeEntries(["item-1", "item-2"])}
        scrollElement={createSizedScrollElement()}
      />,
    );

    expect(useVirtualizerMock.mock.calls[0]![0].initialMeasurementsCache).toEqual([]);

    unmount();
    expect(takeSnapshotMock).toHaveBeenCalled();

    useVirtualizerMock.mockClear();
    render(
      <MessageList
        threadId={threadId}
        entries={makeEntries(["item-1", "item-2"])}
        scrollElement={createSizedScrollElement()}
      />,
    );

    // The prior snapshot's measurements are handed back so rows never
    // re-estimate. Content, not array identity, is what virtual-core consumes.
    expect(useVirtualizerMock.mock.calls[0]![0].initialMeasurementsCache).toEqual(snapshot);
  });

  it("forwards a stale snapshot verbatim after truncation (virtual-core matches by key)", () => {
    const threadId = "thread-snapshot-truncated";
    hydrateCompletedAssistantMessages(threadId, ["item-1", "item-2", "item-3"]);
    const snapshot = [
      { key: "item-1", index: 0, start: 0, end: 40, size: 40, lane: 0 },
      { key: "item-2", index: 1, start: 40, end: 80, size: 40, lane: 0 },
      { key: "item-3", index: 2, start: 80, end: 120, size: 40, lane: 0 },
    ];
    takeSnapshotMock.mockReturnValue(snapshot);

    const { unmount } = render(
      <MessageList
        threadId={threadId}
        entries={makeEntries(["item-1", "item-2", "item-3"])}
        scrollElement={createSizedScrollElement()}
      />,
    );
    unmount();

    useVirtualizerMock.mockClear();
    // Timeline truncated to a single item (e.g. checkpoint revert). Stale keys
    // in the snapshot are harmless: virtual-core seeds itemSizeCache by key and
    // reads sizes via getItemKey, so no index-based guard is needed here.
    render(
      <MessageList
        threadId={threadId}
        entries={makeEntries(["item-1"])}
        scrollElement={createSizedScrollElement()}
      />,
    );

    expect(useVirtualizerMock.mock.calls[0]![0].initialMeasurementsCache).toEqual(snapshot);
  });

  it("drops expansion-dependent rows from the snapshot so they re-estimate collapsed", () => {
    // Regression (adversarial review A3): a group/tool/reasoning/user row the
    // user expanded before leaving snapshots its TALL measured height under a
    // content-stable key, but always remounts collapsed — restoring that size
    // would hand scroll compensation one huge delta on first revisit.
    const threadId = "thread-snapshot-expandable";
    useAppStore.getState().hydrateThreadRuntimeItems(threadId, [
      {
        id: "assistant-1",
        type: "assistant_message",
        state: "completed",
        payload: {},
        streams: {},
      },
      { id: "assistant-2", type: "assistant_message", state: "updated", payload: {}, streams: {} },
      { id: "tool-1", type: "tool_call", state: "completed", payload: {}, streams: {} },
      { id: "reason-1", type: "reasoning", state: "completed", payload: {}, streams: {} },
      { id: "user-1", type: "user_message", state: "completed", payload: {}, streams: {} },
    ]);
    takeSnapshotMock.mockReturnValue([
      { key: "assistant-1", index: 0, start: 0, end: 200, size: 200, lane: 0 },
      { key: "assistant-2", index: 1, start: 200, end: 320, size: 120, lane: 0 },
      { key: "tool-1", index: 2, start: 320, end: 720, size: 400, lane: 0 },
      { key: "reason-1", index: 3, start: 720, end: 1020, size: 300, lane: 0 },
      { key: "user-1", index: 4, start: 1020, end: 1260, size: 240, lane: 0 },
      { key: "tool-call-group:tool-2", index: 5, start: 1260, end: 1660, size: 400, lane: 0 },
    ]);

    const entries = [
      ...makeEntries(["assistant-1", "assistant-2", "tool-1", "reason-1", "user-1"]),
      { kind: "tool_call_group" as const, id: "tool-call-group:tool-2", itemIds: ["tool-2"] },
    ];
    const { unmount } = render(
      <MessageList
        threadId={threadId}
        entries={entries}
        scrollElement={createSizedScrollElement()}
      />,
    );
    unmount();

    useVirtualizerMock.mockClear();
    render(
      <MessageList
        threadId={threadId}
        entries={entries}
        scrollElement={createSizedScrollElement()}
      />,
    );

    // Only the completed assistant message survives: the streaming one is
    // still changing, and every collapsible row (tool, reasoning, clamped user
    // message, group) remounts collapsed, so it must fall back to the accurate
    // collapsed estimate instead of a stale expanded measurement.
    expect(useVirtualizerMock.mock.calls[0]![0].initialMeasurementsCache).toEqual([
      { key: "assistant-1", index: 0, start: 0, end: 200, size: 200, lane: 0 },
    ]);
  });

  it("does not restore when the prior mount measured nothing", () => {
    const threadId = "thread-snapshot-empty";
    takeSnapshotMock.mockReturnValue([]);

    const { unmount } = render(
      <MessageList
        threadId={threadId}
        entries={makeEntries(["item-1"])}
        scrollElement={createSizedScrollElement()}
      />,
    );
    unmount();

    useVirtualizerMock.mockClear();
    render(
      <MessageList
        threadId={threadId}
        entries={makeEntries(["item-1"])}
        scrollElement={createSizedScrollElement()}
      />,
    );

    expect(useVirtualizerMock.mock.calls[0]![0].initialMeasurementsCache).toEqual([]);
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

  it("compensates rows above the viewport when idle", () => {
    const { scrollElement, shouldAdjust, commit } = renderCompensationList();

    scrollElement.scrollTop = 120;
    expect(shouldAdjust({ start: 0, size: 80 }, -40, idleVirtualizer)).toBe(false);

    commit();
    expect(scrollElement.scrollTop).toBe(80);
  });

  it("defers above-viewport compensation during active upward scroll until settle", () => {
    const { scrollElement, shouldAdjust, commit } = renderCompensationList();

    scrollElement.scrollTop = 120;
    expect(
      shouldAdjust({ start: 0, size: 80 }, -40, {
        isScrolling: true,
        scrollDirection: "backward",
      }),
    ).toBe(false);

    commit();
    // First scroll-back after opening mounts estimated rows; applying each
    // measure delta mid-gesture fights the user. Buffer until settle.
    expect(scrollElement.scrollTop).toBe(120);

    scrollElement.dispatchEvent(new Event("scrollend"));
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

  it("leaves bottom-sticky compensation to native end anchoring on iOS", () => {
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

    // Below-viewport streaming row while pinned is owned by the native end
    // anchor, including during iOS momentum tracking.
    expect(
      shouldAdjust({ start: 96, size: 100 }, 24, {
        isScrolling: true,
        scrollDirection: "forward",
      }),
    ).toBe(false);

    commit();
    expect(scrollElement.scrollTop).toBe(160);
  });

  it("does not apply sticky measure compensation while the user has scroll intent", () => {
    const actions = {
      openProjectRelativePath: vi.fn<(path: string, lineNumber?: number) => void>(),
      revealProjectFolderInTree: vi.fn<(path: string) => void>(),
      showProjectEntryInExplorer: vi.fn<(path: string) => void>(),
      onContentHeightChange: vi.fn<() => void>(),
      isStickToBottom: vi.fn<() => boolean>().mockReturnValue(true),
      hasRecentUserScrollIntent: vi.fn<() => boolean>().mockReturnValue(true),
      projectLocation: { kind: "windows" as const, path: "C:\\repo" },
      projectRootNames: new Set<string>(),
    };
    const { scrollElement, shouldAdjust, commit } = renderCompensationList(actions);

    expect(
      shouldAdjust({ start: 96, size: 100 }, 40, {
        isScrolling: true,
        scrollDirection: "backward",
      }),
    ).toBe(false);

    commit();
    // Sticky + intent (scrollbar thumb drag) — do not yank scrollTop.
    expect(scrollElement.scrollTop).toBe(160);
  });

  it("still applies above-viewport compensation while the user has scroll intent", () => {
    // Regression: discarding ALL measure compensation during intent fixed sticky
    // yank but made scroll-back jump — estimated rows above the viewport shrink
    // with no scrollTop correction. Above-viewport deltas must still apply.
    const noteProgrammaticScroll = vi.fn<(scrollTop: number) => void>();
    const actions = {
      openProjectRelativePath: vi.fn<(path: string, lineNumber?: number) => void>(),
      revealProjectFolderInTree: vi.fn<(path: string) => void>(),
      showProjectEntryInExplorer: vi.fn<(path: string) => void>(),
      onContentHeightChange: vi.fn<() => void>(),
      isStickToBottom: vi.fn<() => boolean>().mockReturnValue(false),
      hasRecentUserScrollIntent: vi.fn<() => boolean>().mockReturnValue(true),
      noteProgrammaticScroll,
      projectLocation: { kind: "windows" as const, path: "C:\\repo" },
      projectRootNames: new Set<string>(),
    };
    const { scrollElement, shouldAdjust, commit } = renderCompensationList(actions);

    scrollElement.scrollTop = 120;
    expect(
      shouldAdjust({ start: 0, size: 80 }, -40, {
        isScrolling: true,
        scrollDirection: "backward",
      }),
    ).toBe(false);

    commit();
    expect(scrollElement.scrollTop).toBe(80);
    expect(noteProgrammaticScroll).toHaveBeenCalledWith(80);
  });

  it("leaves bottom-sticky row growth to native end anchoring", () => {
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
    expect(scrollElement.scrollTop).toBe(160);
  });

  it("measures newly mounted rows synchronously so estimate corrections land pre-paint", () => {
    const scrollElement = document.createElement("div");
    const offsetHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetHeight");
    Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
      configurable: true,
      get() {
        return 132;
      },
    });

    try {
      render(
        <MessageList
          threadId="thread-1"
          entries={makeEntries(["item-1", "item-2", "item-3", "item-4"])}
          scrollElement={scrollElement}
        />,
      );

      expect(measureElementMock).toHaveBeenCalledWith(
        document.querySelector("[data-item-id='item-2']"),
      );
      expect(measureElementMock).toHaveBeenCalledWith(
        document.querySelector("[data-item-id='item-3']"),
      );
      // One forced resizeItem with a single offsetHeight read — not a second
      // pass through options.measureElement (that used to double-measure).
      expect(optionsMeasureElementMock).not.toHaveBeenCalled();
      expect(resizeItemMock).toHaveBeenCalledWith(1, 132);
      expect(resizeItemMock).toHaveBeenCalledWith(2, 132);
    } finally {
      if (offsetHeight) {
        Object.defineProperty(HTMLElement.prototype, "offsetHeight", offsetHeight);
      }
    }
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

  it("leaves virtual total size changes to native end anchoring", () => {
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

    expect(onContentHeightChange).not.toHaveBeenCalled();

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

    expect(onContentHeightChange).not.toHaveBeenCalled();
  });

  it("delegates height change to parent actions without forcing list measurement", () => {
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

    // Row ResizeObservers own size recalculation. This callback is only for
    // parent scroll pinning; forcing list measurement here creates resize churn.
    expect(measureElementMock).not.toHaveBeenCalled();
    expect(measureMock).not.toHaveBeenCalled();
    expect(onContentHeightChange).toHaveBeenCalledOnce();
  });
});

function makeEntries(itemIds: readonly string[]) {
  return itemIds.map((id) => ({ kind: "item" as const, id }));
}

function createSizedScrollElement(clientWidth = 500) {
  const scrollElement = document.createElement("div");
  Object.defineProperty(scrollElement, "clientWidth", { configurable: true, value: clientWidth });
  return scrollElement;
}

/**
 * Seeds completed assistant messages so snapshot entries under these ids pass
 * the remount-stable filter (collapsible/streaming rows are dropped on write).
 */
function hydrateCompletedAssistantMessages(threadId: string, itemIds: readonly string[]) {
  useAppStore.getState().hydrateThreadRuntimeItems(
    threadId,
    itemIds.map((id) => ({
      id,
      type: "assistant_message" as const,
      state: "completed" as const,
      payload: {},
      streams: {},
    })),
  );
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
