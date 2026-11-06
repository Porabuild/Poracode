import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import type { MachineDescriptor } from "@/renderer/state/machines";
import { useAgentStatusesStore } from "@/renderer/state/agentStatusesStore";
import { AgentsGeneralSettings } from "./AgentsGeneralSettings";

const mocks = vi.hoisted(() => ({
  rediscover: vi.fn<(distros: string[]) => Promise<unknown>>(),
  host: vi.fn<(machine: MachineDescriptor) => void>(),
  danger: vi.fn<(message: string) => void>(),
}));
let machine: MachineDescriptor;
vi.mock("@/renderer/state/machines", () => ({ useSelectedMachine: () => machine }));
vi.mock("@/renderer/components/providers/settings/agentManagementHost", () => ({
  agentManagementHostForMachine: (selected: MachineDescriptor) => {
    mocks.host(selected);
    return { rediscoverAgents: mocks.rediscover };
  },
}));
vi.mock("@heroui/react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@heroui/react")>()),
  toast: { danger: mocks.danger },
}));
vi.mock("./ModelVisibilitySection", () => ({ ModelVisibilitySection: () => null }));
vi.mock("./ModelOrderSection", () => ({ ModelOrderSection: () => null }));

describe("Agents General discovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rediscover.mockReset().mockResolvedValue({ windows: [], wsl: [] });
    useAgentStatusesStore.getState().resetDiscoveredAgents();
    machine = {
      id: "local",
      kind: "local",
      label: "Local",
      status: "online",
      ref: { host: "local", env: { kind: "native" } },
    };
  });

  it("keeps Refresh available when no agents are installed", async () => {
    render(<AgentsGeneralSettings />);
    fireEvent.click(screen.getByRole("button", { name: "Refresh detected agents" }));
    await waitFor(() => expect(mocks.rediscover).toHaveBeenCalledExactlyOnceWith([]));
    expect(mocks.host).toHaveBeenCalledWith(machine);
    expect(screen.getByRole("heading", { name: "Agents · General" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Refresh detected agents" }).textContent).toBe("");
  });

  it("keeps an active discovery in the background while refreshing", async () => {
    useAgentStatusesStore.setState({
      inFirstLaunchDiscovery: true,
      discoveryScanning: true,
      discoveryHidden: false,
    });
    mocks.rediscover.mockImplementationOnce(async () => {
      expect(useAgentStatusesStore.getState().discoveryHidden).toBe(true);
      return { windows: [], wsl: [] };
    });
    render(<AgentsGeneralSettings />);
    fireEvent.click(screen.getByRole("button", { name: "Refresh detected agents" }));
    await waitFor(() => expect(mocks.rediscover).toHaveBeenCalledOnce());
    expect(useAgentStatusesStore.getState()).toMatchObject({
      inFirstLaunchDiscovery: true,
      discoveryScanning: true,
      discoveryHidden: true,
    });
  });

  it.each(["native", "wsl"] as const)("refreshes the selected remote %s machine", async (kind) => {
    machine = {
      id: "remote:studio",
      kind: kind === "wsl" ? "remote-wsl" : "remote",
      label: "Studio",
      status: "online",
      ref: {
        host: "remote",
        desktopId: "studio",
        env: kind === "wsl" ? { kind, distro: "Ubuntu" } : { kind },
      },
    };
    render(<AgentsGeneralSettings />);
    fireEvent.click(screen.getByRole("button", { name: "Refresh detected agents" }));
    await waitFor(() =>
      expect(mocks.rediscover).toHaveBeenCalledExactlyOnceWith(kind === "wsl" ? ["Ubuntu"] : []),
    );
    expect(mocks.host).toHaveBeenCalledWith(machine);
  });

  it("disables Refresh while the selected machine is offline", () => {
    machine = { ...machine, status: "offline" };
    render(<AgentsGeneralSettings />);
    expect(screen.getByRole("button", { name: "Refresh detected agents" })).toBeDisabled();
    expect(mocks.rediscover).not.toHaveBeenCalled();
  });

  it("keeps pending discovery on its original machine when the selection changes", async () => {
    let finish!: () => void;
    mocks.rediscover.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = () => resolve(undefined);
        }),
    );
    const { rerender } = render(<AgentsGeneralSettings />);
    fireEvent.click(screen.getByRole("button", { name: "Refresh detected agents" }));
    expect(screen.getByRole("button", { name: "Refresh detected agents" })).toBeDisabled();
    machine = { ...machine, id: "other", label: "Other" };
    rerender(<AgentsGeneralSettings />);
    expect(screen.getByRole("button", { name: "Refresh detected agents" })).not.toBeDisabled();
    await act(async () => finish());
    expect(mocks.rediscover).toHaveBeenCalledTimes(1);
  });

  it("reports failures and allows another refresh", async () => {
    mocks.rediscover.mockRejectedValueOnce(new Error("Host unavailable"));
    render(<AgentsGeneralSettings />);
    fireEvent.click(screen.getByRole("button", { name: "Refresh detected agents" }));
    await waitFor(() => expect(mocks.danger).toHaveBeenCalledWith("Host unavailable"));
    expect(screen.getByRole("button", { name: "Refresh detected agents" })).not.toBeDisabled();
  });
});
