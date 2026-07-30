import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "@/renderer/components/providers/bootstrap";
import type { Thread } from "@/shared/contracts";
import { AppProvider } from "@/renderer/components/ui/provider";
import { useAppStore } from "@/renderer/state/appStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { useThreadTodoDockStore } from "@/renderer/state/threadTodoDockStore";
import { ThreadView } from "./ThreadView";

const { bridge, captureFileCheckpoint, runtimeActions } = vi.hoisted(() => ({
  bridge: {
    startThread: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    interruptThread: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    setPendingSteer: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    clearPendingSteer: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    writeTerminal: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    searchProjectFiles: vi
      .fn<() => Promise<{ entries: unknown[]; totalIndexed: number }>>()
      .mockResolvedValue({ entries: [], totalIndexed: 0 }),
    dbGetThreadRuntimeItems: vi.fn<() => Promise<unknown[]>>().mockResolvedValue([]),
    dbGetThreadCompletedTurns: vi.fn<() => Promise<unknown[]>>().mockResolvedValue([]),
    dbGetThreadContextUsage: vi.fn<() => Promise<unknown | null>>().mockResolvedValue(null),
  },
  captureFileCheckpoint: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  runtimeActions: {
    changeThreadConfig: vi.fn<() => void>(),
    resolveThreadServerRequest: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    submitThreadInput: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  },
}));

vi.mock("@/renderer/actions/threadRuntimeActions", () => ({
  changeThreadConfig: runtimeActions.changeThreadConfig,
  resolveThreadServerRequest: runtimeActions.resolveThreadServerRequest,
  submitThreadInput: runtimeActions.submitThreadInput,
}));

vi.mock("../../bridge", () => ({
  readBridge: () => bridge,
  isRemoteSession: () => false,
  isDevApp: () => false,
}));

vi.mock("@/renderer/state/fileCheckpointActions", () => ({
  captureFileCheckpoint,
  hydrateFileCheckpoints: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  finalizeFileCheckpoint: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
}));

vi.mock("./TerminalPane", () => ({
  TerminalPane: (props: { onTerminalResize?: (size: { cols: number; rows: number }) => void }) => (
    <div>
      terminal pane
      <button onClick={() => props.onTerminalResize?.({ cols: 120, rows: 40 })} type="button">
        report terminal size
      </button>
    </div>
  ),
}));

function renderThreadView(props: Parameters<typeof ThreadView>[0]) {
  return render(
    <AppProvider>
      <ThreadView {...props} />
    </AppProvider>,
  );
}

function hasAncestorWithClassFragment(element: HTMLElement | null, fragment: string): boolean {
  let current = element;
  while (current) {
    if (typeof current.className === "string" && current.className.includes(fragment)) {
      return true;
    }
    current = current.parentElement;
  }
  return false;
}

describe("ThreadView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    useSharedSettings.setState({ agentSettings: {}, collapseTerminalComposer: false });
    useThreadTodoDockStore.setState({
      defaultPlacement: "composer",
      defaultCollapsed: false,
      byThreadId: {},
    });
    useAppStore.setState({
      runtimeItemIdsByThread: {},
      runtimeItemsByIdByThread: {},
      runtimeRequestsByThread: {},
      runtimeLaunchConfigByThreadId: {},
    });
  });

  it("renders the supervisor's effective Browser MCP state in active threads", async () => {
    // Mid-thread toggles can't re-attach an MCP server to a running session,
    // so the active-thread chip is informational only. The toggle lives in
    // the draft composer.

    const threadId = "thread-browser-mcp";
    useAppStore.setState({
      runtimeLaunchConfigByThreadId: {
        [threadId]: { model: "gpt-5.4", browserMcp: true },
      },
    });

    renderThreadView({
      thread: {
        id: threadId,
        projectId: "project-1",
        title: "Browser thread",
        agentKind: "codex",
        config: {
          model: "gpt-5.4",
        },
        status: "idle",
        attention: "none",
        canResumeWithConfig: true,
        archived: false,
        done: false,
        starred: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      agentStatus: {
        kind: "codex",
        label: "Codex",
        installed: true,
        authState: "authenticated",
        capabilities: {
          models: [{ id: "gpt-5.4", label: "5.4" }],
          efforts: ["low"],
          modelEfforts: {},
          modes: ["agent"],
          approvalPolicies: [{ id: "on-request", label: "On Request" }],
          sandboxModes: [{ id: "read-only", label: "Read Only" }],
          supportsResume: true,
          supportsDirectInput: true,
          liveInputMode: "terminal",
          presentationMode: "terminal",
          settingDefs: [],
        },
      },
      projectLocation: {
        kind: "windows",
        path: "C:\\repo",
      },
    });

    const browserIcon = screen.getByLabelText("Browser MCP enabled for this thread");
    expect(hasAncestorWithClassFragment(browserIcon, "poracode-overlay-header__controls")).toBe(
      true,
    );
    expect(screen.queryByLabelText("Disable Browser MCP")).toBeNull();
    expect(runtimeActions.changeThreadConfig).not.toHaveBeenCalled();

    await act(async () =>
      useAppStore.setState({
        runtimeLaunchConfigByThreadId: {
          [threadId]: { model: "gpt-5.4", browserMcp: false },
        },
      }),
    );
    await waitFor(() =>
      expect(screen.queryByLabelText("Browser MCP enabled for this thread")).toBeNull(),
    );
  });

  it("renders OpenCode Browser MCP when the supervisor reports an attached transport", () => {
    const threadId = "thread-opencode-browser-mcp";
    useAppStore.setState({
      runtimeLaunchConfigByThreadId: {
        [threadId]: { model: "opencode/big-pickle", browserMcp: true },
      },
    });
    renderThreadView({
      thread: {
        id: threadId,
        projectId: "project-1",
        title: "OpenCode browser thread",
        agentKind: "opencode",
        config: {
          model: "opencode/big-pickle",
        },
        status: "idle",
        attention: "none",
        canResumeWithConfig: true,
        archived: false,
        done: false,
        starred: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      agentStatus: {
        kind: "opencode",
        label: "OpenCode",
        installed: true,
        authState: "authenticated",
        capabilities: {
          models: [{ id: "opencode/big-pickle", label: "Big Pickle" }],
          efforts: [],
          modelEfforts: {},
          modes: ["agent"],
          approvalPolicies: [{ id: "default", label: "Default" }],
          sandboxModes: [],
          supportsResume: true,
          supportsDirectInput: true,
          liveInputMode: "server",
          presentationMode: "gui",
          settingDefs: [],
        },
      },
      projectLocation: {
        kind: "windows",
        path: "C:\\repo",
      },
    });

    expect(screen.getByLabelText("Browser MCP enabled for OpenCode")).toBeInTheDocument();
    expect(screen.queryByLabelText("Disable Browser MCP")).toBeNull();
    expect(runtimeActions.changeThreadConfig).not.toHaveBeenCalled();
  });

  it("starts a queued child launch with its durable non-recursion guard", async () => {
    const onLaunchConsumed = vi.fn<() => void>();

    renderThreadView({
      thread: {
        id: "thread-launch",
        projectId: "project-1",
        title: "Queued Codex thread",
        agentKind: "codex",
        config: {
          model: "gpt-5.4",
        },
        status: "launching",
        attention: "none",
        canResumeWithConfig: false,
        archived: false,
        done: false,
        starred: false,
        parentThreadId: "parent-thread",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      agentStatus: {
        kind: "codex",
        label: "Codex",
        installed: true,
        authState: "authenticated",
        capabilities: {
          models: [{ id: "gpt-5.4", label: "5.4" }],
          efforts: ["low"],
          modelEfforts: {},
          modes: ["agent"],
          approvalPolicies: [{ id: "on-request", label: "On Request" }],
          sandboxModes: [{ id: "read-only", label: "Read Only" }],
          supportsResume: true,
          supportsDirectInput: true,
          liveInputMode: "server",
          presentationMode: "terminal",
          settingDefs: [],
        },
      },
      projectLocation: {
        kind: "windows",
        path: "C:\\repo",
      },
      pendingLaunchPrompt: "hi",
      onLaunchConsumed,
    });

    expect(bridge.startThread).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText("report terminal size"));

    await waitFor(() => {
      expect(onLaunchConsumed).toHaveBeenCalledTimes(1);
      expect(bridge.startThread).toHaveBeenCalledWith({
        threadId: "thread-launch",
        projectLocation: {
          kind: "windows",
          path: "C:\\repo",
        },
        agentKind: "codex",
        config: {
          model: "gpt-5.4",
        },
        prompt: "hi",
        mcpServers: [],
        disabledBuiltInMcpServerIds: [],
        invariantDisabledBuiltInMcpServerIds: ["subagents"],
        disabledBuiltInMcpTools: {},
        initialSize: {
          cols: 120,
          rows: 40,
        },
      });
    });
  });

  it("renders a GUI launch prompt and marks working before awaiting the file checkpoint", async () => {
    let resolveCapture!: () => void;
    captureFileCheckpoint.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        resolveCapture = resolve;
      }),
    );
    const thread: Thread = {
      id: "thread-gui-launch",
      projectId: "project-1",
      title: "Queued chat thread",
      agentKind: "codex",
      config: {
        model: "gpt-5.4",
      },
      status: "launching",
      attention: "none",
      canResumeWithConfig: false,
      archived: false,
      done: false,
      starred: false,
      presentationMode: "gui",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    useAppStore.setState({ threads: [thread] });

    renderThreadView({
      thread,
      agentStatus: {
        kind: "codex",
        label: "Codex",
        installed: true,
        authState: "authenticated",
        capabilities: {
          models: [{ id: "gpt-5.4", label: "5.4" }],
          efforts: ["low"],
          modelEfforts: {},
          modes: ["agent"],
          approvalPolicies: [{ id: "on-request", label: "On Request" }],
          sandboxModes: [{ id: "read-only", label: "Read Only" }],
          supportsResume: true,
          supportsDirectInput: true,
          liveInputMode: "server",
          presentationMode: "gui",
          settingDefs: [],
        },
      },
      projectLocation: {
        kind: "windows",
        path: "C:\\repo",
      },
      pendingLaunchPrompt: "hi",
      onLaunchConsumed: () => undefined,
    });

    await waitFor(() => expect(captureFileCheckpoint).toHaveBeenCalled());

    const optimisticItemId = useAppStore.getState().runtimeItemIdsByThread[thread.id]?.[0];
    expect(optimisticItemId).toEqual(expect.stringMatching(/^user-/));
    expect(useAppStore.getState().threads.find((item) => item.id === thread.id)?.status).toBe(
      "working",
    );
    expect(bridge.startThread).not.toHaveBeenCalled();

    resolveCapture();

    await waitFor(() => expect(bridge.startThread).toHaveBeenCalled());
  });

  it("forwards launch rejection messages to the launch failure callback", async () => {
    bridge.startThread.mockRejectedValueOnce(new Error("launcher boom"));
    const onLaunchConsumed = vi.fn<() => void>();
    const onLaunchFailed = vi.fn<(message: string) => void>();

    renderThreadView({
      thread: {
        id: "thread-launch-error",
        projectId: "project-1",
        title: "Queued Codex thread",
        agentKind: "codex",
        config: {
          model: "gpt-5.4",
        },
        status: "launching",
        attention: "none",
        canResumeWithConfig: false,
        archived: false,
        done: false,
        starred: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      agentStatus: {
        kind: "codex",
        label: "Codex",
        installed: true,
        authState: "authenticated",
        capabilities: {
          models: [{ id: "gpt-5.4", label: "5.4" }],
          efforts: ["low"],
          modelEfforts: {},
          modes: ["agent"],
          approvalPolicies: [{ id: "on-request", label: "On Request" }],
          sandboxModes: [{ id: "read-only", label: "Read Only" }],
          supportsResume: true,
          supportsDirectInput: true,
          liveInputMode: "server",
          presentationMode: "terminal",
          settingDefs: [],
        },
      },
      projectLocation: {
        kind: "windows",
        path: "C:\\repo",
      },
      pendingLaunchPrompt: "hi",
      onLaunchConsumed,
      onLaunchFailed,
    });

    fireEvent.click(screen.getByText("report terminal size"));

    await waitFor(() => {
      expect(onLaunchConsumed).toHaveBeenCalledTimes(1);
      expect(onLaunchFailed).toHaveBeenCalledWith("launcher boom");
    });
  });

  it("strips Electron IPC framing from launch errors before surfacing them", async () => {
    bridge.startThread.mockRejectedValueOnce(
      new Error(
        "Error invoking remote method 'poracode:start-thread': Error: This conversation can't be resumed.",
      ),
    );
    const onLaunchFailed = vi.fn<(message: string) => void>();

    renderThreadView({
      thread: {
        id: "thread-launch-ipc-error",
        projectId: "project-1",
        title: "Cursor resume",
        agentKind: "cursor",
        config: { model: "auto" },
        status: "launching",
        attention: "none",
        canResumeWithConfig: false,
        archived: false,
        done: false,
        starred: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      agentStatus: {
        kind: "cursor",
        label: "Cursor",
        installed: true,
        authState: "authenticated",
        capabilities: {
          models: [{ id: "auto", label: "Auto" }],
          efforts: [],
          modelEfforts: {},
          modes: ["agent"],
          approvalPolicies: [{ id: "default", label: "Default" }],
          sandboxModes: [],
          supportsResume: true,
          supportsDirectInput: true,
          liveInputMode: "terminal",
          presentationMode: "terminal",
          settingDefs: [],
        },
      },
      projectLocation: { kind: "posix", path: "/tmp" },
      pendingLaunchPrompt: "hi",
      onLaunchConsumed: () => undefined,
      onLaunchFailed,
    });

    fireEvent.click(screen.getByText("report terminal size"));

    await waitFor(() => {
      expect(onLaunchFailed).toHaveBeenCalledWith("This conversation can't be resumed.");
    });
  });

  it("renders a server-mode composer for Codex live threads", () => {
    renderThreadView({
      thread: {
        id: "thread-1",
        projectId: "project-1",
        title: "Codex thread",
        agentKind: "codex",
        config: {
          model: "gpt-5.4",
        },
        status: "idle",
        attention: "none",
        canResumeWithConfig: true,
        archived: false,
        done: false,
        starred: false,
        sessionRef: {
          providerSessionId: "session-1",
          discoveredAt: new Date().toISOString(),
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      agentStatus: {
        kind: "codex",
        label: "Codex",
        installed: true,
        authState: "authenticated",
        capabilities: {
          models: [{ id: "gpt-5.4", label: "5.4" }],
          efforts: ["low"],
          modelEfforts: {},
          modes: ["agent"],
          approvalPolicies: [{ id: "on-request", label: "On Request" }],
          sandboxModes: [{ id: "read-only", label: "Read Only" }],
          supportsResume: true,
          supportsDirectInput: true,
          liveInputMode: "server",
          presentationMode: "terminal",
          settingDefs: [],
        },
      },
      projectLocation: {
        kind: "windows",
        path: "C:\\repo",
      },
    });

    expect(
      screen.getByPlaceholderText("Ask Codex anything about this workspace"),
    ).toBeInTheDocument();
    expect(screen.getByText("terminal pane")).toBeInTheDocument();
  });

  it("disables the composer for inactive Codex threads", () => {
    renderThreadView({
      thread: {
        id: "thread-inactive",
        projectId: "project-1",
        title: "Inactive Codex thread",
        agentKind: "codex",
        config: {
          model: "gpt-5.4",
        },
        status: "inactive",
        attention: "none",
        canResumeWithConfig: false,
        archived: false,
        done: false,
        starred: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      agentStatus: {
        kind: "codex",
        label: "Codex",
        installed: true,
        authState: "authenticated",
        capabilities: {
          models: [{ id: "gpt-5.4", label: "5.4" }],
          efforts: ["low"],
          modelEfforts: {},
          modes: ["agent"],
          approvalPolicies: [{ id: "on-request", label: "On Request" }],
          sandboxModes: [{ id: "read-only", label: "Read Only" }],
          supportsResume: true,
          supportsDirectInput: true,
          liveInputMode: "server",
          presentationMode: "terminal",
          settingDefs: [],
        },
      },
      projectLocation: {
        kind: "windows",
        path: "C:\\repo",
      },
    });

    expect(screen.getByPlaceholderText("Ask Codex anything about this workspace")).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });

  it("shows a loading overlay without the composer while a terminal Codex thread is launching", () => {
    renderThreadView({
      thread: {
        id: "thread-launching",
        projectId: "project-1",
        title: "Launching Codex thread",
        agentKind: "codex",
        config: {
          model: "gpt-5.4",
        },
        status: "launching",
        attention: "none",
        canResumeWithConfig: false,
        archived: false,
        done: false,
        starred: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      agentStatus: {
        kind: "codex",
        label: "Codex",
        installed: true,
        authState: "authenticated",
        capabilities: {
          models: [{ id: "gpt-5.4", label: "5.4" }],
          efforts: ["low"],
          modelEfforts: {},
          modes: ["agent"],
          approvalPolicies: [{ id: "on-request", label: "On Request" }],
          sandboxModes: [{ id: "read-only", label: "Read Only" }],
          supportsResume: true,
          supportsDirectInput: true,
          liveInputMode: "server",
          presentationMode: "terminal",
          settingDefs: [],
        },
      },
      projectLocation: {
        kind: "windows",
        path: "C:\\repo",
      },
    });

    expect(screen.getByRole("img", { name: "Loading" })).toBeInTheDocument();
    // Terminal composer stays hidden during launching — only the loader overlay is visible.
    expect(
      screen.queryByPlaceholderText("Ask Codex anything about this workspace"),
    ).not.toBeInTheDocument();
  });

  it("disables only Send while a GUI ACP thread is launching", () => {
    renderThreadView({
      thread: {
        id: "thread-gui-launching",
        projectId: "project-1",
        title: "Launching GUI Codex thread",
        agentKind: "codex",
        config: {
          model: "gpt-5.4",
        },
        status: "launching",
        attention: "none",
        canResumeWithConfig: false,
        presentationMode: "gui",
        sessionRef: {
          providerSessionId: "session-gui-launching",
          discoveredAt: new Date().toISOString(),
        },
        archived: false,
        done: false,
        starred: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      agentStatus: {
        kind: "codex",
        label: "Codex",
        installed: true,
        authState: "authenticated",
        capabilities: {
          models: [{ id: "gpt-5.4", label: "5.4" }],
          efforts: ["low"],
          modelEfforts: {},
          modes: ["agent"],
          approvalPolicies: [{ id: "on-request", label: "On Request" }],
          sandboxModes: [{ id: "read-only", label: "Read Only" }],
          supportsResume: true,
          supportsDirectInput: true,
          liveInputMode: "server",
          presentationMode: "gui",
          settingDefs: [],
        },
      },
      projectLocation: {
        kind: "windows",
        path: "C:\\repo",
      },
    });

    expect(screen.queryByText("terminal pane")).not.toBeInTheDocument();
    const input = screen.getByPlaceholderText("Ask Codex anything about this workspace");
    expect(input).toBeInTheDocument();
    expect(input.getAttribute("aria-disabled")).not.toBe("true");
    expect(screen.getAllByLabelText("Select model")[0]).not.toBeDisabled();
    input.textContent = "test";
    fireEvent.input(input);
    expect(screen.queryByLabelText("Stop response")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Send message")).toBeDisabled();
  });

  it("keeps Claude live threads terminal-driven", () => {
    renderThreadView({
      thread: {
        id: "thread-2",
        projectId: "project-1",
        title: "Claude thread",
        agentKind: "claude",
        config: {
          model: "sonnet",
        },
        status: "idle",
        attention: "none",
        canResumeWithConfig: true,
        archived: false,
        done: false,
        starred: false,
        sessionRef: {
          providerSessionId: "session-2",
          discoveredAt: new Date().toISOString(),
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      agentStatus: {
        kind: "claude",
        label: "Claude Code",
        installed: true,
        authState: "authenticated",
        capabilities: {
          models: [{ id: "sonnet", label: "Sonnet" }],
          efforts: ["low"],
          modelEfforts: {},
          modes: ["agent"],
          approvalPolicies: [{ id: "default", label: "Default" }],
          sandboxModes: [],
          supportsResume: true,
          supportsDirectInput: true,
          liveInputMode: "terminal",
          presentationMode: "terminal",
          settingDefs: [],
        },
      },
      projectLocation: {
        kind: "windows",
        path: "C:\\repo",
      },
    });

    expect(
      screen.queryByPlaceholderText("Ask Codex anything about this workspace"),
    ).not.toBeInTheDocument();
    expect(screen.getByText("terminal pane")).toBeInTheDocument();
  });

  it("hides the terminal pane for server-backed GUI presentation", () => {
    renderThreadView({
      thread: {
        id: "thread-gui",
        projectId: "project-1",
        title: "GUI Codex thread",
        agentKind: "codex",
        config: {
          model: "gpt-5.4",
        },
        status: "idle",
        attention: "none",
        canResumeWithConfig: true,
        archived: false,
        done: false,
        starred: false,
        sessionRef: {
          providerSessionId: "session-gui",
          discoveredAt: new Date().toISOString(),
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      agentStatus: {
        kind: "codex",
        label: "Codex",
        installed: true,
        authState: "authenticated",
        capabilities: {
          models: [{ id: "gpt-5.4", label: "5.4" }],
          efforts: ["low"],
          modelEfforts: {},
          modes: ["agent"],
          approvalPolicies: [{ id: "on-request", label: "On Request" }],
          sandboxModes: [{ id: "read-only", label: "Read Only" }],
          supportsResume: true,
          supportsDirectInput: true,
          liveInputMode: "server",
          presentationMode: "gui",
          settingDefs: [],
        },
      },
      projectLocation: {
        kind: "windows",
        path: "C:\\repo",
      },
    });

    expect(screen.queryByText("terminal pane")).not.toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("Ask Codex anything about this workspace"),
    ).toBeInTheDocument();
  });

  it("renders ExitPlanMode as an approval and leaves plan mode when accepted", async () => {
    const now = new Date().toISOString();
    const rawSummary = 'ExitPlanMode: {"plan":"# Plan"}';

    useAppStore.setState({
      projects: [
        {
          id: "project-1",
          name: "Repo",
          location: { kind: "windows", path: "C:\\repo" },
          createdAt: now,
        },
      ],
      runtimeRequestsByThread: {
        "thread-claude-plan": [
          {
            requestId: "perm-plan",
            threadId: "thread-claude-plan",
            requestType: "tool_user_input",
            receivedAt: now,
            payload: {
              summary: "Proposed plan",
              details: {
                toolName: "ExitPlanMode",
                input: {
                  planFilePath: "C:\\Users\\sdsle\\.claude\\plans\\plan.md",
                },
              },
              options: [
                { optionId: "deny", label: "No, keep planning" },
                { optionId: "default", label: "Yes, and manually approve edits" },
                { optionId: "auto", label: "Yes, and switch to Auto" },
              ],
            },
          },
        ],
      },
    });

    renderThreadView({
      thread: {
        id: "thread-claude-plan",
        projectId: "project-1",
        title: "Claude plan thread",
        agentKind: "claude",
        config: {
          model: "opus",
          mode: "plan",
        },
        status: "needs_reply",
        attention: "needs_reply",
        canResumeWithConfig: true,
        archived: false,
        done: false,
        starred: false,
        presentationMode: "gui",
        sessionRef: {
          providerSessionId: "session-claude-plan",
          discoveredAt: now,
        },
        createdAt: now,
        updatedAt: now,
      },
      agentStatus: {
        kind: "claude",
        label: "Claude Code",
        installed: true,
        authState: "authenticated",
        capabilities: {
          models: [{ id: "opus", label: "Opus" }],
          efforts: ["low"],
          modelEfforts: {},
          modes: ["agent", "plan"],
          approvalPolicies: [
            { id: "auto", label: "Auto" },
            { id: "bypassPermissions", label: "Bypass Permissions" },
          ],
          sandboxModes: [],
          supportsResume: true,
          supportsDirectInput: true,
          liveInputMode: "server",
          presentationMode: "gui",
          settingDefs: [],
        },
      },
      projectLocation: {
        kind: "windows",
        path: "C:\\repo",
      },
    });

    expect(screen.getByText("Proposed plan")).toBeInTheDocument();
    expect(screen.queryByText(rawSummary)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open plan" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "No, keep planning" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Yes, and switch to Auto" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Yes, and manually approve edits" }));

    await waitFor(() => {
      expect(runtimeActions.changeThreadConfig).toHaveBeenCalledWith("thread-claude-plan", {
        model: "opus",
        mode: "agent",
        approvalPolicy: "default",
      });
      expect(runtimeActions.resolveThreadServerRequest).toHaveBeenCalledWith("thread-claude-plan", {
        requestId: "perm-plan",
        method: "requestPermission",
        response: { optionId: "default" },
      });
    });
  });

  it("uses the ACP composer controls for per-thread GUI presentation", () => {
    useSharedSettings.setState({ collapseTerminalComposer: true });

    renderThreadView({
      thread: {
        id: "thread-gui-codex",
        projectId: "project-1",
        title: "GUI Codex thread",
        agentKind: "codex",
        config: {
          model: "gpt-5.4",
          effort: "medium",
        },
        status: "idle",
        attention: "none",
        canResumeWithConfig: true,
        archived: false,
        done: false,
        starred: false,
        presentationMode: "gui",
        sessionRef: {
          providerSessionId: "session-gui",
          discoveredAt: new Date().toISOString(),
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      agentStatus: {
        kind: "codex",
        label: "Codex",
        installed: true,
        authState: "authenticated",
        capabilities: {
          models: [{ id: "gpt-5.4", label: "5.4" }],
          efforts: ["low", "medium"],
          modelEfforts: {},
          fastModels: ["gpt-5.4"],
          modes: ["agent"],
          approvalPolicies: [
            { id: "on-request", label: "On Request" },
            { id: "on-failure", label: "On Failure" },
            { id: "never", label: "Never" },
          ],
          sandboxModes: [
            { id: "read-only", label: "Read Only" },
            { id: "workspace-write", label: "Workspace Write" },
            { id: "danger-full-access", label: "Danger Full Access" },
          ],
          supportsResume: true,
          supportsDirectInput: true,
          liveInputMode: "terminal",
          presentationMode: "terminal",
          presentationModes: ["terminal", "gui"],
          settingDefs: [],
        },
      },
      projectLocation: {
        kind: "windows",
        path: "C:\\repo",
      },
    });

    expect(screen.queryByText("terminal pane")).not.toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("Ask Codex anything about this workspace"),
    ).toBeInTheDocument();
    expect(screen.getAllByText("5.4").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Medium").length).toBeGreaterThan(0);
    expect(screen.queryByText("Normal")).not.toBeInTheDocument();
    expect(screen.getAllByLabelText("Fast").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Work").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Default permissions").length).toBeGreaterThan(0);
    expect(screen.queryByLabelText("Collapse composer")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Show composer")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Work" }));
    expect(runtimeActions.changeThreadConfig).toHaveBeenCalledWith(
      "thread-gui-codex",
      expect.objectContaining({
        mode: "plan",
      }),
    );
  });

  it("shows the pinned todo dock without duplicating the latest plan row or hiding the live timer", async () => {
    const now = Date.now();
    const activeTurnStartedAt = new Date(now - 70_000).toISOString();
    const createdAt = new Date(now - 80_000).toISOString();

    useAppStore.setState({
      runtimeItemIdsByThread: {
        "thread-gui-plan": ["plan-old", "plan-1"],
      },
      runtimeItemsByIdByThread: {
        "thread-gui-plan": {
          "plan-old": {
            id: "plan-old",
            type: "plan",
            state: "completed",
            payload: {
              steps: [{ step: "Old inline todo", status: "completed" }],
            },
            streams: {},
          },
          "plan-1": {
            id: "plan-1",
            type: "plan",
            state: "updated",
            payload: {
              steps: [
                { step: "Build ACP todo dock", status: "in_progress" },
                { step: "Wire ACP todo placement", status: "pending" },
              ],
            },
            streams: {},
          },
        },
      },
    });

    renderThreadView({
      thread: {
        id: "thread-gui-plan",
        projectId: "project-1",
        title: "GUI Copilot thread",
        agentKind: "copilot",
        config: {
          model: "gpt-5.4",
        },
        status: "working",
        attention: "working",
        canResumeWithConfig: true,
        archived: false,
        done: false,
        starred: false,
        presentationMode: "gui",
        sessionRef: {
          providerSessionId: "session-gui-plan",
          discoveredAt: new Date().toISOString(),
        },
        createdAt,
        updatedAt: createdAt,
        activeTurnStartedAt,
      },
      agentStatus: {
        kind: "copilot",
        label: "Copilot",
        installed: true,
        authState: "authenticated",
        capabilities: {
          models: [{ id: "gpt-5.4", label: "5.4" }],
          efforts: ["high"],
          defaultEffort: "high",
          modelEfforts: {},
          modes: ["agent", "plan"],
          approvalPolicies: [{ id: "default", label: "Default" }],
          sandboxModes: [],
          supportsResume: true,
          supportsDirectInput: true,
          liveInputMode: "server",
          presentationMode: "gui",
          settingDefs: [],
        },
      },
      projectLocation: {
        kind: "windows",
        path: "C:\\repo",
      },
    });

    expect(screen.getByLabelText("Thread todo dock")).toHaveAttribute("data-placement", "composer");
    expect(screen.getAllByText("Build ACP todo dock")).toHaveLength(1);
    expect(screen.queryByText("Old inline todo")).not.toBeInTheDocument();
    expect(screen.queryByText("No messages yet")).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(/^Working for 1m/)).toBeInTheDocument());
  });

  it("shows the active GUI goal in the composer dock instead of the chat transcript", () => {
    useAppStore.setState({
      runtimeItemIdsByThread: {
        "thread-gui-goal": ["goal-1"],
      },
      runtimeItemsByIdByThread: {
        "thread-gui-goal": {
          "goal-1": {
            id: "goal-1",
            type: "goal",
            state: "completed",
            payload: {
              action: "set",
              objective: "Ship GUI goal dock",
              status: "active",
              tokensUsed: 120,
              timeUsedSeconds: 5,
              updatedAt: Date.now() / 1000,
            },
            streams: {},
          },
        },
      },
    });

    renderThreadView({
      thread: {
        id: "thread-gui-goal",
        projectId: "project-1",
        title: "GUI Codex goal thread",
        agentKind: "codex",
        config: {
          model: "gpt-5.4",
        },
        status: "idle",
        attention: "none",
        canResumeWithConfig: true,
        archived: false,
        done: false,
        starred: false,
        presentationMode: "gui",
        sessionRef: {
          providerSessionId: "session-gui-goal",
          discoveredAt: new Date().toISOString(),
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      agentStatus: {
        kind: "codex",
        label: "Codex",
        installed: true,
        authState: "authenticated",
        capabilities: {
          models: [{ id: "gpt-5.4", label: "5.4" }],
          efforts: ["low"],
          modelEfforts: {},
          modes: ["agent"],
          approvalPolicies: [{ id: "on-request", label: "On Request" }],
          sandboxModes: [{ id: "read-only", label: "Read Only" }],
          supportsResume: true,
          supportsDirectInput: true,
          liveInputMode: "server",
          presentationMode: "gui",
          settingDefs: [],
        },
      },
      projectLocation: {
        kind: "windows",
        path: "C:\\repo",
      },
    });

    expect(screen.getByLabelText("Thread goal dock")).toHaveAttribute("data-placement", "composer");
    expect(screen.getAllByText("Ship GUI goal dock")).toHaveLength(1);
    expect(screen.queryByText("Goal set")).not.toBeInTheDocument();
    expect(screen.queryByText("No messages yet")).not.toBeInTheDocument();
  });

  it("keeps a completed GUI goal in the composer dock", () => {
    useAppStore.setState({
      runtimeItemIdsByThread: {
        "thread-gui-goal-complete": ["goal-1"],
      },
      runtimeItemsByIdByThread: {
        "thread-gui-goal-complete": {
          "goal-1": {
            id: "goal-1",
            type: "goal",
            state: "completed",
            payload: {
              action: "updated",
              objective: "Ship completed GUI goal dock",
              status: "complete",
              tokensUsed: 120,
              timeUsedSeconds: 5,
              updatedAt: Date.now() / 1000,
            },
            streams: {},
          },
        },
      },
    });

    renderThreadView({
      thread: {
        id: "thread-gui-goal-complete",
        projectId: "project-1",
        title: "GUI completed goal thread",
        agentKind: "claude",
        config: {
          model: "sonnet",
        },
        status: "idle",
        attention: "none",
        canResumeWithConfig: true,
        archived: false,
        done: false,
        starred: false,
        presentationMode: "gui",
        sessionRef: {
          providerSessionId: "session-gui-goal-complete",
          discoveredAt: new Date().toISOString(),
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      agentStatus: {
        kind: "claude",
        label: "Claude Code",
        installed: true,
        authState: "authenticated",
        capabilities: {
          models: [{ id: "sonnet", label: "Sonnet" }],
          efforts: ["low"],
          modelEfforts: {},
          modes: ["agent"],
          approvalPolicies: [{ id: "default", label: "Default" }],
          sandboxModes: [],
          supportsResume: true,
          supportsDirectInput: true,
          liveInputMode: "server",
          presentationMode: "gui",
          settingDefs: [],
        },
      },
      projectLocation: {
        kind: "windows",
        path: "C:\\repo",
      },
    });

    expect(screen.getByLabelText("Thread goal dock")).toHaveAttribute("data-placement", "composer");
    expect(screen.getByText("Ship completed GUI goal dock")).toBeInTheDocument();
    expect(screen.getByText("Complete · 120 tokens")).toBeInTheDocument();
  });

  it("moves the pinned todo dock to the right rail and supports collapse", () => {
    useAppStore.setState({
      runtimeItemIdsByThread: {
        "thread-gui-plan": ["plan-1"],
      },
      runtimeItemsByIdByThread: {
        "thread-gui-plan": {
          "plan-1": {
            id: "plan-1",
            type: "plan",
            state: "updated",
            payload: {
              steps: [
                { step: "Build ACP todo dock", status: "in_progress" },
                { step: "Wire ACP todo placement", status: "pending" },
              ],
            },
            streams: {},
          },
        },
      },
    });

    renderThreadView({
      thread: {
        id: "thread-gui-plan",
        projectId: "project-1",
        title: "GUI Codex thread",
        agentKind: "codex",
        config: {
          model: "gpt-5.4",
        },
        status: "idle",
        attention: "none",
        canResumeWithConfig: true,
        archived: false,
        done: false,
        starred: false,
        presentationMode: "gui",
        sessionRef: {
          providerSessionId: "session-gui-plan",
          discoveredAt: new Date().toISOString(),
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      agentStatus: {
        kind: "codex",
        label: "Codex",
        installed: true,
        authState: "authenticated",
        capabilities: {
          models: [{ id: "gpt-5.4", label: "5.4" }],
          efforts: ["low"],
          modelEfforts: {},
          modes: ["agent"],
          approvalPolicies: [{ id: "on-request", label: "On Request" }],
          sandboxModes: [{ id: "read-only", label: "Read Only" }],
          supportsResume: true,
          supportsDirectInput: true,
          liveInputMode: "server",
          presentationMode: "gui",
          settingDefs: [],
        },
      },
      projectLocation: {
        kind: "windows",
        path: "C:\\repo",
      },
    });

    fireEvent.click(screen.getByRole("button", { name: "Move todo dock to right panel" }));
    expect(screen.getByLabelText("Thread todo dock")).toHaveAttribute("data-placement", "right");

    fireEvent.click(screen.getByRole("button", { name: "Collapse todo dock" }));
    expect(screen.getByLabelText("Thread todo dock")).toHaveAttribute("data-collapsed", "true");
    expect(screen.queryByText("Wire ACP todo placement")).not.toBeInTheDocument();
  });

  it("keeps todo dock placement and collapse scoped to each thread", () => {
    useAppStore.setState({
      runtimeItemIdsByThread: {
        "thread-gui-plan-a": ["plan-a"],
        "thread-gui-plan-b": ["plan-b"],
      },
      runtimeItemsByIdByThread: {
        "thread-gui-plan-a": {
          "plan-a": {
            id: "plan-a",
            type: "plan",
            state: "updated",
            payload: {
              steps: [
                { step: "Plan A active step", status: "in_progress" },
                { step: "Plan A pending step", status: "pending" },
              ],
            },
            streams: {},
          },
        },
        "thread-gui-plan-b": {
          "plan-b": {
            id: "plan-b",
            type: "plan",
            state: "updated",
            payload: {
              steps: [
                { step: "Plan B active step", status: "in_progress" },
                { step: "Plan B pending step", status: "pending" },
              ],
            },
            streams: {},
          },
        },
      },
    });

    const { rerender } = renderThreadView({
      thread: {
        id: "thread-gui-plan-a",
        projectId: "project-1",
        title: "GUI Codex thread A",
        agentKind: "codex",
        config: {
          model: "gpt-5.4",
        },
        status: "idle",
        attention: "none",
        canResumeWithConfig: true,
        archived: false,
        done: false,
        starred: false,
        presentationMode: "gui",
        sessionRef: {
          providerSessionId: "session-gui-plan-a",
          discoveredAt: new Date().toISOString(),
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      agentStatus: {
        kind: "codex",
        label: "Codex",
        installed: true,
        authState: "authenticated",
        capabilities: {
          models: [{ id: "gpt-5.4", label: "5.4" }],
          efforts: ["low"],
          modelEfforts: {},
          modes: ["agent"],
          approvalPolicies: [{ id: "on-request", label: "On Request" }],
          sandboxModes: [{ id: "read-only", label: "Read Only" }],
          supportsResume: true,
          supportsDirectInput: true,
          liveInputMode: "server",
          presentationMode: "gui",
          settingDefs: [],
        },
      },
      projectLocation: {
        kind: "windows",
        path: "C:\\repo",
      },
    });

    fireEvent.click(screen.getByRole("button", { name: "Move todo dock to right panel" }));
    fireEvent.click(screen.getByRole("button", { name: "Collapse todo dock" }));

    expect(screen.getByLabelText("Thread todo dock")).toHaveAttribute("data-placement", "right");
    expect(screen.getByLabelText("Thread todo dock")).toHaveAttribute("data-collapsed", "true");

    rerender(
      <AppProvider>
        <ThreadView
          thread={{
            id: "thread-gui-plan-b",
            projectId: "project-1",
            title: "GUI Codex thread B",
            agentKind: "codex",
            config: {
              model: "gpt-5.4",
            },
            status: "idle",
            attention: "none",
            canResumeWithConfig: true,
            archived: false,
            done: false,
            starred: false,
            presentationMode: "gui",
            sessionRef: {
              providerSessionId: "session-gui-plan-b",
              discoveredAt: new Date().toISOString(),
            },
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }}
          agentStatus={{
            kind: "codex",
            label: "Codex",
            installed: true,
            authState: "authenticated",
            capabilities: {
              models: [{ id: "gpt-5.4", label: "5.4" }],
              efforts: ["low"],
              modelEfforts: {},
              modes: ["agent"],
              approvalPolicies: [{ id: "on-request", label: "On Request" }],
              sandboxModes: [{ id: "read-only", label: "Read Only" }],
              supportsResume: true,
              supportsDirectInput: true,
              liveInputMode: "server",
              presentationMode: "gui",
              settingDefs: [],
            },
          }}
          projectLocation={{
            kind: "windows",
            path: "C:\\repo",
          }}
        />
      </AppProvider>,
    );

    expect(screen.getByLabelText("Thread todo dock")).toHaveAttribute("data-placement", "composer");
    expect(screen.getByLabelText("Thread todo dock")).toHaveAttribute("data-collapsed", "false");
    expect(screen.getByText("Plan B pending step")).toBeInTheDocument();
  });

  it("shows the runtime debug inspector toggle for GUI ACP threads in production builds", () => {
    renderThreadView({
      thread: {
        id: "thread-gui-debug",
        projectId: "project-1",
        title: "GUI Codex debug thread",
        agentKind: "codex",
        config: {
          model: "gpt-5.4",
        },
        status: "idle",
        attention: "none",
        canResumeWithConfig: true,
        archived: false,
        done: false,
        starred: false,
        presentationMode: "gui",
        sessionRef: {
          providerSessionId: "session-gui-debug",
          discoveredAt: new Date().toISOString(),
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      agentStatus: {
        kind: "codex",
        label: "Codex",
        installed: true,
        authState: "authenticated",
        capabilities: {
          models: [{ id: "gpt-5.4", label: "5.4" }],
          efforts: ["low"],
          modelEfforts: {},
          modes: ["agent"],
          approvalPolicies: [{ id: "on-request", label: "On Request" }],
          sandboxModes: [{ id: "read-only", label: "Read Only" }],
          supportsResume: true,
          supportsDirectInput: true,
          liveInputMode: "server",
          presentationMode: "gui",
          settingDefs: [],
        },
      },
      projectLocation: {
        kind: "windows",
        path: "C:\\repo",
      },
    });

    const toggle = screen.getByRole("button", { name: "Show runtime debug panel" });

    expect(toggle).toBeInTheDocument();

    fireEvent.click(toggle);

    expect(screen.getByText("Runtime debug")).toBeInTheDocument();
    expect(screen.getByText("No runtime items yet for this thread.")).toBeInTheDocument();
  });

  it("keeps send disabled while a Codex thread is running", () => {
    renderThreadView({
      thread: {
        id: "thread-3",
        projectId: "project-1",
        title: "Codex thread",
        agentKind: "codex",
        config: {
          model: "gpt-5.4",
        },
        status: "working",
        attention: "none",
        canResumeWithConfig: true,
        archived: false,
        done: false,
        starred: false,
        sessionRef: {
          providerSessionId: "session-3",
          discoveredAt: new Date().toISOString(),
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      agentStatus: {
        kind: "codex",
        label: "Codex",
        installed: true,
        authState: "authenticated",
        capabilities: {
          models: [{ id: "gpt-5.4", label: "5.4" }],
          efforts: ["low"],
          modelEfforts: {},
          modes: ["agent"],
          approvalPolicies: [{ id: "on-request", label: "On Request" }],
          sandboxModes: [{ id: "read-only", label: "Read Only" }],
          supportsResume: true,
          supportsDirectInput: true,
          liveInputMode: "server",
          presentationMode: "terminal",
          settingDefs: [],
        },
      },
      projectLocation: {
        kind: "windows",
        path: "C:\\repo",
      },
    });

    const input = screen.getByPlaceholderText("Ask Codex anything about this workspace");
    input.textContent = "test";
    fireEvent.input(input);

    expect(screen.getByLabelText("Send message")).toBeDisabled();
  });

  it("keeps terminal presentation inside the thread max-width shell", () => {
    renderThreadView({
      thread: {
        id: "thread-terminal-layout",
        projectId: "project-1",
        title: "Codex terminal thread",
        agentKind: "codex",
        config: {
          model: "gpt-5.4",
        },
        status: "idle",
        attention: "none",
        canResumeWithConfig: true,
        sessionRef: {
          providerSessionId: "session-layout",
          discoveredAt: new Date().toISOString(),
        },
        presentationMode: "terminal",
        archived: false,
        done: false,
        starred: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      agentStatus: {
        kind: "codex",
        label: "Codex",
        installed: true,
        authState: "authenticated",
        capabilities: {
          models: [{ id: "gpt-5.4", label: "5.4" }],
          efforts: ["low"],
          modelEfforts: {},
          modes: ["agent"],
          approvalPolicies: [{ id: "on-request", label: "On Request" }],
          sandboxModes: [{ id: "read-only", label: "Read Only" }],
          supportsResume: true,
          supportsDirectInput: true,
          liveInputMode: "server",
          presentationMode: "terminal",
          settingDefs: [],
        },
      },
      projectLocation: {
        kind: "windows",
        path: "C:\\repo",
      },
    });

    const terminalPane = screen.getByText("terminal pane");
    expect(hasAncestorWithClassFragment(terminalPane.parentElement, "max-w-[920px]")).toBe(true);
    expect(hasAncestorWithClassFragment(terminalPane.parentElement, "max-w-[1040px]")).toBe(true);
  });

  it("allows queued follow-ups and stop while a GUI ACP thread is running", async () => {
    renderThreadView({
      thread: {
        id: "thread-gui-working",
        projectId: "project-1",
        title: "Codex GUI thread",
        agentKind: "codex",
        config: {
          model: "gpt-5.4",
        },
        status: "working",
        attention: "none",
        canResumeWithConfig: true,
        sessionRef: {
          providerSessionId: "session-gui",
          discoveredAt: new Date().toISOString(),
        },
        presentationMode: "gui",
        archived: false,
        done: false,
        starred: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      agentStatus: {
        kind: "codex",
        label: "Codex",
        installed: true,
        authState: "authenticated",
        capabilities: {
          models: [{ id: "gpt-5.4", label: "5.4" }],
          efforts: ["low"],
          modelEfforts: {},
          modes: ["agent"],
          approvalPolicies: [{ id: "on-request", label: "On Request" }],
          sandboxModes: [{ id: "read-only", label: "Read Only" }],
          supportsResume: true,
          supportsDirectInput: true,
          liveInputMode: "server",
          presentationMode: "gui",
          settingDefs: [],
        },
      },
      projectLocation: {
        kind: "windows",
        path: "C:\\repo",
      },
    });

    // With empty input and agent working, stop button replaces send
    expect(screen.getByLabelText("Stop response")).toBeInTheDocument();

    const stopButton = screen.getByLabelText("Stop response");
    fireEvent.click(stopButton);

    await waitFor(() => {
      expect(bridge.interruptThread).toHaveBeenCalledWith({ threadId: "thread-gui-working" });
    });
    expect(stopButton.querySelector('[aria-label="Loading"]')).toBeInTheDocument();

    // After entering text, send button appears instead
    const input = screen.getByPlaceholderText("Ask Codex anything about this workspace");
    input.textContent = "test";
    fireEvent.input(input);

    expect(screen.getByLabelText("Send message")).not.toBeDisabled();
  });

  it("allows stopping a GUI provider before a session ref is discovered", async () => {
    renderThreadView({
      thread: {
        id: "thread-gui-starting",
        projectId: "project-1",
        title: "GUI thread",
        agentKind: "generic-gui",
        config: {
          model: "model-a",
        },
        status: "working",
        attention: "working",
        canResumeWithConfig: false,
        presentationMode: "gui",
        archived: false,
        done: false,
        starred: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      agentStatus: {
        kind: "generic-gui",
        label: "Generic",
        installed: true,
        authState: "authenticated",
        capabilities: {
          models: [{ id: "model-a", label: "Model A" }],
          efforts: ["low"],
          modelEfforts: {},
          modes: ["agent"],
          approvalPolicies: [{ id: "on-request", label: "On Request" }],
          sandboxModes: [{ id: "read-only", label: "Read Only" }],
          supportsResume: true,
          supportsDirectInput: true,
          liveInputMode: "server",
          presentationMode: "gui",
          settingDefs: [],
        },
      },
      projectLocation: {
        kind: "windows",
        path: "C:\\repo",
      },
    });

    fireEvent.click(screen.getByLabelText("Stop response"));

    await waitFor(() => {
      expect(bridge.interruptThread).toHaveBeenCalledWith({ threadId: "thread-gui-starting" });
    });
  });
});
