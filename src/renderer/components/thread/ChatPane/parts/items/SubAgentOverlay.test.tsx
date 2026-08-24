import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectLocation, ToolCallPayload } from "@/shared/contracts";
import { AppProvider } from "@/renderer/components/ui/provider";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { useAppStore } from "@/renderer/state/appStore";
import type { ChatTimelineEntry } from "../../chatPaneSelectors";
import type { RuntimeChatItem } from "@/renderer/state/slices/runtimeEventSlice";
import { SubAgentContent, SubAgentHeaderText, SubAgentOpenController } from "./SubAgentOverlay";
import { ActiveSubAgentTile } from "./ActiveSubAgentTile";
import { byTextContent } from "@/renderer/testUtils/text";

const mockBridge = {
  subagentSubscribe:
    vi.fn<(payload: { threadId: string; parentItemId: string }) => Promise<{ history: [] }>>(),
  subagentUnsubscribe:
    vi.fn<(payload: { threadId: string; parentItemId: string }) => Promise<void>>(),
};
const mockScrollToEnd = vi.hoisted(() => vi.fn<() => Promise<void>>());

type MockLegendProps = {
  data: readonly ChatTimelineEntry[];
  keyExtractor: (item: ChatTimelineEntry, index: number) => string;
  renderItem: (input: { item: ChatTimelineEntry; index: number }) => React.ReactNode;
  ListHeaderComponent?: React.ReactNode;
  ListEmptyComponent?: React.ReactNode;
  ListFooterComponent?: React.ReactNode;
  className?: string;
  contentContainerClassName?: string;
  contentContainerStyle?: React.CSSProperties;
  style?: React.CSSProperties;
  onWheelCapture?: React.WheelEventHandler<HTMLDivElement>;
  onLoad?: () => void;
};

vi.mock("@legendapp/list/react", async () => {
  const React = await import("react");
  return {
    LegendList: React.forwardRef(function MockLegendList(
      props: MockLegendProps,
      forwardedRef: React.ForwardedRef<unknown>,
    ) {
      const scrollRef = React.useRef<HTMLDivElement>(null);
      const onLoadRef = React.useRef(props.onLoad);
      React.useImperativeHandle(forwardedRef, () => ({
        getScrollableNode: () => scrollRef.current,
        getState: () => ({
          sizes: new Map(),
          listen: () => () => undefined,
        }),
        scrollToEnd: mockScrollToEnd,
      }));
      React.useLayoutEffect(() => onLoadRef.current?.(), []);
      return (
        <div
          ref={scrollRef}
          className={props.className}
          style={props.style}
          data-poracode-chat-scroller="true"
          onWheelCapture={props.onWheelCapture}
        >
          <div
            className={`legend-list-content-container ${props.contentContainerClassName ?? ""}`}
            style={props.contentContainerStyle}
          >
            {props.ListHeaderComponent}
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

vi.mock("@/renderer/bridge", () => ({
  isRemoteSession: () => false,
  readBridge: () => mockBridge,
}));

describe("SubAgentContent", () => {
  beforeEach(() => {
    mockBridge.subagentSubscribe.mockReset().mockResolvedValue({ history: [] });
    mockBridge.subagentUnsubscribe.mockReset().mockResolvedValue(undefined);
    mockScrollToEnd.mockReset().mockResolvedValue(undefined);
    useAppStore.setState({
      runtimeItemIdsByThread: {},
      runtimeItemsByIdByThread: {},
      runtimeRequestsByThread: {},
      runtimeStructuralVersionByThread: {},
      openSubAgentByThread: {},
    });
  });

  it("uses the shared compact panel chrome and content surface", async () => {
    const threadId = "thread-1";
    const parentItem = makeSubAgentItem("parent-1");

    useAppStore.setState({
      runtimeItemIdsByThread: { [threadId]: [parentItem.id] },
      runtimeItemsByIdByThread: {
        [threadId]: {
          [parentItem.id]: parentItem,
        },
      },
      runtimeStructuralVersionByThread: { [threadId]: 1 },
      openSubAgentByThread: { [threadId]: parentItem.id },
    });

    render(
      <SubAgentContent
        threadId={threadId}
        parentItemId={parentItem.id}
        onClose={() => undefined}
      />,
    );

    const dialog = await screen.findByRole("region", {
      name: "Agent (rubber-duck): Critiquing opencode fix",
    });
    expect(dialog).toHaveClass("poracode-subagent-surface", "bg-[var(--content-background)]");
    expect(within(dialog).getByText("Working…")).toBeInTheDocument();

    const heading = within(dialog).getByRole("heading", {
      name: "Agent (rubber-duck): Critiquing opencode fix",
    });
    const header = heading.parentElement?.parentElement;
    if (!(header instanceof HTMLDivElement)) {
      throw new Error("missing subagent overlay header");
    }

    expect(header).toHaveClass("px-2", "py-1", "gap-2");
    expect(header).not.toHaveClass("bg-[var(--composer-surface)]");

    const closeButton = within(dialog).getByRole("button", { name: "Close subagent" });
    expect(closeButton).toHaveClass("rounded", "p-1", "text-muted/60");

    const icons = header.querySelectorAll("svg");
    expect(icons).toHaveLength(2);
    expect(icons[0]).toHaveClass("size-3.5");
    expect(icons[1]).toHaveClass("size-3.5");
  });

  it("reuses the main chat fade, sticky-bottom controls, and live elapsed footer", async () => {
    const threadId = "thread-1";
    const parentItem: RuntimeChatItem = {
      ...makeSubAgentItem("parent-1"),
      startedAt: Date.now() - 70_000,
    };

    useAppStore.setState({
      runtimeItemIdsByThread: { [threadId]: [parentItem.id] },
      runtimeItemsByIdByThread: {
        [threadId]: {
          [parentItem.id]: parentItem,
        },
      },
      runtimeStructuralVersionByThread: { [threadId]: 1 },
    });

    const view = render(
      <SubAgentContent threadId={threadId} parentItemId={parentItem.id} hideHeader />,
    );

    expect(await screen.findByText("Working for 1m 10s")).toBeInTheDocument();
    await waitFor(() => expect(mockScrollToEnd).toHaveBeenCalled());
    const scroller = view.container.querySelector<HTMLElement>(
      '[data-poracode-chat-scroller="true"]',
    );
    expect(scroller).not.toBeNull();
    expect(scroller?.style.maskImage).toContain("var(--top-fade-size");
    const scrollButton = screen.getByRole("button", { name: "Scroll to bottom" });
    expect(scrollButton).toHaveClass("opacity-0");

    Object.defineProperties(scroller!, {
      clientHeight: { configurable: true, value: 200 },
      scrollHeight: { configurable: true, value: 1_000 },
    });
    fireEvent.wheel(scroller!, { deltaY: -10 });
    scroller!.scrollTop = 100;
    fireEvent.scroll(scroller!);

    await waitFor(() => expect(scrollButton).toHaveClass("opacity-80"));
    mockScrollToEnd.mockClear();
    fireEvent.click(scrollButton);
    await waitFor(() => expect(mockScrollToEnd).toHaveBeenCalled());
  });

  it("shows the frozen subagent duration after completion", async () => {
    const threadId = "thread-1";
    const startedAt = Date.now() - 75_000;
    const runningParent = makeSubAgentItem("parent-1");
    const parentItem: RuntimeChatItem = {
      ...runningParent,
      state: "completed",
      startedAt,
      completedAt: startedAt + 75_000,
      payload: { ...(runningParent.payload as ToolCallPayload), status: "success" },
    };

    useAppStore.setState({
      runtimeItemIdsByThread: { [threadId]: [parentItem.id] },
      runtimeItemsByIdByThread: {
        [threadId]: {
          [parentItem.id]: parentItem,
        },
      },
      runtimeStructuralVersionByThread: { [threadId]: 1 },
    });

    render(<SubAgentContent threadId={threadId} parentItemId={parentItem.id} hideHeader />);

    expect(await screen.findByText("Worked for 1m 15s")).toBeInTheDocument();
  });

  it("splits a Crossagent name and model selection into a two-line route header", () => {
    const threadId = "thread-1";
    const parentItem: RuntimeChatItem = {
      id: "parent-1",
      type: "tool_call",
      state: "started",
      payload: {
        name: "dev-spa-rework — Codex · 5.6 Sol · High · Fast",
        status: "running",
        isCrossagent: true,
      } satisfies ToolCallPayload,
      streams: {},
    };
    useAppStore.setState({
      runtimeItemIdsByThread: { [threadId]: [parentItem.id] },
      runtimeItemsByIdByThread: { [threadId]: { [parentItem.id]: parentItem } },
      runtimeStructuralVersionByThread: { [threadId]: 1 },
    });

    render(<SubAgentHeaderText threadId={threadId} parentItemId={parentItem.id} />);

    expect(screen.getByText("Crossagent: dev-spa-rework")).toHaveClass("text-sm");
    expect(screen.getByText("Codex · 5.6 Sol · High · Fast")).toHaveClass(
      "text-[0.6875rem]",
      "text-foreground-muted",
    );
  });

  it("can omit its internal header when the routed shell owns the title", async () => {
    const threadId = "thread-1";
    const parentItem = makeSubAgentItem("parent-1");
    useAppStore.setState({
      runtimeItemIdsByThread: { [threadId]: [parentItem.id] },
      runtimeItemsByIdByThread: { [threadId]: { [parentItem.id]: parentItem } },
      runtimeStructuralVersionByThread: { [threadId]: 1 },
    });

    render(<SubAgentContent threadId={threadId} parentItemId={parentItem.id} hideHeader />);

    const region = await screen.findByRole("region", {
      name: "Agent (rubber-duck): Critiquing opencode fix",
    });
    expect(within(region).queryByRole("heading")).not.toBeInTheDocument();
    expect(within(region).getByText("Working…")).toBeInTheDocument();
  });

  it("renders a clean composer row without a loader or duplicate agent description", () => {
    const threadId = "thread-1";
    const parentItem: RuntimeChatItem = {
      id: "parent-1",
      type: "tool_call",
      state: "started",
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
      } satisfies ToolCallPayload,
      streams: {},
    };

    useAppStore.setState({
      runtimeItemIdsByThread: { [threadId]: [parentItem.id] },
      runtimeItemsByIdByThread: { [threadId]: { [parentItem.id]: parentItem } },
      runtimeStructuralVersionByThread: { [threadId]: 1 },
    });

    const view = render(
      <AppProvider>
        <ActiveSubAgentTile threadId={threadId} />
      </AppProvider>,
    );

    const row = view.container.querySelector(".poracode-subagent-dock-row");
    expect(row).not.toBeNull();
    expect(
      row?.querySelector('[data-poracode-shimmer-text="Agent · protocol specialist"]'),
    ).toBeNull();
    expect(view.container).toHaveTextContent("Subagents");
    expect(screen.getByText("protocol specialist")).toBeInTheDocument();
    expect(row?.textContent).not.toContain("specialist·GPT");
    expect(row?.querySelector(".poracode-pixel-loader")).toBeNull();
  });

  it("renders Subagents and Crossagents in separate dock sections", () => {
    const threadId = "thread-1";
    const subagent = makeSubAgentItem("subagent-1");
    const crossagent: RuntimeChatItem = {
      id: "crossagent-1",
      type: "tool_call",
      state: "started",
      payload: {
        name: "Codex · GPT-5.5",
        status: "running",
        isCrossagent: true,
      } satisfies ToolCallPayload,
      streams: {},
    };

    useAppStore.setState({
      runtimeItemIdsByThread: { [threadId]: [subagent.id, crossagent.id] },
      runtimeItemsByIdByThread: {
        [threadId]: { [subagent.id]: subagent, [crossagent.id]: crossagent },
      },
      runtimeStructuralVersionByThread: { [threadId]: 1 },
    });

    render(
      <AppProvider>
        <ActiveSubAgentTile threadId={threadId} />
      </AppProvider>,
    );

    expect(screen.getByText("Subagents")).toBeInTheDocument();
    expect(screen.getByText("Crossagents")).toBeInTheDocument();
    expect(screen.queryByText("Background tasks")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Close subagents panel" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Close Crossagents panel" })).toBeInTheDocument();
    // Rows sit under the kind header, so they keep the bare label.
    expect(screen.getByText("Codex · GPT-5.5")).toBeInTheDocument();
    expect(screen.queryByText(/^Crossagent:/)).not.toBeInTheDocument();
  });

  it("renders child messages through the main timeline parser", async () => {
    const threadId = "thread-1";
    const parentItem = makeSubAgentItem("parent-1");
    const prompt = makeChildItem("prompt-1", parentItem.id, "user_message", {
      content: [{ kind: "text", text: "Inspect the renderer." }],
    });
    const commandOne = makeChildItem("command-1", parentItem.id, "command_execution", {
      command: "pnpm run typecheck",
    });
    const hiddenPlan = makeChildItem("plan-1", parentItem.id, "plan", undefined, {
      plan_text: "internal plan",
    });
    const commandTwo = makeChildItem("command-2", parentItem.id, "command_execution", {
      command: "pnpm run lint",
    });
    const assistant = makeChildItem("assistant-1", parentItem.id, "assistant_message", undefined, {
      assistant_text: "## Child result\n\n- parsed markdown",
    });

    useAppStore.setState({
      runtimeItemIdsByThread: {
        [threadId]: [
          parentItem.id,
          prompt.id,
          commandOne.id,
          hiddenPlan.id,
          commandTwo.id,
          assistant.id,
        ],
      },
      runtimeItemsByIdByThread: {
        [threadId]: {
          [parentItem.id]: parentItem,
          [prompt.id]: prompt,
          [commandOne.id]: commandOne,
          [hiddenPlan.id]: hiddenPlan,
          [commandTwo.id]: commandTwo,
          [assistant.id]: assistant,
        },
      },
      runtimeStructuralVersionByThread: { [threadId]: 1 },
      openSubAgentByThread: { [threadId]: parentItem.id },
    });

    render(
      <AppProvider>
        <SubAgentContent threadId={threadId} parentItemId={parentItem.id} />
      </AppProvider>,
    );

    const dialog = await screen.findByRole("region");
    expect(within(dialog).getByText("Inspect the renderer.")).toBeInTheDocument();
    expect(within(dialog).getByText(byTextContent("2 commands"))).toBeInTheDocument();
    expect(
      await within(dialog).findByRole("heading", { name: "Child result" }, { timeout: 5_000 }),
    ).toBeInTheDocument();
    expect(within(dialog).getByRole("listitem")).toHaveTextContent("parsed markdown");
    expect(within(dialog).queryByText("internal plan")).not.toBeInTheDocument();
  });

  it("does not present the final child tool group as live after the subagent completes", async () => {
    const threadId = "thread-1";
    const runningParent = makeSubAgentItem("parent-1");
    const parentItem: RuntimeChatItem = {
      ...runningParent,
      state: "completed",
      payload: { ...(runningParent.payload as ToolCallPayload), status: "success" },
    };
    const commandOne = makeChildItem("command-1", parentItem.id, "command_execution", {
      command: "pnpm run typecheck",
    });
    const commandTwo = makeChildItem("command-2", parentItem.id, "command_execution", {
      command: "pnpm run lint",
    });

    useAppStore.setState({
      runtimeItemIdsByThread: {
        [threadId]: [parentItem.id, commandOne.id, commandTwo.id],
      },
      runtimeItemsByIdByThread: {
        [threadId]: {
          [parentItem.id]: parentItem,
          [commandOne.id]: commandOne,
          [commandTwo.id]: commandTwo,
        },
      },
      runtimeStructuralVersionByThread: { [threadId]: 1 },
      openSubAgentByThread: { [threadId]: parentItem.id },
    });

    render(
      <AppProvider>
        <SubAgentContent threadId={threadId} parentItemId={parentItem.id} />
      </AppProvider>,
    );

    const dialog = await screen.findByRole("region");
    expect(within(dialog).getByText(byTextContent("2 commands")).closest("button")).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  it("shows an explicit terminal status for a cancelled Crossagent", async () => {
    const threadId = "thread-1";
    const runningParent = makeSubAgentItem("parent-1");
    const parentItem: RuntimeChatItem = {
      ...runningParent,
      state: "completed",
      payload: {
        ...(runningParent.payload as ToolCallPayload),
        status: "error",
        isCrossagent: true,
        crossagentStatus: "cancelled",
      },
    };

    useAppStore.setState({
      runtimeItemIdsByThread: { [threadId]: [parentItem.id] },
      runtimeItemsByIdByThread: { [threadId]: { [parentItem.id]: parentItem } },
      runtimeStructuralVersionByThread: { [threadId]: 1 },
    });

    render(<SubAgentContent threadId={threadId} parentItemId={parentItem.id} />);

    expect(await screen.findByText("Cancelled")).toBeInTheDocument();
  });

  it("derives the terminal status for persisted Crossagents without the new status field", async () => {
    const threadId = "thread-1";
    const runningParent = makeSubAgentItem("parent-1");
    const parentItem: RuntimeChatItem = {
      ...runningParent,
      state: "completed",
      payload: {
        ...(runningParent.payload as ToolCallPayload),
        status: "success",
        isCrossagent: true,
      },
    };

    useAppStore.setState({
      runtimeItemIdsByThread: { [threadId]: [parentItem.id] },
      runtimeItemsByIdByThread: { [threadId]: { [parentItem.id]: parentItem } },
      runtimeStructuralVersionByThread: { [threadId]: 1 },
    });

    render(<SubAgentContent threadId={threadId} parentItemId={parentItem.id} />);

    expect(await screen.findByText("Completed")).toBeInTheDocument();
  });

  it("hands an open target to its host and consumes the transient store signal", async () => {
    const threadId = "thread-1";
    const parentItem = makeSubAgentItem("parent-1");
    const onOpen = vi.fn<(parentItemId: string, projectLocation?: ProjectLocation) => void>();
    useAppStore.setState({
      openSubAgentByThread: { [threadId]: parentItem.id },
    });

    render(
      <SubAgentOpenController
        threadId={threadId}
        projectLocation={{ kind: "posix", path: "/repo" }}
        onOpen={onOpen}
      />,
    );

    await waitFor(() => {
      expect(onOpen).toHaveBeenCalledWith(parentItem.id, { kind: "posix", path: "/repo" });
    });
    expect(useAppStore.getState().openSubAgentByThread[threadId]).toBeNull();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("still applies legacy-host subscribe history after the overlay unmounts", async () => {
    const threadId = "thread-1";
    const parentItem = makeSubAgentItem("parent-1");
    let resolveSubscribe: ((value: { history: unknown[] }) => void) | undefined;
    mockBridge.subagentSubscribe.mockReset().mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSubscribe = resolve as (value: { history: unknown[] }) => void;
        }),
    );

    useAppStore.setState({
      runtimeItemIdsByThread: { [threadId]: [parentItem.id] },
      runtimeItemsByIdByThread: { [threadId]: { [parentItem.id]: parentItem } },
      runtimeStructuralVersionByThread: { [threadId]: 1 },
    });

    const view = render(
      <SubAgentContent threadId={threadId} parentItemId={parentItem.id} hideHeader />,
    );

    await waitFor(() => expect(mockBridge.subagentSubscribe).toHaveBeenCalled());
    view.unmount();

    resolveSubscribe?.({
      history: [
        {
          type: "item.started",
          threadId,
          itemId: "child-late",
          itemType: "assistant_message",
          parentItemId: parentItem.id,
        },
        {
          type: "content.delta",
          threadId,
          itemId: "child-late",
          stream: "assistant_text",
          delta: "preserved after unmount",
        },
      ],
    });

    await waitFor(() => {
      const child = useAppStore.getState().runtimeItemsByIdByThread[threadId]?.["child-late"];
      expect(child).toBeDefined();
      expect(child?.streams.assistant_text).toBe("preserved after unmount");
      expect(child?.parentItemId).toBe(parentItem.id);
    });
  });
});

function makeSubAgentItem(id: string): RuntimeChatItem {
  const payload: ToolCallPayload = {
    name: "Task",
    status: "running",
    args: {
      description: "Critiquing opencode fix",
      subagent_type: "rubber-duck",
    },
  };

  return {
    id,
    type: "tool_call",
    state: "started",
    payload,
    streams: {},
  };
}

function makeChildItem(
  id: string,
  parentItemId: string,
  type: RuntimeChatItem["type"],
  payload?: unknown,
  streams: RuntimeChatItem["streams"] = {},
): RuntimeChatItem {
  return {
    id,
    parentItemId,
    type,
    state: "completed",
    ...(payload !== undefined ? { payload } : {}),
    streams,
  };
}
