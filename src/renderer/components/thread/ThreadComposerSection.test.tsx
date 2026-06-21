import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentStatus, Thread } from "@/shared/contracts";
import { useAppStore } from "@/renderer/state/appStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { useThreadTodoDockStore } from "@/renderer/state/threadTodoDockStore";
import { ThreadComposerSection } from "./ThreadComposerSection";

vi.mock("../../bridge", () => ({
  isRemoteSession: () => false,
  readBridge: () => ({
    pickFiles: vi.fn<() => Promise<string[] | undefined>>().mockResolvedValue(undefined),
    setPendingSteer: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  }),
}));

vi.mock("./ThreadComposer", () => ({
  ThreadComposer: (props: {
    fixedContent?: ReactNode;
    inputContent?: ReactNode;
    onSubmit: () => void;
  }) => (
    <div>
      {props.fixedContent}
      {props.inputContent}
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
    });
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
        onConfigChange={() => undefined}
        onResolveServerRequest={async () => undefined}
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
        onConfigChange={() => undefined}
        onResolveServerRequest={async () => undefined}
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

  it("keeps queued runtime approval requests actionable after resolving the first one", async () => {
    let resolveRequest: (() => void) | undefined;
    const onResolveServerRequest = vi.fn<() => Promise<void>>(
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
        onConfigChange={() => undefined}
        onResolveServerRequest={onResolveServerRequest}
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

  it("renders multi-question user input forms with answer options instead of approval fallback buttons", async () => {
    const onResolveServerRequest = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
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
        onConfigChange={() => undefined}
        onResolveServerRequest={onResolveServerRequest}
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
      expect(onResolveServerRequest).toHaveBeenCalledWith({
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
    const onResolveServerRequest = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
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
        onConfigChange={() => undefined}
        onResolveServerRequest={onResolveServerRequest}
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
    const onResolveServerRequest = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
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
        onConfigChange={() => undefined}
        onResolveServerRequest={onResolveServerRequest}
        onSubmitInput={async () => undefined}
        onTodoDockCollapsedChange={() => undefined}
        onTodoDockPlacementChange={() => undefined}
      />,
    );

    fireEvent.click(screen.getByText("Scope A"));
    fireEvent.click(screen.getByText("After each phase"));
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));

    await waitFor(() => {
      expect(onResolveServerRequest).toHaveBeenCalledWith({
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
    const onResolveServerRequest = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
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
        onConfigChange={() => undefined}
        onResolveServerRequest={onResolveServerRequest}
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
      expect(onResolveServerRequest).toHaveBeenCalledWith({
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
