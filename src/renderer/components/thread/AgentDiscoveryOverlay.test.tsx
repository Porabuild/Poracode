import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { useAgentStatusesStore } from "@/renderer/state/agentStatusesStore";
import { AgentDiscoveryOverlay } from "./AgentDiscoveryOverlay";

beforeEach(() => {
  vi.useFakeTimers();
  useAgentStatusesStore.setState({
    inFirstLaunchDiscovery: true,
    discoveryScanning: true,
    discoveryHidden: false,
    discoveryScope: { kind: "native" },
    discoveredAgents: [],
  });
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
