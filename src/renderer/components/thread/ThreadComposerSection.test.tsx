import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { toast } from "@heroui/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import type { AgentStatus, Thread } from "@/shared/contracts";
import { useAppStore } from "@/renderer/state/appStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { useThreadTodoDockStore } from "@/renderer/state/threadTodoDockStore";
import { ThreadComposerSection } from "./ThreadComposerSection";
import type { ThreadErrorDockState } from "./threadErrorState";

const bridgeMock = vi.hoisted(() => ({
  isRemoteSession: vi.fn<() => boolean>(() => false),
  clearPendingSteer: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  interruptThread: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  refreshAgentStatuses: vi
    .fn<() => Promise<{ windows: AgentStatus[]; wsl: AgentStatus[] }>>()
    .mockResolvedValue({ windows: [], wsl: [] }),
}));

const runtimeActions = vi.hoisted(() => ({
  changeThreadConfig: vi.fn<() => void>(),
  resolveThreadServerRequest: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  submitThreadInput: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
}));

vi.mock("@/renderer/actions/threadRuntimeActions", () => ({
  changeThreadConfig: runtimeActions.changeThreadConfig,
  resolveThreadServerRequest: runtimeActions.resolveThreadServerRequest,
  submitThreadInput: runtimeActions.submitThreadInput,
}));

vi.mock("../../bridge", () => ({
  isRemoteSession: bridgeMock.isRemoteSession,
  readBridge: () => ({
    pickFiles: vi.fn<() => Promise<string[] | undefined>>().mockResolvedValue(undefined),
    clearPendingSteer: bridgeMock.clearPendingSteer,
    interruptThread: bridgeMock.interruptThread,
    setPendingSteer: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    writeTerminal: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    refreshAgentStatuses: bridgeMock.refreshAgentStatuses,
  }),
}));

const toastDangerSpy = vi.spyOn(toast, "danger").mockImplementation(() => undefined as never);

vi.mock("./ThreadComposer", () => ({
  ThreadComposer: (props: {
    controls?: Array<{
      kind?: string;
      label?: string;
      currentModel?: string;
      effortValue?: string;
    }>;
    fixedContent?: ReactNode;
    inputContent?: ReactNode;
    onAttachFiles?: (paths: string[]) => void;
    onStop?: () => void;
    onSubmit: () => void;
    submitDisabled?: boolean;
  }) => (
    <div>
      {props.fixedContent}
      {props.inputContent}
      <output data-testid="control-kinds">
        {props.controls?.map((control) => control.kind ?? control.label ?? "").join(",") ?? ""}
      </output>
      <output data-testid="attach-files-enabled">{props.onAttachFiles ? "yes" : "no"}</output>
      {props.onStop && props.submitDisabled ? (
        <button type="button" aria-label="Stop response" onClick={props.onStop}>
          stop
        </button>
      ) : null}
      <button type="button" onClick={props.onSubmit}>
        send
      </button>
    </div>
  ),
}));

const guiThread: Thread = {
  id: "thread-gui-idle",
  projectId: "project-1",
  title: "Codex GUI thread",
  agentKind: "codex",
  config: {
    model: "gpt-5.4",
  },
  status: "idle",
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
};

const codexGuiStatus: AgentStatus = {
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
};

const terminalThread: Thread = {
  ...guiThread,
  id: "thread-terminal-idle",
  agentKind: "claude",
  config: { model: "claude" },
  presentationMode: "terminal",
};

const claudeTerminalStatus: AgentStatus = {
  kind: "claude",
  label: "Claude",
  installed: true,
  authState: "authenticated",
  capabilities: {
    models: [{ id: "claude", label: "Claude" }],
    efforts: [],
    modelEfforts: {},
    modes: ["agent"],
    approvalPolicies: [],
    sandboxModes: [],
    supportsResume: true,
    supportsDirectInput: true,
    liveInputMode: "terminal",
    presentationMode: "terminal",
    settingDefs: [],
  },
};

describe("ThreadComposerSection", () => {
  beforeEach(() => {
    useSharedSettings.setState({ collapseTerminalComposer: false });
    useThreadTodoDockStore.setState({
      defaultPlacement: "composer",
      defaultCollapsed: false,
      byThreadId: {},
    });
    useAppStore.setState({
      runtimeItemIdsByThread: {},
      runtimeItemsByIdByThread: {},
      runtimeRequestsByThread: {},
      pendingSteerByThreadId: {},
      threadDraftContents: {},
    });
    bridgeMock.isRemoteSession.mockReturnValue(false);
    bridgeMock.clearPendingSteer.mockClear();
    bridgeMock.clearPendingSteer.mockResolvedValue(undefined);
    bridgeMock.refreshAgentStatuses.mockClear();
    bridgeMock.interruptThread.mockClear();
    bridgeMock.interruptThread.mockResolvedValue(undefined);
    runtimeActions.changeThreadConfig.mockClear();
    runtimeActions.resolveThreadServerRequest.mockClear();
    runtimeActions.resolveThreadServerRequest.mockResolvedValue(undefined);
    runtimeActions.submitThreadInput.mockClear();
    runtimeActions.submitThreadInput.mockResolvedValue(undefined);
    toastDangerSpy.mockClear();
  });

  function composerElement(opts?: {
    thread?: Thread;
    agentStatus?: AgentStatus;
    errorDockStates?: ThreadErrorDockState[];
    onSubmitInput?: (prompt: string, segments?: unknown) => Promise<void>;
    onOpenProjectRelativePath?: (path: string, lineNumber?: number) => void;
  }) {
    const thread = opts?.thread ?? guiThread;
    const agentStatus = opts?.agentStatus ?? codexGuiStatus;
    return (
      <ThreadComposerSection
        threadId={thread.id}
        fallbackThread={thread}
        agentStatus={agentStatus}
        projectLocation={{ kind: "windows", path: "C:\\repo" }}
        paneCount={1}
        terminalPaneRef={{ current: null }}
        todoDockCollapsed={false}
        todoDockPlacement="composer"
        todoDockState={null}
        goalDockState={null}
        errorDockStates={opts?.errorDockStates ?? []}
        onGoalDockDismiss={() => undefined}
        onDismissError={() => undefined}
        {...(opts?.onSubmitInput ? { onSubmitInput: opts.onSubmitInput } : {})}
        {...(opts?.onOpenProjectRelativePath
          ? { onOpenProjectRelativePath: opts.onOpenProjectRelativePath }
          : {})}
        onTodoDockCollapsedChange={() => undefined}
        onTodoDockPlacementChange={() => undefined}
      />
    );
  }

  function renderComposer(opts?: {
    thread?: Thread;
    agentStatus?: AgentStatus;
    errorDockStates?: ThreadErrorDockState[];
    onSubmitInput?: ReturnType<typeof vi.fn<(prompt: string, segments?: unknown) => Promise<void>>>;
    onOpenProjectRelativePath?: (path: string, lineNumber?: number) => void;
  }) {
    const onSubmitInput =
      opts?.onSubmitInput ??
      vi.fn<(prompt: string, segments?: unknown) => Promise<void>>(() => Promise.resolve());
    const result = render(composerElement({ ...opts, onSubmitInput }));
    return { ...result, onSubmitInput };
  }

  it("hides provider controls for active terminal threads", () => {
    renderComposer({
      thread: { ...terminalThread, config: { model: "claude", effort: "low" } },
      agentStatus: {
        ...claudeTerminalStatus,
        capabilities: {
          ...claudeTerminalStatus.capabilities,
          models: [
            { id: "claude", label: "Claude" },
            { id: "opus", label: "Opus" },
          ],
          efforts: ["low", "high"],
          modelEfforts: {
            claude: ["low", "high"],
            opus: ["high"],
          },
        },
      },
    });

    expect(screen.getByTestId("control-kinds")).toBeEmptyDOMElement();
  });

  it("hides the terminal composer collapse button in remote sessions", () => {
    const { unmount } = renderComposer({
      thread: terminalThread,
      agentStatus: claudeTerminalStatus,
    });
    expect(screen.getByRole("button", { name: "Collapse composer" })).toBeInTheDocument();
    unmount();

    bridgeMock.isRemoteSession.mockReturnValue(true);
    renderComposer({
      thread: terminalThread,
      agentStatus: claudeTerminalStatus,
    });

    expect(screen.queryByRole("button", { name: "Collapse composer" })).not.toBeInTheDocument();
  });

  it("preserves an unsent draft when the composer unmounts and restores it on remount", async () => {
    const { unmount } = renderComposer();

    const input = screen.getByRole("textbox");
    input.appendChild(document.createTextNode("half-written thought"));
    fireEvent.input(input);

    unmount();

    expect(useAppStore.getState().threadDraftContents[guiThread.id]?.segments).toEqual([
      { kind: "text", content: "half-written thought" },
    ]);

    renderComposer();

    await waitFor(() => {
      expect(screen.getByRole("textbox").textContent).toContain("half-written thought");
    });
    // The draft is consumed on restore so a later real send can't resurrect it.
    expect(useAppStore.getState().threadDraftContents[guiThread.id]).toBeUndefined();
  });

  it("does not leave a draft behind once the message is sent", async () => {
    const { unmount, onSubmitInput } = renderComposer();

    const input = screen.getByRole("textbox");
    input.appendChild(document.createTextNode("ship it"));
    fireEvent.input(input);
    fireEvent.click(screen.getByText("send"));

    await waitFor(() => {
      expect(onSubmitInput).toHaveBeenCalledWith("ship it", [{ kind: "text", content: "ship it" }]);
    });

    unmount();

    expect(useAppStore.getState().threadDraftContents[guiThread.id]).toBeUndefined();
  });

  it("does not re-save an in-flight terminal send as a stale draft when navigating away", async () => {
    // Terminal threads clear the composer only after the send resolves, so the
    // unmount cleanup must skip saving while a submit is in flight.
    let resolveSubmit: (() => void) | undefined;
    const onSubmitInput = vi.fn<(prompt: string, segments?: unknown) => Promise<void>>(
      () =>
        new Promise<void>((resolve) => {
          resolveSubmit = resolve;
        }),
    );
    const { unmount } = renderComposer({
      thread: terminalThread,
      agentStatus: claudeTerminalStatus,
      onSubmitInput,
    });

    const input = screen.getByRole("textbox");
    input.appendChild(document.createTextNode("terminal message"));
    fireEvent.input(input);
    fireEvent.click(screen.getByText("send"));

    await waitFor(() => {
      expect(onSubmitInput).toHaveBeenCalledWith("terminal message", [
        { kind: "text", content: "terminal message" },
      ]);
    });

    // Send is still pending — navigating away must not stash the sent text.
    unmount();
    expect(useAppStore.getState().threadDraftContents[terminalThread.id]).toBeUndefined();

    await act(async () => {
      resolveSubmit?.();
      await Promise.resolve();
    });
  });

  it("defers a terminal thread's draft restore until the composer mounts after launching", async () => {
    useAppStore.setState({
      threadDraftContents: {
        [terminalThread.id]: {
          segments: [{ kind: "text", content: "resume me" }],
          attachments: [],
        },
      },
    });

    const { rerender } = render(
      composerElement({
        thread: { ...terminalThread, status: "launching" },
        agentStatus: claudeTerminalStatus,
      }),
    );

    // While launching, the terminal composer (and its editor) is not rendered,
    // so the draft must be left intact rather than silently consumed.
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(useAppStore.getState().threadDraftContents[terminalThread.id]).toBeDefined();

    // Same instance leaves launching → editor mounts → draft restores + consumes.
    rerender(composerElement({ thread: terminalThread, agentStatus: claudeTerminalStatus }));

    await waitFor(() => {
      expect(screen.getByRole("textbox").textContent).toContain("resume me");
    });
    expect(useAppStore.getState().threadDraftContents[terminalThread.id]).toBeUndefined();
  });

  it("clears the GUI ACP composer as soon as a direct send starts", async () => {
    let resolveSubmit: (() => void) | undefined;
    const onSubmitInput = vi.fn<(prompt: string, segments?: unknown) => Promise<void>>(
      () =>
        new Promise((resolve) => {
          resolveSubmit = resolve;
        }),
    );

    render(
      <ThreadComposerSection
        threadId={guiThread.id}
        fallbackThread={guiThread}
        agentStatus={codexGuiStatus}
        projectLocation={{
          kind: "windows",
          path: "C:\\repo",
        }}
        paneCount={1}
        terminalPaneRef={{ current: null }}
        todoDockCollapsed={false}
        todoDockPlacement="composer"
        todoDockState={null}
        goalDockState={null}
        errorDockStates={[]}
        onGoalDockDismiss={() => undefined}
        onDismissError={() => undefined}
        onSubmitInput={onSubmitInput}
        onTodoDockCollapsedChange={() => undefined}
        onTodoDockPlacementChange={() => undefined}
      />,
    );

    const input = screen.getByRole("textbox");
    input.appendChild(document.createTextNode("slow send"));
    fireEvent.input(input);
    fireEvent.click(screen.getByText("send"));

    expect(input.textContent).toBe("");
    await waitFor(() => {
      expect(onSubmitInput).toHaveBeenCalledWith("slow send", [
        { kind: "text", content: "slow send" },
      ]);
    });

    await act(async () => {
      resolveSubmit?.();
      await Promise.resolve();
    });
  });

  it("reports active-thread send failures and restores the GUI composer", async () => {
    const onSubmitInput = vi
      .fn<(prompt: string, segments?: unknown) => Promise<void>>()
      .mockRejectedValue(new Error("send failed"));

    renderComposer({ onSubmitInput });

    const input = screen.getByRole("textbox");
    input.appendChild(document.createTextNode("retry me"));
    fireEvent.input(input);
    fireEvent.click(screen.getByText("send"));

    await waitFor(() => {
      expect(toastDangerSpy).toHaveBeenCalledWith("send failed");
    });
    expect(screen.getByRole("textbox")).toHaveTextContent("retry me");
  });

  it("restores approval requests and composer text when auto-deny before submit fails", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    runtimeActions.resolveThreadServerRequest.mockRejectedValueOnce(new Error("deny failed"));
    const onSubmitInput = vi
      .fn<(prompt: string, segments?: unknown) => Promise<void>>()
      .mockResolvedValue(undefined);
    useAppStore.setState({
      runtimeRequestsByThread: {
        [guiThread.id]: [
          {
            requestId: "approval-before-submit",
            threadId: guiThread.id,
            requestType: "command_execution_approval",
            payload: { summary: "Run first" },
            receivedAt: new Date().toISOString(),
          },
        ],
      },
    });

    renderComposer({ onSubmitInput });

    const input = screen.getByRole("textbox");
    input.appendChild(document.createTextNode("do this instead"));
    fireEvent.input(input);
    fireEvent.click(screen.getByText("send"));

    await waitFor(() => {
      expect(toastDangerSpy).toHaveBeenCalledWith("deny failed");
    });
    expect(onSubmitInput).not.toHaveBeenCalled();
    expect(screen.getByText("Run first")).toBeInTheDocument();
    expect(screen.getByRole("textbox")).toHaveTextContent("do this instead");
    expect(useAppStore.getState().runtimeRequestsByThread[guiThread.id]).toEqual([
      expect.objectContaining({ requestId: "approval-before-submit" }),
    ]);
    consoleError.mockRestore();
  });

  it("shows an auth row and blocks active-thread input when the agent needs login", () => {
    const onSubmitInput = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    render(
      <ThreadComposerSection
        threadId={guiThread.id}
        fallbackThread={guiThread}
        agentStatus={{ ...codexGuiStatus, authState: "missing", loginCommand: "codex login" }}
        projectLocation={{
          kind: "windows",
          path: "C:\\repo",
        }}
        paneCount={1}
        terminalPaneRef={{ current: null }}
        todoDockCollapsed={false}
        todoDockPlacement="composer"
        todoDockState={null}
        goalDockState={null}
        errorDockStates={[]}
        onGoalDockDismiss={() => undefined}
        onDismissError={() => undefined}
        onSubmitInput={onSubmitInput}
        onTodoDockCollapsedChange={() => undefined}
        onTodoDockPlacementChange={() => undefined}
      />,
    );

    expect(screen.getByText("Sign in required")).toBeInTheDocument();
    const input = screen.getByRole("textbox");
    input.appendChild(document.createTextNode("should not send"));
    fireEvent.input(input);
    fireEvent.click(screen.getByText("send"));

    expect(onSubmitInput).not.toHaveBeenCalled();
  });

  it("keeps remote auth docks actionable without desktop-only login controls", async () => {
    bridgeMock.isRemoteSession.mockReturnValue(true);
    renderComposer({
      thread: terminalThread,
      agentStatus: {
        ...claudeTerminalStatus,
        authState: "missing",
        loginCommand: "claude login",
      },
    });

    expect(screen.getByText("Sign in required")).toBeInTheDocument();
    expect(
      screen.getByText("Claude: Sign in on the paired desktop, then refresh this status."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Login" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Settings" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Refresh Claude authentication" }));

    await waitFor(() => {
      expect(bridgeMock.refreshAgentStatuses).toHaveBeenCalledTimes(1);
    });
  });

  it("disables desktop-local attachment drops in remote sessions", () => {
    renderComposer();
    expect(screen.getByTestId("attach-files-enabled")).toHaveTextContent("yes");

    bridgeMock.isRemoteSession.mockReturnValue(true);
    renderComposer();
    expect(screen.getAllByTestId("attach-files-enabled").at(-1)!).toHaveTextContent("no");
  });

  it("shows generic error docks for remote terminal sessions only", () => {
    const errorDockStates = [{ sourceItemId: "err-1", message: "Tool failed remotely." }];
    const { unmount } = renderComposer({
      thread: terminalThread,
      agentStatus: claudeTerminalStatus,
      errorDockStates,
    });

    expect(screen.queryByText("Tool failed remotely.")).not.toBeInTheDocument();
    unmount();

    bridgeMock.isRemoteSession.mockReturnValue(true);
    renderComposer({
      thread: terminalThread,
      agentStatus: claudeTerminalStatus,
      errorDockStates,
    });

    expect(screen.getByText("Tool failed remotely.")).toBeInTheDocument();
  });

  it("keeps runtime approval requests actionable in remote terminal sessions", async () => {
    bridgeMock.isRemoteSession.mockReturnValue(true);
    useAppStore.setState({
      runtimeRequestsByThread: {
        [terminalThread.id]: [
          {
            requestId: "terminal-approval",
            threadId: terminalThread.id,
            requestType: "command_execution_approval",
            payload: { summary: "Run mobile terminal command" },
            receivedAt: new Date().toISOString(),
          },
        ],
      },
    });

    renderComposer({
      thread: terminalThread,
      agentStatus: claudeTerminalStatus,
    });

    expect(screen.getByText("Run mobile terminal command")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Allow" }));

    await waitFor(() => {
      expect(runtimeActions.resolveThreadServerRequest).toHaveBeenCalledWith(terminalThread.id, {
        requestId: "terminal-approval",
        method: "requestPermission",
        response: { optionId: "allow" },
      });
    });
  });

  it("restores runtime approval requests when resolving fails", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    runtimeActions.resolveThreadServerRequest.mockRejectedValueOnce(new Error("approval failed"));
    useAppStore.setState({
      runtimeRequestsByThread: {
        [guiThread.id]: [
          {
            requestId: "approval-fails",
            threadId: guiThread.id,
            requestType: "command_execution_approval",
            payload: { summary: "Run fragile command" },
            receivedAt: new Date().toISOString(),
          },
        ],
      },
    });

    renderComposer();

    fireEvent.click(screen.getByRole("button", { name: "Allow" }));

    await waitFor(() => {
      expect(toastDangerSpy).toHaveBeenCalledWith("approval failed");
    });
    expect(screen.getByText("Run fragile command")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Allow" })).toBeEnabled();
    expect(useAppStore.getState().runtimeRequestsByThread[guiThread.id]).toEqual([
      expect.objectContaining({ requestId: "approval-fails" }),
    ]);
    consoleError.mockRestore();
  });

  it("shows todo and goal docks in remote terminal sessions only", () => {
    const terminalTodoDockState = {
      sourceItemId: "plan-1",
      itemState: "completed" as const,
      steps: [{ text: "Patch mobile runtime chrome", status: "pending" as const }],
      activeIndex: 0,
      sourceKind: "steps" as const,
    };
    const terminalGoalDockState = {
      sourceItemId: "goal-1",
      itemState: "completed" as const,
      objective: "No mobile dead ends",
      status: "active" as const,
      action: "set" as const,
    };
    const renderTerminalDocks = () =>
      render(
        <ThreadComposerSection
          threadId={terminalThread.id}
          fallbackThread={terminalThread}
          agentStatus={claudeTerminalStatus}
          projectLocation={{ kind: "windows", path: "C:\\repo" }}
          paneCount={1}
          terminalPaneRef={{ current: null }}
          todoDockCollapsed={false}
          todoDockPlacement="composer"
          todoDockState={terminalTodoDockState}
          goalDockState={terminalGoalDockState}
          errorDockStates={[]}
          onGoalDockDismiss={() => undefined}
          onDismissError={() => undefined}
          onSubmitInput={async () => undefined}
          onTodoDockCollapsedChange={() => undefined}
          onTodoDockPlacementChange={() => undefined}
        />,
      );

    const { unmount } = renderTerminalDocks();
    expect(screen.queryByLabelText("Thread todo dock")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Thread goal dock")).not.toBeInTheDocument();
    unmount();

    bridgeMock.isRemoteSession.mockReturnValue(true);
    renderTerminalDocks();

    expect(screen.getByLabelText("Thread todo dock")).toHaveTextContent(
      "Patch mobile runtime chrome",
    );
    expect(screen.getByLabelText("Thread goal dock")).toHaveTextContent("No mobile dead ends");
  });

  it("exposes interrupt for remote terminal sessions while a turn is working", () => {
    bridgeMock.isRemoteSession.mockReturnValue(true);
    renderComposer({
      thread: {
        ...terminalThread,
        id: "thread-terminal-working",
        status: "working",
        attention: "working",
      },
      agentStatus: claudeTerminalStatus,
    });

    fireEvent.click(screen.getByRole("button", { name: "Stop response" }));

    expect(bridgeMock.interruptThread).toHaveBeenCalledWith({
      threadId: "thread-terminal-working",
    });
  });

  it("reports failed remote terminal interrupts instead of only logging them", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    bridgeMock.isRemoteSession.mockReturnValue(true);
    bridgeMock.interruptThread.mockRejectedValueOnce(new Error("interrupt failed"));
    renderComposer({
      thread: {
        ...terminalThread,
        id: "thread-terminal-working",
        status: "working",
        attention: "working",
      },
      agentStatus: claudeTerminalStatus,
    });

    fireEvent.click(screen.getByRole("button", { name: "Stop response" }));

    await waitFor(() => {
      expect(toastDangerSpy).toHaveBeenCalledWith("interrupt failed");
    });
    consoleError.mockRestore();
  });

  it("reports failed pending steer cancellation", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    bridgeMock.clearPendingSteer.mockRejectedValueOnce(new Error("cancel failed"));
    useAppStore.setState({
      pendingSteerByThreadId: {
        [guiThread.id]: {
          id: "pending-1",
          prompt: "Actually inspect the diff first",
          stagedAt: Date.now(),
        },
      },
    });

    renderComposer({
      thread: { ...guiThread, status: "working", attention: "working" },
      agentStatus: codexGuiStatus,
    });

    fireEvent.click(screen.getByRole("button", { name: "Cancel pending steer" }));

    await waitFor(() => {
      expect(toastDangerSpy).toHaveBeenCalledWith("cancel failed");
    });
    expect(bridgeMock.clearPendingSteer).toHaveBeenCalledWith({ threadId: guiThread.id });
    consoleError.mockRestore();
  });

  it("keeps queued runtime approval requests actionable after resolving the first one", async () => {
    let resolveRequest: (() => void) | undefined;
    runtimeActions.resolveThreadServerRequest.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveRequest = resolve;
        }),
    );
    useAppStore.setState({
      runtimeRequestsByThread: {
        [guiThread.id]: [
          {
            requestId: "r1",
            threadId: guiThread.id,
            requestType: "command_execution_approval",
            payload: { summary: "Run first command" },
            receivedAt: new Date().toISOString(),
          },
          {
            requestId: "r2",
            threadId: guiThread.id,
            requestType: "command_execution_approval",
            payload: { summary: "Run second command" },
            receivedAt: new Date().toISOString(),
          },
        ],
      },
    });

    render(
      <ThreadComposerSection
        threadId={guiThread.id}
        fallbackThread={guiThread}
        agentStatus={codexGuiStatus}
        projectLocation={{
          kind: "windows",
          path: "C:\\repo",
        }}
        paneCount={1}
        terminalPaneRef={{ current: null }}
        todoDockCollapsed={false}
        todoDockPlacement="composer"
        todoDockState={null}
        goalDockState={null}
        errorDockStates={[]}
        onGoalDockDismiss={() => undefined}
        onDismissError={() => undefined}
        onSubmitInput={async () => undefined}
        onTodoDockCollapsedChange={() => undefined}
        onTodoDockPlacementChange={() => undefined}
      />,
    );

    expect(screen.getByText("Run first command")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Allow" }));

    await waitFor(() => {
      expect(screen.getByText("Run second command")).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "Allow" })).toBeEnabled();

    await act(async () => {
      resolveRequest?.();
      await Promise.resolve();
    });
  });

  it("routes plan file opens through the mobile workspace callback when provided", () => {
    const onOpenProjectRelativePath = vi.fn<(path: string, lineNumber?: number) => void>();
    useAppStore.setState({
      projects: [
        {
          id: "project-1",
          name: "Repo",
          location: { kind: "windows", path: "C:\\repo" },
          createdAt: new Date().toISOString(),
        },
      ],
      runtimeRequestsByThread: {
        [guiThread.id]: [
          {
            requestId: "plan-approval",
            threadId: guiThread.id,
            requestType: "tool_user_input",
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
              ],
            },
            receivedAt: new Date().toISOString(),
          },
        ],
      },
    });

    renderComposer({ onOpenProjectRelativePath });

    fireEvent.click(screen.getByRole("button", { name: "Open plan" }));

    expect(onOpenProjectRelativePath).toHaveBeenCalledWith(
      "C:\\Users\\sdsle\\.claude\\plans\\plan.md",
    );
  });

  it("renders multi-question user input forms with answer options instead of approval fallback buttons", async () => {
    useAppStore.setState({
      runtimeRequestsByThread: {
        [guiThread.id]: [
          {
            requestId: "claude-question-1",
            threadId: guiThread.id,
            requestType: "tool_user_input",
            payload: {
              summary: "Which split scope should I execute?",
              details: {
                userInputForm: {
                  questions: [
                    {
                      question: "Which split scope should I execute?",
                      header: "Scope",
                      options: [
                        {
                          optionId: "Scope A: minimal",
                          label: "Scope A: minimal",
                          description: "Add the runtime package only.",
                        },
                        {
                          optionId: "Scope B: app-only",
                          label: "Scope B: app-only",
                          description: "Move desktop app source only.",
                        },
                      ],
                    },
                    {
                      question: "Should I run validation after each phase?",
                      header: "Validation cadence",
                      options: [
                        {
                          optionId: "After each phase",
                          label: "After each phase",
                          description: "Land in incremental chunks.",
                        },
                      ],
                    },
                  ],
                },
              },
            },
            receivedAt: new Date().toISOString(),
          },
        ],
      },
    });

    render(
      <ThreadComposerSection
        threadId={guiThread.id}
        fallbackThread={guiThread}
        agentStatus={codexGuiStatus}
        projectLocation={{
          kind: "windows",
          path: "C:\\repo",
        }}
        paneCount={1}
        terminalPaneRef={{ current: null }}
        todoDockCollapsed={false}
        todoDockPlacement="composer"
        todoDockState={null}
        goalDockState={null}
        errorDockStates={[]}
        onGoalDockDismiss={() => undefined}
        onDismissError={() => undefined}
        onSubmitInput={async () => undefined}
        onTodoDockCollapsedChange={() => undefined}
        onTodoDockPlacementChange={() => undefined}
      />,
    );

    expect(screen.getByText("Scope A: minimal")).toBeInTheDocument();
    expect(screen.queryByText("After each phase")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Allow" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Deny" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("Scope A: minimal"));
    expect(screen.getByText("After each phase")).toBeInTheDocument();
    fireEvent.click(screen.getByText("After each phase"));
    fireEvent.click(screen.getByRole("tab", { name: /Scope/ }));
    fireEvent.click(screen.getByText("Scope B: app-only"));
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));

    await waitFor(() => {
      expect(runtimeActions.resolveThreadServerRequest).toHaveBeenCalledWith(guiThread.id, {
        requestId: "claude-question-1",
        method: "requestPermission",
        response: {
          answers: {
            "Which split scope should I execute?": "Scope B: app-only",
            "Should I run validation after each phase?": "After each phase",
          },
        },
      });
    });
  });

  it("keeps long permission details in a scrollable region so actions remain available", () => {
    const longCommand = Array.from({ length: 60 }, (_, index) => `patch line ${index + 1}`).join(
      "\n",
    );
    useAppStore.setState({
      runtimeRequestsByThread: {
        [guiThread.id]: [
          {
            requestId: "approval-long",
            threadId: guiThread.id,
            requestType: "command_execution_approval",
            payload: {
              summary: "Permission required",
              details: {
                toolName: "Edit",
                input: { command: longCommand },
              },
            },
            receivedAt: new Date().toISOString(),
          },
        ],
      },
    });

    render(
      <ThreadComposerSection
        threadId={guiThread.id}
        fallbackThread={guiThread}
        agentStatus={codexGuiStatus}
        projectLocation={{
          kind: "windows",
          path: "C:\\repo",
        }}
        paneCount={1}
        terminalPaneRef={{ current: null }}
        todoDockCollapsed={false}
        todoDockPlacement="composer"
        todoDockState={null}
        goalDockState={null}
        errorDockStates={[]}
        onGoalDockDismiss={() => undefined}
        onDismissError={() => undefined}
        onSubmitInput={async () => undefined}
        onTodoDockCollapsedChange={() => undefined}
        onTodoDockPlacementChange={() => undefined}
      />,
    );

    const details = screen.getByRole("region", { name: "Request details" });
    expect(details).toHaveClass("overflow-y-auto");
    expect(details).toHaveClass("max-h-[min(12rem,35vh)]");
    expect(screen.getByRole("button", { name: "Allow" })).toHaveClass("button--tertiary");
    expect(screen.getByRole("button", { name: "Deny" })).toHaveClass("button--ghost");
  });

  it("submits Codex multi-question user input in Codex-native response shape", async () => {
    useAppStore.setState({
      runtimeRequestsByThread: {
        [guiThread.id]: [
          {
            requestId: "codex-question-1",
            threadId: guiThread.id,
            requestType: "tool_user_input",
            payload: {
              summary: "Input requested",
              details: {
                codexUserInput: {
                  questions: [
                    {
                      id: "scope",
                      header: "Scope",
                      question: "Which scope?",
                      options: [{ label: "Scope A", description: "Minimal" }],
                    },
                    {
                      id: "validation",
                      header: "Validation",
                      question: "Which validation?",
                      options: [{ label: "After each phase", description: "Incremental" }],
                    },
                  ],
                },
              },
            },
            receivedAt: new Date().toISOString(),
          },
        ],
      },
    });

    render(
      <ThreadComposerSection
        threadId={guiThread.id}
        fallbackThread={guiThread}
        agentStatus={codexGuiStatus}
        projectLocation={{
          kind: "windows",
          path: "C:\\repo",
        }}
        paneCount={1}
        terminalPaneRef={{ current: null }}
        todoDockCollapsed={false}
        todoDockPlacement="composer"
        todoDockState={null}
        goalDockState={null}
        errorDockStates={[]}
        onGoalDockDismiss={() => undefined}
        onDismissError={() => undefined}
        onSubmitInput={async () => undefined}
        onTodoDockCollapsedChange={() => undefined}
        onTodoDockPlacementChange={() => undefined}
      />,
    );

    fireEvent.click(screen.getByText("Scope A"));
    fireEvent.click(screen.getByText("After each phase"));
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));

    await waitFor(() => {
      expect(runtimeActions.resolveThreadServerRequest).toHaveBeenCalledWith(guiThread.id, {
        requestId: "codex-question-1",
        method: "requestPermission",
        response: {
          answers: {
            scope: { answers: ["Scope A"] },
            validation: { answers: ["After each phase"] },
          },
        },
      });
    });
  });

  it("submits ACP elicitation forms in ACP response shape", async () => {
    useAppStore.setState({
      runtimeRequestsByThread: {
        [guiThread.id]: [
          {
            requestId: "acp-elicit-1",
            threadId: guiThread.id,
            requestType: "tool_user_input",
            payload: {
              summary: "Choose deployment scope",
              details: {
                acpElicitation: {
                  mode: "form",
                  message: "Choose deployment scope",
                  requestedSchema: {
                    type: "object",
                    required: ["scope"],
                    properties: {
                      scope: {
                        type: "string",
                        title: "Scope",
                        enum: ["Scope A", "Scope B"],
                      },
                      confirm: {
                        type: "boolean",
                        title: "Confirm",
                      },
                    },
                  },
                },
              },
            },
            receivedAt: new Date().toISOString(),
          },
        ],
      },
    });

    render(
      <ThreadComposerSection
        threadId={guiThread.id}
        fallbackThread={guiThread}
        agentStatus={codexGuiStatus}
        projectLocation={{
          kind: "windows",
          path: "C:\\repo",
        }}
        paneCount={1}
        terminalPaneRef={{ current: null }}
        todoDockCollapsed={false}
        todoDockPlacement="composer"
        todoDockState={null}
        goalDockState={null}
        errorDockStates={[]}
        onGoalDockDismiss={() => undefined}
        onDismissError={() => undefined}
        onSubmitInput={async () => undefined}
        onTodoDockCollapsedChange={() => undefined}
        onTodoDockPlacementChange={() => undefined}
      />,
    );

    expect(screen.getByText("ACP agent needs input.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Allow" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Deny" })).not.toBeInTheDocument();

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "Scope B" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "Confirm" }));
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));

    await waitFor(() => {
      expect(runtimeActions.resolveThreadServerRequest).toHaveBeenCalledWith(guiThread.id, {
        requestId: "acp-elicit-1",
        method: "requestPermission",
        response: {
          action: "accept",
          content: {
            scope: "Scope B",
            confirm: true,
          },
        },
      });
    });
  });
});
