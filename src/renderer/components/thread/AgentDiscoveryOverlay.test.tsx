import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { useAgentStatusesStore } from "@/renderer/state/agentStatusesStore";
import { refreshDiscoveredAgent } from "@/renderer/actions/agentDiscoveryActions";
import {
  agentStatusSchema,
  type AgentStatusesResponse,
  type RefreshAgentScope,
} from "@/shared/contracts";
import { AgentDiscoveryOverlay } from "./AgentDiscoveryOverlay";

const bridge = vi.hoisted(() => ({
  refreshAgentStatuses:
    vi.fn<(distros: string[], scope?: RefreshAgentScope) => Promise<AgentStatusesResponse>>(),
}));
vi.mock("@/renderer/bridge", () => ({ readBridge: () => bridge }));

const foundAgent = agentStatusSchema.parse({
  kind: "countdown-test",
  label: "Countdown test agent",
  installed: true,
  authState: "authenticated",
  capabilities: {},
});

beforeEach(() => {
  vi.useFakeTimers();
  useAgentStatusesStore.setState({
    inFirstLaunchDiscovery: true,
    discoveryScanning: true,
    discoveryAutoHideCancelled: false,
    discoveryHidden: false,
    discoveryScope: { kind: "native" },
    discoveredAgents: [],
  });
  bridge.refreshAgentStatuses
    .mockReset()
    .mockResolvedValue({ windows: [], wsl: [], fromCache: false });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  useAgentStatusesStore.getState().resetDiscoveredAgents();
});

function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

function finishDiscovery() {
  act(() => {
    useAgentStatusesStore.setState({ discoveryScanning: false });
  });
}

describe("discovery completion countdown", () => {
  it("does not dismiss when a refresh starts at the countdown deadline", async () => {
    useAgentStatusesStore.setState({ discoveredAgents: [foundAgent] });
    render(<AgentDiscoveryOverlay />);
    finishDiscovery();
    advance(9000);
    await act(async () => {
      const refresh = refreshDiscoveredAgent([foundAgent]);
      vi.advanceTimersByTime(1000);
      await refresh;
    });
    expect(screen.getByRole("button", { name: "Done" })).toBeEnabled();
  });

  it.each(["success", "failure"])(
    "keeps results open after a manual refresh ends in %s and restores the timer for a new scan",
    async (outcome) => {
      if (outcome === "failure") {
        bridge.refreshAgentStatuses.mockRejectedValueOnce(new Error("Refresh failed"));
      }
      useAgentStatusesStore.setState({ discoveredAgents: [foundAgent] });
      render(<AgentDiscoveryOverlay />);
      finishDiscovery();
      advance(3000);
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "Refresh Countdown test agent" }));
      });
      expect(bridge.refreshAgentStatuses).toHaveBeenCalledOnce();
      expect(screen.getByRole("button", { name: "Done" })).toBeEnabled();
      advance(15_000);
      expect(screen.getByRole("button", { name: "Done" })).toBeEnabled();
      fireEvent.click(screen.getByRole("button", { name: "Done" }));
      expect(screen.queryByRole("region")).not.toBeInTheDocument();

      act(() => {
        useAgentStatusesStore.getState().beginFirstLaunchDiscovery({ kind: "all", wslDistros: [] });
      });
      finishDiscovery();
      expect(screen.getByRole("button", { name: "Done (10s)" })).toBeInTheDocument();
      advance(10_000);
      expect(screen.queryByRole("region")).not.toBeInTheDocument();
    },
  );

  it("remembers a refresh during scanning when the screen is hidden and reopened", async () => {
    useAgentStatusesStore.setState({ discoveredAgents: [foundAgent] });
    render(<AgentDiscoveryOverlay />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Refresh Countdown test agent" }));
    });
    fireEvent.click(screen.getByRole("button", { name: "Hide" }));
    finishDiscovery();
    advance(15_000);
    fireEvent.click(screen.getByRole("button", { name: "Show agent discovery" }));
    expect(screen.getByRole("button", { name: "Done" })).toBeEnabled();
    advance(15_000);
    expect(screen.getByRole("button", { name: "Done" })).toBeEnabled();
  });

  it("starts only after scanning finishes and dismisses after ten seconds", () => {
    render(<AgentDiscoveryOverlay />);
    advance(15_000);
    expect(screen.getByRole("button", { name: "Hide" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Done/ })).not.toBeInTheDocument();

    finishDiscovery();
    expect(screen.getByRole("button", { name: "Done (10s)" })).toBeEnabled();
    advance(1000);
    expect(screen.getByRole("button", { name: "Done (9s)" })).toBeEnabled();
    advance(8000);
    expect(screen.getByRole("button", { name: "Done (1s)" })).toBeInTheDocument();
    expect(useAgentStatusesStore.getState().inFirstLaunchDiscovery).toBe(true);
    advance(1000);
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
    expect(useAgentStatusesStore.getState().inFirstLaunchDiscovery).toBe(false);
  });

  it("lets Done dismiss immediately without a later timer closing a new scan", () => {
    render(<AgentDiscoveryOverlay />);
    finishDiscovery();
    advance(3000);
    fireEvent.click(screen.getByRole("button", { name: "Done (7s)" }));
    expect(screen.queryByRole("region")).not.toBeInTheDocument();

    act(() => {
      useAgentStatusesStore.getState().beginFirstLaunchDiscovery({ kind: "all", wslDistros: [] });
    });
    advance(10_000);
    expect(screen.getByRole("button", { name: "Hide" })).toBeInTheDocument();
    expect(useAgentStatusesStore.getState().discoveryScanning).toBe(true);
  });

  it("keeps the original deadline when the screen rerenders", () => {
    const view = render(<AgentDiscoveryOverlay />);
    finishDiscovery();
    advance(4000);
    view.rerender(<AgentDiscoveryOverlay />);
    expect(screen.getByRole("button", { name: "Done (6s)" })).toBeInTheDocument();
    advance(6000);
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
  });

  it("cleans up on unmount", () => {
    const view = render(<AgentDiscoveryOverlay />);
    finishDiscovery();
    advance(3000);
    view.unmount();
    advance(10_000);
    expect(useAgentStatusesStore.getState().inFirstLaunchDiscovery).toBe(true);
  });

  it("cancels the countdown during a new scan and starts fresh when it finishes", () => {
    render(<AgentDiscoveryOverlay />);
    finishDiscovery();
    advance(3000);
    act(() => {
      useAgentStatusesStore.getState().beginFirstLaunchDiscovery({ kind: "all", wslDistros: [] });
    });
    advance(10_000);
    expect(screen.getByRole("button", { name: "Hide" })).toBeInTheDocument();
    finishDiscovery();
    expect(screen.getByRole("button", { name: "Done (10s)" })).toBeInTheDocument();
    advance(10_000);
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
  });
});
