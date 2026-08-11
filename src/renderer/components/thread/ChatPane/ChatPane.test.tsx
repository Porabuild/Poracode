import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { toast } from "@heroui/react";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { CanonicalContentBlock, Project, Thread } from "@/shared/contracts";
import { AppProvider } from "@/renderer/components/ui/provider";
import { useAppStore } from "@/renderer/state/appStore";
import { ChatPane } from "./ChatPane";
import { byTextContent } from "@/renderer/testUtils/text";

const {
  hydrateThreadRuntimeItems,
  loadOlderThreadRuntimeItems,
  releaseThreadRuntimeItems,
  retainThreadRuntimeItems,
} = vi.hoisted(() => ({
  hydrateThreadRuntimeItems: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  loadOlderThreadRuntimeItems: vi.fn<() => Promise<boolean>>().mockResolvedValue(false),
  releaseThreadRuntimeItems: vi.fn<() => void>(),
  retainThreadRuntimeItems: vi.fn<() => void>(),
}));
const { hydrateFileCheckpoints, finalizeFileCheckpoint } = vi.hoisted(() => ({
  hydrateFileCheckpoints: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  finalizeFileCheckpoint: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
}));
const { legendScrollToEnd, legendScrollToIndex } = vi.hoisted(() => ({
  legendScrollToEnd: vi.fn<(options?: { animated?: boolean }) => void>(),
  legendScrollToIndex: vi.fn<(options: { index: number; viewPosition?: number }) => void>(),
}));

vi.mock("@/renderer/state/chatRuntimePersister", () => ({
  hydrateThreadRuntimeItems,
  loadOlderThreadRuntimeItems,
  releaseThreadRuntimeItems,
  retainThreadRuntimeItems,
}));

vi.mock("@/renderer/state/fileCheckpointActions", () => ({
  hydrateFileCheckpoints,
  finalizeFileCheckpoint,
}));

vi.mock("@legendapp/list/react", async () => {
  const React = await import("react");
  return {
    LegendList: React.forwardRef(function MockLegendList(
      props: {
        data: readonly { id: string }[];
        renderItem: (input: { item: { id: string }; index: number }) => React.ReactNode;
        keyExtractor: (item: { id: string }, index: number) => string;
        ListEmptyComponent?: React.ReactNode;
        ListFooterComponent?: React.ReactNode;
        className?: string;
        contentContainerClassName?: string;
        contentContainerStyle?: React.CSSProperties;
        onLoad?: () => void;
        onStartReached?: () => void;
        onKeyDownCapture?: React.KeyboardEventHandler<HTMLDivElement>;
        onPointerDownCapture?: React.PointerEventHandler<HTMLDivElement>;
        onWheelCapture?: React.WheelEventHandler<HTMLDivElement>;
        style?: React.CSSProperties;
      },
      forwardedRef: React.ForwardedRef<unknown>,
    ) {
      const scrollRef = React.useRef<HTMLDivElement>(null);
      const sizesRef = React.useRef(new Map<string, number>());
      const totalSizeListenerRef = React.useRef<(() => void) | null>(null);
      const onLoadRef = React.useRef(props.onLoad);
      React.useImperativeHandle(forwardedRef, () => ({
        getScrollableNode: () => scrollRef.current,
        getState: () => ({
          sizes: sizesRef.current,
          positionAtIndex: (index: number) =>
            props.data
              .slice(0, index)
              .reduce(
                (top, item, itemIndex) =>
                  top + (sizesRef.current.get(props.keyExtractor(item, itemIndex)) ?? 100),
                0,
              ),
          sizeAtIndex: (index: number) => {
            const item = props.data[index];
            return item
              ? (sizesRef.current.get(props.keyExtractor(item, index)) ?? 100)
              : Number.NaN;
          },
          listen: (_name: string, listener: () => void) => {
            totalSizeListenerRef.current = listener;
            return () => {
              totalSizeListenerRef.current = null;
            };
          },
        }),
        scrollToEnd: (options?: { animated?: boolean }) => {
          legendScrollToEnd(options);
          const element = scrollRef.current;
          if (element) element.scrollTop = element.scrollHeight;
          return Promise.resolve();
        },
        scrollToIndex: (options: { index: number; viewPosition?: number }) => {
          legendScrollToIndex(options);
          return Promise.resolve();
        },
        setItemSize: (itemKey: string, size: { height: number }) => {
          sizesRef.current.set(itemKey, size.height);
          const content = scrollRef.current?.querySelector(".legend-list-content-container");
          let top = 0;
          for (let index = 0; index < props.data.length; index += 1) {
            const item = props.data[index]!;
            const key = props.keyExtractor(item, index);
            const container = Array.from(content?.children ?? []).find(
              (element) => element instanceof HTMLElement && element.dataset.mockLegendKey === key,
            );
            if (container instanceof HTMLElement) container.style.top = `${top}px`;
            top += sizesRef.current.get(key) ?? 100;
          }
          totalSizeListenerRef.current?.();
        },
      }));
      React.useLayoutEffect(() => {
        onLoadRef.current?.();
      }, []);
      return (
        <div
          ref={scrollRef}
          className={props.className}
          onKeyDownCapture={props.onKeyDownCapture}
          onPointerDownCapture={props.onPointerDownCapture}
          onWheelCapture={props.onWheelCapture}
          onScroll={(event) => {
            if (event.currentTarget.scrollTop === 0) props.onStartReached?.();
          }}
          style={props.style}
        >
          <div
            className={`legend-list-content-container ${props.contentContainerClassName ?? ""}`}
            style={props.contentContainerStyle}
          >
            {props.data.length === 0 ? props.ListEmptyComponent : null}
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
                        (sizesRef.current.get(props.keyExtractor(preceding, precedingIndex)) ??
                          100),
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

const toastDangerSpy = vi.spyOn(toast, "danger").mockImplementation(() => undefined as never);

const originalResizeObserver = globalThis.ResizeObserver;

const project: Project = {
  id: "project-1",
  name: "Repo",
  location: {
    kind: "windows",
    path: "C:\\repo",
  },
  createdAt: "2026-03-28T00:00:00.000Z",
};

class MockResizeObserver {
  static instances = new Set<MockResizeObserver>();

  readonly #callback: ResizeObserverCallback;
  readonly #elements = new Set<Element>();

  constructor(callback: ResizeObserverCallback) {
    this.#callback = callback;
    MockResizeObserver.instances.add(this);
  }

  observe = (element: Element) => {
    this.#elements.add(element);
  };

  unobserve = (element: Element) => {
    this.#elements.delete(element);
  };

  disconnect = () => {
    this.#elements.clear();
    MockResizeObserver.instances.delete(this);
  };

  static reset() {
    MockResizeObserver.instances.clear();
  }

  static notify(element: Element) {
    for (const instance of MockResizeObserver.instances) {
      if (!instance.#elements.has(element)) continue;
      instance.#callback([{ target: element } as ResizeObserverEntry], instance as ResizeObserver);
    }
  }
}

beforeAll(() => {
  globalThis.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;
});

afterAll(() => {
  globalThis.ResizeObserver = originalResizeObserver;
});

describe("ChatPane", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    toastDangerSpy.mockClear();
    vi.useRealTimers();
    MockResizeObserver.reset();
    localStorage.clear();
    Object.defineProperty(window, "poracode", {
      configurable: true,
      writable: true,
      value: {
        dbSetState: vi
          .fn<(key: string, value: string) => Promise<void>>()
          .mockResolvedValue(undefined),
        dbTruncateThreadRuntimeAfter: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
        dbSyncAll: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
        setWindowChrome: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
      },
    });
    useAppStore.setState((state) => ({
      ...state,
      projects: [],
      threads: [],
      view: { kind: "home" },
      runtimeItemIdsByThread: {},
      runtimeItemsByIdByThread: {},
      runtimeRequestsByThread: {},
      runtimeCompletedTurnsByThread: {},
      fileCheckpointsByThread: {},
      fileCheckpointTurnsByThread: {},
      provisioningWorktreeThreadIds: {},
    }));
  });

  it("shows the submitted prompt while its worktree is being created", async () => {
    const thread = {
      ...makeThread(),
      status: "launching",
      worktreeBranch: "poracode/feature",
    } as Thread;
    useAppStore.setState({
      threads: [thread],
      provisioningWorktreeThreadIds: { [thread.id]: true },
    });
    seedUserMessage(thread.id, "Build the feature");

    const { rerender } = renderChatPane(thread);

    expect(await screen.findByText("Build the feature")).toBeInTheDocument();
    expect(screen.getByText("Creating worktree…")).toBeInTheDocument();

    useAppStore.setState({ provisioningWorktreeThreadIds: {} });
    rerender(
      <AppProvider>
        <ChatPane {...chatPaneProps({ ...thread, status: "working" })} />
      </AppProvider>,
    );

    expect(screen.queryByText("Creating worktree…")).not.toBeInTheDocument();
  });

  it("loads the next persisted page when LegendList reaches the start", async () => {
    const thread = makeThread();
    seedAssistantMessage(thread.id, "Latest answer");
    loadOlderThreadRuntimeItems.mockResolvedValueOnce(true);

    const { container } = renderChatPane(thread);
    await waitFor(() => expect(hydrateThreadRuntimeItems).toHaveBeenCalledWith(thread.id));

    const scrollElement = getScrollElement(container);
    fireEvent.scroll(scrollElement, { target: { scrollTop: 0 } });

    await waitFor(() => expect(loadOlderThreadRuntimeItems).toHaveBeenCalledTimes(1));
    expect(loadOlderThreadRuntimeItems).toHaveBeenLastCalledWith(thread.id);
  });

  it("resolves a bare filename chip through the project index before opening it", async () => {
    const thread = makeThread();
    seedAssistantMessage(thread.id, "Open BrowserPanelManager.ts:288.");
    useAppStore.setState({ projects: [project] });
    const searchProjectFiles = vi
      .fn<typeof window.poracode.searchProjectFiles>()
      .mockResolvedValue({
        entries: [
          {
            path: "src/main/browser/BrowserPanelManager.ts",
            name: "BrowserPanelManager.ts",
            type: "file",
          },
        ],
        totalIndexed: 1,
      });
    Object.assign(window.poracode, { searchProjectFiles });
    const onOpenProjectRelativePath = vi.fn<(path: string, lineNumber?: number) => void>();

    renderChatPane(thread, { onOpenProjectRelativePath });

    fireEvent.click(await screen.findByRole("button", { name: /BrowserPanelManager\.ts.*288/ }));

    await waitFor(() =>
      expect(onOpenProjectRelativePath).toHaveBeenCalledWith(
        "src/main/browser/BrowserPanelManager.ts",
        288,
      ),
    );
    expect(searchProjectFiles).toHaveBeenCalledWith({
      projectLocation: project.location,
      query: "BrowserPanelManager.ts",
      limit: 5,
    });
  });

  it("keeps the chat pinned when the last assistant message grows without changing the scroll anchor", async () => {
    const thread = makeThread();
    seedAssistantMessage(thread.id, "Inspect output");

    const { container } = renderChatPane(thread);
    await waitFor(() => expect(hydrateThreadRuntimeItems).toHaveBeenCalledWith(thread.id));

    const scrollElement = getScrollElement(container);
    const metrics = installScrollMetrics(scrollElement, {
      scrollHeight: 200,
      clientHeight: 100,
      scrollTop: 0,
    });

    act(() => {
      metrics.setScrollTop(200);
      fireEvent.scroll(scrollElement);
    });

    act(() => {
      appendAssistantText(thread.id, " — Open logs");
    });

    await screen.findByText(/Open logs/, {}, { timeout: 3_000 });

    act(() => {
      metrics.setScrollHeight(300);
      MockResizeObserver.notify(scrollElement);
    });

    await waitFor(() => expect(metrics.getScrollTop()).toBe(300));
  });

  it("does not duplicate native sticky growth with virtualizer reconciliation", async () => {
    const thread = makeThread();
    seedAssistantMessage(thread.id, "Inspect output");
    useAppStore.setState({ projects: [project] });

    const { container } = renderChatPane(thread);
    await waitFor(() => expect(hydrateThreadRuntimeItems).toHaveBeenCalledWith(thread.id));

    const scrollElement = getScrollElement(container);
    const contentElement = getContentElement(scrollElement);
    const metrics = installScrollMetrics(scrollElement, {
      scrollHeight: 200,
      clientHeight: 100,
      scrollTop: 0,
    });

    act(() => {
      metrics.setScrollTop(200);
      fireEvent.scroll(scrollElement);
    });
    legendScrollToEnd.mockClear();

    act(() => {
      metrics.setScrollHeight(300);
      // LegendList's end anchor applies the virtual row delta first.
      metrics.setScrollTop(300);
      MockResizeObserver.notify(contentElement);
    });

    expect(legendScrollToEnd).not.toHaveBeenCalled();
    expect(metrics.getScrollTop()).toBe(300);
  });

  it("reconciles the virtualizer when sticky tail content changes", async () => {
    const thread = makeThread();
    seedAssistantMessage(thread.id, "Inspect output");
    useAppStore.setState({ projects: [project] });

    const { container } = renderChatPane(thread);
    await waitFor(() => expect(hydrateThreadRuntimeItems).toHaveBeenCalledWith(thread.id));

    const scrollElement = getScrollElement(container);
    const metrics = installScrollMetrics(scrollElement, {
      scrollHeight: 200,
      clientHeight: 100,
      scrollTop: 0,
    });

    act(() => {
      metrics.setScrollTop(200);
      fireEvent.scroll(scrollElement);
    });
    legendScrollToEnd.mockClear();

    act(() => {
      metrics.setScrollHeight(300);
      appendAssistantText(thread.id, " continued");
    });

    await waitFor(() => expect(legendScrollToEnd).toHaveBeenCalledWith({ animated: false }));
    expect(metrics.getScrollTop()).toBe(300);
  });

  it("disables native browser scroll anchoring on the managed chat scroller", async () => {
    const thread = makeThread();
    seedAssistantMessage(thread.id, "Inspect output");

    const { container } = renderChatPane(thread);
    await waitFor(() => expect(hydrateThreadRuntimeItems).toHaveBeenCalledWith(thread.id));

    expect(getScrollElement(container).className).toContain("[overflow-anchor:none]");
  });

  it("does not disturb the native end anchor when bottom-pinned content collapses", async () => {
    const thread = makeThread();
    seedPlanItem(thread.id, [{ step: "Inspect output", status: "in_progress" }]);

    const { container } = renderChatPane(thread);
    await waitFor(() => expect(hydrateThreadRuntimeItems).toHaveBeenCalledWith(thread.id));

    const scrollElement = getScrollElement(container);
    const contentElement = getContentElement(scrollElement);
    const metrics = installScrollMetrics(scrollElement, {
      scrollHeight: 320,
      clientHeight: 100,
      scrollTop: 0,
    });

    act(() => {
      metrics.setScrollTop(320);
      fireEvent.scroll(scrollElement);
    });

    act(() => {
      metrics.setScrollHeight(220);
      // LegendList's end anchor applies the virtual row delta first.
      metrics.setScrollTop(220);
      MockResizeObserver.notify(contentElement);
    });

    expect(metrics.getScrollTop()).toBe(220);
  });

  it("stays sticky when scrollHeight grows after a programmatic scroll lands", async () => {
    const thread = makeThread();
    seedPlanItem(thread.id, [{ step: "Inspect output", status: "in_progress" }]);

    const { container } = renderChatPane(thread);
    await waitFor(() => expect(hydrateThreadRuntimeItems).toHaveBeenCalledWith(thread.id));

    const scrollElement = getScrollElement(container);
    const contentElement = getContentElement(scrollElement);
    const metrics = installScrollMetrics(scrollElement, {
      scrollHeight: 200,
      clientHeight: 100,
      scrollTop: 0,
    });

    act(() => {
      metrics.setScrollTop(100);
      fireEvent.scroll(scrollElement);
    });

    // Race: virtualizer measurement grows scrollHeight after the auto-pin
    // landed, but the delayed scroll event for that programmatic scroll only
    // fires now. Bare `!isAtBottom` must not disengage sticky here, or the
    // corrective re-pin will skip and the "scroll to bottom" button will
    // appear despite the user wanting to stay pinned.
    act(() => {
      metrics.setScrollHeight(300);
      fireEvent.scroll(scrollElement);
    });

    act(() => {
      // LegendList's end anchor applies the delayed virtual row delta.
      metrics.setScrollTop(300);
      MockResizeObserver.notify(contentElement);
    });

    expect(metrics.getScrollTop()).toBe(300);
  });

  it("does not pull the user back to the bottom after they scroll up", async () => {
    const thread = makeThread();
    seedAssistantMessage(thread.id, "Inspect output");

    const { container } = renderChatPane(thread);
    await waitFor(() => expect(hydrateThreadRuntimeItems).toHaveBeenCalledWith(thread.id));

    const scrollElement = getScrollElement(container);
    const contentElement = getContentElement(scrollElement);
    const metrics = installScrollMetrics(scrollElement, {
      scrollHeight: 200,
      clientHeight: 100,
      scrollTop: 0,
    });

    act(() => {
      metrics.setScrollTop(200);
      fireEvent.scroll(scrollElement);
    });

    act(() => {
      fireEvent.wheel(scrollElement, { deltaY: -120 });
      metrics.setScrollTop(80);
      fireEvent.scroll(scrollElement);
    });

    act(() => {
      appendAssistantText(thread.id, " — Open logs");
    });

    await screen.findByText(/Open logs/);

    act(() => {
      metrics.setScrollHeight(300);
      MockResizeObserver.notify(contentElement);
    });

    await waitFor(() => expect(metrics.getScrollTop()).toBe(80));
  });

  it("does not re-stick when the scrollbar thumb is dragged away from the bottom", async () => {
    // Regression: native scrollbar thumbs often never fire pointerdown on the
    // scroller (Windows overlay scrollbars) — only scroll. Sticky used to
    // require a prior intent flag to release, so ResizeObserver re-pins yanked
    // the thumb back to the bottom mid-drag.
    const thread = makeThread();
    seedAssistantMessage(thread.id, "Inspect output");

    const { container } = renderChatPane(thread);
    await waitFor(() => expect(hydrateThreadRuntimeItems).toHaveBeenCalledWith(thread.id));

    const scrollElement = getScrollElement(container);
    const contentElement = getContentElement(scrollElement);
    const metrics = installScrollMetrics(scrollElement, {
      scrollHeight: 200,
      clientHeight: 100,
      scrollTop: 0,
    });

    act(() => {
      metrics.setScrollTop(200);
      fireEvent.scroll(scrollElement);
    });

    act(() => {
      // No pointerdown — mirrors a native thumb drag that only emits scroll.
      metrics.setScrollTop(80);
      fireEvent.scroll(scrollElement);
    });

    act(() => {
      metrics.setScrollHeight(300);
      MockResizeObserver.notify(contentElement);
    });

    await waitFor(() => expect(metrics.getScrollTop()).toBe(80));
  });

  it("does not re-stick when the scrollbar thumb is dragged while content height grows", async () => {
    // Working-thread regression: a thumb drag often coincides with streaming
    // growth. Height growth must not be treated as a layout clamp that keeps
    // sticky on — otherwise the next ResizeObserver re-pin yanks the thumb.
    const thread = makeThread();
    seedAssistantMessage(thread.id, "Inspect output");

    const { container } = renderChatPane(thread);
    await waitFor(() => expect(hydrateThreadRuntimeItems).toHaveBeenCalledWith(thread.id));

    const scrollElement = getScrollElement(container);
    const contentElement = getContentElement(scrollElement);
    const metrics = installScrollMetrics(scrollElement, {
      scrollHeight: 200,
      clientHeight: 100,
      scrollTop: 0,
    });

    act(() => {
      metrics.setScrollTop(200);
      fireEvent.scroll(scrollElement);
    });

    act(() => {
      // Thumb drag + live stream in the same scroll tick: height grew, scrollTop
      // moved up, no pointerdown.
      metrics.setScrollHeight(280);
      metrics.setScrollTop(80);
      fireEvent.scroll(scrollElement);
    });

    act(() => {
      metrics.setScrollHeight(360);
      MockResizeObserver.notify(contentElement);
    });

    await waitFor(() => expect(metrics.getScrollTop()).toBe(80));
  });

  it("does not snap back to the bottom after a tiny upward scroll within the bottom epsilon", async () => {
    // Regression: a wheel-up of only 1–3 px disables sticky in the wheel
    // handler, but the resulting scroll event arrives with `isAtBottom` still
    // true (within `BOTTOM_EPSILON_PX = 4`). The `else if (isAtBottom)` branch
    // used to unconditionally re-enable sticky here, so the next streaming
    // delta would slam scrollTop back to scrollHeight.
    const thread = makeThread();
    seedAssistantMessage(thread.id, "Inspect output");

    const { container } = renderChatPane(thread);
    await waitFor(() => expect(hydrateThreadRuntimeItems).toHaveBeenCalledWith(thread.id));

    const scrollElement = getScrollElement(container);
    const contentElement = getContentElement(scrollElement);
    const metrics = installScrollMetrics(scrollElement, {
      scrollHeight: 200,
      clientHeight: 100,
      scrollTop: 0,
    });

    act(() => {
      metrics.setScrollTop(100);
      fireEvent.scroll(scrollElement);
    });

    act(() => {
      fireEvent.wheel(scrollElement, { deltaY: -2 });
      metrics.setScrollTop(98);
      fireEvent.scroll(scrollElement);
    });

    act(() => {
      appendAssistantText(thread.id, " — Open logs");
    });

    await screen.findByText(/Open logs/);

    act(() => {
      metrics.setScrollHeight(300);
      MockResizeObserver.notify(contentElement);
    });

    await waitFor(() => expect(metrics.getScrollTop()).toBe(98));
  });

  it("re-pins to the bottom when the user scrolls back down to it", async () => {
    const thread = makeThread();
    seedAssistantMessage(thread.id, "Inspect output");

    const { container } = renderChatPane(thread);
    await waitFor(() => expect(hydrateThreadRuntimeItems).toHaveBeenCalledWith(thread.id));

    const scrollElement = getScrollElement(container);
    const contentElement = getContentElement(scrollElement);
    const metrics = installScrollMetrics(scrollElement, {
      scrollHeight: 200,
      clientHeight: 100,
      scrollTop: 0,
    });

    act(() => {
      metrics.setScrollTop(100);
      fireEvent.scroll(scrollElement);
    });

    act(() => {
      fireEvent.wheel(scrollElement, { deltaY: -120 });
      metrics.setScrollTop(20);
      fireEvent.scroll(scrollElement);
    });

    // User scrolls back down to the bottom — direction is downward and lands
    // at-bottom, so sticky must re-engage.
    act(() => {
      metrics.setScrollTop(100);
      fireEvent.scroll(scrollElement);
    });

    act(() => {
      appendAssistantText(thread.id, " — Open logs");
    });

    await screen.findByText(/Open logs/);

    act(() => {
      metrics.setScrollHeight(300);
      // LegendList follows the append after sticky mode was re-engaged.
      metrics.setScrollTop(300);
      MockResizeObserver.notify(contentElement);
    });

    await waitFor(() => expect(metrics.getScrollTop()).toBe(300));
  });

  it("does not release sticky mode for layout-driven upward scroll during tail collapse", async () => {
    const thread = makeThread();
    seedAssistantMessage(thread.id, "Inspect output");

    const { container } = renderChatPane(thread);
    await waitFor(() => expect(hydrateThreadRuntimeItems).toHaveBeenCalledWith(thread.id));

    const scrollElement = getScrollElement(container);
    const contentElement = getContentElement(scrollElement);
    const metrics = installScrollMetrics(scrollElement, {
      scrollHeight: 320,
      clientHeight: 100,
      scrollTop: 0,
    });

    act(() => {
      metrics.setScrollTop(320);
      fireEvent.scroll(scrollElement);
    });

    // Collapsing/removing tail content can make the browser lower scrollTop
    // before the ResizeObserver correction runs. That is not user intent and
    // must not turn off bottom stickiness.
    act(() => {
      metrics.setScrollHeight(220);
      metrics.setScrollTop(80);
      fireEvent.scroll(scrollElement);
    });

    act(() => {
      metrics.setScrollHeight(300);
      MockResizeObserver.notify(contentElement);
    });

    await waitFor(() => expect(metrics.getScrollTop()).toBe(300));
  });

  it("keeps sticky after a tool-collapse click whose height compensation moves scrollTop up", async () => {
    // Regression: pointerdown on the disclosure used to arm user-scroll intent.
    // Sticky row-height compensation then decreased scrollTop, and the scroll
    // handler treated that as a user scroll-away — leaving the chat stranded
    // above the bottom after collapsing a tool while pinned.
    const thread = makeThread();
    seedAssistantMessage(thread.id, "Inspect output");

    const { container } = renderChatPane(thread);
    await waitFor(() => expect(hydrateThreadRuntimeItems).toHaveBeenCalledWith(thread.id));

    const scrollElement = getScrollElement(container);
    const contentElement = getContentElement(scrollElement);
    const metrics = installScrollMetrics(scrollElement, {
      scrollHeight: 320,
      clientHeight: 100,
      scrollTop: 0,
    });

    act(() => {
      metrics.setScrollTop(320);
      fireEvent.scroll(scrollElement);
    });

    const toolButton = document.createElement("button");
    toolButton.type = "button";
    contentElement.append(toolButton);

    act(() => {
      fireEvent.pointerDown(toolButton);
      metrics.setScrollHeight(220);
      metrics.setScrollTop(80);
      fireEvent.scroll(scrollElement);
    });

    act(() => {
      MockResizeObserver.notify(contentElement);
    });

    await waitFor(() => expect(metrics.getScrollTop()).toBe(220));
    toolButton.remove();
  });

  it("keeps sticky after a tool-expand click whose content growth leaves scrollTop above the bottom", async () => {
    // Same pointer-intent bug as collapse: expanding a tool grows scrollHeight
    // while the click armed user-scroll intent. Without the control-click
    // guard, sticky is released and the chat stays mid-transcript.
    const thread = makeThread();
    seedAssistantMessage(thread.id, "Inspect output");

    const { container } = renderChatPane(thread);
    await waitFor(() => expect(hydrateThreadRuntimeItems).toHaveBeenCalledWith(thread.id));

    const scrollElement = getScrollElement(container);
    const contentElement = getContentElement(scrollElement);
    const metrics = installScrollMetrics(scrollElement, {
      scrollHeight: 220,
      clientHeight: 100,
      scrollTop: 0,
    });

    act(() => {
      metrics.setScrollTop(220);
      fireEvent.scroll(scrollElement);
    });

    const toolButton = document.createElement("button");
    toolButton.type = "button";
    contentElement.append(toolButton);

    act(() => {
      fireEvent.pointerDown(toolButton);
      // LegendList's visible-content anchoring can move scrollTop upward while
      // the disclosure commit starts, before the larger row height becomes
      // observable. This is layout-driven, not a user scroll-away.
      metrics.setScrollTop(180);
      fireEvent.scroll(scrollElement);
    });

    act(() => {
      metrics.setScrollHeight(420);
      MockResizeObserver.notify(contentElement);
    });

    await waitFor(() => expect(metrics.getScrollTop()).toBe(420));
    toolButton.remove();
  });

  it("re-pins after todo dock layout changes when the thread was already at the bottom", async () => {
    const thread = makeThread();
    seedAssistantMessage(thread.id, "Inspect output");

    const { container, rerender } = renderChatPane(thread, { layoutChangeToken: "collapsed" });
    await waitFor(() => expect(hydrateThreadRuntimeItems).toHaveBeenCalledWith(thread.id));

    const scrollElement = getScrollElement(container);
    const metrics = installScrollMetrics(scrollElement, {
      scrollHeight: 200,
      clientHeight: 100,
      scrollTop: 0,
    });

    act(() => {
      metrics.setScrollTop(200);
      fireEvent.scroll(scrollElement);
    });

    act(() => {
      metrics.setScrollTop(80);
      rerender(
        <AppProvider>
          <ChatPane {...chatPaneProps(thread)} layoutChangeToken="expanded" />
        </AppProvider>,
      );
    });

    expect(metrics.getScrollTop()).toBe(200);
  });

  it("keeps the user's place after todo dock layout changes when they already scrolled up", async () => {
    const thread = makeThread();
    seedAssistantMessage(thread.id, "Inspect output");

    const { container, rerender } = renderChatPane(thread, { layoutChangeToken: "collapsed" });
    await waitFor(() => expect(hydrateThreadRuntimeItems).toHaveBeenCalledWith(thread.id));

    const scrollElement = getScrollElement(container);
    const metrics = installScrollMetrics(scrollElement, {
      scrollHeight: 200,
      clientHeight: 100,
      scrollTop: 0,
    });

    act(() => {
      metrics.setScrollTop(200);
      fireEvent.scroll(scrollElement);
    });

    act(() => {
      fireEvent.wheel(scrollElement, { deltaY: -120 });
      metrics.setScrollTop(80);
      fireEvent.scroll(scrollElement);
    });

    act(() => {
      rerender(
        <AppProvider>
          <ChatPane {...chatPaneProps(thread)} layoutChangeToken="expanded" />
        </AppProvider>,
      );
    });

    expect(metrics.getScrollTop()).toBe(80);
  });

  it("re-pins when the scroll viewport shrinks while already at the bottom", async () => {
    const thread = makeThread();
    seedAssistantMessage(thread.id, "Inspect output");

    const { container } = renderChatPane(thread);
    await waitFor(() => expect(hydrateThreadRuntimeItems).toHaveBeenCalledWith(thread.id));

    const scrollElement = getScrollElement(container);
    const metrics = installScrollMetrics(scrollElement, {
      scrollHeight: 300,
      clientHeight: 100,
      scrollTop: 0,
    });

    act(() => {
      metrics.setScrollTop(200);
      fireEvent.scroll(scrollElement);
    });

    act(() => {
      metrics.setClientHeight(60);
      MockResizeObserver.notify(scrollElement);
    });

    await waitFor(() => expect(metrics.getScrollTop()).toBe(300));
  });

  it("keeps the user's place when the scroll viewport shrinks after they scrolled up", async () => {
    const thread = makeThread();
    seedAssistantMessage(thread.id, "Inspect output");

    const { container } = renderChatPane(thread);
    await waitFor(() => expect(hydrateThreadRuntimeItems).toHaveBeenCalledWith(thread.id));

    const scrollElement = getScrollElement(container);
    const metrics = installScrollMetrics(scrollElement, {
      scrollHeight: 300,
      clientHeight: 100,
      scrollTop: 0,
    });

    act(() => {
      metrics.setScrollTop(200);
      fireEvent.scroll(scrollElement);
    });

    act(() => {
      fireEvent.wheel(scrollElement, { deltaY: -120 });
      metrics.setScrollTop(120);
      fireEvent.scroll(scrollElement);
    });

    act(() => {
      metrics.setClientHeight(60);
      MockResizeObserver.notify(scrollElement);
    });

    expect(metrics.getScrollTop()).toBe(120);
  });

  it("keeps running command accordions closed until clicked", async () => {
    const thread = makeThread();
    seedCommandItem(thread.id, "cmd-1", "npm run test", "command output");

    renderChatPane(thread);
    await waitFor(() => expect(hydrateThreadRuntimeItems).toHaveBeenCalledWith(thread.id));

    const trigger = screen.getByText("Check · npm run test").closest("button");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText(/command output/)).not.toBeInTheDocument();

    fireEvent.click(trigger!);

    expect(trigger).toHaveAttribute("aria-expanded", "true");
    await screen.findByText(/command output/);
  });

  it("shows the requested command in expanded command accordions", async () => {
    const thread = makeThread();
    const command = String.raw`cd C:\Users\sdsle\work\poracode && "C:\Program Files\WindowsApps\Microsoft.PowerShell_7.6.1.0_x64__8wekyb3d8bbwe\pwsh.exe" -Command 'git status --short'`;
    seedCommandItem(thread.id, "cmd-1", command, "status output");

    renderChatPane(thread);
    await waitFor(() => expect(hydrateThreadRuntimeItems).toHaveBeenCalledWith(thread.id));

    fireEvent.click(screen.getByText("Git · git status --short").closest("button")!);

    expect(document.body).toHaveTextContent("$ git status --short");
    expect(document.body).not.toHaveTextContent("WindowsApps");
  });

  it("shows provider-reported subagent model and tokens without falling back to the parent model", async () => {
    const thread = { ...makeThread(), config: { model: "gpt-parent-main" } };
    seedSubAgentTool(thread.id, {
      itemId: "task-1",
      model: "opus",
      tokens: 336_000,
      lastToolName: "Bash",
      stepCount: 21,
    });

    renderChatPane(thread);
    await waitFor(() => expect(hydrateThreadRuntimeItems).toHaveBeenCalledWith(thread.id));

    expect(await screen.findByText("Opus")).toBeInTheDocument();
    expect(screen.getByText("336K tok")).toBeInTheDocument();
    expect(screen.getByText("Bash")).toBeInTheDocument();
    expect(screen.getByText("21 steps")).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent("gpt-parent-main");
  });

  it("animates running agent titles without duplicating their description in progress", async () => {
    const thread = makeThread();
    useAppStore.getState().applyRuntimeEvent(thread.id, {
      type: "item.started",
      threadId: thread.id,
      itemId: "subagent-running",
      itemType: "tool_call",
      payload: {
        name: "spawnAgent",
        status: "running",
        isSubAgent: true,
        args: { description: "protocol specialist" },
        progress: {
          model: "gpt-5.6-sol",
          effort: "ultra",
          description: "protocol specialist",
          stepCount: 5,
        },
      },
    });

    const view = renderChatPane(thread);
    await waitFor(() => expect(hydrateThreadRuntimeItems).toHaveBeenCalledWith(thread.id));

    expect(
      view.container.querySelectorAll('[data-poracode-shimmer-text="Agent · protocol specialist"]'),
    ).toHaveLength(1);
    expect(view.container.textContent).not.toContain("specialist·5 steps");
    expect(view.container.querySelector(".poracode-pixel-loader")).toBeNull();
    expect(view.container.querySelector(".lucide-chevron-right")).toHaveClass(
      "[@media(hover:hover)]:opacity-0",
      "[@media(hover:hover)]:group-hover:opacity-100",
    );
  });

  it("shows a completed Codex child response through the shared subagent result disclosure", async () => {
    const thread = makeThread();
    useAppStore.getState().applyRuntimeEvent(thread.id, {
      type: "item.started",
      threadId: thread.id,
      itemId: "subagent-result",
      itemType: "tool_call",
      payload: {
        name: "spawnAgent",
        status: "running",
        isSubAgent: true,
        args: { description: "protocol specialist" },
        progress: { model: "gpt-5.6-sol", effort: "ultra" },
      },
    });
    useAppStore.getState().applyRuntimeEvent(thread.id, {
      type: "item.completed",
      threadId: thread.id,
      itemId: "subagent-result",
      payload: { status: "success", result: "## Protocol result\n\n- routed" },
    });

    renderChatPane(thread);
    await waitFor(() => expect(hydrateThreadRuntimeItems).toHaveBeenCalledWith(thread.id));

    const resultToggle = await screen.findByRole("button", { name: "Subagent Result" });
    expect(document.body).toHaveTextContent("Agent · protocol specialist·GPT 5.6 Sol");
    expect(resultToggle).toHaveClass("group");
    expect(resultToggle.querySelector(".lucide-chevron-down")).toHaveClass(
      "[@media(hover:hover)]:opacity-0",
      "[@media(hover:hover)]:group-hover:opacity-100",
      "[@media(hover:hover)]:group-focus-visible:opacity-100",
    );
    fireEvent.click(resultToggle);
    expect(await screen.findByRole("heading", { name: "Protocol result" })).toBeInTheDocument();
  });

  it("labels a Crossagents child separately from native subagents", async () => {
    const thread = makeThread();
    useAppStore.getState().applyRuntimeEvent(thread.id, {
      type: "item.started",
      threadId: thread.id,
      itemId: "crossagent-result",
      itemType: "tool_call",
      payload: {
        name: "protocol specialist",
        status: "running",
        isCrossagent: true,
      },
    });
    useAppStore.getState().applyRuntimeEvent(thread.id, {
      type: "item.completed",
      threadId: thread.id,
      itemId: "crossagent-result",
      payload: {
        name: "protocol specialist",
        status: "success",
        isCrossagent: true,
        result: "Cross-provider result",
      },
    });

    renderChatPane(thread);
    await waitFor(() => expect(hydrateThreadRuntimeItems).toHaveBeenCalledWith(thread.id));

    expect(await screen.findByRole("button", { name: "Crossagent Result" })).toBeInTheDocument();
    expect(document.body).toHaveTextContent("Crossagent · protocol specialist");
    expect(screen.queryByRole("button", { name: "Subagent Result" })).not.toBeInTheDocument();
  });

  it("shows an intentionally cancelled Crossagent without an error indicator", async () => {
    const thread = makeThread();
    useAppStore.getState().applyRuntimeEvent(thread.id, {
      type: "item.started",
      threadId: thread.id,
      itemId: "crossagent-cancelled",
      itemType: "tool_call",
      payload: {
        name: "cancel probe",
        status: "running",
        isCrossagent: true,
        crossagentStatus: "running",
      },
    });
    useAppStore.getState().applyRuntimeEvent(thread.id, {
      type: "item.completed",
      threadId: thread.id,
      itemId: "crossagent-cancelled",
      payload: {
        name: "cancel probe",
        status: "error",
        isCrossagent: true,
        crossagentStatus: "cancelled",
      },
    });

    renderChatPane(thread);
    await waitFor(() => expect(hydrateThreadRuntimeItems).toHaveBeenCalledWith(thread.id));

    const row = await screen.findByRole("button", {
      name: "Open Crossagent: Crossagent: cancel probe",
    });
    expect(row).toHaveTextContent("cancelled");
    expect(row).toHaveAccessibleDescription("cancelled");
    expect(screen.queryByLabelText("error")).not.toBeInTheDocument();
  });

  it("separates the collapsed Agent label from its step count", async () => {
    const thread = makeThread();
    useAppStore.getState().applyRuntimeEvent(thread.id, {
      type: "item.started",
      threadId: thread.id,
      itemId: "subagent-steps",
      itemType: "tool_call",
      payload: {
        name: "mario-game-builder — Codex · 5.6 Terra",
        status: "running",
        isSubAgent: true,
        progress: { stepCount: 5 },
      },
    });

    renderChatPane(thread);
    await waitFor(() => expect(hydrateThreadRuntimeItems).toHaveBeenCalledWith(thread.id));

    expect((await screen.findByText("5 steps")).parentElement).toHaveTextContent("·5 steps");
  });

  it("collapses long user messages behind a show more button", async () => {
    const thread = makeThread();
    seedUserMessage(
      thread.id,
      [
        "Validate optimisations and plan fixes",
        "Issue one with enough context to fill the first visible line.",
        "Issue two with enough context to fill the second visible line.",
        "Issue three with enough context to fill the third visible line.",
        "Issue four should be hidden until the message is expanded.",
      ].join("\n"),
    );

    const { container } = renderChatPane(thread);
    await waitFor(() => expect(hydrateThreadRuntimeItems).toHaveBeenCalledWith(thread.id));

    const content = getUserMessageContent(container);
    installElementHeightMetrics(content, { scrollHeight: 120, clientHeight: 88 });
    act(() => {
      MockResizeObserver.notify(content);
    });

    const button = await screen.findByRole("button", { name: "Show more" });
    expect(button).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(button);

    expect(screen.getByRole("button", { name: "Show less" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
  });

  it("resets a long user message scroll position before collapsing it", async () => {
    const thread = makeThread();
    seedUserMessage(
      thread.id,
      [
        "Validate optimisations and plan fixes",
        "Issue one with enough context to fill the first visible line.",
        "Issue two with enough context to fill the second visible line.",
        "Issue three with enough context to fill the third visible line.",
        "Issue four should be hidden until the message is expanded.",
      ].join("\n"),
    );

    const { container } = renderChatPane(thread);
    await waitFor(() => expect(hydrateThreadRuntimeItems).toHaveBeenCalledWith(thread.id));

    const content = getUserMessageContent(container);
    const metrics = installScrollMetrics(content, {
      scrollHeight: 240,
      clientHeight: 88,
      scrollTop: 0,
    });
    act(() => {
      MockResizeObserver.notify(content);
    });

    fireEvent.click(await screen.findByRole("button", { name: "Show more" }));
    metrics.setScrollTop(152);
    fireEvent.click(screen.getByRole("button", { name: "Show less" }));

    expect(metrics.getScrollTop()).toBe(0);
    expect(screen.getByRole("button", { name: "Show more" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  it("does not collapse a long raw prompt when it only renders as two rows", async () => {
    const thread = makeThread();
    seedUserMessage(
      thread.id,
      "yesh we do not need recreate them, because we just changing 1 value, that can affect also another value, but we should keep object same, just change some values in it",
    );

    const { container } = renderChatPane(thread);
    await waitFor(() => expect(hydrateThreadRuntimeItems).toHaveBeenCalledWith(thread.id));

    const content = getUserMessageContent(container);
    installElementHeightMetrics(content, { scrollHeight: 44, clientHeight: 44 });
    act(() => {
      MockResizeObserver.notify(content);
    });

    expect(screen.queryByRole("button", { name: "Show more" })).not.toBeInTheDocument();
  });

  it("renders file mentions in user messages as inline chips", async () => {
    const thread = makeThread();
    seedUserMessageContent(thread.id, [
      { kind: "text", text: "/goal sadasdas " },
      {
        kind: "file",
        path: "src/supervisor/agents/acp/session.ts",
        name: "session.ts",
        source: "mention",
      },
    ]);

    renderChatPane(thread);
    await waitFor(() => expect(hydrateThreadRuntimeItems).toHaveBeenCalledWith(thread.id));

    expect(screen.getByText("goal")).toBeInTheDocument();
    expect(screen.getByText("sadasdas")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /session\.ts/u })).toBeInTheDocument();
    expect(
      screen.queryByText(/src\/supervisor\/agents\/acp\/session\.ts/u),
    ).not.toBeInTheDocument();
  });

  it("renders legacy image file attachments as image previews", async () => {
    const thread = makeThread();
    seedUserMessageContent(thread.id, [
      {
        kind: "file",
        path: "C:\\tmp\\screenshot.png",
        name: "screenshot.png",
        source: "attachment",
      },
    ]);

    const { container } = renderChatPane(thread);
    await waitFor(() => expect(hydrateThreadRuntimeItems).toHaveBeenCalledWith(thread.id));

    expect(screen.getByAltText("screenshot.png")).toBeInTheDocument();
    expect(
      container.querySelector('[data-poracode-attachment-image-preview="true"]'),
    ).toBeInTheDocument();
    expect(container.querySelector(".poracode-attachment-chip__icon")).not.toBeInTheDocument();
  });

  it("renders selected skills in user messages as skill badges", async () => {
    const thread = makeThread();
    seedUserMessageContent(thread.id, [
      { kind: "skill", name: "simplify", invocation: "$simplify" },
    ]);

    const { container } = renderChatPane(thread);
    await waitFor(() => expect(hydrateThreadRuntimeItems).toHaveBeenCalledWith(thread.id));

    const badge = container.querySelector('[data-skill-name="simplify"]');
    expect(badge).toHaveTextContent("simplify");
    expect(badge?.querySelector("svg")).toBeInTheDocument();
    expect(badge).not.toHaveClass("poracode-slash-chip--user-message");
    expect(screen.queryByText("$simplify")).not.toBeInTheDocument();
  });

  it("renders MCP mentions in user messages as badges", async () => {
    const thread = makeThread();
    seedUserMessageContent(thread.id, [{ kind: "mcp", name: "Browser" }]);

    const { container } = renderChatPane(thread);
    await waitFor(() => expect(hydrateThreadRuntimeItems).toHaveBeenCalledWith(thread.id));

    const badge = container.querySelector('[data-mcp-name="Browser"]');
    expect(badge).toHaveTextContent("Browser");
    expect(badge?.querySelector("svg")).toBeInTheDocument();
    // The raw `@Browser` directive text is replaced by the badge.
    expect(screen.queryByText("@Browser")).not.toBeInTheDocument();
  });

  it("copies user message text from the inline action", async () => {
    const thread = makeThread();
    seedUserMessage(thread.id, "Copy this prompt");
    const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    renderChatPane(thread);
    await waitFor(() => expect(hydrateThreadRuntimeItems).toHaveBeenCalledWith(thread.id));

    fireEvent.click(screen.getByRole("button", { name: "Copy message" }));

    expect(writeText).toHaveBeenCalledWith("Copy this prompt");
    await screen.findByRole("button", { name: "Copied" });
  });

  it("reports user message copy failures", async () => {
    const thread = makeThread();
    seedUserMessage(thread.id, "Copy this prompt");
    const writeText = vi
      .fn<(text: string) => Promise<void>>()
      .mockRejectedValue(new Error("copy failed"));
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    renderChatPane(thread);
    await waitFor(() => expect(hydrateThreadRuntimeItems).toHaveBeenCalledWith(thread.id));

    fireEvent.click(screen.getByRole("button", { name: "Copy message" }));

    await waitFor(() => {
      expect(toastDangerSpy).toHaveBeenCalledWith("copy failed");
    });
  });

  it("hides the assistant copy action until the active turn settles", async () => {
    const thread = makeThread();
    seedAssistantMessage(thread.id, "Still working");
    completeAssistantMessage(thread.id);

    const { container } = renderChatPane(thread);
    await waitFor(() => expect(hydrateThreadRuntimeItems).toHaveBeenCalledWith(thread.id));

    expect(screen.getByText("Still working")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Copy message" })).not.toBeInTheDocument();
    expect(container.querySelector(".poracode-message-action-strip")).not.toBeNull();
  });

  it("shows the assistant copy action after the turn settles", async () => {
    const thread = { ...makeThread(), status: "idle" as const };
    seedAssistantMessage(thread.id, "Final answer");
    completeAssistantMessage(thread.id);

    renderChatPane(thread);
    await waitFor(() => expect(hydrateThreadRuntimeItems).toHaveBeenCalledWith(thread.id));

    expect(screen.getByRole("button", { name: "Copy message" })).toBeInTheDocument();
  });

  it("renders links in slash command user messages as links", async () => {
    const thread = makeThread();
    const url = "https://tanstack.com/blog/tanstack-virtual-chat";
    seedUserMessage(thread.id, `/goal implement new chat\n${url}`);

    renderChatPane(thread);
    await waitFor(() => expect(hydrateThreadRuntimeItems).toHaveBeenCalledWith(thread.id));

    expect(screen.getByText("goal").parentElement).toHaveClass("poracode-slash-chip");
    expect(screen.getByRole("link", { name: url })).toHaveAttribute("href", url);
  });

  it("renders ACP skill commands with their short display name", async () => {
    const thread = makeThread();
    seedUserMessage(thread.id, "/skill:simplify review these changes");

    renderChatPane(thread);
    await waitFor(() => expect(hydrateThreadRuntimeItems).toHaveBeenCalledWith(thread.id));

    expect(screen.getByText("simplify").parentElement).toHaveClass("poracode-slash-chip");
    expect(screen.queryByText("skill:simplify")).not.toBeInTheDocument();
  });

  it("reports failed user message link opens", async () => {
    const thread = makeThread();
    const url = "https://tanstack.com/blog/tanstack-virtual-chat";
    seedUserMessage(thread.id, url);
    const openExternal = vi
      .fn<(href: string) => Promise<void>>()
      .mockRejectedValue(new Error("open failed"));
    Object.defineProperty(window, "poracode", {
      configurable: true,
      value: {
        openExternal,
        setWindowChrome: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
      },
    });

    renderChatPane(thread);
    await waitFor(() => expect(hydrateThreadRuntimeItems).toHaveBeenCalledWith(thread.id));

    fireEvent.click(screen.getByRole("link", { name: url }));

    await waitFor(() => {
      expect(toastDangerSpy).toHaveBeenCalledWith("open failed");
    });
    expect(openExternal).toHaveBeenCalledWith(url);
  });

  it("updates user message collapse state when resize changes visual overflow", async () => {
    const thread = makeThread();
    seedUserMessage(thread.id, "Resize can wrap this prompt into more visual rows.");

    const { container } = renderChatPane(thread);
    await waitFor(() => expect(hydrateThreadRuntimeItems).toHaveBeenCalledWith(thread.id));

    const content = getUserMessageContent(container);
    const metrics = installElementHeightMetrics(content, { scrollHeight: 44, clientHeight: 44 });
    act(() => {
      MockResizeObserver.notify(content);
    });

    expect(screen.queryByRole("button", { name: "Show more" })).not.toBeInTheDocument();

    act(() => {
      metrics.setScrollHeight(120);
      MockResizeObserver.notify(content);
    });

    expect(await screen.findByRole("button", { name: "Show more" })).toBeInTheDocument();
  });

  it("keeps ACP command accordions closed while live output streams in", async () => {
    const thread = makeThread();
    startCommandItem(thread.id, "cmd-1", "npm run test");

    renderChatPane(thread);
    await waitFor(() => expect(hydrateThreadRuntimeItems).toHaveBeenCalledWith(thread.id));

    const trigger = screen.getByText("Check · npm run test").closest("button");
    expect(trigger).toHaveAttribute("aria-expanded", "false");

    act(() => {
      useAppStore.getState().applyRuntimeEvent(thread.id, {
        type: "content.delta",
        threadId: thread.id,
        itemId: "cmd-1",
        stream: "command_output",
        delta: "streamed output",
      });
    });

    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText(/streamed output/)).not.toBeInTheDocument();
  });

  it("expands the live tool-call group at the timeline tail and collapses it on click", async () => {
    const thread = makeThread();
    seedCommandItem(thread.id, "cmd-1", "echo one", "one");
    seedCommandItem(thread.id, "cmd-2", "echo two", "two");

    renderChatPane(thread);
    await waitFor(() => expect(hydrateThreadRuntimeItems).toHaveBeenCalledWith(thread.id));

    const trigger = screen.getByText(byTextContent("2 commands")).closest("button");
    expect(trigger).toHaveAttribute("aria-expanded", "true");

    fireEvent.click(trigger!);

    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("keeps following virtual rows aligned through repeated tool-group toggles", async () => {
    const thread = makeThread();
    seedCommandItem(thread.id, "cmd-1", "echo one", "one");
    seedCommandItem(thread.id, "cmd-2", "echo two", "two");
    seedAssistantMessage(thread.id, "Following answer", "assistant-after-group");
    seedUserMessage(thread.id, "Following prompt", "user-after-group");

    const { container } = renderChatPane(thread);
    await waitFor(() => expect(hydrateThreadRuntimeItems).toHaveBeenCalledWith(thread.id));

    const trigger = screen.getByText(byTextContent("2 commands")).closest("button");
    const groupRow = trigger?.closest<HTMLElement>("[data-chat-virtual-row='true']");
    const assistantRow = container.querySelector<HTMLElement>(
      "[data-chat-virtual-row='true'][data-item-id='assistant-after-group']",
    );
    const userRow = container.querySelector<HTMLElement>(
      "[data-chat-virtual-row='true'][data-item-id='user-after-group']",
    );
    if (!trigger || !groupRow || !assistantRow || !userRow) {
      throw new Error("missing virtualized tool-group fixture");
    }
    Object.defineProperties(groupRow, {
      offsetHeight: {
        configurable: true,
        get: () => (trigger.getAttribute("aria-expanded") === "true" ? 220 : 100),
      },
      offsetWidth: { configurable: true, value: 500 },
    });

    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(virtualRowTop(assistantRow)).toBe(100);
    expect(virtualRowTop(userRow)).toBe(200);

    for (let toggle = 0; toggle < 6; toggle += 1) {
      fireEvent.click(trigger);
      act(() => MockResizeObserver.notify(groupRow));

      const expanded = toggle % 2 === 0;
      const groupHeight = expanded ? 220 : 100;
      expect(trigger).toHaveAttribute("aria-expanded", String(expanded));
      expect(virtualRowTop(assistantRow)).toBe(groupHeight);
      expect(virtualRowTop(userRow)).toBe(groupHeight + 100);
    }
  });

  it("collapses the tool-call group automatically once a non-group item arrives after it", async () => {
    const thread = makeThread();
    seedCommandItem(thread.id, "cmd-1", "echo one", "one");
    seedCommandItem(thread.id, "cmd-2", "echo two", "two");

    renderChatPane(thread);
    await waitFor(() => expect(hydrateThreadRuntimeItems).toHaveBeenCalledWith(thread.id));

    const trigger = screen.getByText(byTextContent("2 commands")).closest("button");
    expect(trigger).toHaveAttribute("aria-expanded", "true");

    act(() => {
      useAppStore.getState().applyRuntimeEvent(thread.id, {
        type: "item.started",
        threadId: thread.id,
        itemId: "asst-1",
        itemType: "assistant_message",
      });
      useAppStore.getState().applyRuntimeEvent(thread.id, {
        type: "content.delta",
        threadId: thread.id,
        itemId: "asst-1",
        stream: "assistant_text",
        delta: "follow up",
      });
    });

    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("uses the persisted live turn start when reopening a working thread", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-01T12:01:10.000Z"));

    renderChatPane({
      ...makeThread(),
      activeTurnStartedAt: "2026-05-01T12:00:00.000Z",
    });

    expect(screen.getByText("Working for 1m 10s")).toBeInTheDocument();
  });

  it("pauses the live turn timer while a runtime request is open", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-01T12:01:10.000Z"));

    useAppStore.getState().applyRuntimeEvent("thread-gui", {
      type: "request.opened",
      threadId: "thread-gui",
      requestId: "approval-1",
      requestType: "command_execution_approval",
      payload: { summary: "Permission required" },
    });

    renderChatPane({
      ...makeThread(),
      activeTurnStartedAt: "2026-05-01T12:00:00.000Z",
    });

    const label = screen.getByText("Working for 1m 10s");
    expect(label).toHaveClass("text-muted");

    act(() => {
      vi.advanceTimersByTime(10_000);
    });

    expect(screen.getByText("Working for 1m 10s")).toBeInTheDocument();
  });

  it("shows the last worked duration for a reopened completed thread", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-01T12:02:00.000Z"));

    renderChatPane({
      ...makeThread(),
      status: "idle",
      activeTurnStartedAt: undefined,
      lastTurnStartedAt: "2026-05-01T12:00:00.000Z",
      lastTurnEndedAt: "2026-05-01T12:01:15.000Z",
    });

    expect(screen.getByText("Worked for 1m 15s")).toBeInTheDocument();
  });

  it("keeps the working timer live while a native Agent call is still running", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-01T12:02:00.000Z"));
    const thread = {
      ...makeThread(),
      status: "idle" as const,
      activeTurnStartedAt: undefined,
      lastTurnStartedAt: "2026-05-01T12:00:00.000Z",
      lastTurnEndedAt: "2026-05-01T12:01:15.000Z",
    };
    useAppStore.getState().applyRuntimeEvent(thread.id, {
      type: "item.started",
      threadId: thread.id,
      itemId: "agent-1",
      itemType: "tool_call",
      payload: {
        name: "Agent",
        status: "running",
        args: { subagent_type: "Explore" },
      },
    });

    renderChatPane(thread);

    expect(screen.getByText("Working for 2m 00s")).toBeInTheDocument();
    expect(screen.queryByText("Worked for 1m 15s")).not.toBeInTheDocument();
  });

  it("suppresses the anchored completed turn while background work keeps the timer live", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-01T12:02:00.000Z"));
    const thread = {
      ...makeThread(),
      status: "idle" as const,
      activeTurnStartedAt: undefined,
      lastTurnStartedAt: "2026-05-01T12:00:00.000Z",
      lastTurnEndedAt: "2026-05-01T12:01:15.000Z",
    };
    seedAssistantMessage(thread.id, "Inspect output");
    useAppStore.getState().hydrateThreadCompletedTurns(thread.id, [
      {
        startedAt: new Date("2026-05-01T12:00:00.000Z").getTime(),
        endedAt: new Date("2026-05-01T12:01:15.000Z").getTime(),
        anchorItemId: ASSISTANT_ITEM_ID,
      },
    ]);
    useAppStore.getState().applyRuntimeEvent(thread.id, {
      type: "item.started",
      threadId: thread.id,
      itemId: "agent-1",
      itemType: "tool_call",
      payload: {
        name: "Agent",
        status: "running",
        args: { subagent_type: "Explore" },
      },
    });

    renderChatPane(thread);

    expect(screen.getByText("Working for 2m 00s")).toBeInTheDocument();
    expect(screen.queryByText("Worked for 1m 15s")).not.toBeInTheDocument();
  });

  it("renders anchored completed turn duration inside a chat surface", () => {
    const thread = makeThread();
    seedAssistantMessage(thread.id, "Inspect output");
    useAppStore.getState().hydrateThreadCompletedTurns(thread.id, [
      {
        startedAt: new Date("2026-05-01T12:00:00.000Z").getTime(),
        endedAt: new Date("2026-05-01T12:01:15.000Z").getTime(),
        anchorItemId: ASSISTANT_ITEM_ID,
      },
    ]);

    renderChatPane(thread);

    const label = screen.getByText("Worked for 1m 15s");
    expect(label.closest(".surface")).not.toBeNull();
  });

  it("renders a completed turn whose stored anchor is an unrendered goal item", () => {
    const thread = {
      ...makeThread(),
      status: "idle" as const,
      activeTurnStartedAt: undefined,
      lastTurnStartedAt: "2026-05-01T12:00:00.000Z",
      lastTurnEndedAt: "2026-05-01T12:01:15.000Z",
    };
    seedAssistantMessage(thread.id, "Inspect output");
    completeAssistantMessage(thread.id);
    useAppStore.getState().applyRuntimeEvent(thread.id, {
      type: "item.started",
      threadId: thread.id,
      itemId: "goal-1",
      itemType: "goal",
      payload: { entries: [{ id: "1", title: "Ship it", status: "completed" }] },
    });
    useAppStore.getState().hydrateThreadCompletedTurns(thread.id, [
      {
        startedAt: new Date("2026-05-01T12:00:00.000Z").getTime(),
        endedAt: new Date("2026-05-01T12:01:15.000Z").getTime(),
        anchorItemId: "goal-1",
      },
    ]);

    renderChatPane(thread);

    expect(screen.getAllByText("Worked for 1m 15s")).toHaveLength(1);
  });

  it("keeps a completed turn anchored before an optimistic follow-up prompt", async () => {
    const thread = {
      ...makeThread(),
      status: "idle" as const,
      activeTurnStartedAt: undefined,
      lastTurnStartedAt: "2026-05-01T12:00:00.000Z",
      lastTurnEndedAt: "2026-05-01T12:01:15.000Z",
    };
    seedAssistantMessage(thread.id, "Inspect output");
    useAppStore.getState().hydrateThreadCompletedTurns(thread.id, [
      {
        startedAt: new Date("2026-05-01T12:00:00.000Z").getTime(),
        endedAt: new Date("2026-05-01T12:01:15.000Z").getTime(),
        anchorItemId: ASSISTANT_ITEM_ID,
      },
    ]);

    const { container } = renderChatPane(thread);
    await waitFor(() => expect(screen.getByText("Worked for 1m 15s")).toBeInTheDocument());

    act(() => {
      seedUserMessage(thread.id, "Follow-up prompt", "user-2");
    });
    await screen.findByText("Follow-up prompt");

    expect(screen.getAllByText("Worked for 1m 15s")).toHaveLength(1);
    const text = container.textContent ?? "";
    expect(text.indexOf("Inspect output")).toBeLessThan(text.indexOf("Worked for 1m 15s"));
    expect(text.indexOf("Worked for 1m 15s")).toBeLessThan(text.indexOf("Follow-up prompt"));
  });

  it("ignores sub-second duplicate completed turns when rendering a rehydrated footer", () => {
    const thread = {
      ...makeThread(),
      status: "idle" as const,
      activeTurnStartedAt: undefined,
      lastTurnStartedAt: "2026-05-01T12:10:00.000Z",
      lastTurnEndedAt: "2026-05-01T12:10:00.700Z",
    };
    seedAssistantMessage(thread.id, "Final answer");
    useAppStore.getState().hydrateThreadCompletedTurns(thread.id, [
      {
        startedAt: new Date("2026-05-01T12:00:00.000Z").getTime(),
        endedAt: new Date("2026-05-01T12:07:50.000Z").getTime(),
        anchorItemId: ASSISTANT_ITEM_ID,
      },
      {
        startedAt: new Date("2026-05-01T12:10:00.000Z").getTime(),
        endedAt: new Date("2026-05-01T12:10:00.700Z").getTime(),
        anchorItemId: ASSISTANT_ITEM_ID,
      },
    ]);

    renderChatPane(thread);

    expect(screen.getAllByText("Worked for 7m 50s")).toHaveLength(1);
    expect(screen.queryByText("Worked for 0s")).not.toBeInTheDocument();
  });

  it("waits for a base file checkpoint before finalizing a completed turn", async () => {
    const thread = { ...makeThread(), status: "idle" as const };
    useAppStore.setState({ projects: [project] });
    seedUserMessage(thread.id, "Initial prompt", "user-1");
    seedAssistantMessage(thread.id, "First answer", "assistant-1");
    useAppStore.getState().hydrateThreadCompletedTurns(thread.id, [
      {
        startedAt: new Date("2026-05-01T12:00:00.000Z").getTime(),
        endedAt: new Date("2026-05-01T12:00:05.000Z").getTime(),
        anchorItemId: "assistant-1",
      },
    ]);

    renderChatPane(thread);
    await waitFor(() => expect(hydrateThreadRuntimeItems).toHaveBeenCalledWith(thread.id));

    expect(finalizeFileCheckpoint).not.toHaveBeenCalled();

    act(() => {
      useAppStore.getState().upsertThreadFileCheckpoint(thread.id, {
        threadId: thread.id,
        checkpointItemId: "user-1",
        ref: "refs/poracode/checkpoints/thread/user-1",
        commit: "abc123",
        capturedAt: "2026-05-01T12:00:00.000Z",
      });
    });

    await waitFor(() =>
      expect(finalizeFileCheckpoint).toHaveBeenCalledWith({
        threadId: thread.id,
        checkpointItemId: "assistant-1",
        baseCheckpointItemId: "user-1",
        projectLocation: project.location,
      }),
    );
  });

  it("shows checkpoint buttons on later user messages and reverts to before that prompt", async () => {
    const thread = {
      ...makeThread(),
      status: "idle" as const,
      config: {
        model: "gpt-5.6-terra",
        effort: "high",
        approvalPolicy: "on-request",
        sandboxMode: "workspace-write",
      },
    };
    const rollbackThreadConversation = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    Object.assign(window, {
      poracode: {
        rollbackThreadConversation,
        dbTruncateThreadRuntimeAfter: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
        dbSyncAll: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
        setWindowChrome: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
      },
    });
    seedUserMessage(thread.id, "Initial prompt", "user-1");
    seedAssistantMessage(thread.id, "First answer", "assistant-1");
    seedUserMessage(thread.id, "Follow-up prompt", "user-2");
    seedAssistantMessage(thread.id, "Second answer", "assistant-2");

    renderChatPane(thread);
    await waitFor(() => expect(hydrateThreadRuntimeItems).toHaveBeenCalledWith(thread.id));

    const buttons = screen.getAllByRole("button", { name: "Revert to this checkpoint" });
    expect(buttons).toHaveLength(1);
    expect(screen.getByText("Follow-up prompt").closest(".surface")).toContainElement(buttons[0]!);
    expect(buttons[0]!.closest(".poracode-message-action-strip")).not.toBeNull();

    fireEvent.click(buttons[0]!);
    expect(await screen.findByText("Revert to checkpoint?")).toBeInTheDocument();
    expect(
      screen.getByText(/restores files when a checkpoint snapshot is available/),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Revert" }));

    await waitFor(() =>
      expect(rollbackThreadConversation).toHaveBeenCalledWith({
        threadId: thread.id,
        numTurns: 1,
        config: thread.config,
      }),
    );
    await waitFor(() => expect(screen.queryByText("Follow-up prompt")).not.toBeInTheDocument());
    expect(screen.getByText("Initial prompt")).toBeInTheDocument();
    expect(screen.getByText("First answer")).toBeInTheDocument();
    expect(screen.queryByText("Second answer")).not.toBeInTheDocument();
  });

  it("rolls back provider by completed turns instead of assistant message count", async () => {
    const thread = { ...makeThread(), status: "idle" as const };
    const rollbackThreadConversation = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    Object.assign(window, {
      poracode: {
        rollbackThreadConversation,
        dbTruncateThreadRuntimeAfter: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
        dbSyncAll: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
        setWindowChrome: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
      },
    });
    seedUserMessage(thread.id, "Initial prompt", "user-1");
    seedAssistantMessage(thread.id, "First answer", "assistant-1");
    seedUserMessage(thread.id, "Follow-up prompt", "user-2");
    seedAssistantMessage(thread.id, "Second answer part one", "assistant-2a");
    seedAssistantMessage(thread.id, "Second answer part two", "assistant-2b");
    useAppStore.getState().hydrateThreadCompletedTurns(thread.id, [
      {
        startedAt: new Date("2026-05-01T12:00:00.000Z").getTime(),
        endedAt: new Date("2026-05-01T12:00:05.000Z").getTime(),
        anchorItemId: "assistant-1",
      },
      {
        startedAt: new Date("2026-05-01T12:01:00.000Z").getTime(),
        endedAt: new Date("2026-05-01T12:01:05.000Z").getTime(),
        anchorItemId: "assistant-2b",
      },
    ]);

    renderChatPane(thread);
    await waitFor(() => expect(hydrateThreadRuntimeItems).toHaveBeenCalledWith(thread.id));

    fireEvent.click(screen.getByRole("button", { name: "Revert to this checkpoint" }));
    fireEvent.click(await screen.findByRole("button", { name: "Revert" }));

    await waitFor(() =>
      expect(rollbackThreadConversation).toHaveBeenCalledWith({
        threadId: thread.id,
        numTurns: 1,
        config: thread.config,
      }),
    );
  });

  it("continues local checkpoint revert when provider rollback fails", async () => {
    const thread = { ...makeThread(), status: "idle" as const };
    Object.assign(window, {
      poracode: {
        rollbackThreadConversation: vi
          .fn<() => Promise<void>>()
          .mockRejectedValue(new Error("Codex does not support checkpoint rollback.")),
        dbTruncateThreadRuntimeAfter: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
        dbSyncAll: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
        setWindowChrome: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
      },
    });
    seedUserMessage(thread.id, "Initial prompt", "user-1");
    seedAssistantMessage(thread.id, "First answer", "assistant-1");
    seedUserMessage(thread.id, "Follow-up prompt", "user-2");
    seedAssistantMessage(thread.id, "Second answer", "assistant-2");

    renderChatPane(thread);
    await waitFor(() => expect(hydrateThreadRuntimeItems).toHaveBeenCalledWith(thread.id));

    fireEvent.click(screen.getByRole("button", { name: "Revert to this checkpoint" }));
    fireEvent.click(await screen.findByRole("button", { name: "Revert" }));

    await waitFor(() => expect(screen.queryByText("Follow-up prompt")).not.toBeInTheDocument());
    expect(
      screen.queryByText("Codex does not support checkpoint rollback."),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Second answer")).not.toBeInTheDocument();
  });

  it("warns when checkpoint file restore would affect another chat on the main tree", async () => {
    const thread = { ...makeThread(), status: "idle" as const };
    const sibling = {
      ...makeThread(),
      id: "thread-sibling",
      title: "Sibling thread",
      status: "idle" as const,
    };
    useAppStore.setState((state) => ({ ...state, threads: [thread, sibling] }));
    seedUserMessage(thread.id, "Initial prompt", "user-1");
    seedAssistantMessage(thread.id, "First answer", "assistant-1");
    seedUserMessage(thread.id, "Follow-up prompt", "user-2");

    renderChatPane(thread);
    await waitFor(() => expect(hydrateThreadRuntimeItems).toHaveBeenCalledWith(thread.id));

    fireEvent.click(screen.getAllByRole("button", { name: "Revert to this checkpoint" })[0]!);

    expect(await screen.findByText("Revert to checkpoint?")).toBeInTheDocument();
    expect(screen.queryByText("Chat only")).not.toBeInTheDocument();
    expect(screen.queryByText("Chat and files")).not.toBeInTheDocument();
    expect(screen.getByText(/No file checkpoint is stored/)).toBeInTheDocument();
    expect(screen.getByText(/Another chat uses this same tree/)).toBeInTheDocument();
  });

  it("does not expose checkpoint revert controls while the thread is working", async () => {
    const thread = makeThread();
    seedUserMessage(thread.id, "Initial prompt", "user-1");
    seedAssistantMessage(thread.id, "Streaming answer", "assistant-1");

    renderChatPane(thread);
    await waitFor(() => expect(hydrateThreadRuntimeItems).toHaveBeenCalledWith(thread.id));

    expect(
      screen.queryByRole("button", { name: "Revert to this checkpoint" }),
    ).not.toBeInTheDocument();
  });

  it("skips checkpoint confirmation after the user opts out", async () => {
    const thread = { ...makeThread(), status: "idle" as const };
    seedUserMessage(thread.id, "Initial prompt", "user-1");
    seedAssistantMessage(thread.id, "First answer", "assistant-1");
    seedUserMessage(thread.id, "Follow-up prompt", "user-2");

    renderChatPane(thread);
    await waitFor(() => expect(hydrateThreadRuntimeItems).toHaveBeenCalledWith(thread.id));

    fireEvent.click(screen.getAllByRole("button", { name: "Revert to this checkpoint" })[0]!);
    fireEvent.click(await screen.findByLabelText("Don't ask again"));
    fireEvent.click(screen.getByRole("button", { name: "Revert" }));

    await waitFor(() =>
      expect(localStorage.getItem("poracode-chat-checkpoint-revert-skip-confirm")).toBe("1"),
    );

    act(() => {
      useAppStore.getState().applyRuntimeEvent(thread.id, {
        type: "item.started",
        threadId: thread.id,
        itemId: "user-3",
        itemType: "user_message",
        payload: { content: [{ kind: "text", text: "Another prompt" }] },
      });
    });
    await screen.findByText("Another prompt");

    fireEvent.click(screen.getAllByRole("button", { name: "Revert to this checkpoint" })[0]!);

    expect(screen.queryByText("Revert to checkpoint?")).not.toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText("Another prompt")).not.toBeInTheDocument());
  });
});

function renderChatPane(thread: Thread, props: Partial<Parameters<typeof ChatPane>[0]> = {}) {
  return render(
    <AppProvider>
      <ChatPane {...chatPaneProps(thread)} {...props} />
    </AppProvider>,
  );
}

function chatPaneProps(thread: Thread): Parameters<typeof ChatPane>[0] {
  return { thread };
}

const PLAN_ITEM_ID = "plan-1";

function seedPlanItem(
  threadId: string,
  steps: Array<{ step: string; status: "pending" | "in_progress" | "completed" }>,
) {
  useAppStore.getState().applyRuntimeEvent(threadId, {
    type: "item.started",
    threadId,
    itemId: PLAN_ITEM_ID,
    itemType: "plan",
  });
  useAppStore.getState().applyRuntimeEvent(threadId, {
    type: "item.updated",
    threadId,
    itemId: PLAN_ITEM_ID,
    payload: { steps },
  });
}

const ASSISTANT_ITEM_ID = "asst-grow";

function seedAssistantMessage(threadId: string, initialText: string, itemId = ASSISTANT_ITEM_ID) {
  useAppStore.getState().applyRuntimeEvent(threadId, {
    type: "item.started",
    threadId,
    itemId,
    itemType: "assistant_message",
  });
  useAppStore.getState().applyRuntimeEvent(threadId, {
    type: "content.delta",
    threadId,
    itemId,
    stream: "assistant_text",
    delta: initialText,
  });
}

function completeAssistantMessage(threadId: string, itemId = ASSISTANT_ITEM_ID) {
  useAppStore.getState().applyRuntimeEvent(threadId, {
    type: "item.completed",
    threadId,
    itemId,
  });
}

function appendAssistantText(threadId: string, delta: string) {
  useAppStore.getState().applyRuntimeEvent(threadId, {
    type: "content.delta",
    threadId,
    itemId: ASSISTANT_ITEM_ID,
    stream: "assistant_text",
    delta,
  });
}

function seedCommandItem(threadId: string, itemId: string, command: string, output: string) {
  startCommandItem(threadId, itemId, command);
  useAppStore.getState().applyRuntimeEvent(threadId, {
    type: "content.delta",
    threadId,
    itemId,
    stream: "command_output",
    delta: output,
  });
}

function startCommandItem(threadId: string, itemId: string, command: string) {
  useAppStore.getState().applyRuntimeEvent(threadId, {
    type: "item.started",
    threadId,
    itemId,
    itemType: "command_execution",
    payload: { command },
  });
}

function seedSubAgentTool(
  threadId: string,
  args: {
    itemId: string;
    model: string;
    tokens: number;
    lastToolName: string;
    stepCount: number;
  },
) {
  useAppStore.getState().applyRuntimeEvent(threadId, {
    type: "item.started",
    threadId,
    itemId: args.itemId,
    itemType: "tool_call",
    payload: {
      name: "Task",
      status: "running",
      args: { description: "Audit project", model: args.model },
      isSubAgent: true,
      progress: {
        model: args.model,
        tokens: args.tokens,
        lastToolName: args.lastToolName,
        stepCount: args.stepCount,
      },
    },
  });
}

function seedUserMessage(threadId: string, text: string, itemId = "user-1") {
  seedUserMessageContent(threadId, [{ kind: "text", text }], itemId);
}

function seedUserMessageContent(
  threadId: string,
  content: CanonicalContentBlock[],
  itemId = "user-1",
) {
  useAppStore.getState().applyRuntimeEvent(threadId, {
    type: "item.started",
    threadId,
    itemId,
    itemType: "user_message",
    payload: { content },
  });
}

function makeThread(): Thread {
  const now = new Date().toISOString();
  return {
    id: "thread-gui",
    projectId: "project-1",
    title: "ACP thread",
    agentKind: "copilot",
    config: {
      model: "gpt-5.4",
    },
    status: "working",
    attention: "none",
    canResumeWithConfig: false,
    archived: false,
    done: false,
    starred: false,
    presentationMode: "gui",
    createdAt: now,
    updatedAt: now,
  };
}

function getScrollElement(container: HTMLElement): HTMLDivElement {
  const element = container.querySelector(".overflow-y-auto");
  if (!(element instanceof HTMLDivElement)) {
    throw new Error("missing chat scroll container");
  }
  return element;
}

function getContentElement(scrollElement: HTMLDivElement): HTMLDivElement {
  const element = scrollElement.firstElementChild;
  if (!(element instanceof HTMLDivElement)) {
    throw new Error("missing chat content wrapper");
  }
  return element;
}

function virtualRowTop(row: HTMLElement): number {
  const container = row.parentElement;
  if (!(container instanceof HTMLElement)) throw new Error("missing virtual row container");
  return Number.parseFloat(container.style.top);
}

function getUserMessageContent(container: HTMLElement): HTMLDivElement {
  const element = container.querySelector("[data-user-message-content='true']");
  if (!(element instanceof HTMLDivElement)) {
    throw new Error("missing user message content element");
  }
  return element;
}

function installElementHeightMetrics(
  element: HTMLElement,
  initial: { scrollHeight: number; clientHeight: number },
) {
  let scrollHeight = initial.scrollHeight;
  let clientHeight = initial.clientHeight;

  Object.defineProperties(element, {
    scrollHeight: {
      configurable: true,
      get: () => scrollHeight,
    },
    clientHeight: {
      configurable: true,
      get: () => clientHeight,
    },
  });

  return {
    setClientHeight: (value: number) => {
      clientHeight = value;
    },
    setScrollHeight: (value: number) => {
      scrollHeight = value;
    },
  };
}

function installScrollMetrics(
  element: HTMLDivElement,
  initial: { scrollHeight: number; clientHeight: number; scrollTop: number },
) {
  let scrollHeight = initial.scrollHeight;
  let clientHeight = initial.clientHeight;
  let scrollTop = initial.scrollTop;

  Object.defineProperties(element, {
    scrollHeight: {
      configurable: true,
      get: () => scrollHeight,
    },
    clientHeight: {
      configurable: true,
      get: () => clientHeight,
    },
    scrollTop: {
      configurable: true,
      get: () => scrollTop,
      set: (value: number) => {
        scrollTop = value;
      },
    },
  });

  return {
    getScrollTop: () => scrollTop,
    setClientHeight: (value: number) => {
      clientHeight = value;
    },
    setScrollHeight: (value: number) => {
      scrollHeight = value;
    },
    setScrollTop: (value: number) => {
      scrollTop = value;
    },
  };
}
