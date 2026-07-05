// @vitest-environment jsdom
import { act, createEvent, fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Project, Thread, ToolCallPayload } from "@/shared/contracts";
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
    onResolveServerRequest?: unknown;
    onSubmitInput?: (prompt: string) => Promise<void>;
  }>,
  guiContentProps: [] as Array<{ onResolveServerRequest?: unknown }>,
  keyboardOffset: 0,
}));

const bridgeMock = vi.hoisted(() => ({
  closeThread: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  startThread: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  subagentSubscribe: vi.fn<() => Promise<{ history: [] }>>().mockResolvedValue({ history: [] }),
  subagentUnsubscribe: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
}));

const toastDanger = vi.hoisted(() => vi.fn<(message: string) => void>());

vi.mock("@/renderer/bridge", () => ({
  readBridge: () => bridgeMock,
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
    onResolveServerRequest?: unknown;
    onSubmitInput?: (prompt: string) => Promise<void>;
  }) => {
    fixtures.composerProps.push(props);
    return (
      <div data-testid="thread-composer-section">
        <div data-composer-input-anchor="">
          <div role="textbox" tabIndex={0} contentEditable suppressContentEditableWarning />
        </div>
      </div>
    );
  },
}));

vi.mock("@/renderer/components/thread/ThreadContent", () => ({
  GuiThreadContent: (props: { onResolveServerRequest?: unknown }) => {
    fixtures.guiContentProps.push(props);
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
  useProjectAgentStatuses: () => [],
}));

vi.mock("@/renderer/state/sharedSettingsStore", () => ({
  useSharedSettings: <T,>(selector: (state: { agentTerminalFontSize: number }) => T) =>
    selector({ agentTerminalFontSize: 13 }),
}));

vi.mock("@/renderer/state/useThread", () => ({
  useProject: () => fixtures.project,
}));

vi.mock("../useKeyboardOffset", () => ({
  useKeyboardOffset: () => fixtures.keyboardOffset,
}));

describe("mobile ThreadView", () => {
  beforeEach(() => {
    bridgeMock.closeThread.mockReset().mockResolvedValue(undefined);
    bridgeMock.startThread.mockReset().mockResolvedValue(undefined);
    bridgeMock.subagentSubscribe.mockClear();
    bridgeMock.subagentUnsubscribe.mockClear();
    toastDanger.mockClear();
    fixtures.composerProps.length = 0;
    fixtures.guiContentProps.length = 0;
    fixtures.keyboardOffset = 0;
    useAppStore.setState({
      runtimeItemIdsByThread: {},
      runtimeItemsByIdByThread: {},
      runtimeRequestsByThread: {},
      runtimeStructuralVersionByThread: {},
      openSubAgentByThread: {},
    });
  });

  it("mounts the subagent overlay for terminal threads", async () => {
    const thread = makeTerminalThread();
    const parentItem = makeSubAgentItem("agent-1");

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
        onResolveServerRequest={() => Promise.resolve()}
      />,
    );

    expect(
      await screen.findByRole("dialog", {
        name: "Agent (rubber-duck): Checking mobile parity",
      }),
    ).toBeInTheDocument();
    expect(bridgeMock.subagentSubscribe).toHaveBeenCalledWith({
      threadId: thread.id,
      parentItemId: parentItem.id,
    });
  });

  it("reports failed terminal thread reloads", async () => {
    bridgeMock.startThread.mockRejectedValueOnce(new Error("restart failed"));

    render(
      <ThreadView
        thread={makeTerminalThread()}
        terminalScrollback=""
        onThreadAction={() => undefined}
        onSubmitInput={() => Promise.resolve()}
        onResolveServerRequest={() => Promise.resolve()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Reload terminal" }));

    await waitFor(() => {
      expect(bridgeMock.closeThread).toHaveBeenCalledWith({ threadId: "thread-1" });
    });
    await new Promise((resolve) => window.setTimeout(resolve, 300));

    await waitFor(() => {
      expect(toastDanger).toHaveBeenCalledWith("restart failed");
    });
  });

  it("renders the terminal composer for runtime request resolution", () => {
    render(
      <ThreadView
        thread={makeTerminalThread()}
        terminalScrollback=""
        onThreadAction={() => undefined}
        onSubmitInput={() => Promise.resolve()}
        onResolveServerRequest={() => Promise.resolve()}
      />,
    );

    // ThreadComposerSection resolves runtime requests via the shared actions
    // module directly, so the mobile ThreadView just needs to render it.
    expect(fixtures.composerProps.length).toBeGreaterThan(0);
  });

  it("does not apply terminal keyboard padding while the floating composer is focused", async () => {
    fixtures.keyboardOffset = 320;
    const { container } = render(
      <ThreadView
        thread={makeTerminalThread()}
        terminalScrollback=""
        onThreadAction={() => undefined}
        onSubmitInput={() => Promise.resolve()}
        onResolveServerRequest={() => Promise.resolve()}
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

  it("renders GUI thread content for runtime request resolution", () => {
    render(
      <ThreadView
        thread={{ ...makeTerminalThread(), presentationMode: "gui" }}
        terminalScrollback=""
        onThreadAction={() => undefined}
        onSubmitInput={() => Promise.resolve()}
        onResolveServerRequest={() => Promise.resolve()}
      />,
    );

    // ThreadComposerSection (rendered inside GuiThreadContent) resolves
    // runtime requests via the shared actions module directly.
    expect(fixtures.guiContentProps.length).toBeGreaterThan(0);
  });

  it("collapses the floating composer after a successful send", async () => {
    const { container } = render(
      <ThreadView
        thread={{ ...makeTerminalThread(), presentationMode: "gui" }}
        terminalScrollback=""
        onThreadAction={() => undefined}
        onSubmitInput={() => Promise.resolve()}
        onResolveServerRequest={() => Promise.resolve()}
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

  it("keeps the composer expanded when the keyboard is dismissed (no collapse-on-focus-loss)", async () => {
    const { container } = render(
      <ThreadView
        thread={{ ...makeTerminalThread(), presentationMode: "gui" }}
        terminalScrollback=""
        onThreadAction={() => undefined}
        onSubmitInput={() => Promise.resolve()}
        onResolveServerRequest={() => Promise.resolve()}
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
