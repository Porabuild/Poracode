import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import type {
  AgentStatus,
  ManageAgentPluginsPayload,
  ManageAgentPluginsResult,
} from "@/shared/contracts";
import { OpenCode2PluginsSettings } from "./OpenCode2PluginsSettings";

const bridge = vi.hoisted(() => ({
  platform: "darwin",
  manageAgentPlugins:
    vi.fn<(payload: ManageAgentPluginsPayload) => Promise<ManageAgentPluginsResult>>(),
  openExternal: vi.fn<(url: string) => Promise<void>>(),
}));
vi.mock("@/renderer/bridge", () => ({ readBridge: () => bridge }));
const statuses = [
  { kind: "opencode2", installed: true, envKind: "posix" },
] as unknown as AgentStatus[];
const goal = {
  target: "@prevalentware/opencode-goal-plugin",
  status: "active" as const,
  outdated: false,
  server: true,
  terminal: true,
};
beforeEach(() => {
  vi.clearAllMocks();
  bridge.manageAgentPlugins.mockResolvedValue({ packages: [] });
});

describe("OpenCode 2 plugin settings", () => {
  it("loads native packages and installs the featured goal package explicitly", async () => {
    render(<OpenCode2PluginsSettings agentKind="opencode2" statuses={statuses} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(bridge.manageAgentPlugins).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Manage plugins" }));
    await screen.findByText("No package plugins installed.");
    expect(bridge.manageAgentPlugins).toHaveBeenCalledWith({
      agentKind: "opencode2",
      env: { kind: "native" },
      action: "list",
    });
    bridge.manageAgentPlugins.mockResolvedValue({ packages: [goal] });
    fireEvent.click(screen.getByRole("tab", { name: "Discover" }));
    const install = screen
      .getAllByRole("button", { name: "Install" })
      .find((button) => !button.hasAttribute("disabled"))!;
    fireEvent.click(install);
    await waitFor(() =>
      expect(bridge.manageAgentPlugins).toHaveBeenLastCalledWith({
        agentKind: "opencode2",
        env: { kind: "native" },
        action: "install",
        target: goal.target,
      }),
    );
    await screen.findByRole("button", { name: `Remove ${goal.target}` });
    fireEvent.click(screen.getByRole("tab", { name: "Discover" }));
    expect(screen.getByRole("button", { name: "Installed" })).toBeDisabled();
  });

  it("lets a failed featured package be retried", async () => {
    bridge.manageAgentPlugins.mockResolvedValue({
      packages: [{ ...goal, status: "failed" }],
    });
    render(<OpenCode2PluginsSettings agentKind="opencode2" statuses={statuses} />);
    fireEvent.click(screen.getByRole("button", { name: "Manage plugins" }));
    fireEvent.click(await screen.findByRole("tab", { name: "Discover" }));
    const retry = await screen.findByRole("button", { name: "Retry" });
    expect(retry).not.toBeDisabled();
    fireEvent.click(retry);
    await waitFor(() =>
      expect(bridge.manageAgentPlugins).toHaveBeenLastCalledWith({
        agentKind: "opencode2",
        env: { kind: "native" },
        action: "install",
        target: goal.target,
      }),
    );
  });
  it("keeps failed installation actionable and does not claim it is installed", async () => {
    render(<OpenCode2PluginsSettings agentKind="opencode2" statuses={statuses} />);
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
    render(<OpenCode2PluginsSettings agentKind="opencode2" statuses={statuses} />);
    fireEvent.click(screen.getByRole("button", { name: "Manage plugins" }));
    fireEvent.click(await screen.findByRole("button", { name: `Remove ${goal.target}` }));
    await screen.findByText("Remove plugin");
    expect(bridge.manageAgentPlugins).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: /^Remove$/ }));
    await waitFor(() =>
      expect(bridge.manageAgentPlugins).toHaveBeenLastCalledWith({
        agentKind: "opencode2",
        env: { kind: "native" },
        action: "remove",
        target: goal.target,
      }),
    );
  });
  it("does not launch plugin processes when the provider is absent", () => {
    render(<OpenCode2PluginsSettings agentKind="opencode2" statuses={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "Manage plugins" }));
    expect(screen.getByText("Install OpenCode 2 to manage its plugins.")).toBeInTheDocument();
    expect(bridge.manageAgentPlugins).not.toHaveBeenCalled();
  });
});
