import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppProvider } from "../ui/provider";
import { ThreadView } from "./ThreadView";

vi.mock("./TerminalPane", () => ({
  TerminalPane: (props: { readOnly?: boolean }) => (
    <div data-read-only={props.readOnly ? "true" : "false"}>terminal pane</div>
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
        label: "Codex CLI",
        installed: true,
        authState: "authenticated",
        capabilities: {
          models: ["gpt-5.4"],
          efforts: ["low"],
          modes: ["agent"],
          approvalPolicies: ["on-request"],
          sandboxModes: ["read-only"],
          supportsResume: true,
          supportsDirectInput: true,
          liveInputMode: "server",
        },
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

  it("does not render the server-mode composer for inactive Codex threads", () => {
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
        label: "Codex CLI",
        installed: true,
        authState: "authenticated",
        capabilities: {
          models: ["gpt-5.4"],
          efforts: ["low"],
          modes: ["agent"],
          approvalPolicies: ["on-request"],
          sandboxModes: ["read-only"],
          supportsResume: true,
          supportsDirectInput: true,
          liveInputMode: "server",
        },
      },
      pendingServerRequests: [],
      onConfigChange: () => undefined,
      onResolveServerRequest: async () => undefined,
      onSubmitInput: async () => undefined,
    });

    expect(
      screen.queryByPlaceholderText("Ask Codex anything about this workspace"),
    ).not.toBeInTheDocument();
  });

  it("does not render the server-mode composer while a Codex thread is launching", () => {
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
        label: "Codex CLI",
        installed: true,
        authState: "authenticated",
        capabilities: {
          models: ["gpt-5.4"],
          efforts: ["low"],
          modes: ["agent"],
          approvalPolicies: ["on-request"],
          sandboxModes: ["read-only"],
          supportsResume: true,
          supportsDirectInput: true,
          liveInputMode: "server",
        },
      },
      pendingServerRequests: [],
      onConfigChange: () => undefined,
      onResolveServerRequest: async () => undefined,
      onSubmitInput: async () => undefined,
    });

    expect(
      screen.queryByPlaceholderText("Ask Codex anything about this workspace"),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Starting thread...")).toBeInTheDocument();
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
        label: "Codex CLI",
        installed: true,
        authState: "authenticated",
        capabilities: {
          models: ["gpt-5.4"],
          efforts: ["low"],
          modes: ["agent"],
          approvalPolicies: ["on-request"],
          sandboxModes: ["read-only"],
          supportsResume: true,
          supportsDirectInput: true,
          liveInputMode: "server",
        },
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
    expect(
      screen.queryByPlaceholderText("Ask Codex anything about this workspace"),
    ).not.toBeInTheDocument();
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
        label: "Claude Code CLI",
        installed: true,
        authState: "authenticated",
        capabilities: {
          models: ["sonnet"],
          efforts: ["low"],
          modes: ["agent"],
          approvalPolicies: ["default"],
          sandboxModes: [],
          supportsResume: true,
          supportsDirectInput: true,
          liveInputMode: "terminal",
        },
      },
      pendingServerRequests: [],
      onConfigChange: () => undefined,
      onResolveServerRequest: async () => undefined,
      onSubmitInput: async () => undefined,
    });

    expect(
      screen.queryByPlaceholderText("Ask Codex anything about this workspace"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText("Live thread input is handled directly in the terminal during this phase."),
    ).toBeInTheDocument();
    expect(screen.getByText("terminal pane")).toHaveAttribute("data-read-only", "false");
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
        label: "Codex CLI",
        installed: true,
        authState: "authenticated",
        capabilities: {
          models: ["gpt-5.4"],
          efforts: ["low"],
          modes: ["agent"],
          approvalPolicies: ["on-request"],
          sandboxModes: ["read-only"],
          supportsResume: true,
          supportsDirectInput: true,
          liveInputMode: "server",
        },
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
