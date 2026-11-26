import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Thread, ProjectLocation, ToolCallPayload } from "@/shared/contracts";
import { AppProvider } from "@/renderer/components/ui/provider";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { DeferredItemMarkdownInner } from "@/renderer/deferredFeatures";
import { PanelContentDeferredContext } from "@/renderer/components/layout/panelMotion";
import { useAppStore } from "@/renderer/state/appStore";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import type { RemoteImageReadiness } from "@/renderer/state/remoteServers/environmentSessions";
import { remoteImageRef } from "@/shared/remote";
import type { SubAgentSubscribePayload, SubAgentSubscribeResult } from "@/shared/ipc";
import { toLocalFileUrl } from "@/shared/promptContent";
import { MCP_APP_HOST_META_KEY } from "@/shared/contracts/mcpApps";
import { MCP_APP_MIME_TYPE } from "@/shared/mcpAppResources";
import type { ChatTimelineEntry } from "../../chatPaneSelectors";
import type { RuntimeChatItem } from "@/renderer/state/slices/runtimeEventSlice";
import { SubAgentContent, SubAgentHeaderText, SubAgentOpenController } from "./SubAgentOverlay";
import { ActiveSubAgentTile } from "./ActiveSubAgentTile";
import { byTextContent } from "@/renderer/testUtils/text";

const mockBridge = {
  subagentSubscribe:
    vi.fn<(payload: SubAgentSubscribePayload) => Promise<SubAgentSubscribeResult>>(),
  subagentUnsubscribe: vi.fn<(payload: SubAgentSubscribePayload) => Promise<void>>(),
};
const mockScrollToEnd = vi.hoisted(() => vi.fn<() => Promise<void>>());
const mockMcpAppCard = vi.hoisted(() => vi.fn<() => null>(() => null));

vi.mock("./McpAppCard", () => ({ McpAppCard: mockMcpAppCard }));

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
  it("keeps the child subscription while hidden and catches up its retained transcript on reveal", async () => {
    await DeferredItemMarkdownInner.preload();
    const threadId = "retained-child";
    const parent = makeSubAgentItem("retained-parent");
    useAppStore.getState().hydrateThreadRuntimeItems(threadId, [
      parent,
      {
        id: "reply",
        parentItemId: parent.id,
        type: "assistant_message",
        state: "started",
        payload: { role: "assistant", content: [] },
        streams: { assistant_text: "Visible child response." },
      },
    ]);
    const view = render(
      <SubAgentContent
        threadId={threadId}
        parentItemId={parent.id}
        visible
        initialScrollRevealDelayMs={0}
      />,
    );
    await screen.findByText("Visible child response.");
    view.rerender(
      <SubAgentContent
        threadId={threadId}
        parentItemId={parent.id}
        visible={false}
        initialScrollRevealDelayMs={0}
      />,
    );
    await waitFor(() => expect(screen.getByText("Visible child response.")).not.toBeVisible());
    expect(mockBridge.subagentUnsubscribe).not.toHaveBeenCalled();
    act(() =>
      useAppStore.getState().applyRuntimeEvent(threadId, {
        type: "content.delta",
        threadId,
        itemId: "reply",
        stream: "assistant_text",
        delta: " Arrived while hidden.",
      }),
    );
    expect(screen.queryByText(/Arrived while hidden/)).toBeNull();
    view.rerender(
      <SubAgentContent
        threadId={threadId}
        parentItemId={parent.id}
        visible
        initialScrollRevealDelayMs={0}
      />,
    );
    await screen.findByText(/Arrived while hidden/);
    expect(mockBridge.subagentSubscribe).toHaveBeenCalledTimes(1);
    view.unmount();
    expect(mockBridge.subagentUnsubscribe).toHaveBeenCalledTimes(1);
  });

  beforeEach(() => {
    mockMcpAppCard.mockClear();
    mockBridge.subagentSubscribe.mockReset().mockResolvedValue({ history: [] });
    mockBridge.subagentUnsubscribe.mockReset().mockResolvedValue(undefined);
    mockScrollToEnd.mockReset().mockResolvedValue(undefined);
    useAppStore.setState({
      runtimeItemIdsByThread: {},
      runtimeItemsByIdByThread: {},
      runtimeRequestsByThread: {},
      runtimeStructuralVersionByThread: {},
      runtimeHydrationStatus: {},
      openSubAgentByThread: {},
    });
  });

  it("uses the shared compact panel chrome and content surface", async () => {
    // This case checks panel chrome once its real deferred renderer is ready.
    // The controlled history/Markdown gates below cover loading independently.
    await DeferredItemMarkdownInner.preload();
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
    expect(await within(dialog).findByText("Working…")).toBeInTheDocument();

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
    expect(screen.queryByRole("button", { name: "Scroll to bottom" })).toBeNull();
    const scrollButton = view.container.querySelector('button[aria-label="Scroll to bottom"]');
    expect(scrollButton).toHaveClass("opacity-0");
    expect(scrollButton).toBeDisabled();

    Object.defineProperties(scroller!, {
      clientHeight: { configurable: true, value: 200 },
      scrollHeight: { configurable: true, value: 1_000 },
    });
    fireEvent.wheel(scroller!, { deltaY: -10 });
    scroller!.scrollTop = 100;
    fireEvent.scroll(scroller!);

    await waitFor(() => expect(scrollButton).toHaveClass("opacity-100"));
    mockScrollToEnd.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Scroll to bottom" }));
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

  it.each([undefined, "dev-spa-rework"])(
    "splits a Crossagent name and model selection into a two-line route header (title: %s)",
    (title) => {
      const threadId = "thread-1";
      const parentItem: RuntimeChatItem = {
        id: "parent-1",
        type: "tool_call",
        state: "started",
        payload: {
          name: "dev-spa-rework — Codex · 5.6 Sol · High · Fast",
          ...(title ? { title } : {}),
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
    },
  );

  it("keeps a localized default header until the parent arrives", () => {
    render(<SubAgentHeaderText threadId="missing-thread" parentItemId="missing-parent" />);

    expect(screen.getByText("Subagent")).toBeInTheDocument();
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
    expect(await within(region).findByText("Working…")).toBeInTheDocument();
  });

  it("renders a clean composer row with a loader and no duplicate agent description", () => {
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
    expect(row?.querySelector(".poracode-pixel-loader")).not.toBeNull();
    expect(row).toHaveClass("bg-accent/10");
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

  it.each([undefined, "Review CEO deck"])(
    "splits a Crossagents row into name and muted route meta in the right panel (title: %s)",
    (title) => {
      const threadId = "thread-1";
      const crossagent: RuntimeChatItem = {
        id: "crossagent-1",
        type: "tool_call",
        state: "started",
        payload: {
          name: "Review CEO deck — Codex · GPT-5.5 · High",
          ...(title ? { title } : {}),
          status: "running",
          isCrossagent: true,
          progress: { stepCount: 50 },
        } satisfies ToolCallPayload,
        streams: {},
      };
      useAppStore.setState({
        runtimeItemIdsByThread: { [threadId]: [crossagent.id] },
        runtimeItemsByIdByThread: { [threadId]: { [crossagent.id]: crossagent } },
        runtimeStructuralVersionByThread: { [threadId]: 1 },
      });

      render(
        <AppProvider>
          <ActiveSubAgentTile threadId={threadId} placement="right" />
        </AppProvider>,
      );

      const primary = screen.getByText("Review CEO deck");
      const meta = screen.getByText("Codex · GPT-5.5 · High · 50 steps");
      expect(meta).toHaveClass("text-[0.6875rem]", "text-muted");
      // The name and the meta stack in one column, not one truncated line.
      expect(primary.parentElement).toBe(meta.parentElement);
      expect(primary.parentElement).toHaveClass("flex-col");
      expect(screen.queryByText(/^Review CEO deck —/)).not.toBeInTheDocument();
    },
  );

  it("shows subagent type and model as the second line in the right panel", () => {
    const threadId = "thread-1";
    const parentItem: RuntimeChatItem = {
      id: "parent-1",
      type: "tool_call",
      state: "started",
      payload: {
        name: "spawnAgent",
        status: "running",
        isSubAgent: true,
        args: { description: "protocol specialist", subagent_type: "Explore" },
        progress: { model: "gpt-5.6-sol", effort: "ultra", stepCount: 5 },
      } satisfies ToolCallPayload,
      streams: {},
    };
    useAppStore.setState({
      runtimeItemIdsByThread: { [threadId]: [parentItem.id] },
      runtimeItemsByIdByThread: { [threadId]: { [parentItem.id]: parentItem } },
      runtimeStructuralVersionByThread: { [threadId]: 1 },
    });

    render(
      <AppProvider>
        <ActiveSubAgentTile threadId={threadId} placement="right" />
      </AppProvider>,
    );

    expect(screen.getByText("protocol specialist")).toBeInTheDocument();
    expect(screen.getByText("Explore · GPT 5.6 Sol · Ultra · 5 steps")).toHaveClass(
      "text-[0.6875rem]",
      "text-muted",
    );
  });

  it("keeps Crossagents rows on one line in the composer", () => {
    const threadId = "thread-1";
    const crossagent: RuntimeChatItem = {
      id: "crossagent-1",
      type: "tool_call",
      state: "started",
      payload: {
        name: "Review CEO deck — Codex · GPT-5.5 · High",
        status: "running",
        isCrossagent: true,
        progress: { stepCount: 50 },
      } satisfies ToolCallPayload,
      streams: {},
    };
    useAppStore.setState({
      runtimeItemIdsByThread: { [threadId]: [crossagent.id] },
      runtimeItemsByIdByThread: { [threadId]: { [crossagent.id]: crossagent } },
      runtimeStructuralVersionByThread: { [threadId]: 1 },
    });

    render(
      <AppProvider>
        <ActiveSubAgentTile threadId={threadId} placement="composer" />
      </AppProvider>,
    );

    expect(screen.getByText("Review CEO deck — Codex · GPT-5.5 · High")).toBeInTheDocument();
    expect(screen.queryByText("Codex · GPT-5.5 · High · 50 steps")).not.toBeInTheDocument();
  });

  it("prefixes a role run in the composer placement", () => {
    const threadId = "thread-crew";
    const crewBinding = {
      version: 1 as const,
      policy: "crew-only" as const,
      roles: [
        {
          id: "builder",
          label: "Builder",
          selection: { agentKind: "codex", model: "gpt-5.5" },
        },
      ],
    };
    const run: RuntimeChatItem = {
      id: "crossagent-builder",
      type: "tool_call",
      state: "started",
      payload: {
        name: "Codex · GPT-5.5",
        title: "Review CEO deck",
        status: "running",
        isCrossagent: true,
        subAgentType: "Builder",
      } satisfies ToolCallPayload,
      streams: {},
    };
    useAppStore.setState({
      runtimeItemIdsByThread: { [threadId]: [run.id] },
      runtimeItemsByIdByThread: { [threadId]: { [run.id]: run } },
      runtimeStructuralVersionByThread: { [threadId]: 1 },
    });
    render(
      <AppProvider>
        <ActiveSubAgentTile threadId={threadId} placement="composer" crewBinding={crewBinding} />
      </AppProvider>,
    );
    expect(screen.getByText("Builder: Review CEO deck")).toBeInTheDocument();
  });

  it("shows only the task title for a matched crew run in the right panel", () => {
    const threadId = "thread-crew";
    const crewBinding = {
      version: 1 as const,
      policy: "crew-only" as const,
      roles: [
        {
          id: "builder",
          label: "Builder",
          selection: { agentKind: "codex", model: "gpt-5.5" },
        },
      ],
    };
    const run: RuntimeChatItem = {
      id: "crossagent-builder",
      type: "tool_call",
      state: "started",
      payload: {
        name: "Codex · GPT-5.5 · High",
        progress: { stepCount: 39 },
        title: "Review CEO deck",
        status: "running",
        isCrossagent: true,
        subAgentType: "Builder",
      } satisfies ToolCallPayload,
      streams: {},
    };
    useAppStore.setState({
      runtimeItemIdsByThread: { [threadId]: [run.id] },
      runtimeItemsByIdByThread: { [threadId]: { [run.id]: run } },
      runtimeStructuralVersionByThread: { [threadId]: 1 },
    });
    render(
      <AppProvider>
        <ActiveSubAgentTile
          threadId={threadId}
          placement="right"
          crewBinding={crewBinding}
          thread={
            {
              id: threadId,
              agentKind: "codex",
              config: { model: "gpt-5.5", crew: crewBinding },
            } as Thread
          }
        />
      </AppProvider>,
    );
    expect(screen.getByText("Review CEO deck")).toBeInTheDocument();
    expect(screen.queryByText(/39 steps/)).not.toBeInTheDocument();
    expect(screen.queryByText("Codex · GPT-5.5 · High")).not.toBeInTheDocument();
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
    expect(await within(dialog).findByText("Inspect the renderer.")).toBeInTheDocument();
    expect(within(dialog).getByText(byTextContent("2 commands"))).toBeInTheDocument();
    expect(
      await within(dialog).findByRole("heading", { name: "Child result" }, { timeout: 5_000 }),
    ).toBeInTheDocument();
    expect(within(dialog).getByRole("listitem")).toHaveTextContent("parsed markdown");
    expect(within(dialog).queryByText("internal plan")).not.toBeInTheDocument();
  });

  it.each(["Subagent", "Crossagent"])("loads host-held images in the %s panel", async (panel) => {
    const isCrossagent = panel === "Crossagent";
    const threadId = "image-thread";
    const remoteServerId = "image-host";
    const parent = makeSubAgentItem("image-parent");
    const itemId = "image-view";
    const ref = { threadId, itemId, path: ["images", 0], mime: "image/png", bytes: 80_000 };
    const child = makeChildItem(itemId, parent.id, isCrossagent ? "mcp_tool_call" : "tool_call", {
      name: "View",
      kind: "read",
      status: "success",
      result: "880x700",
      images: [remoteImageRef(ref)],
    });
    const uri = "ui://fixture/panel";
    const app = makeChildItem("mcp-app", parent.id, "mcp_tool_call", {
      name: "show_panel",
      status: "success",
      result: {
        content: [
          {
            type: "resource",
            resource: { uri, mimeType: MCP_APP_MIME_TYPE, text: "<p>Panel</p>" },
          },
        ],
        _meta: {
          [MCP_APP_HOST_META_KEY]: {
            version: 1,
            sessionId: "fd558ade-3aa4-4a2f-a333-b74531737b21",
            toolName: "show_panel",
            resourceUri: uri,
          },
        },
      },
    });
    const listeners = new Set<() => void>();
    let src = "";
    const requestRef = vi.fn<RemoteImageReadiness["requestRef"]>();
    const readiness: RemoteImageReadiness = {
      resolveRef: () => src,
      subscribeRef: (_ref, listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      requestRef,
      resolvePath: () => "",
      subscribePath: () => () => undefined,
      requestPath: () => undefined,
    };
    const { servers, imageReadinessFor } = useRemoteServersStore.getState();
    const { threads } = useAppStore.getState();
    useRemoteServersStore.setState({
      servers: [
        {
          desktopId: remoteServerId,
          label: "Image Host",
          endpoint: "http://images.test/",
          accessToken: "test",
          scopes: [],
        },
      ],
      imageReadinessFor: (key) => (key === remoteServerId ? readiness : undefined),
    });
    useAppStore.setState({
      threads: [...threads, { id: threadId, remoteServerId } as Thread],
      runtimeItemIdsByThread: { [threadId]: [parent.id, child.id, app.id] },
      runtimeItemsByIdByThread: {
        [threadId]: {
          [parent.id]: {
            ...parent,
            payload: { ...(parent.payload as ToolCallPayload), isCrossagent },
          },
          [child.id]: child,
          [app.id]: app,
        },
      },
      runtimeStructuralVersionByThread: { [threadId]: 1 },
    });

    const view = render(
      <AppProvider>
        <SubAgentContent threadId={threadId} parentItemId={parent.id} />
      </AppProvider>,
    );
    try {
      await waitFor(() => expect(requestRef.mock.calls[0]?.[0]).toEqual(ref));
      const card = view.container.querySelector("[data-poracode-image-card]");
      expect(card).toBeInTheDocument();
      expect(card?.querySelector("img")).toBeNull();
      act(() => {
        src = "blob:child-image";
        for (const listener of listeners) listener();
      });
      expect(card?.querySelector("img")).toHaveAttribute("src", src);
      expect(view.container.querySelector("[data-poracode-inline-visual]")).toBeInTheDocument();
      expect(mockMcpAppCard).not.toHaveBeenCalled();
    } finally {
      view.unmount();
      useAppStore.setState({ threads });
      useRemoteServersStore.setState({ servers, imageReadinessFor });
    }
  });

  it("loads child relative and canonical Markdown images through the owning host", async () => {
    await DeferredItemMarkdownInner.preload();
    const threadId = "markdown-thread";
    const remoteServerId = "markdown-host";
    const parent = makeSubAgentItem("markdown-parent");
    const relative = makeChildItem("markdown-relative", parent.id, "assistant_message", undefined, {
      assistant_text: "![Child relative](images/child.png)",
    });
    const canonical = makeChildItem(
      "markdown-canonical",
      parent.id,
      "assistant_message",
      undefined,
      {
        assistant_text: `![Child canonical](<${toLocalFileUrl("C:\\repo\\images\\canonical.png")}>)`,
      },
    );
    const resolvePath = vi.fn<RemoteImageReadiness["resolvePath"]>(() => "blob:child-markdown");
    const readiness: RemoteImageReadiness = {
      resolveRef: () => "",
      subscribeRef: () => () => undefined,
      requestRef: () => undefined,
      resolvePath,
      subscribePath: () => () => undefined,
      requestPath: () => undefined,
    };
    const { servers, imageReadinessFor } = useRemoteServersStore.getState();
    const { threads, projects } = useAppStore.getState();
    useRemoteServersStore.setState({
      servers: [
        {
          desktopId: remoteServerId,
          label: "Markdown Host",
          endpoint: "http://markdown.test/",
          accessToken: "test",
          scopes: [],
        },
      ],
      imageReadinessFor: (key) => (key === remoteServerId ? readiness : undefined),
    });
    useAppStore.setState({
      threads: [
        ...threads,
        {
          id: threadId,
          projectId: "markdown-project",
          remoteServerId,
          title: "Markdown child",
          agentKind: "acp-generic",
          config: { model: "fixture" },
          status: "idle",
          attention: "none",
          canResumeWithConfig: false,
          archived: false,
          done: false,
          starred: false,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        } as Thread,
      ],
      projects: [
        ...projects,
        {
          id: "markdown-project",
          name: "Markdown project",
          location: { kind: "windows", path: "C:\\repo" },
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      runtimeItemIdsByThread: { [threadId]: [parent.id, relative.id, canonical.id] },
      runtimeItemsByIdByThread: {
        [threadId]: { [parent.id]: parent, [relative.id]: relative, [canonical.id]: canonical },
      },
      runtimeStructuralVersionByThread: { [threadId]: 1 },
    });

    const view = render(
      <AppProvider>
        <SubAgentContent threadId={threadId} parentItemId={parent.id} hideHeader />
      </AppProvider>,
    );
    try {
      await waitFor(() => {
        expect(resolvePath.mock.calls.some(([path]) => path === "C:/repo/images/child.png")).toBe(
          true,
        );
        expect(
          resolvePath.mock.calls.some(([path]) => path === "C:/repo/images/canonical.png"),
        ).toBe(true);
        expect(view.container.querySelectorAll("[data-poracode-image-card]")).toHaveLength(2);
      });
      expect(
        view.container.querySelector("button[aria-label='Open image preview'] img"),
      ).toHaveAttribute("src", "blob:child-markdown");
    } finally {
      view.unmount();
      useAppStore.setState({ threads, projects });
      useRemoteServersStore.setState({ servers, imageReadinessFor });
    }
  });

  it("waits for parent history before declaring a subagent target missing", async () => {
    const threadId = "loading-thread";
    const { threads } = useAppStore.getState();
    useAppStore.setState({
      threads: [
        ...threads,
        {
          id: threadId,
          projectId: "loading-project",
          title: "Loading child",
          agentKind: "acp-generic",
          config: { model: "fixture" },
          status: "idle",
          attention: "none",
          canResumeWithConfig: false,
          archived: false,
          done: false,
          starred: false,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        } as Thread,
      ],
      runtimeHydrationStatus: { [threadId]: "pending" },
    });
    const view = render(
      <AppProvider>
        <SubAgentContent threadId={threadId} parentItemId="missing-parent" hideHeader />
      </AppProvider>,
    );
    try {
      expect(await screen.findByRole("status")).toBeInTheDocument();
      expect(screen.queryByText("Subagent not found.")).not.toBeInTheDocument();

      act(() => {
        useAppStore.setState({
          runtimeHydrationStatus: {},
          runtimeItemIdsByThread: { [threadId]: [] },
          runtimeItemsByIdByThread: { [threadId]: {} },
        });
      });
      expect(await screen.findByText("Subagent not found.")).toBeInTheDocument();
    } finally {
      view.unmount();
      useAppStore.setState({ threads });
    }
  });

  it("defers the first child timeline render until idle", async () => {
    const threadId = "thread-1";
    const parentItem = makeSubAgentItem("parent-1");
    const children = Array.from({ length: 20 }, (_entry, index) =>
      makeChildItem(`assistant-${index}`, parentItem.id, "assistant_message", undefined, {
        assistant_text: `Child message ${index}`,
      }),
    );

    useAppStore.setState({
      runtimeItemIdsByThread: {
        [threadId]: [parentItem.id, ...children.map((item) => item.id)],
      },
      runtimeItemsByIdByThread: {
        [threadId]: {
          [parentItem.id]: parentItem,
          ...Object.fromEntries(children.map((item) => [item.id, item])),
        },
      },
      runtimeStructuralVersionByThread: { [threadId]: 1 },
    });

    render(<SubAgentContent threadId={threadId} parentItemId={parentItem.id} />);

    expect(screen.queryByText("Child message 19")).not.toBeInTheDocument();
    expect(document.querySelector(".poracode-subagent-skeleton")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
    expect(await screen.findByText("Child message 18")).toBeInTheDocument();
    expect(screen.getByText("Child message 19")).toBeInTheDocument();
    expect(screen.getByText("Child message 0")).toBeInTheDocument();
    const scroller = document.querySelector("[data-poracode-chat-scroller]");
    expect(scroller).toHaveClass("opacity-0");
    expect(document.querySelector(".poracode-subagent-skeleton")).toHaveClass("opacity-100");
    await waitFor(() => expect(scroller).toHaveClass("opacity-100"));
    expect(document.querySelector(".poracode-subagent-skeleton")).toHaveClass(
      "invisible",
      "opacity-0",
    );
  });

  it.each(["running", "completed"] as const)(
    "shows cached %s Crossagent content while resubscribing after a remount",
    async (status) => {
      await DeferredItemMarkdownInner.preload();
      const threadId = "thread-1";
      const parentItem: RuntimeChatItem = {
        ...makeSubAgentItem("parent-1"),
        state: status === "running" ? "started" : "completed",
        payload: {
          name: "Cached task",
          status: status === "running" ? "running" : "success",
          isCrossagent: true,
        } satisfies ToolCallPayload,
      };
      const child = makeChildItem("assistant-1", parentItem.id, "assistant_message", undefined, {
        assistant_text: "Cached response",
      });
      useAppStore.setState({
        runtimeItemIdsByThread: { [threadId]: [parentItem.id, child.id] },
        runtimeItemsByIdByThread: {
          [threadId]: { [parentItem.id]: parentItem, [child.id]: child },
        },
        runtimeStructuralVersionByThread: { [threadId]: 1 },
      });
      const content = (
        <SubAgentContent
          threadId={threadId}
          parentItemId={parentItem.id}
          initialScrollRevealDelayMs={0}
        />
      );
      const firstView = render(content);
      expect(await screen.findByText("Cached response")).toBeInTheDocument();
      firstView.unmount();
      expect(mockBridge.subagentUnsubscribe).toHaveBeenCalledWith(
        expect.objectContaining({
          threadId,
          parentItemId: parentItem.id,
        }),
      );

      const history = Promise.withResolvers<{ history: [] }>();
      mockBridge.subagentSubscribe.mockReturnValue(history.promise);
      render(content);

      expect(await screen.findByText("Cached response")).toBeInTheDocument();
      await waitFor(() =>
        expect(document.querySelector("[data-poracode-chat-scroller]")).toHaveClass("opacity-100"),
      );
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
      expect(mockBridge.subagentSubscribe).toHaveBeenCalledTimes(2);
      act(() => {
        useAppStore.getState().applyRuntimeEvents(threadId, [
          {
            type: "item.started",
            threadId,
            itemId: "assistant-2",
            itemType: "assistant_message",
            parentItemId: parentItem.id,
          },
          {
            type: "content.delta",
            threadId,
            itemId: "assistant-2",
            stream: "assistant_text",
            delta: "Updated response",
          },
        ]);
      });
      expect(await screen.findByText("Updated response")).toBeInTheDocument();
      await act(async () => history.resolve({ history: [] }));
      expect(screen.getByText("Cached response")).toBeInTheDocument();
      expect(screen.getByText("Updated response")).toBeInTheDocument();
    },
  );

  it("waits for history replay and Markdown before mounting an uncached transcript", async () => {
    const threadId = "thread-1";
    const parentItem = makeSubAgentItem("parent-1");
    const child = makeChildItem("assistant-1", parentItem.id, "assistant_message", undefined, {
      assistant_text: "Prepared message",
    });
    const history = Promise.withResolvers<{ history: [] }>();
    const markdown = Promise.withResolvers<void>();
    mockBridge.subagentSubscribe.mockReturnValue(history.promise);
    const preload = vi
      .spyOn(DeferredItemMarkdownInner, "preload")
      .mockReturnValue(markdown.promise);
    let idle: IdleRequestCallback | undefined;
    vi.stubGlobal("requestIdleCallback", (callback: IdleRequestCallback) => {
      idle = callback;
      return 1;
    });
    vi.stubGlobal("cancelIdleCallback", vi.fn());
    useAppStore.setState({
      runtimeItemIdsByThread: { [threadId]: [parentItem.id] },
      runtimeItemsByIdByThread: { [threadId]: { [parentItem.id]: parentItem } },
      runtimeStructuralVersionByThread: { [threadId]: 1 },
    });
    const { unmount } = render(
      <SubAgentContent threadId={threadId} parentItemId={parentItem.id} />,
    );
    try {
      await act(async () => idle?.({ didTimeout: false, timeRemaining: () => 50 }));
      expect(screen.queryByText("Prepared message")).not.toBeInTheDocument();
      expect(screen.getByRole("status")).toHaveTextContent("Loading");
      await act(async () => {
        useAppStore.setState({
          runtimeItemIdsByThread: { [threadId]: [parentItem.id, child.id] },
          runtimeItemsByIdByThread: {
            [threadId]: { [parentItem.id]: parentItem, [child.id]: child },
          },
          runtimeStructuralVersionByThread: { [threadId]: 2 },
        });
        history.resolve({ history: [] });
      });
      expect(screen.queryByText("Prepared message")).not.toBeInTheDocument();
      await waitFor(() => expect(idle).toBeTypeOf("function"));
      await act(async () => idle?.({ didTimeout: false, timeRemaining: () => 50 }));
      await act(async () => markdown.resolve());
      expect(await screen.findByText("Prepared message")).toBeInTheDocument();
    } finally {
      unmount();
      preload.mockRestore();
      vi.unstubAllGlobals();
    }
  });

  it("waits for the panel to settle and does not mount late history during exit", async () => {
    const threadId = "thread-1";
    const parentItem = makeSubAgentItem("parent-1");
    const child = makeChildItem("assistant-1", parentItem.id, "assistant_message", undefined, {
      assistant_text: "Deferred transcript",
    });
    const history = Promise.withResolvers<{ history: [] }>();
    mockBridge.subagentSubscribe.mockReturnValue(history.promise);
    const idleCallbacks: IdleRequestCallback[] = [];
    vi.stubGlobal("requestIdleCallback", (callback: IdleRequestCallback) => {
      idleCallbacks.push(callback);
      return idleCallbacks.length;
    });
    vi.stubGlobal("cancelIdleCallback", vi.fn());
    useAppStore.setState({
      runtimeItemIdsByThread: { [threadId]: [parentItem.id, child.id] },
      runtimeItemsByIdByThread: { [threadId]: { [parentItem.id]: parentItem, [child.id]: child } },
      runtimeStructuralVersionByThread: { [threadId]: 1 },
    });
    const content = <SubAgentContent threadId={threadId} parentItemId={parentItem.id} />;
    const { rerender, unmount } = render(
      <PanelContentDeferredContext value>{content}</PanelContentDeferredContext>,
    );
    try {
      // A pending opening and an interrupted close both defer the first mount.
      await act(async () => history.resolve({ history: [] }));
      expect(idleCallbacks).toHaveLength(0);
      expect(screen.queryByText("Deferred transcript")).not.toBeInTheDocument();
      rerender(<PanelContentDeferredContext value={false}>{content}</PanelContentDeferredContext>);
      await waitFor(() => expect(idleCallbacks).toHaveLength(1));
      await act(async () =>
        idleCallbacks.shift()?.({ didTimeout: false, timeRemaining: () => 50 }),
      );
      expect(await screen.findByText("Deferred transcript")).toBeInTheDocument();
      // Once mounted, keep the current transcript through the exit fade.
      rerender(<PanelContentDeferredContext value>{content}</PanelContentDeferredContext>);
      expect(screen.getByText("Deferred transcript")).toBeInTheDocument();
    } finally {
      unmount();
      vi.unstubAllGlobals();
    }
  });

  it("keeps the pending idle reveal while child entries continue arriving", async () => {
    const threadId = "thread-1";
    const parentItem = makeSubAgentItem("parent-1");
    const children = Array.from({ length: 8 }, (_entry, index) =>
      makeChildItem(`assistant-${index}`, parentItem.id, "assistant_message", undefined, {
        assistant_text: `Child message ${index}`,
      }),
    );
    const idleCallbacks: IdleRequestCallback[] = [];
    const cancelIdleCallback = vi.fn<(id: number) => void>();
    vi.stubGlobal("requestIdleCallback", (callback: IdleRequestCallback) => {
      idleCallbacks.push(callback);
      return idleCallbacks.length;
    });
    vi.stubGlobal("cancelIdleCallback", cancelIdleCallback);

    try {
      useAppStore.setState({
        runtimeItemIdsByThread: { [threadId]: [parentItem.id, children[0]!.id] },
        runtimeItemsByIdByThread: {
          [threadId]: { [parentItem.id]: parentItem, [children[0]!.id]: children[0]! },
        },
        runtimeStructuralVersionByThread: { [threadId]: 1 },
      });

      render(<SubAgentContent threadId={threadId} parentItemId={parentItem.id} />);
      await waitFor(() => expect(idleCallbacks).toHaveLength(1));

      act(() => {
        useAppStore.setState({
          runtimeItemIdsByThread: {
            [threadId]: [parentItem.id, ...children.map((item) => item.id)],
          },
          runtimeItemsByIdByThread: {
            [threadId]: {
              [parentItem.id]: parentItem,
              ...Object.fromEntries(children.map((item) => [item.id, item])),
            },
          },
          runtimeStructuralVersionByThread: { [threadId]: 2 },
        });
      });

      expect(idleCallbacks).toHaveLength(1);
      expect(cancelIdleCallback).not.toHaveBeenCalled();
      await act(async () => {
        idleCallbacks.shift()?.({ didTimeout: false, timeRemaining: () => 50 });
      });
      for (let index = 0; index < children.length; index += 1) {
        expect(screen.getByText(`Child message ${index}`)).toBeInTheDocument();
      }
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("does not restart the timer fallback when child entries arrive", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("requestIdleCallback", undefined);
    const threadId = "thread-1";
    const parentItem = makeSubAgentItem("parent-1");
    const children = Array.from({ length: 8 }, (_entry, index) =>
      makeChildItem(`assistant-${index}`, parentItem.id, "assistant_message", undefined, {
        assistant_text: `Child message ${index}`,
      }),
    );

    try {
      useAppStore.setState({
        runtimeItemIdsByThread: { [threadId]: [parentItem.id, children[0]!.id] },
        runtimeItemsByIdByThread: {
          [threadId]: { [parentItem.id]: parentItem, [children[0]!.id]: children[0]! },
        },
        runtimeStructuralVersionByThread: { [threadId]: 1 },
      });
      render(<SubAgentContent threadId={threadId} parentItemId={parentItem.id} />);

      await act(async () => Promise.resolve());
      await act(async () => vi.advanceTimersByTime(10));
      act(() => {
        useAppStore.setState({
          runtimeItemIdsByThread: {
            [threadId]: [parentItem.id, ...children.map((item) => item.id)],
          },
          runtimeItemsByIdByThread: {
            [threadId]: {
              [parentItem.id]: parentItem,
              ...Object.fromEntries(children.map((item) => [item.id, item])),
            },
          },
          runtimeStructuralVersionByThread: { [threadId]: 2 },
        });
      });
      await act(async () => vi.advanceTimersByTime(6));

      for (let index = 0; index < children.length; index += 1) {
        expect(screen.getByText(`Child message ${index}`)).toBeInTheDocument();
      }
    } finally {
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  });

  it("mounts the complete tool-group count in one idle pass", async () => {
    const threadId = "thread-1";
    const runningParent = makeSubAgentItem("parent-1");
    const parentItem: RuntimeChatItem = {
      ...runningParent,
      state: "completed",
      payload: { ...(runningParent.payload as ToolCallPayload), status: "success" },
    };
    const commands = Array.from({ length: 250 }, (_entry, index) =>
      makeChildItem(`command-${index}`, parentItem.id, "command_execution", {
        command: `echo ${index}`,
      }),
    );
    const idleCallbacks: IdleRequestCallback[] = [];
    vi.stubGlobal("requestIdleCallback", (callback: IdleRequestCallback) => {
      idleCallbacks.push(callback);
      return idleCallbacks.length;
    });
    vi.stubGlobal("cancelIdleCallback", vi.fn());

    try {
      useAppStore.setState({
        runtimeItemIdsByThread: {
          [threadId]: [parentItem.id, ...commands.map((item) => item.id)],
        },
        runtimeItemsByIdByThread: {
          [threadId]: {
            [parentItem.id]: parentItem,
            ...Object.fromEntries(commands.map((item) => [item.id, item])),
          },
        },
        runtimeStructuralVersionByThread: { [threadId]: 1 },
      });

      render(<SubAgentContent threadId={threadId} parentItemId={parentItem.id} />);

      expect(document.querySelector(".poracode-subagent-skeleton")).toHaveClass("opacity-100");
      await waitFor(() => expect(idleCallbacks).toHaveLength(1));
      await act(async () => {
        idleCallbacks.shift()?.({ didTimeout: false, timeRemaining: () => 50 });
      });
      expect(await screen.findByText(byTextContent("250 commands"))).toBeInTheDocument();
      expect(idleCallbacks).toHaveLength(0);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("applies complete tool-group appends and truncations without restarting the reveal", async () => {
    const threadId = "thread-1";
    const parentItem = makeSubAgentItem("parent-1");
    const commands = Array.from({ length: 201 }, (_entry, index) =>
      makeChildItem(`command-${index}`, parentItem.id, "command_execution", {
        command: `echo ${index}`,
      }),
    );
    const idleCallbacks: IdleRequestCallback[] = [];
    vi.stubGlobal("requestIdleCallback", (callback: IdleRequestCallback) => {
      idleCallbacks.push(callback);
      return idleCallbacks.length;
    });
    vi.stubGlobal("cancelIdleCallback", vi.fn());

    try {
      useAppStore.setState({
        runtimeItemIdsByThread: {
          [threadId]: [parentItem.id, commands[0]!.id, commands[1]!.id],
        },
        runtimeItemsByIdByThread: {
          [threadId]: {
            [parentItem.id]: parentItem,
            [commands[0]!.id]: commands[0]!,
            [commands[1]!.id]: commands[1]!,
          },
        },
        runtimeStructuralVersionByThread: { [threadId]: 1 },
      });
      render(<SubAgentContent threadId={threadId} parentItemId={parentItem.id} />);

      await waitFor(() => expect(idleCallbacks.length).toBeGreaterThan(0));
      await act(async () => {
        idleCallbacks.shift()?.({ didTimeout: false, timeRemaining: () => 50 });
      });
      expect(screen.getByText(byTextContent("2 commands"))).toBeInTheDocument();

      act(() => {
        useAppStore.setState({
          runtimeItemIdsByThread: {
            [threadId]: [parentItem.id, ...commands.map((item) => item.id)],
          },
          runtimeItemsByIdByThread: {
            [threadId]: {
              [parentItem.id]: parentItem,
              ...Object.fromEntries(commands.map((item) => [item.id, item])),
            },
          },
          runtimeStructuralVersionByThread: { [threadId]: 2 },
        });
      });
      expect(screen.getByText(byTextContent("201 commands"))).toBeInTheDocument();
      expect(idleCallbacks).toHaveLength(0);

      act(() => {
        useAppStore.setState({
          runtimeItemIdsByThread: {
            [threadId]: [parentItem.id, commands[0]!.id, commands[1]!.id],
          },
          runtimeItemsByIdByThread: {
            [threadId]: {
              [parentItem.id]: parentItem,
              [commands[0]!.id]: commands[0]!,
              [commands[1]!.id]: commands[1]!,
            },
          },
          runtimeStructuralVersionByThread: { [threadId]: 3 },
        });
      });
      expect(screen.getByText(byTextContent("2 commands"))).toBeInTheDocument();

      act(() => {
        useAppStore.setState({
          runtimeItemIdsByThread: {
            [threadId]: [parentItem.id, ...commands.map((item) => item.id)],
          },
          runtimeItemsByIdByThread: {
            [threadId]: {
              [parentItem.id]: parentItem,
              ...Object.fromEntries(commands.map((item) => [item.id, item])),
            },
          },
          runtimeStructuralVersionByThread: { [threadId]: 4 },
        });
      });
      expect(screen.getByText(byTextContent("201 commands"))).toBeInTheDocument();
      expect(idleCallbacks).toHaveLength(0);
    } finally {
      vi.unstubAllGlobals();
    }
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
    expect(
      (await within(dialog).findByText(byTextContent("2 commands"))).closest("button"),
    ).toHaveAttribute("aria-expanded", "false");
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
    let resolveSubscribe: ((value: SubAgentSubscribeResult) => void) | undefined;
    mockBridge.subagentSubscribe.mockReset().mockImplementation(
      () =>
        new Promise<SubAgentSubscribeResult>((resolve) => {
          resolveSubscribe = resolve;
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

  it("skips a late legacy release when a newer watcher owns the same target", async () => {
    const threadId = "legacy-remount";
    const parent = makeSubAgentItem("parent-1");
    let resolveFirst: ((value: SubAgentSubscribeResult) => void) | undefined;
    let subscribeCount = 0;
    mockBridge.subagentSubscribe.mockReset().mockImplementation(() => {
      subscribeCount += 1;
      if (subscribeCount === 1) {
        return new Promise<SubAgentSubscribeResult>((resolve) => {
          resolveFirst = resolve;
        });
      }
      return Promise.resolve({ history: [] });
    });
    mockBridge.subagentUnsubscribe.mockReset().mockResolvedValue(undefined);
    useAppStore.setState({
      runtimeItemIdsByThread: { [threadId]: [parent.id] },
      runtimeItemsByIdByThread: { [threadId]: { [parent.id]: parent } },
      runtimeStructuralVersionByThread: { [threadId]: 1 },
    });

    const first = render(
      <SubAgentContent threadId={threadId} parentItemId={parent.id} hideHeader />,
    );
    await waitFor(() => expect(mockBridge.subagentSubscribe).toHaveBeenCalledTimes(1));
    const firstViewer = mockBridge.subagentSubscribe.mock.calls[0]![0].viewerId;
    first.unmount();

    const second = render(
      <SubAgentContent threadId={threadId} parentItemId={parent.id} hideHeader />,
    );
    await waitFor(() => expect(mockBridge.subagentSubscribe).toHaveBeenCalledTimes(2));
    const secondViewer = mockBridge.subagentSubscribe.mock.calls[1]![0].viewerId;
    expect(secondViewer).not.toBe(firstViewer);

    resolveFirst?.({ history: [] });
    await act(async () => Promise.resolve());
    expect(mockBridge.subagentUnsubscribe).not.toHaveBeenCalled();

    second.unmount();
    await waitFor(() =>
      expect(mockBridge.subagentUnsubscribe).toHaveBeenCalledWith(
        expect.objectContaining({ viewerId: secondViewer, threadId, parentItemId: parent.id }),
      ),
    );
    expect(mockBridge.subagentUnsubscribe).not.toHaveBeenCalledWith(
      expect.objectContaining({ viewerId: firstViewer }),
    );
  });

  it("releases a late scoped lease after the same target remounts", async () => {
    const threadId = "scoped-remount";
    const parent = makeSubAgentItem("parent-1");
    let resolveFirst: ((value: SubAgentSubscribeResult) => void) | undefined;
    let subscribeCount = 0;
    mockBridge.subagentSubscribe.mockReset().mockImplementation(() => {
      subscribeCount += 1;
      if (subscribeCount === 1) {
        return new Promise<SubAgentSubscribeResult>((resolve) => {
          resolveFirst = resolve;
        });
      }
      return Promise.resolve({ history: [], leaseMs: 90_000 });
    });
    mockBridge.subagentUnsubscribe.mockReset().mockResolvedValue(undefined);
    useAppStore.setState({
      runtimeItemIdsByThread: { [threadId]: [parent.id] },
      runtimeItemsByIdByThread: { [threadId]: { [parent.id]: parent } },
      runtimeStructuralVersionByThread: { [threadId]: 1 },
    });

    const first = render(
      <SubAgentContent threadId={threadId} parentItemId={parent.id} hideHeader />,
    );
    await waitFor(() => expect(mockBridge.subagentSubscribe).toHaveBeenCalledTimes(1));
    const firstViewer = mockBridge.subagentSubscribe.mock.calls[0]![0].viewerId;
    first.unmount();

    const second = render(
      <SubAgentContent threadId={threadId} parentItemId={parent.id} hideHeader />,
    );
    await waitFor(() => expect(mockBridge.subagentSubscribe).toHaveBeenCalledTimes(2));

    resolveFirst?.({ history: [], leaseMs: 90_000 });
    await waitFor(() =>
      expect(mockBridge.subagentUnsubscribe).toHaveBeenCalledWith(
        expect.objectContaining({ viewerId: firstViewer, threadId, parentItemId: parent.id }),
      ),
    );
    expect(second).toBeDefined();
    second.unmount();
  });

  it("releases the last legacy viewer on close", async () => {
    const threadId = "legacy-last-close";
    const parent = makeSubAgentItem("parent-1");
    let resolveSubscribe: ((value: SubAgentSubscribeResult) => void) | undefined;
    mockBridge.subagentSubscribe.mockReset().mockImplementation(
      () =>
        new Promise<SubAgentSubscribeResult>((resolve) => {
          resolveSubscribe = resolve;
        }),
    );
    mockBridge.subagentUnsubscribe.mockReset().mockResolvedValue(undefined);
    useAppStore.setState({
      runtimeItemIdsByThread: { [threadId]: [parent.id] },
      runtimeItemsByIdByThread: { [threadId]: { [parent.id]: parent } },
      runtimeStructuralVersionByThread: { [threadId]: 1 },
    });

    const view = render(
      <SubAgentContent threadId={threadId} parentItemId={parent.id} hideHeader />,
    );
    await waitFor(() => expect(mockBridge.subagentSubscribe).toHaveBeenCalledTimes(1));
    const viewerId = mockBridge.subagentSubscribe.mock.calls[0]![0].viewerId;
    view.unmount();
    resolveSubscribe?.({ history: [] });
    await waitFor(() =>
      expect(mockBridge.subagentUnsubscribe).toHaveBeenCalledWith(
        expect.objectContaining({ viewerId, threadId, parentItemId: parent.id }),
      ),
    );
  });

  it("grants a viewer lease only for active parents and releases completed ones", async () => {
    vi.useFakeTimers();
    const threadId = "completed-lease";
    const runningParent = makeSubAgentItem("parent-1");
    const completedParent: RuntimeChatItem = {
      ...runningParent,
      state: "completed",
      payload: { ...(runningParent.payload as ToolCallPayload), status: "success" },
    };
    mockBridge.subagentSubscribe.mockReset().mockResolvedValue({
      history: [],
      leaseMs: 90_000,
    });
    useAppStore.setState({
      runtimeItemIdsByThread: { [threadId]: [completedParent.id] },
      runtimeItemsByIdByThread: { [threadId]: { [completedParent.id]: completedParent } },
      runtimeStructuralVersionByThread: { [threadId]: 1 },
    });
    const view = render(
      <SubAgentContent threadId={threadId} parentItemId={completedParent.id} hideHeader />,
    );
    try {
      await act(async () => Promise.resolve());
      expect(mockBridge.subagentSubscribe).toHaveBeenCalledTimes(1);
      expect(mockBridge.subagentUnsubscribe).toHaveBeenCalledTimes(1);
      await act(async () => {
        vi.advanceTimersByTime(180_000);
      });
      await act(async () => Promise.resolve());
      expect(mockBridge.subagentSubscribe).toHaveBeenCalledTimes(1);
    } finally {
      view.unmount();
      vi.useRealTimers();
    }
  });

  it("renews the same viewer while active and stops on parent completion", async () => {
    vi.useFakeTimers();
    const threadId = "active-lease";
    const parent = makeSubAgentItem("parent-1");
    mockBridge.subagentSubscribe.mockReset().mockResolvedValue({
      history: [],
      leaseMs: 90_000,
    });
    useAppStore.setState({
      runtimeItemIdsByThread: { [threadId]: [parent.id] },
      runtimeItemsByIdByThread: { [threadId]: { [parent.id]: parent } },
      runtimeStructuralVersionByThread: { [threadId]: 1 },
    });
    const view = render(
      <SubAgentContent threadId={threadId} parentItemId={parent.id} hideHeader />,
    );
    try {
      await act(async () => Promise.resolve());
      expect(mockBridge.subagentSubscribe).toHaveBeenCalledTimes(1);
      const viewerId = mockBridge.subagentSubscribe.mock.calls[0]![0].viewerId;
      expect(viewerId).toEqual(expect.any(String));

      await act(async () => {
        vi.advanceTimersByTime(30_000);
      });
      await act(async () => Promise.resolve());
      expect(mockBridge.subagentSubscribe).toHaveBeenCalledTimes(2);
      expect(mockBridge.subagentSubscribe.mock.calls[1]![0].viewerId).toBe(viewerId);

      const completedParent: RuntimeChatItem = {
        ...parent,
        state: "completed",
        payload: { ...(parent.payload as ToolCallPayload), status: "success" },
      };
      act(() => {
        useAppStore.setState({
          runtimeItemsByIdByThread: {
            [threadId]: { [completedParent.id]: completedParent },
          },
        });
      });
      await act(async () => Promise.resolve());
      expect(mockBridge.subagentUnsubscribe).toHaveBeenCalledWith(
        expect.objectContaining({ viewerId, threadId, parentItemId: parent.id }),
      );

      await act(async () => {
        vi.advanceTimersByTime(180_000);
      });
      await act(async () => Promise.resolve());
      expect(mockBridge.subagentSubscribe).toHaveBeenCalledTimes(2);
    } finally {
      view.unmount();
      vi.useRealTimers();
    }
  });

  it("retries a rejected initial subscribe with the same viewer before renewing", async () => {
    vi.useFakeTimers();
    const threadId = "retry-lease";
    const parent = makeSubAgentItem("parent-1");
    mockBridge.subagentSubscribe
      .mockReset()
      .mockRejectedValueOnce(new Error("transient"))
      .mockResolvedValue({ history: [], leaseMs: 90_000 });
    mockBridge.subagentUnsubscribe.mockReset().mockResolvedValue(undefined);
    useAppStore.setState({
      runtimeItemIdsByThread: { [threadId]: [parent.id] },
      runtimeItemsByIdByThread: { [threadId]: { [parent.id]: parent } },
      runtimeStructuralVersionByThread: { [threadId]: 1 },
    });
    const view = render(
      <SubAgentContent threadId={threadId} parentItemId={parent.id} hideHeader />,
    );
    try {
      await act(async () => Promise.resolve());
      expect(mockBridge.subagentSubscribe).toHaveBeenCalledTimes(1);
      const viewerId = mockBridge.subagentSubscribe.mock.calls[0]![0].viewerId;
      expect(viewerId).toEqual(expect.any(String));
      expect(mockBridge.subagentUnsubscribe).not.toHaveBeenCalled();

      await act(async () => {
        vi.advanceTimersByTime(999);
      });
      await act(async () => Promise.resolve());
      expect(mockBridge.subagentSubscribe).toHaveBeenCalledTimes(1);

      await act(async () => {
        vi.advanceTimersByTime(1);
      });
      await act(async () => Promise.resolve());
      expect(mockBridge.subagentSubscribe).toHaveBeenCalledTimes(2);
      expect(mockBridge.subagentSubscribe.mock.calls[1]![0].viewerId).toBe(viewerId);
      expect(mockBridge.subagentUnsubscribe).not.toHaveBeenCalled();
    } finally {
      view.unmount();
      vi.useRealTimers();
    }
  });

  it("releases a granted viewer when the panel closes before subscribe resolves", async () => {
    const threadId = "close-before-subscribe";
    const parent = makeSubAgentItem("parent-1");
    let resolveSubscribe: ((value: SubAgentSubscribeResult) => void) | undefined;
    mockBridge.subagentSubscribe.mockReset().mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSubscribe = resolve;
        }),
    );
    useAppStore.setState({
      runtimeItemIdsByThread: { [threadId]: [parent.id] },
      runtimeItemsByIdByThread: { [threadId]: { [parent.id]: parent } },
      runtimeStructuralVersionByThread: { [threadId]: 1 },
    });
    const view = render(
      <SubAgentContent threadId={threadId} parentItemId={parent.id} hideHeader />,
    );
    await waitFor(() => expect(mockBridge.subagentSubscribe).toHaveBeenCalledTimes(1));
    const viewerId = mockBridge.subagentSubscribe.mock.calls[0]![0].viewerId;
    view.unmount();
    resolveSubscribe?.({ history: [], leaseMs: 90_000 });
    await waitFor(() =>
      expect(mockBridge.subagentUnsubscribe).toHaveBeenCalledWith(
        expect.objectContaining({ viewerId, threadId, parentItemId: parent.id }),
      ),
    );
    expect(mockBridge.subagentSubscribe).toHaveBeenCalledTimes(1);
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
