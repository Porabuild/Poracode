import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { CanonicalContentBlock, Project, Thread } from "@/shared/contracts";
import { AppProvider } from "@/renderer/components/ui/provider";
import { useAppStore } from "@/renderer/state/appStore";
import { ChatPane } from "./ChatPane";

const { hydrateThreadRuntimeItems } = vi.hoisted(() => ({
  hydrateThreadRuntimeItems: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
}));
const { hydrateFileCheckpoints, finalizeFileCheckpoint } = vi.hoisted(() => ({
  hydrateFileCheckpoints: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  finalizeFileCheckpoint: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
}));
const { virtualizerScrollToIndex } = vi.hoisted(() => ({
  virtualizerScrollToIndex:
    vi.fn<(index: number, options?: { align?: "auto" | "center" | "end" | "start" }) => void>(),
}));

vi.mock("@/renderer/state/chatRuntimePersister", () => ({
  hydrateThreadRuntimeItems,
}));

vi.mock("@/renderer/state/fileCheckpointActions", () => ({
  hydrateFileCheckpoints,
  finalizeFileCheckpoint,
}));

vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: (options: {
    count: number;
    getScrollElement?: () => Element | null;
    getItemKey?: (index: number) => string | number;
  }) => ({
    getVirtualItems: () =>
      Array.from({ length: options.count }, (_, index) => ({
        key: options.getItemKey?.(index) ?? index,
        index,
        start: index * 96,
      })),
    getTotalSize: () => options.count * 96,
    measure: vi.fn<() => void>(),
    measureElement: vi.fn<(element: HTMLDivElement | null) => void>(),
    scrollToIndex: (
      index: number,
      scrollOptions?: { align?: "auto" | "center" | "end" | "start" },
    ) => {
      virtualizerScrollToIndex(index, scrollOptions);
      const element = options.getScrollElement?.();
      if (element instanceof HTMLElement) {
        element.scrollTop = element.scrollHeight;
      }
    },
  }),
}));

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
    vi.useRealTimers();
    MockResizeObserver.reset();
    localStorage.clear();
    Reflect.deleteProperty(window, "lightcode");
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
    }));
  });

  it("keeps the chat pinned when the last assistant message grows without changing the scroll anchor", async () => {
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
      appendAssistantText(thread.id, " — Open logs");
    });

    await screen.findByText(/Open logs/);

    act(() => {
      metrics.setScrollHeight(300);
      MockResizeObserver.notify(contentElement);
    });

    await waitFor(() => expect(metrics.getScrollTop()).toBe(300));
  });

  it("reconciles the virtualizer when sticky content growth pins to the bottom", async () => {
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
    virtualizerScrollToIndex.mockClear();

    act(() => {
      metrics.setScrollHeight(300);
      MockResizeObserver.notify(contentElement);
    });

    expect(virtualizerScrollToIndex).toHaveBeenCalledWith(0, { align: "end" });
    expect(metrics.getScrollTop()).toBe(300);
  });

  it("disables native browser scroll anchoring on the managed chat scroller", async () => {
    const thread = makeThread();
    seedAssistantMessage(thread.id, "Inspect output");

    const { container } = renderChatPane(thread);
    await waitFor(() => expect(hydrateThreadRuntimeItems).toHaveBeenCalledWith(thread.id));

    expect(getScrollElement(container).className).toContain("[overflow-anchor:none]");
  });

  it("re-pins in the same resize frame when bottom-pinned content collapses", async () => {
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

    const trigger = screen.getByText("Check: npm run test").closest("button");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText(/command output/)).not.toBeInTheDocument();

    fireEvent.click(trigger!);

    expect(trigger).toHaveAttribute("aria-expanded", "true");
    await screen.findByText(/command output/);
  });

  it("shows the requested command in expanded command accordions", async () => {
    const thread = makeThread();
    const command = String.raw`cd C:\Users\sdsle\work\lightcode && "C:\Program Files\WindowsApps\Microsoft.PowerShell_7.6.1.0_x64__8wekyb3d8bbwe\pwsh.exe" -Command 'git status --short'`;
    seedCommandItem(thread.id, "cmd-1", command, "status output");

    renderChatPane(thread);
    await waitFor(() => expect(hydrateThreadRuntimeItems).toHaveBeenCalledWith(thread.id));

    fireEvent.click(screen.getByText("Git: git status --short").closest("button")!);

    expect(document.body).toHaveTextContent("$ git status --short");
    expect(document.body).not.toHaveTextContent("WindowsApps");
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

    const trigger = screen.getByText("Check: npm run test").closest("button");
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

    const trigger = screen.getByText(/^2 commands$/).closest("button");
    expect(trigger).toHaveAttribute("aria-expanded", "true");

    fireEvent.click(trigger!);

    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("collapses the tool-call group automatically once a non-group item arrives after it", async () => {
    const thread = makeThread();
    seedCommandItem(thread.id, "cmd-1", "echo one", "one");
    seedCommandItem(thread.id, "cmd-2", "echo two", "two");

    renderChatPane(thread);
    await waitFor(() => expect(hydrateThreadRuntimeItems).toHaveBeenCalledWith(thread.id));

    const trigger = screen.getByText(/^2 commands$/).closest("button");
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

  it("shows checkpoint buttons on later user messages and reverts to before that prompt", async () => {
    const thread = { ...makeThread(), status: "idle" as const };
    seedUserMessage(thread.id, "Initial prompt", "user-1");
    seedAssistantMessage(thread.id, "First answer", "assistant-1");
    seedUserMessage(thread.id, "Follow-up prompt", "user-2");
    seedAssistantMessage(thread.id, "Second answer", "assistant-2");

    renderChatPane(thread);
    await waitFor(() => expect(hydrateThreadRuntimeItems).toHaveBeenCalledWith(thread.id));

    const buttons = screen.getAllByRole("button", { name: "Revert to this checkpoint" });
    expect(buttons).toHaveLength(1);
    expect(screen.getByText("Follow-up prompt").closest(".surface")).toContainElement(buttons[0]!);

    fireEvent.click(buttons[0]!);
    expect(await screen.findByText("Revert to checkpoint?")).toBeInTheDocument();
    expect(screen.getByText(/Workspace files are not changed/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Revert" }));

    await waitFor(() => expect(screen.queryByText("Follow-up prompt")).not.toBeInTheDocument());
    expect(screen.getByText("Initial prompt")).toBeInTheDocument();
    expect(screen.getByText("First answer")).toBeInTheDocument();
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

    expect(await screen.findByText("Chat only")).toBeInTheDocument();
    expect(screen.getByText("Chat and files")).toBeInTheDocument();
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
      expect(localStorage.getItem("lightcode-chat-checkpoint-revert-skip-confirm")).toBe("1"),
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
