import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentStatus, Project } from "@/shared/contracts";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import { RemoteProjectModal } from "./RemoteProjectModal";

const startRemoteThread = vi.fn<() => Promise<void>>();

function cursorStatus(envDistro: string, guiModel: string): AgentStatus {
  return {
    kind: "cursor",
    label: `Cursor ${envDistro}`,
    installed: true,
    authState: "missing",
    envKind: "wsl",
    envDistro,
    presentationAuthStates: { gui: "authenticated" },
    presentationAuthUsesProviderLogin: { gui: false },
    capabilities: {
      models: [{ id: "cli-model", label: "CLI model" }],
      efforts: ["low"],
      modelEfforts: { "cli-model": ["low"] },
      modes: ["agent"],
      approvalPolicies: [{ id: "never", label: "Never" }],
      sandboxModes: [{ id: "danger-full-access", label: "Full access" }],
      defaultApprovalPolicy: "never",
      defaultSandboxMode: "danger-full-access",
      supportsResume: true,
      supportsDirectInput: true,
      liveInputMode: "terminal",
      presentationMode: "terminal",
      presentationModes: ["terminal", "gui"],
      settingDefs: [],
      presentationCapabilities: {
        gui: {
          models: [{ id: guiModel, label: guiModel }],
          efforts: ["high"],
          defaultEffort: "high",
          modelEfforts: { [guiModel]: ["high"] },
          modes: ["agent"],
          approvalPolicies: [{ id: "on-request", label: "On request" }],
          sandboxModes: [{ id: "workspace-write", label: "Workspace write" }],
          defaultApprovalPolicy: "on-request",
          defaultApprovalsReviewer: "auto_review",
          defaultSandboxMode: "workspace-write",
          supportsResume: true,
          supportsDirectInput: true,
          liveInputMode: "server",
          presentationMode: "gui",
          settingDefs: [],
        },
      },
    },
  };
}

const project: Project = {
  id: "project-1",
  name: "Ubuntu project",
  location: {
    kind: "wsl",
    distro: "Ubuntu",
    linuxPath: "/home/user/repo",
    uncPath: "\\\\wsl.localhost\\Ubuntu\\home\\user\\repo",
  },
  createdAt: "2026-07-27T00:00:00.000Z",
};

describe("RemoteProjectModal", () => {
  beforeEach(() => {
    startRemoteThread.mockReset().mockResolvedValue(undefined);
    useRemoteServersStore.setState({
      servers: [
        {
          desktopId: "desktop-1",
          label: "Remote PC",
          endpoint: "http://remote.test",
          accessToken: "token",
          scopes: ["session:read"],
        },
      ],
      runtime: {
        "desktop-1": {
          status: "online",
          projects: [project],
          threads: [],
          agentStatuses: {
            windows: [],
            wsl: [cursorStatus("Debian", "debian-sdk"), cursorStatus("Ubuntu", "ubuntu-sdk")],
            updatedAt: "2026-07-27T00:00:00.000Z",
          },
        },
      },
      remoteProjectDraft: { desktopId: "desktop-1", projectId: project.id },
      startRemoteThread,
    });
  });

  afterEach(() => {
    cleanup();
    useRemoteServersStore.setState({
      servers: [],
      runtime: {},
      remoteProjectDraft: null,
    });
  });

  it("launches with the exact distro's GUI catalog, auth, and safety defaults", async () => {
    render(<RemoteProjectModal />);

    expect(screen.getByLabelText("Agent")).toHaveValue("cursor");
    expect(screen.getByLabelText("Agent")).toHaveTextContent("Cursor Ubuntu");
    expect(screen.getByLabelText("Agent")).not.toHaveTextContent("Cursor Debian");
    expect(screen.getByLabelText("Model")).toHaveValue("ubuntu-sdk");
    expect(screen.getByLabelText("Effort")).toHaveValue("high");
    expect(screen.getByLabelText("Presentation")).toHaveValue("gui");

    fireEvent.change(screen.getByLabelText("Prompt"), {
      target: { value: "Inspect the remote project" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Start remote thread" }));

    await waitFor(() => {
      expect(startRemoteThread).toHaveBeenCalledWith({
        desktopId: "desktop-1",
        projectId: project.id,
        agentKind: "cursor",
        config: {
          model: "ubuntu-sdk",
          effort: "high",
          approvalPolicy: "on-request",
          approvalsReviewer: "auto_review",
          sandboxMode: "workspace-write",
        },
        prompt: "Inspect the remote project",
        presentationMode: "gui",
      });
    });
  });
});
