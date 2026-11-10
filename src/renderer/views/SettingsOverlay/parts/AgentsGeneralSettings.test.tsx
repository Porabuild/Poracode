import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { agentStatusSchema, type AgentStatusesResponse } from "@/shared/contracts";
import type { MachineDescriptor } from "@/renderer/state/machines";
import {
  applyAgentStatusSupervisorEvent,
  useAgentStatusesStore,
} from "@/renderer/state/agentStatusesStore";
import { AgentDiscoveryOverlay } from "@/renderer/components/thread/AgentDiscoveryOverlay";
import { AgentsGeneralSettings } from "./AgentsGeneralSettings";

const mocks = vi.hoisted(() => ({
  rediscover: vi.fn<(distros: string[]) => Promise<unknown>>(),
  refreshAgentStatuses: vi.fn<(distros: string[]) => Promise<AgentStatusesResponse>>(),
  cancelAgentDiscovery: vi.fn<() => Promise<AgentStatusesResponse>>(),
  host: vi.fn<(machine: MachineDescriptor) => void>(),
  danger: vi.fn<(message: string) => void>(),
}));
let machine: MachineDescriptor;
vi.mock("@/renderer/state/machines", () => ({ useSelectedMachine: () => machine }));
vi.mock("@/renderer/components/providers/settings/agentManagementHost", () => ({
  agentManagementHostForMachine: (selected: MachineDescriptor) => {
    mocks.host(selected);
    return {
      isRemote: selected.ref.host === "remote" || selected.desktopId !== undefined,
      rediscoverAgents: mocks.rediscover,
    };
  },
}));
vi.mock("@/renderer/bridge", () => ({ readBridge: () => mocks }));
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
    mocks.refreshAgentStatuses
      .mockReset()
      .mockResolvedValue({ windows: [], wsl: [], fromCache: false });
    mocks.cancelAgentDiscovery
      .mockReset()
      .mockResolvedValue({ windows: [], wsl: [], fromCache: false });
    useAgentStatusesStore.getState().resetDiscoveredAgents();
    // A returning user's loaded inventory must still allow manual discovery.
    useAgentStatusesStore.getState().hydrateFromCache({ windows: [], wsl: [] });
    machine = {
      id: "local",
      kind: "local",
      label: "Local",
      status: "online",
      ref: { host: "local", env: { kind: "native" } },
    };
  });

  afterEach(() => {
    vi.useRealTimers();
    useAgentStatusesStore.getState().resetDiscoveredAgents();
  });

  it("keeps Refresh available when no agents are installed", async () => {
    render(<AgentsGeneralSettings />);
    fireEvent.click(screen.getByRole("button", { name: "Refresh detected agents" }));
    await waitFor(() => expect(mocks.refreshAgentStatuses).toHaveBeenCalledExactlyOnceWith([]));
    expect(mocks.host).toHaveBeenCalledWith(machine);
    expect(screen.getByRole("heading", { name: "Agents · General" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Refresh detected agents" }).textContent).toBe("");
  });

  it("shows background progress, opens results, and keeps discovery alive after leaving Settings", async () => {
    vi.useFakeTimers();
    let finish!: (response: AgentStatusesResponse) => void;
    mocks.refreshAgentStatuses.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const view = render(
      <>
        <AgentsGeneralSettings />
        <AgentDiscoveryOverlay />
      </>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Refresh detected agents" }));
    expect(screen.getByRole("button", { name: "Show agent discovery" })).toBeVisible();
    expect(screen.getByText("Discovering agents…")).toBeInTheDocument();
    expect(useAgentStatusesStore.getState()).toMatchObject({
      inFirstLaunchDiscovery: true,
      discoveryScanning: true,
      discoveryHidden: true,
    });
    const found = agentStatusSchema.parse({
      kind: "discovery-test",
      label: "Discovery test",
      installed: true,
      authState: "authenticated",
      capabilities: {},
    });
    act(() => applyAgentStatusSupervisorEvent({ type: "agent-detected", status: found }));
    expect(screen.getByText("1 agent found")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Show agent discovery" }));
    expect(screen.getByRole("button", { name: "Hide" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Hide" }));
    view.rerender(<AgentDiscoveryOverlay />);
    expect(screen.getByRole("button", { name: "Show agent discovery" })).toBeVisible();
    await act(async () => {
      finish({ windows: [found], wsl: [], fromCache: false });
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(useAgentStatusesStore.getState().discoveryScanning).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Show agent discovery" }));
    expect(screen.getByRole("button", { name: "Done (10s)" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Done (10s)" }));
    expect(screen.queryByRole("button", { name: "Show agent discovery" })).toBeNull();
  });

  it("disables Refresh during app-owned discovery without starting another scan", () => {
    useAgentStatusesStore.setState({ inFirstLaunchDiscovery: true, discoveryScanning: true });
    render(<AgentsGeneralSettings />);
    expect(screen.getByRole("button", { name: "Refresh detected agents" })).toBeDisabled();
    expect(mocks.refreshAgentStatuses).not.toHaveBeenCalled();
  });

  it("cancels discovery without reporting an error or accepting late results", async () => {
    vi.useFakeTimers();
    let reject!: (error: Error) => void;
    mocks.refreshAgentStatuses.mockReturnValueOnce(
      new Promise((_resolve, fail) => {
        reject = fail;
      }),
    );
    render(
      <>
        <AgentsGeneralSettings />
        <AgentDiscoveryOverlay />
      </>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Refresh detected agents" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel agent discovery" }));
    expect(mocks.cancelAgentDiscovery).toHaveBeenCalledOnce();
    await act(async () => {
      reject(new Error("Agent discovery cancelled"));
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(mocks.danger).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Show agent discovery" })).toBeNull();
    expect(screen.getByRole("button", { name: "Refresh detected agents" })).toBeEnabled();
    expect(useAgentStatusesStore.getState().inFirstLaunchDiscovery).toBe(false);
  });

  it("refreshes the selected local WSL distro in the background", async () => {
    machine = {
      ...machine,
      id: "wsl:Ubuntu",
      kind: "local-wsl",
      ref: { host: "local", env: { kind: "wsl", distro: "Ubuntu" } },
    };
    render(<AgentsGeneralSettings />);
    fireEvent.click(screen.getByRole("button", { name: "Refresh detected agents" }));
    await waitFor(() =>
      expect(mocks.refreshAgentStatuses).toHaveBeenCalledExactlyOnceWith(["Ubuntu"]),
    );
    expect(useAgentStatusesStore.getState().discoveryHidden).toBe(true);
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
    expect(useAgentStatusesStore.getState().inFirstLaunchDiscovery).toBe(false);
    expect(mocks.refreshAgentStatuses).not.toHaveBeenCalled();
  });

  it("disables Refresh while the selected machine is offline", () => {
    machine = { ...machine, status: "offline" };
    render(<AgentsGeneralSettings />);
    expect(screen.getByRole("button", { name: "Refresh detected agents" })).toBeDisabled();
    expect(mocks.rediscover).not.toHaveBeenCalled();
  });

  it("keeps pending discovery on its original machine when the selection changes", async () => {
    let finish!: () => void;
    machine = { ...machine, desktopId: "studio" };
    mocks.rediscover.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = () => resolve({ windows: [], wsl: [] });
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
    vi.useFakeTimers();
    mocks.refreshAgentStatuses.mockRejectedValueOnce(new Error("Host unavailable"));
    render(<AgentsGeneralSettings />);
    fireEvent.click(screen.getByRole("button", { name: "Refresh detected agents" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(mocks.danger).toHaveBeenCalledWith("Host unavailable");
    expect(screen.getByRole("button", { name: "Refresh detected agents" })).not.toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Refresh detected agents" }));
    expect(mocks.refreshAgentStatuses).toHaveBeenCalledTimes(2);
    expect(useAgentStatusesStore.getState().discoveryScanning).toBe(true);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
  });
});
