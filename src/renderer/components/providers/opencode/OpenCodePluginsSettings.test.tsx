import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import type {
  AgentStatus,
  ManageAgentPluginsPayload,
  ManageAgentPluginsResult,
} from "@/shared/contracts";
import {
  AgentSettingsHostProvider,
  type AgentSettingsHost,
} from "@/renderer/components/providers/settings/AgentSettingsHostContext";
import { OpenCodePluginsSettings } from "./OpenCodePluginsSettings";

const bridge = vi.hoisted(() => ({
  platform: "darwin",
  manageAgentPlugins:
    vi.fn<(payload: ManageAgentPluginsPayload) => Promise<ManageAgentPluginsResult>>(),
  openExternal: vi.fn<(url: string) => Promise<void>>(),
}));
vi.mock("@/renderer/bridge", () => ({ readBridge: () => bridge }));
const statuses = [
  { kind: "opencode", installed: true, envKind: "posix" },
] as unknown as AgentStatus[];
const goal = {
  target: "@prevalentware/opencode-goal-plugin",
  status: "active" as const,
  outdated: false,
  server: true,
  terminal: true,
};

function makeRemoteHost(overrides?: Partial<AgentSettingsHost>) {
  const callProcedure = vi.fn<AgentSettingsHost["callProcedure"]>(
    async () => ({ packages: [] }) as never,
  );
  const host: AgentSettingsHost = {
    key: "conn-1",
    connectionKey: "conn-1",
    isRemote: true,
    isOnline: true,
    machineProject: undefined,
    canManageProfiles: false,
    canWrite: true,
    canEditSecrets: false,
    callProcedure,
    rediscoverAgents: vi.fn<AgentSettingsHost["rediscoverAgents"]>(async () => ({
      windows: [],
      wsl: [],
    })),
    setAgentSetting: vi.fn<AgentSettingsHost["setAgentSetting"]>(),
    saveAgentSettings: vi.fn<AgentSettingsHost["saveAgentSettings"]>(async () => undefined),
    setAgentDisabled: vi.fn<AgentSettingsHost["setAgentDisabled"]>(),
    setHiddenModels: vi.fn<AgentSettingsHost["setHiddenModels"]>(),
    createProfile: vi.fn<AgentSettingsHost["createProfile"]>(),
    updateProfile: vi.fn<AgentSettingsHost["updateProfile"]>(),
    setProfileEnvironment: vi.fn<AgentSettingsHost["setProfileEnvironment"]>(),
    removeProfile: vi.fn<AgentSettingsHost["removeProfile"]>(),
    ...overrides,
  };
  return { host, callProcedure };
}

beforeEach(() => {
  vi.clearAllMocks();
  bridge.manageAgentPlugins.mockResolvedValue({ packages: [] });
});

describe("OpenCode plugin settings", () => {
  it("loads native packages and installs a package named in Discover", async () => {
    render(<OpenCodePluginsSettings agentKind="opencode" statuses={statuses} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(bridge.manageAgentPlugins).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Manage plugins" }));
    await screen.findByText("No package plugins installed.");
    expect(bridge.manageAgentPlugins).toHaveBeenCalledWith({
      agentKind: "opencode",
      env: { kind: "native" },
      action: "list",
    });
    bridge.manageAgentPlugins.mockResolvedValue({ packages: [goal] });
    fireEvent.click(screen.getByRole("tab", { name: "Discover" }));
    expect(screen.queryByText("OpenCode Goal Plugin")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Package name or Git URL"), {
      target: { value: goal.target },
    });
    fireEvent.submit(screen.getByLabelText("Package name or Git URL").closest("form")!);
    await waitFor(() =>
      expect(bridge.manageAgentPlugins).toHaveBeenLastCalledWith({
        agentKind: "opencode",
        env: { kind: "native" },
        action: "install",
        target: goal.target,
      }),
    );
    await screen.findByRole("button", { name: `Remove ${goal.target}` });
  });

  it("shows a failed package on Installed without a Discover retry card", async () => {
    bridge.manageAgentPlugins.mockResolvedValue({
      packages: [{ ...goal, status: "failed" }],
    });
    render(<OpenCodePluginsSettings agentKind="opencode" statuses={statuses} />);
    fireEvent.click(screen.getByRole("button", { name: "Manage plugins" }));
    await screen.findByText("Failed to load");
    fireEvent.click(screen.getByRole("tab", { name: "Discover" }));
    expect(screen.queryByText("OpenCode Goal Plugin")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
  });
  it("keeps failed installation actionable and does not claim it is installed", async () => {
    render(<OpenCodePluginsSettings agentKind="opencode" statuses={statuses} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(bridge.manageAgentPlugins).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Manage plugins" }));
    await screen.findByText("No package plugins installed.");
    bridge.manageAgentPlugins.mockRejectedValueOnce(new Error("offline"));
    fireEvent.click(screen.getByRole("tab", { name: "Discover" }));
    fireEvent.change(screen.getByLabelText("Package name or Git URL"), {
      target: { value: "example-plugin" },
    });
    fireEvent.submit(screen.getByLabelText("Package name or Git URL").closest("form")!);
    await screen.findByRole("alert");
    expect(screen.getByLabelText("Package name or Git URL")).toHaveValue("example-plugin");
    expect(screen.queryByRole("button", { name: "Installed" })).not.toBeInTheDocument();
  });
  it("confirms before removing an installed package", async () => {
    bridge.manageAgentPlugins.mockResolvedValue({ packages: [goal] });
    render(<OpenCodePluginsSettings agentKind="opencode" statuses={statuses} />);
    fireEvent.click(screen.getByRole("button", { name: "Manage plugins" }));
    fireEvent.click(await screen.findByRole("button", { name: `Remove ${goal.target}` }));
    await screen.findByText("Remove plugin");
    expect(bridge.manageAgentPlugins).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: /^Remove$/ }));
    await waitFor(() =>
      expect(bridge.manageAgentPlugins).toHaveBeenLastCalledWith({
        agentKind: "opencode",
        env: { kind: "native" },
        action: "remove",
        target: goal.target,
      }),
    );
  });
  it("shows installed and update versions and a loader while updating", async () => {
    const installed = { ...goal, version: "0.1.67", outdated: true };
    const outdated = { ...installed, latestVersion: "0.1.101" };
    const updated = { ...goal, version: "0.1.101", outdated: false };
    let updateGate: Promise<{ packages: (typeof updated)[] }> | undefined;
    bridge.manageAgentPlugins.mockImplementation(async (payload) => {
      if (payload.action === "check") return { packages: [outdated] };
      if (payload.action === "update" && updateGate) return updateGate;
      return { packages: [installed] };
    });
    render(<OpenCodePluginsSettings agentKind="opencode" statuses={statuses} />);
    fireEvent.click(screen.getByRole("button", { name: "Manage plugins" }));
    // `list` never carries latestVersion; only the explicit check resolves it.
    await screen.findByText("v0.1.67");
    expect(screen.queryByText(/→ v0\.1\.101/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Check agent plugin updates" }));
    await screen.findByText("v0.1.67 → v0.1.101");
    expect(screen.getByText(/Update available/)).toBeInTheDocument();

    const pending = Promise.withResolvers<{ packages: (typeof updated)[] }>();
    updateGate = pending.promise;
    fireEvent.click(screen.getByRole("button", { name: `Update ${goal.target}` }));
    await screen.findByText("Updating to v0.1.101");
    expect(screen.queryByRole("button", { name: `Update ${goal.target}` })).not.toBeInTheDocument();
    expect(bridge.manageAgentPlugins).toHaveBeenLastCalledWith({
      agentKind: "opencode",
      env: { kind: "native" },
      action: "update",
      target: goal.target,
    });

    pending.resolve({ packages: [updated] });
    await screen.findByText("v0.1.101");
    expect(screen.queryByText("Updating to v0.1.101")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: `Update ${goal.target}` })).not.toBeInTheDocument();
  });

  it("shows a server-reported in-progress update with a shortened hash version", async () => {
    bridge.manageAgentPlugins.mockResolvedValue({
      packages: [
        {
          ...goal,
          version: "a".repeat(40),
          outdated: true,
          latestVersion: "0.1.101",
          updating: true,
        },
      ],
    });
    render(<OpenCodePluginsSettings agentKind="opencode" statuses={statuses} />);
    fireEvent.click(screen.getByRole("button", { name: "Manage plugins" }));
    await screen.findByText("Updating to v0.1.101");
    expect(screen.getByText(/aaaaaaa → v0\.1\.101/)).toBeInTheDocument();
  });

  it("does not launch plugin processes when the provider is absent", () => {
    render(<OpenCodePluginsSettings agentKind="opencode" statuses={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "Manage plugins" }));
    expect(screen.getByText("Install OpenCode to manage its plugins.")).toBeInTheDocument();
    expect(bridge.manageAgentPlugins).not.toHaveBeenCalled();
  });

  it("routes plugin listing and installation through the remote settings host without calling readBridge", async () => {
    const { host, callProcedure } = makeRemoteHost();
    callProcedure.mockResolvedValueOnce({ packages: [] } as never);
    render(
      <AgentSettingsHostProvider host={host}>
        <OpenCodePluginsSettings agentKind="opencode" statuses={statuses} />
      </AgentSettingsHostProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Manage plugins" }));
    await screen.findByText("No package plugins installed.");
    expect(callProcedure).toHaveBeenCalledWith("manageAgentPlugins", {
      agentKind: "opencode",
      env: { kind: "native" },
      action: "list",
    });

    callProcedure.mockResolvedValueOnce({ packages: [goal] } as never);
    fireEvent.click(screen.getByRole("tab", { name: "Discover" }));
    fireEvent.change(screen.getByLabelText("Package name or Git URL"), {
      target: { value: goal.target },
    });
    fireEvent.submit(screen.getByLabelText("Package name or Git URL").closest("form")!);
    await waitFor(() =>
      expect(callProcedure).toHaveBeenLastCalledWith("manageAgentPlugins", {
        agentKind: "opencode",
        env: { kind: "native" },
        action: "install",
        target: goal.target,
      }),
    );
    await screen.findByRole("button", { name: `Remove ${goal.target}` });
    expect(bridge.manageAgentPlugins).not.toHaveBeenCalled();
  });

  it("disables Manage plugins when the remote host is offline", () => {
    const { host, callProcedure } = makeRemoteHost({ isOnline: false });
    render(
      <AgentSettingsHostProvider host={host}>
        <OpenCodePluginsSettings agentKind="opencode" statuses={statuses} />
      </AgentSettingsHostProvider>,
    );
    expect(screen.getByRole("button", { name: "Manage plugins" })).toBeDisabled();
    expect(callProcedure).not.toHaveBeenCalled();
    expect(bridge.manageAgentPlugins).not.toHaveBeenCalled();
  });
});
