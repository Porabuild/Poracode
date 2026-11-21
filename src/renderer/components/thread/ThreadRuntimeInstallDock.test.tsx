import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { msg } from "@lingui/core/macro";
import type { AgentStatus, Project } from "@/shared/contracts";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { toast } from "@heroui/react";
import { ThreadRuntimeInstallDock } from "./ThreadRuntimeInstallDock";

const host = vi.hoisted(() => ({
  installAcpRegistryAgent: vi.fn<(input: unknown) => Promise<{ installed: [] }>>(),
  recordRegistryInstalls: vi.fn<(...args: unknown[]) => void>(),
  rediscoverAgents: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
}));
const resolveHost = vi.hoisted(() => vi.fn<(key?: string) => typeof host>(() => host));
vi.mock("../providers/settings/agentManagementHost", () => ({
  agentManagementHostForConnection: resolveHost,
}));

afterEach(() => vi.clearAllMocks());
const requirement = {
  description: msg`Not installed`,
  installLabel: msg`Install ACP`,
  registryAgentId: "fixture-runtime",
};
const status = { kind: "fixture", label: "Fixture", envKind: "windows" } as AgentStatus;
const project = { id: "project", location: { kind: "windows", path: "C:\\repo" } } as Project;

describe("composer runtime installation", () => {
  it.each([undefined, "paired-host"])(
    "installs on project host %s, then detects the same environment",
    async (remoteServerId) => {
      host.installAcpRegistryAgent.mockResolvedValue({ installed: [] });
      host.rediscoverAgents.mockResolvedValue({ windows: [], wsl: [] });
      render(
        <ThreadRuntimeInstallDock
          requirement={requirement}
          agentStatus={status}
          project={{
            ...project,
            ...(remoteServerId ? { remoteServerId } : {}),
          }}
        />,
      );
      fireEvent.click(screen.getByRole("button", { name: "Install ACP" }));
      await waitFor(() => expect(host.rediscoverAgents).toHaveBeenCalledOnce());
      expect(resolveHost).toHaveBeenCalledWith(remoteServerId);
      expect(host.installAcpRegistryAgent).toHaveBeenCalledExactlyOnceWith({
        agentId: "fixture-runtime",
        target: { kind: "native" },
      });
      expect(host.rediscoverAgents).toHaveBeenCalledWith([], {
        agentKinds: ["fixture"],
        envs: [{ kind: "native" }],
      });
    },
  );

  it("keeps pending through WSL detection and prevents duplicate installs", async () => {
    const detection = Promise.withResolvers<unknown>();
    host.installAcpRegistryAgent.mockResolvedValue({ installed: [] });
    host.rediscoverAgents.mockReturnValue(detection.promise);
    render(
      <ThreadRuntimeInstallDock
        requirement={requirement}
        agentStatus={{
          ...status,
          envKind: "wsl",
          envDistro: "Ubuntu",
        }}
        project={project}
      />,
    );
    const button = screen.getByRole("button", { name: "Install ACP" });
    fireEvent.click(button);
    fireEvent.click(button);
    await waitFor(() =>
      expect(host.rediscoverAgents).toHaveBeenCalledWith(["Ubuntu"], {
        agentKinds: ["fixture"],
        envs: [{ kind: "wsl", distro: "Ubuntu" }],
      }),
    );
    expect(host.installAcpRegistryAgent).toHaveBeenCalledOnce();
    expect(button).toBeDisabled();
    detection.resolve({});
    await waitFor(() => expect(button).not.toBeDisabled());
  });

  it("shows installation refusal and lets the user retry without claiming detection", async () => {
    const danger = vi.spyOn(toast, "danger").mockImplementation(() => undefined as never);
    try {
      host.installAcpRegistryAgent.mockRejectedValue(new Error("Fixture settings refused"));
      render(
        <ThreadRuntimeInstallDock
          requirement={requirement}
          agentStatus={status}
          project={project}
        />,
      );
      fireEvent.click(screen.getByRole("button", { name: "Install ACP" }));
      await waitFor(() => expect(danger).toHaveBeenCalledWith("Fixture settings refused"));
      expect(host.rediscoverAgents).not.toHaveBeenCalled();
      expect(screen.getByRole("button", { name: "Install ACP" })).not.toBeDisabled();
    } finally {
      danger.mockRestore();
    }
  });
});
