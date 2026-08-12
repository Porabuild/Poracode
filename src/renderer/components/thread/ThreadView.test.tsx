import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@/renderer/components/providers/bootstrap";
import type { Thread } from "@/shared/contracts";
import { closeAllPanels } from "@/renderer/actions/panelActions";
import { AppProvider } from "@/renderer/components/ui/provider";
import { useAppStore } from "@/renderer/state/appStore";
import { usePanelStore } from "@/renderer/state/panelStore";
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
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    useSharedSettings.setState({ agentSettings: {}, collapseTerminalComposer: false });
    useThreadTodoDockStore.setState({
      defaultPlacement: "composer",
      defaultCollapsed: false,
      byThreadId: {},
    });
    usePanelStore.setState({ rightPanelTab: "git" });
    useAppStore.setState({
      runtimeItemIdsByThread: {},
      runtimeItemsByIdByThread: {},
      runtimeRequestsByThread: {},
      provisioningWorktreeThreadIds: {},
    });
  });

  it("does not render MCP controls in active-thread headers", () => {
    renderThreadView({
      thread: {
        id: "thread-browser-mcp",
        projectId: "project-1",
        title: "Browser thread",
        agentKind: "codex",
        config: {
          model: "gpt-5.4",
          browserMcp: true,
          computerUse: true,
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

    expect(screen.queryByLabelText("Browser MCP enabled for this thread")).toBeNull();
    expect(
      screen.queryByLabelText(
        "Computer Use enabled — interactive actions take over the desktop; don't use the machine while the agent is controlling it",
      ),
    ).toBeNull();
    expect(screen.queryByLabelText("Disable Browser MCP")).toBeNull();
    expect(screen.queryByLabelText("Disable Computer Use")).toBeNull();
    expect(runtimeActions.changeThreadConfig).not.toHaveBeenCalled();
  });

  it("keeps thread actions reachable without duplicate compact title chrome", () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn((query: string) => ({
        media: query,
        matches: query === "(max-width: 767px)",
        onchange: null,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        addListener: () => undefined,
        removeListener: () => undefined,
        dispatchEvent: () => true,
      })),
    );

    const { container } = renderThreadView({
      thread: {
        id: "thread-mobile-header",
        projectId: "project-1",
        title: "Mobile thread",
        agentKind: "codex",
        config: { model: "gpt-5.4" },
        status: "idle",
        attention: "none",
        canResumeWithConfig: true,
        archived: false,
        done: false,
        starred: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      agentStatus: undefined,
      projectLocation: { kind: "windows", path: "C:\\repo" },
      onMarkDone: () => undefined,
    });

    const header = container.querySelector("[data-poracode-thread-header]");
    expect(header).toHaveAttribute("data-compact", "true");
    expect(header).not.toHaveClass("hidden");
    expect(header?.querySelector(".poracode-thread-pane-title")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Mark done" })).toBeInTheDocument();
    const toolsTrigger = screen.getByRole("button", { name: "Show thread tools" });
    const toolsMenu = toolsTrigger
      .closest("[data-poracode-thread-tool-rail]")
      ?.querySelector("[data-poracode-thread-tool-menu]");
    expect(toolsMenu).toHaveClass("invisible");

    fireEvent.click(toolsTrigger);

    expect(toolsTrigger).toHaveAttribute("aria-expanded", "true");
    expect(toolsMenu).toHaveClass("visible");
    fireEvent.click(screen.getByRole("button", { name: "Terminal" }));
    expect(toolsMenu).toHaveClass("invisible");
  });

  it("does not infer MCP enablement from the provider identity", () => {
    renderThreadView({
      thread: {
        id: "thread-opencode-browser-mcp",
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

    expect(screen.queryByLabelText("Browser MCP enabled for this thread")).toBeNull();
    expect(screen.queryByLabelText("Disable Browser MCP")).toBeNull();
    expect(runtimeActions.changeThreadConfig).not.toHaveBeenCalled();
  });

  it("starts a queued launch after the terminal reports its first size", async () => {
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
        analytics: {
          outcome: "accepted",
          requestType: "tool_user_input",
        },
      });
    });
  });

  it("keeps plan mode when a plan review asks for revisions", async () => {
    const now = new Date().toISOString();

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
        "thread-kimi-revise": [
          {
            requestId: "perm-plan",
            threadId: "thread-kimi-revise",
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
                { optionId: "plan_approve", label: "Approve" },
                { optionId: "plan_revise", label: "Revise" },
                { optionId: "plan_reject_and_exit", label: "Reject and Exit" },
              ],
            },
          },
        ],
      },
    });

    renderThreadView({
      thread: {
        id: "thread-kimi-revise",
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

    // "Revise" reads as positive to the negative-option pattern, but Kimi keeps
    // plan mode active for it — the composer must not drop out of plan mode.
    fireEvent.click(screen.getByRole("button", { name: "Revise" }));

    await waitFor(() => {
      expect(runtimeActions.resolveThreadServerRequest).toHaveBeenCalledWith("thread-kimi-revise", {
        requestId: "perm-plan",
        method: "requestPermission",
        response: { optionId: "plan_revise" },
        analytics: {
          outcome: "accepted",
          requestType: "tool_user_input",
        },
      });
    });
    expect(runtimeActions.changeThreadConfig).not.toHaveBeenCalled();
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

  it("moves the pinned todo dock into the unified right panel", () => {
    useAppStore.setState({
      view: { kind: "thread", panes: ["thread-gui-plan"] },
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
    expect(screen.queryByLabelText("Thread todo dock")).not.toBeInTheDocument();
    expect(useThreadTodoDockStore.getState().byThreadId["thread-gui-plan"]?.placement).toBe(
      "right",
    );
    expect(usePanelStore.getState().rightPanelTab).toBe("plan");

    act(() => closeAllPanels());
    expect(screen.getByLabelText("Thread todo dock")).toHaveAttribute("data-placement", "composer");
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
    useThreadTodoDockStore.getState().setCollapsed("thread-gui-plan-a", true);

    expect(useThreadTodoDockStore.getState().byThreadId["thread-gui-plan-a"]).toMatchObject({
      placement: "right",
      collapsed: true,
    });

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

  it("keeps header thread tools open while the pointer crosses into the menu", async () => {
    vi.useFakeTimers();
    try {
      renderThreadView({
        thread: {
          id: "thread-split-tool-menu",
          projectId: "project-1",
          title: "Split pane thread",
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
        agentStatus: undefined,
        projectLocation: {
          kind: "windows",
          path: "C:\\repo",
        },
        paneCount: 2,
        onMarkDone: () => undefined,
      });

      const headerTrigger = screen.getByRole("button", { name: "Show thread tools" });
      const headerMenu = headerTrigger.closest("[data-poracode-thread-tool-rail]");
      const toolMenu = headerMenu?.querySelector("[data-poracode-thread-tool-menu]");
      const doneButton = screen.getByRole("button", { name: "Mark done" });

      expect(headerMenu).toHaveAttribute("data-placement", "header");
      expect(headerMenu).not.toHaveClass("invisible");
      expect(toolMenu).toHaveClass("left-1/2", "w-9", "-translate-x-1/2");
      expect(toolMenu).toHaveClass("transition-opacity");
      expect(toolMenu).not.toHaveClass("grid-rows-[0fr]");
      expect(toolMenu).toHaveClass("invisible");
      expect(doneButton.nextElementSibling).toBe(headerMenu);
      expect(hasAncestorWithClassFragment(headerMenu as HTMLElement, "@container")).toBe(true);
      expect(headerMenu?.querySelector('[aria-label="Git"]')).not.toBeNull();
      expect(headerMenu?.querySelector('[aria-label="Files"]')).not.toBeNull();
      expect(headerMenu?.querySelector('[aria-label="Terminal"]')).not.toBeNull();
      expect(headerMenu?.querySelector('[aria-label="Notes"]')).not.toBeNull();

      fireEvent.pointerEnter(headerMenu as HTMLElement);
      expect(toolMenu).toHaveClass("pointer-events-auto", "visible", "opacity-100");
      expect(toolMenu).not.toHaveClass("pointer-events-none", "invisible", "opacity-0");

      fireEvent.pointerLeave(headerMenu as HTMLElement);
      expect(toolMenu).toHaveClass("visible");
      fireEvent.pointerEnter(toolMenu as HTMLElement);
      await act(() => vi.advanceTimersByTimeAsync(300));
      expect(toolMenu).toHaveClass("visible");

      fireEvent.pointerLeave(headerMenu as HTMLElement);
      await act(() => vi.advanceTimersByTimeAsync(300));
      expect(toolMenu).toHaveClass("invisible");

      fireEvent.pointerEnter(headerMenu as HTMLElement);
      fireEvent.click(headerTrigger);
      expect(toolMenu).toHaveClass("invisible");
      fireEvent.pointerLeave(headerMenu as HTMLElement);
      fireEvent.pointerEnter(headerMenu as HTMLElement);
      expect(toolMenu).toHaveClass("visible");
      fireEvent.click(headerTrigger);
    } finally {
      vi.useRealTimers();
    }
  });

  it("hides base-checkout thread tools while a new worktree is provisioning", async () => {
    const thread: Thread = {
      id: "thread-worktree-provisioning",
      projectId: "project-1",
      title: "Provisioning worktree",
      agentKind: "codex",
      config: { model: "gpt-5.4" },
      status: "launching",
      attention: "none",
      canResumeWithConfig: false,
      worktreeBranch: "poracode/feature",
      archived: false,
      done: false,
      starred: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const props: Parameters<typeof ThreadView>[0] = {
      thread,
      agentStatus: undefined,
      projectLocation: { kind: "windows", path: "C:\\repo" },
      paneCount: 2,
    };
    useAppStore.setState({
      provisioningWorktreeThreadIds: { [thread.id]: true },
    });
    const { rerender } = renderThreadView(props);

    expect(screen.queryByRole("button", { name: "Show thread tools" })).toBeNull();
    expect(screen.getByText("Creating worktree…")).toBeInTheDocument();

    rerender(
      <AppProvider>
        <ThreadView
          {...props}
          thread={{
            ...thread,
            status: "error",
            attention: "error",
            errorMessage: "Host refused launch",
            worktreePath: "C:\\worktrees\\feature",
          }}
        />
      </AppProvider>,
    );

    expect(screen.getByRole("button", { name: "Show thread tools" })).toBeInTheDocument();
    expect(screen.queryByText("Creating worktree…")).toBeNull();
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
