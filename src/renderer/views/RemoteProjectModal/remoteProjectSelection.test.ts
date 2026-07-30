import { describe, expect, it } from "vitest";
import type { AgentStatus, ProjectLocation } from "@/shared/contracts";
import { agentStatusForPresentation } from "@/shared/agentSelection";
import type { RemoteAgentStatuses } from "@/shared/remote";
import { buildRemoteThreadConfig, remoteProjectAgentStatuses } from "./remoteProjectSelection";

function makeStatus(
  kind: string,
  envDistro: string,
  overrides: Partial<AgentStatus> = {},
): AgentStatus {
  return {
    kind,
    label: kind,
    installed: true,
    authState: "missing",
    envKind: "wsl",
    envDistro,
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
    },
    ...overrides,
  };
}

function remoteStatuses(wsl: AgentStatus[]): RemoteAgentStatuses {
  return {
    windows: [],
    wsl,
    updatedAt: "2026-07-27T00:00:00.000Z",
  };
}

const ubuntuProject: ProjectLocation = {
  kind: "wsl",
  distro: "Ubuntu",
  linuxPath: "/home/user/repo",
  uncPath: "\\\\wsl.localhost\\Ubuntu\\home\\user\\repo",
};

describe("remote project agent selection", () => {
  it("uses only statuses from the project's exact WSL distro", () => {
    const ubuntu = makeStatus("cursor", "Ubuntu");
    const debian = makeStatus("cursor", "Debian", { label: "Cursor Debian" });

    expect(remoteProjectAgentStatuses(remoteStatuses([debian, ubuntu]), ubuntuProject)).toEqual([
      ubuntu,
    ]);
  });

  it("keeps agents whose selected GUI presentation owns the model catalog", () => {
    const cursor = makeStatus("cursor", "Ubuntu", {
      presentationAuthStates: { gui: "authenticated" },
      presentationAuthUsesProviderLogin: { gui: false },
      capabilities: {
        ...makeStatus("cursor", "Ubuntu").capabilities,
        models: [],
        efforts: [],
        modelEfforts: {},
        presentationCapabilities: {
          gui: {
            models: [{ id: "sdk-model", label: "SDK model" }],
            efforts: ["high"],
            modelEfforts: { "sdk-model": ["high"] },
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
    });

    expect(remoteProjectAgentStatuses(remoteStatuses([cursor]), ubuntuProject)).toEqual([cursor]);

    const gui = agentStatusForPresentation(cursor, "gui");
    expect(gui.authState).toBe("authenticated");
    expect(gui.capabilities.models.map((model) => model.id)).toEqual(["sdk-model"]);
    expect(buildRemoteThreadConfig(gui, "sdk-model", "high")).toEqual({
      model: "sdk-model",
      effort: "high",
      approvalPolicy: "on-request",
      approvalsReviewer: "auto_review",
      sandboxMode: "workspace-write",
    });
  });

  it("falls back to advertised options when provider defaults are stale", () => {
    const status = makeStatus("qoder", "Ubuntu", {
      capabilities: {
        ...makeStatus("qoder", "Ubuntu").capabilities,
        approvalPolicies: [
          { id: "default", label: "Default" },
          { id: "acceptEdits", label: "Accept Edits" },
        ],
        defaultApprovalPolicy: "bypassPermissions",
        sandboxModes: [{ id: "workspace-write", label: "Workspace write" }],
        defaultSandboxMode: "danger-full-access",
      },
    });

    expect(buildRemoteThreadConfig(status, "model-a", "")).toEqual({
      model: "model-a",
      approvalPolicy: "default",
      sandboxMode: "workspace-write",
    });
  });
});
