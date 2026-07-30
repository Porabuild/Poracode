// @vitest-environment jsdom
import { act, createEvent, fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentStatus, Project, Thread, ToolCallPayload } from "@/shared/contracts";
import "@/renderer/components/providers/bootstrap";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { useAppStore } from "@/renderer/state/appStore";
import type { RuntimeChatItem } from "@/renderer/state/slices/runtimeEventSlice";
import { ThreadView } from "./ThreadView";

const fixtures = vi.hoisted(() => ({
  project: {
    id: "project-1",
    name: "Repo",
    location: { kind: "posix", path: "/repo" },
    createdAt: "2026-01-01T00:00:00.000Z",
  } as Project,
  composerProps: [] as Array<{
    onSubmitInput?: (prompt: string) => Promise<void>;
    autoFocusComposer?: boolean;
    composerPlaceholder?: string;
    submitOnEnter?: boolean;
  }>,
  guiThreadProps: [] as Array<{
    initialScrollRevealDelayMs?: number;
    onInitialScrollSettled?: () => void;
  }>,
  desktopPointer: false,
  keyboardOffset: 0,
  agentStatuses: [] as AgentStatus[],
}));

const bridgeMock = vi.hoisted(() => ({
  closeThread: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  startThread: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  subagentSubscribe: vi.fn<() => Promise<{ history: [] }>>().mockResolvedValue({ history: [] }),
  subagentUnsubscribe: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
}));

const toastDanger = vi.hoisted(() => vi.fn<(message: string) => void>());

function createDeferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

vi.mock("@/renderer/bridge", () => ({
  readBridge: () => bridgeMock,
  isRemoteSession: () => true,
}));

vi.mock("@heroui/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@heroui/react")>();
  return {
    ...actual,
    toast: {
      ...actual.toast,
      danger: toastDanger,
    },
  };
});

vi.mock("@/renderer/components/terminal/XTermSurface", () => ({
  XTermSurface: () => <div data-testid="xterm-surface" />,
}));

vi.mock("../MobileTerminal", () => ({
  MobileTerminal: () => <div data-testid="mobile-terminal" />,
}));

vi.mock("../TerminalAccessory", () => ({
  TerminalAccessory: (props: { onReload?: () => void }) => (
    <button type="button" data-testid="terminal-accessory" onClick={props.onReload}>
      Reload terminal
    </button>
  ),
}));

vi.mock("../ThreadTitleRow", () => ({
  ThreadTitleRow: () => <div data-testid="thread-title-row" />,
}));

vi.mock("../GitSummaryParts", () => ({
  WorkspaceChip: () => <button type="button">Workspace</button>,
}));

vi.mock("@/renderer/components/thread/ThreadComposerSection", () => ({
  ThreadComposerSection: (props: {
    onSubmitInput?: (prompt: string) => Promise<void>;
    autoFocusComposer?: boolean;
    composerPlaceholder?: string;
  }) => {
    fixtures.composerProps.push(props);
    return (
      <div data-testid="thread-composer-section">
        <div data-composer-input-anchor="">
          <div
            role="textbox"
            tabIndex={0}
            contentEditable
            suppressContentEditableWarning
            aria-label="Composer input"
          />
        </div>
      </div>
    );
  },
}));

vi.mock("@/renderer/components/thread/ThreadContent", () => ({
  GuiThreadContent: (props: {
    initialScrollRevealDelayMs?: number;
    onInitialScrollSettled?: () => void;
  }) => {
    fixtures.guiThreadProps.push(props);
    return <div data-testid="gui-thread-content" />;
  },
}));

vi.mock("@/renderer/components/thread/useThreadDockState", () => ({
  useThreadDockState: () => ({
    todoDockCollapsed: false,
    todoDockPlacement: "composer",
    todoDockState: null,
    goalDockState: null,
    errorDockStates: [],
    onGoalDockDismiss: () => undefined,
    onDismissError: () => undefined,
    onTodoDockCollapsedChange: () => undefined,
    onTodoDockPlacementChange: () => undefined,
    onTodoDockRetire: () => undefined,
  }),
}));

vi.mock("@/renderer/hooks/uiSelectors", () => ({
  useProjectAgentStatuses: () => fixtures.agentStatuses,
}));

vi.mock("@/renderer/state/sharedSettingsStore", () => ({
  useSharedSettings: <T,>(selector: (state: { agentTerminalFontSize: number }) => T) =>
    selector({ agentTerminalFontSize: 13 }),
}));

vi.mock("@/renderer/state/useThread", () => ({
  useProject: () => fixtures.project,
}));

vi.mock("../useKeyboardOffset", () => ({
  useKeyboardGeometry: () => ({
    liftOffset: fixtures.keyboardOffset,
    visibilityOffset: fixtures.keyboardOffset,
  }),
  useKeyboardOffset: () => fixtures.keyboardOffset,
  useKeyboardVisibilityOffset: () => fixtures.keyboardOffset,
}));

vi.mock("../useMediaQuery", () => ({
  DESKTOP_POINTER_QUERY: "desktop-pointer",
  useMediaQuery: () => fixtures.desktopPointer,
}));

vi.mock("../composeScrollLock", () => ({
  focusWithoutScroll: vi.fn<(element: HTMLElement | null | undefined) => void>(),
  lockComposeScroll: vi.fn<(source?: HTMLElement | null) => void>(),
  unlockComposeScroll: vi.fn<() => void>(),
}));

describe("mobile ThreadView", () => {
  beforeEach(() => {
    bridgeMock.closeThread.mockReset().mockResolvedValue(undefined);
    bridgeMock.startThread.mockReset().mockResolvedValue(undefined);
    bridgeMock.subagentSubscribe.mockClear();
    bridgeMock.subagentUnsubscribe.mockClear();
    toastDanger.mockClear();
    fixtures.composerProps.length = 0;
    fixtures.guiThreadProps.length = 0;
    fixtures.desktopPointer = false;
    fixtures.keyboardOffset = 0;
    fixtures.agentStatuses = [];
    useAppStore.setState({
      runtimeItemIdsByThread: {},
      runtimeItemsByIdByThread: {},
      runtimeRequestsByThread: {},
      runtimeStructuralVersionByThread: {},
      openSubAgentByThread: {},
      pendingSteerByThreadId: {},
      pendingComposerFocusThreadId: null,
    });
  });

  it("enables desktop composer behavior only for desktop-like PWA input", () => {
    const thread = makeTerminalThread();
    const props = {
      thread,
      terminalScrollback: "",
      onThreadAction: () => undefined,
      onSubmitInput: () => Promise.resolve(),
    };

    const { container, unmount } = render(<ThreadView {...props} />);
    expect(fixtures.composerProps.at(-1)?.submitOnEnter).toBe(false);
    expect(fixtures.composerProps.at(-1)?.autoFocusComposer).toBe(false);
    expect(container.querySelector(".m-thread-compose-dock")).not.toHaveAttribute("data-expanded");
    unmount();

    fixtures.desktopPointer = true;
    const desktopView = render(<ThreadView {...props} />);
    expect(fixtures.composerProps.at(-1)?.submitOnEnter).toBe(true);
    expect(fixtures.composerProps.at(-1)?.autoFocusComposer).toBe(true);
    expect(desktopView.container.querySelector(".m-thread-compose-dock")).toHaveAttribute(
      "data-expanded",
    );
  });

  it("requests composer focus when the desktop PWA switches threads in place", () => {
    fixtures.desktopPointer = true;
    const firstThread = makeTerminalThread();
    const props = {
      thread: firstThread,
      terminalScrollback: "",
      onThreadAction: () => undefined,
      onSubmitInput: () => Promise.resolve(),
    };
    const view = render(<ThreadView {...props} />);
    useAppStore.getState().clearComposerFocusRequest(firstThread.id);

    const nextThread = { ...firstThread, id: "thread-2", title: "Next thread" };
    view.rerender(<ThreadView {...props} thread={nextThread} />);

    expect(useAppStore.getState().pendingComposerFocusThreadId).toBe(nextThread.id);
  });

  it("hands terminal subagents to the routed host instead of mounting an overlay", async () => {
    const thread = makeTerminalThread();
    const parentItem = makeSubAgentItem("agent-1");
    const onOpenSubAgent = vi.fn<(parentItemId: string) => void>();

    useAppStore.setState({
      runtimeItemIdsByThread: { [thread.id]: [parentItem.id] },
      runtimeItemsByIdByThread: {
        [thread.id]: {
          [parentItem.id]: parentItem,
        },
      },
      runtimeStructuralVersionByThread: { [thread.id]: 1 },
      openSubAgentByThread: { [thread.id]: parentItem.id },
    });

    render(
      <ThreadView
        thread={thread}
        terminalScrollback=""
        onThreadAction={() => undefined}
        onSubmitInput={() => Promise.resolve()}
        onOpenSubAgent={onOpenSubAgent}
      />,
    );

    await waitFor(() => {
      expect(onOpenSubAgent).toHaveBeenCalledWith(parentItem.id);
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(bridgeMock.subagentSubscribe).not.toHaveBeenCalled();
    expect(useAppStore.getState().openSubAgentByThread[thread.id]).toBeNull();
  });

  it("reports failed terminal thread reloads", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      const close = createDeferred();
      bridgeMock.closeThread.mockReturnValueOnce(close.promise);
      bridgeMock.startThread.mockRejectedValueOnce(new Error("restart failed"));

      render(
        <ThreadView
          thread={makeTerminalThread()}
          terminalScrollback=""
          onThreadAction={() => undefined}
          onSubmitInput={() => Promise.resolve()}
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: "Reload terminal" }));

      expect(bridgeMock.closeThread).toHaveBeenCalledWith({ threadId: "thread-1" });

      await act(async () => {
        close.resolve();
        await vi.advanceTimersByTimeAsync(0);
      });

      await act(() => vi.advanceTimersByTimeAsync(249));
      expect(bridgeMock.startThread).not.toHaveBeenCalled();
      expect(toastDanger).not.toHaveBeenCalled();

      await act(() => vi.advanceTimersByTimeAsync(1));
      expect(bridgeMock.startThread).toHaveBeenCalledTimes(1);
      expect(toastDanger).toHaveBeenCalledWith("restart failed");
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not apply terminal keyboard padding while the floating composer is focused", async () => {
    fixtures.keyboardOffset = 320;
    const { container } = render(
      <ThreadView
        thread={makeTerminalThread()}
        terminalScrollback=""
        onThreadAction={() => undefined}
        onSubmitInput={() => Promise.resolve()}
      />,
    );
    const thread = container.querySelector<HTMLElement>(".m-thread");
    expect(thread?.style.getPropertyValue("--m-keyboard-offset")).toBe("320px");

    const input = screen.getByRole("textbox");
    const pointerDown = createEvent.pointerDown(input, {
      cancelable: true,
      pointerType: "touch",
    });
    fireEvent(input, pointerDown);

    expect(thread?.style.getPropertyValue("--m-keyboard-offset")).toBe("0px");
    await waitFor(() => {
      expect(thread?.style.getPropertyValue("--m-keyboard-offset")).toBe("0px");
    });
  });

  it("collapses the floating composer after a successful send", async () => {
    const { container } = render(
      <ThreadView
        thread={{ ...makeTerminalThread(), presentationMode: "gui" }}
        terminalScrollback=""
        onThreadAction={() => undefined}
        onSubmitInput={() => Promise.resolve()}
      />,
    );
    const dock = container.querySelector(".m-thread-compose-dock");

    // Focusing the composer expands the controlled dock.
    fireEvent.focusIn(screen.getByRole("textbox"));
    await waitFor(() => expect(dock).toHaveAttribute("data-expanded"));

    // A successful send collapses it (drops keyboard + scrim). Drive the
    // composer's onSubmitInput directly rather than a DOM click so a leftover
    // ghost-tap guard from an earlier test can't swallow the gesture.
    await act(async () => {
      await fixtures.composerProps.at(-1)?.onSubmitInput?.("hi");
    });
    expect(dock).not.toHaveAttribute("data-expanded");
  });

  it("uses the mobile follow-up placeholder for an active thread", () => {
    render(
      <ThreadView
        thread={{ ...makeTerminalThread(), presentationMode: "gui" }}
        terminalScrollback=""
        onThreadAction={() => undefined}
        onSubmitInput={() => Promise.resolve()}
      />,
    );

    expect(fixtures.composerProps.at(-1)?.composerPlaceholder).toBe("Follow up...");
  });

  it("mounts GUI history only after the remote snapshot is ready", () => {
    const thread = { ...makeTerminalThread(), presentationMode: "gui" } as Thread;
    const props = {
      thread,
      terminalScrollback: "",
      loading: true,
      onThreadAction: () => undefined,
      onSubmitInput: () => Promise.resolve(),
    };
    const view = render(<ThreadView {...props} />);

    expect(screen.queryByTestId("gui-thread-content")).toBeNull();

    view.rerender(<ThreadView {...props} loading={false} />);

    expect(screen.getByTestId("gui-thread-content")).toBeInTheDocument();
    expect(fixtures.guiThreadProps.at(-1)?.initialScrollRevealDelayMs).toBe(50);
    expect(view.container.querySelector(".m-thread-content")).toHaveClass("invisible");

    act(() => fixtures.guiThreadProps.at(-1)?.onInitialScrollSettled?.());

    expect(view.container.querySelector(".m-thread-content")).not.toHaveClass("invisible");
  });

  it("shows model and effort text with the compact active-thread icons", () => {
    fixtures.agentStatuses = [makeCodexStatus()];
    const thread = {
      ...makeTerminalThread(),
      presentationMode: "gui",
      config: {
        model: "gpt-5",
        effort: "high",
        fast: true,
        mode: "plan",
        approvalPolicy: "never",
        sandboxMode: "danger-full-access",
      },
    } as Thread;

    const view = render(
      <ThreadView
        thread={thread}
        terminalScrollback=""
        onThreadAction={() => undefined}
        onSubmitInput={() => Promise.resolve()}
      />,
    );

    const summary = view.container.querySelector(".m-compose-summary");
    expect(summary?.querySelector(".poracode-provider-icon")).not.toBeNull();
    expect(summary?.querySelector(".lucide-zap")).not.toBeNull();
    // Fast is only summarized when on, so its chip carries the fill modifier
    // (the real toolbar fills via the toggle's selected state, which this inert
    // summary never has).
    expect(summary?.querySelector(".m-compose-summary__item--fast .lucide-zap")).not.toBeNull();
    expect(summary?.querySelector(".poracode-composer-mode-icon")).not.toBeNull();
    expect(summary?.querySelector(".poracode-composer-permission-icon")).not.toBeNull();
    expect(summary).toHaveTextContent("GPT-5");
    expect(summary).toHaveTextContent("High");

    view.rerender(
      <ThreadView
        thread={{ ...thread, config: { ...thread.config, fast: false } }}
        terminalScrollback=""
        onThreadAction={() => undefined}
        onSubmitInput={() => Promise.resolve()}
      />,
    );
    expect(view.container.querySelector(".m-compose-summary .lucide-zap")).toBeNull();
  });

  it("shows the session-pinned runtime model in the compact summary", () => {
    const baseStatus = makeCodexStatus();
    fixtures.agentStatuses = [
      {
        ...baseStatus,
        runtimeVariants: {
          sdk: {
            presentationMode: "gui",
            installed: true,
            authState: "authenticated",
            authUsesProviderLogin: false,
            capabilities: {
              ...baseStatus.capabilities,
              models: [{ id: "sdk-model", label: "Pinned SDK model" }],
              efforts: ["high"],
              modelEfforts: { "sdk-model": ["high"] },
            },
          },
        },
        sessionRuntimeRouting: { prefixes: { "sdk:": "sdk" } },
      },
    ];
    const thread = {
      ...makeTerminalThread(),
      presentationMode: "gui",
      config: { model: "sdk-model", effort: "high" },
      sessionRef: {
        providerSessionId: "sdk:session-1",
        discoveredAt: "2026-01-01T00:00:00.000Z",
      },
    } as Thread;

    const view = render(
      <ThreadView
        thread={thread}
        terminalScrollback=""
        onThreadAction={() => undefined}
        onSubmitInput={() => Promise.resolve()}
      />,
    );

    expect(view.container.querySelector(".m-compose-summary")).toHaveTextContent(
      "Pinned SDK model",
    );
  });

  it("hosts an open runtime request above the composer bubble, outside its clip", () => {
    const thread = { ...makeTerminalThread(), presentationMode: "gui" } as Thread;
    useAppStore.setState({
      runtimeRequestsByThread: {
        [thread.id]: [
          {
            requestId: "request-1",
            threadId: thread.id,
            requestType: "command_execution_approval",
            payload: {
              summary: "Run rm -rf build",
              details: { toolName: "Bash", description: "rm -rf build" },
            },
            receivedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      },
    });

    const view = render(
      <ThreadView
        thread={thread}
        terminalScrollback=""
        onThreadAction={() => undefined}
        onSubmitInput={() => Promise.resolve()}
      />,
    );

    const card = view.container.querySelector(".m-thread-action-docks");
    expect(card).not.toBeNull();
    expect(card).toHaveTextContent("Run rm -rf build");
    // The collapsed bubble clips to one control line, so the card must be a
    // sibling of the bubble inside the dock — never nested in it.
    expect(card?.closest(".m-thread-compose-dock")).not.toBeNull();
    expect(card?.closest(".m-compose-bubble")).toBeNull();
  });

  it("pins the touch composer collapsed while a runtime request is open", async () => {
    const thread = { ...makeTerminalThread(), presentationMode: "gui" } as Thread;
    useAppStore.setState({
      runtimeRequestsByThread: {
        [thread.id]: [
          {
            requestId: "request-1",
            threadId: thread.id,
            requestType: "command_execution_approval",
            payload: { summary: "Run rm -rf build", details: { toolName: "Bash" } },
            receivedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      },
    });

    const { container } = render(
      <ThreadView
        thread={thread}
        terminalScrollback=""
        onThreadAction={() => undefined}
        onSubmitInput={() => Promise.resolve()}
      />,
    );
    const dock = container.querySelector(".m-thread-compose-dock");
    expect(dock).toHaveAttribute("data-locked");

    // Focusing the pill would normally expand the dock (see the keyboard-dismiss
    // test below); under an open request it must stay collapsed so the card keeps
    // the surface. The pill remains a one-line input for deny-with-feedback.
    fireEvent.focusIn(screen.getByRole("textbox"));
    await waitFor(() => expect(dock).toBeInTheDocument());
    expect(dock).not.toHaveAttribute("data-expanded");
  });

  it("leaves the desktop PWA composer open while a runtime request is up", () => {
    fixtures.desktopPointer = true;
    const thread = { ...makeTerminalThread(), presentationMode: "gui" } as Thread;
    useAppStore.setState({
      runtimeRequestsByThread: {
        [thread.id]: [
          {
            requestId: "request-1",
            threadId: thread.id,
            requestType: "command_execution_approval",
            payload: { summary: "Run rm -rf build", details: { toolName: "Bash" } },
            receivedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      },
    });

    const { container } = render(
      <ThreadView
        thread={thread}
        terminalScrollback=""
        onThreadAction={() => undefined}
        onSubmitInput={() => Promise.resolve()}
      />,
    );
    const dock = container.querySelector(".m-thread-compose-dock");
    expect(dock).not.toHaveAttribute("data-locked");
    expect(dock).toHaveAttribute("data-expanded");
  });

  it("hosts a waiting pending steer in the same action-dock card", () => {
    const thread = {
      ...makeTerminalThread(),
      presentationMode: "gui",
      status: "working",
    } as Thread;
    useAppStore.setState({
      pendingSteerByThreadId: {
        [thread.id]: {
          id: "steer-1",
          prompt: "Focus on the parser instead",
          // Older than the reveal delay, so it is visible on first render.
          stagedAt: Date.now() - 10_000,
        },
      },
    });

    const view = render(
      <ThreadView
        thread={thread}
        terminalScrollback=""
        onThreadAction={() => undefined}
        onSubmitInput={() => Promise.resolve()}
      />,
    );

    const card = view.container.querySelector(".m-thread-action-docks");
    expect(card).toHaveTextContent("Focus on the parser instead");
    expect(card?.closest(".m-compose-bubble")).toBeNull();
  });

  it("uses GUI authentication for the auth-required action dock", () => {
    fixtures.agentStatuses = [
      {
        ...makeCodexStatus(),
        authState: "authenticated",
        presentationAuthStates: { gui: "missing" },
      },
    ];
    const thread = { ...makeTerminalThread(), presentationMode: "gui" } as Thread;

    const view = render(
      <ThreadView
        thread={thread}
        terminalScrollback=""
        onThreadAction={() => undefined}
        onSubmitInput={() => Promise.resolve()}
      />,
    );

    const card = view.container.querySelector(".m-thread-action-docks");
    expect(card).not.toBeNull();
    expect(card?.closest(".m-compose-bubble")).toBeNull();
  });

  it("does not show an auth dock when GUI auth is ready despite missing root auth", () => {
    fixtures.agentStatuses = [
      {
        ...makeCodexStatus(),
        authState: "missing",
        presentationAuthStates: { gui: "authenticated" },
      },
    ];
    const thread = { ...makeTerminalThread(), presentationMode: "gui" } as Thread;

    const view = render(
      <ThreadView
        thread={thread}
        terminalScrollback=""
        onThreadAction={() => undefined}
        onSubmitInput={() => Promise.resolve()}
      />,
    );

    expect(view.container.querySelector(".m-thread-action-docks")).toBeNull();
  });

  it("keeps the composer expanded when the keyboard is dismissed (no collapse-on-focus-loss)", async () => {
    const { container } = render(
      <ThreadView
        thread={{ ...makeTerminalThread(), presentationMode: "gui" }}
        terminalScrollback=""
        onThreadAction={() => undefined}
        onSubmitInput={() => Promise.resolve()}
      />,
    );
    const dock = container.querySelector(".m-thread-compose-dock");
    const input = screen.getByRole("textbox");

    fireEvent.focusIn(input);
    await waitFor(() => expect(dock).toHaveAttribute("data-expanded"));

    // Dismissing the keyboard blurs the input but must not collapse the dock.
    fireEvent.focusOut(input);
    await waitFor(() => expect(dock).toHaveAttribute("data-expanded"));
  });
});

function makeTerminalThread(): Thread {
  return {
    id: "thread-1",
    title: "Mobile terminal",
    projectId: fixtures.project.id,
    agentKind: "codex",
    status: "working",
    attention: "none",
    presentationMode: "terminal",
    config: { model: "gpt-5" },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    canResumeWithConfig: true,
  } as Thread;
}

function makeCodexStatus(): AgentStatus {
  return {
    kind: "codex",
    label: "Codex",
    installed: true,
    authState: "authenticated",
    capabilities: {
      models: [{ id: "gpt-5", label: "GPT-5" }],
      efforts: ["low", "high"],
      modelEfforts: { "gpt-5": ["low", "high"] },
      fastModels: ["gpt-5"],
      thinkingModels: [],
      modes: ["agent", "plan"],
      approvalPolicies: [
        { id: "on-request", label: "On request" },
        { id: "never", label: "Never" },
      ],
      sandboxModes: [
        { id: "workspace-write", label: "Workspace write" },
        { id: "danger-full-access", label: "Full access" },
      ],
      supportsResume: true,
      supportsDirectInput: true,
      liveInputMode: "server",
      presentationMode: "gui",
      presentationModes: ["gui"],
      settingDefs: [],
    },
  };
}

function makeSubAgentItem(id: string): RuntimeChatItem {
  const payload: ToolCallPayload = {
    name: "Task",
    status: "running",
    args: {
      description: "Checking mobile parity",
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
