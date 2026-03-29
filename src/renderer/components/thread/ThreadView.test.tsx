import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppProvider } from "../ui/provider";
import { ThreadView } from "./ThreadView";

const { bridge } = vi.hoisted(() => ({
  bridge: {
    startThread: vi.fn().mockResolvedValue(undefined),
    writeTerminal: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("../../bridge", () => ({
  readBridge: () => bridge,
}));

vi.mock("./TerminalPane", () => ({
  TerminalPane: (props: {
    readOnly?: boolean;
    onTerminalResize?: (size: { cols: number; rows: number }) => void;
  }) => (
    <div data-read-only={props.readOnly ? "true" : "false"}>
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

describe("ThreadView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("starts a queued launch after the terminal reports its first size", async () => {
    const onLaunchConsumed = vi.fn();

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
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      agentStatus: {
        kind: "codex",
        label: "Codex",
        installed: true,
        authState: "authenticated",
        capabilities: {
          models: ["gpt-5.4"],
          efforts: ["low"],
          modelEfforts: {},
          modes: ["agent"],
          approvalPolicies: ["on-request"],
          sandboxModes: ["read-only"],
          supportsResume: true,
          supportsDirectInput: true,
          liveInputMode: "server",
          presentationMode: "terminal",
        },
      },
      projectLocation: {
        kind: "windows",
        path: "C:\\repo",
      },
      pendingLaunchPrompt: "hi",
      pendingServerRequests: [],
      onConfigChange: () => undefined,
      onLaunchConsumed,
      onResolveServerRequest: async () => undefined,
      onSubmitInput: async () => undefined,
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
        initialSize: {
          cols: 120,
          rows: 40,
        },
      });
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
          models: ["gpt-5.4"],
          efforts: ["low"],
          modelEfforts: {},
          modes: ["agent"],
          approvalPolicies: ["on-request"],
          sandboxModes: ["read-only"],
          supportsResume: true,
          supportsDirectInput: true,
          liveInputMode: "server",
          presentationMode: "terminal",
        },
      },
      projectLocation: {
        kind: "windows",
        path: "C:\\repo",
      },
      pendingServerRequests: [],
      onConfigChange: () => undefined,
      onResolveServerRequest: async () => undefined,
      onSubmitInput: async () => undefined,
    });

    expect(
      screen.getByPlaceholderText("Ask Codex anything about this workspace"),
    ).toBeInTheDocument();
    expect(screen.getByText("terminal pane")).toHaveAttribute("data-read-only", "true");
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
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      agentStatus: {
        kind: "codex",
        label: "Codex",
        installed: true,
        authState: "authenticated",
        capabilities: {
          models: ["gpt-5.4"],
          efforts: ["low"],
          modelEfforts: {},
          modes: ["agent"],
          approvalPolicies: ["on-request"],
          sandboxModes: ["read-only"],
          supportsResume: true,
          supportsDirectInput: true,
          liveInputMode: "server",
          presentationMode: "terminal",
        },
      },
      projectLocation: {
        kind: "windows",
        path: "C:\\repo",
      },
      pendingServerRequests: [],
      onConfigChange: () => undefined,
      onResolveServerRequest: async () => undefined,
      onSubmitInput: async () => undefined,
    });

    expect(screen.getByPlaceholderText("Ask Codex anything about this workspace")).toBeDisabled();
  });

  it("shows a loading overlay on the composer while a Codex thread is launching", () => {
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
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      agentStatus: {
        kind: "codex",
        label: "Codex",
        installed: true,
        authState: "authenticated",
        capabilities: {
          models: ["gpt-5.4"],
          efforts: ["low"],
          modelEfforts: {},
          modes: ["agent"],
          approvalPolicies: ["on-request"],
          sandboxModes: ["read-only"],
          supportsResume: true,
          supportsDirectInput: true,
          liveInputMode: "server",
          presentationMode: "terminal",
        },
      },
      projectLocation: {
        kind: "windows",
        path: "C:\\repo",
      },
      pendingServerRequests: [],
      onConfigChange: () => undefined,
      onResolveServerRequest: async () => undefined,
      onSubmitInput: async () => undefined,
    });

    expect(screen.getByText("Starting thread...")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Ask Codex anything about this workspace")).toBeDisabled();
  });

  it("renders server request UI instead of the composer while Codex is waiting", () => {
    renderThreadView({
      thread: {
        id: "thread-1",
        projectId: "project-1",
        title: "Codex thread",
        agentKind: "codex",
        config: {
          model: "gpt-5.4",
        },
        status: "needs_reply",
        attention: "needs_reply",
        canResumeWithConfig: true,
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
          models: ["gpt-5.4"],
          efforts: ["low"],
          modelEfforts: {},
          modes: ["agent"],
          approvalPolicies: ["on-request"],
          sandboxModes: ["read-only"],
          supportsResume: true,
          supportsDirectInput: true,
          liveInputMode: "server",
          presentationMode: "terminal",
        },
      },
      projectLocation: {
        kind: "windows",
        path: "C:\\repo",
      },
      pendingServerRequests: [
        {
          threadId: "thread-1",
          requestId: "request-1",
          method: "item/tool/requestUserInput",
          params: {
            questions: [
              {
                id: "repo_name",
                header: "Repository",
                question: "Which repository should Codex inspect?",
                isOther: false,
                isSecret: false,
                options: null,
              },
            ],
          },
          receivedAt: new Date().toISOString(),
        },
      ],
      onConfigChange: () => undefined,
      onResolveServerRequest: async () => undefined,
      onSubmitInput: async () => undefined,
    });

    expect(screen.getByText("Input requested")).toBeInTheDocument();
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
          models: ["sonnet"],
          efforts: ["low"],
          modelEfforts: {},
          modes: ["agent"],
          approvalPolicies: ["default"],
          sandboxModes: [],
          supportsResume: true,
          supportsDirectInput: true,
          liveInputMode: "terminal",
          presentationMode: "terminal",
        },
      },
      projectLocation: {
        kind: "windows",
        path: "C:\\repo",
      },
      pendingServerRequests: [],
      onConfigChange: () => undefined,
      onResolveServerRequest: async () => undefined,
      onSubmitInput: async () => undefined,
    });

    expect(
      screen.queryByPlaceholderText("Ask Codex anything about this workspace"),
    ).not.toBeInTheDocument();
    expect(screen.getByText("terminal pane")).toHaveAttribute("data-read-only", "false");
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
          models: ["gpt-5.4"],
          efforts: ["low"],
          modelEfforts: {},
          modes: ["agent"],
          approvalPolicies: ["on-request"],
          sandboxModes: ["read-only"],
          supportsResume: true,
          supportsDirectInput: true,
          liveInputMode: "server",
          presentationMode: "gui",
        },
      },
      projectLocation: {
        kind: "windows",
        path: "C:\\repo",
      },
      pendingServerRequests: [],
      onConfigChange: () => undefined,
      onResolveServerRequest: async () => undefined,
      onSubmitInput: async () => undefined,
    });

    expect(screen.queryByText("terminal pane")).not.toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("Ask Codex anything about this workspace"),
    ).toBeInTheDocument();
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
          models: ["gpt-5.4"],
          efforts: ["low"],
          modelEfforts: {},
          modes: ["agent"],
          approvalPolicies: ["on-request"],
          sandboxModes: ["read-only"],
          supportsResume: true,
          supportsDirectInput: true,
          liveInputMode: "server",
          presentationMode: "terminal",
        },
      },
      projectLocation: {
        kind: "windows",
        path: "C:\\repo",
      },
      pendingServerRequests: [],
      onConfigChange: () => undefined,
      onResolveServerRequest: async () => undefined,
      onSubmitInput: async () => undefined,
    });

    fireEvent.change(screen.getByPlaceholderText("Ask Codex anything about this workspace"), {
      target: { value: "test" },
    });

    expect(screen.getByLabelText("Send message")).toBeDisabled();
  });
});
