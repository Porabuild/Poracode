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

  it("keeps grid cards symmetrical during scanning and settles radar, subtitle, and remainder cards on completion", () => {
    useAgentStatusesStore.setState({
      discoveredAgents: [
        foundAgent,
        { ...foundAgent, kind: "second-agent", label: "Second agent" },
        { ...foundAgent, kind: "third-agent", label: "Third agent" },
        { ...foundAgent, kind: "fourth-agent", label: "Fourth agent" },
      ],
    });
    render(<AgentDiscoveryOverlay />);

    const region = screen.getByRole("region");
    const cardsWhileScanning = [...region.querySelectorAll<HTMLElement>("[data-motion-key]")];
    expect(cardsWhileScanning).toHaveLength(4);
    for (const card of cardsWhileScanning) {
      expect(card.className).not.toContain("justify-self-center");
      expect(card.className).not.toContain("lg:col-start-");
      expect(card.querySelector(".agent-discovery-row")).not.toBeNull();
      const refreshBtn = card.querySelector<HTMLButtonElement>("button");
      expect(refreshBtn?.className).toContain("agent-discovery-card__refresh");
      expect(refreshBtn?.className).not.toContain("agent-discovery-card__refresh--active");
    }
    expect(region.querySelector(".agent-discovery-radar__signals")).not.toBeNull();
    expect(region.querySelectorAll(".agent-discovery-radar__planet")).toHaveLength(4);
    expect(region.querySelector(".agent-discovery-subtitle--open")).not.toBeNull();

    finishDiscovery();

    // 4 agents on 3-col desktop leaves 1 remainder card centered (col-start-3).
    const cardsAfterScan = [...region.querySelectorAll<HTMLElement>("[data-motion-key]")];
    expect(cardsAfterScan[0]?.className).not.toContain("lg:col-start-");
    expect(cardsAfterScan[3]?.className).toContain("lg:col-start-3");
    expect(region.querySelector(".agent-discovery-subtitle--open")).toBeNull();
    expect(region.querySelector(".agent-discovery-radar__signals--exiting")).not.toBeNull();

    advance(650);
    expect(region.querySelector(".agent-discovery-radar__signals")).toBeNull();
    // Discovered constellation stays visible after scanning finishes.
    expect(region.querySelector(".agent-discovery-radar__constellation")).not.toBeNull();
    expect(region.querySelectorAll(".agent-discovery-radar__planet")).toHaveLength(4);
  });

  it("auto-scrolls to follow newly discovered agents and pauses when the user scrolls up", () => {
    useAgentStatusesStore.setState({ discoveredAgents: [foundAgent] });
    render(<AgentDiscoveryOverlay />);

    const region = screen.getByRole("region");
    const list = region.querySelector("[data-motion-key]")?.parentElement;
    const scroller = list?.parentElement;
    expect(scroller).not.toBeNull();

    let scrollTop = 0;
    let scrollHeight = 600;
    const clientHeight = 300;
    Object.defineProperties(scroller!, {
      scrollTop: {
        configurable: true,
        get: () => scrollTop,
        set: (value: number) => {
          scrollTop = value;
        },
      },
      scrollHeight: { configurable: true, get: () => scrollHeight },
      clientHeight: { configurable: true, get: () => clientHeight },
    });
    const scrollToSpy = vi.fn<(options: ScrollToOptions) => void>(({ top }) => {
      scrollTop = top ?? scrollTop;
    });
    Object.defineProperty(scroller!, "scrollTo", { configurable: true, value: scrollToSpy });

    act(() => {
      useAgentStatusesStore.getState().pushDiscoveredAgent({
        ...foundAgent,
        kind: "agent-two",
        label: "Agent two",
      });
    });
    expect(scrollToSpy).toHaveBeenCalledWith({ top: 300, behavior: "smooth" });

    // User wheels upward to read earlier items -> stops following new arrivals.
    scrollToSpy.mockClear();
    fireEvent.wheel(scroller!, { deltaY: -120 });
    // Cancelling the smooth follow is instant and must not pull the viewport
    // back toward the bottom; the user's scroll stays where it is.
    expect(scrollToSpy).toHaveBeenCalledExactlyOnceWith({ top: 300, behavior: "auto" });
    scrollToSpy.mockClear();
    scrollTop = 180;
    fireEvent.scroll(scroller!);
    scrollHeight = 800;
    act(() => {
      useAgentStatusesStore.getState().pushDiscoveredAgent({
        ...foundAgent,
        kind: "agent-three",
        label: "Agent three",
      });
    });
    expect(scrollToSpy).not.toHaveBeenCalled();

    // User scrolls back to the bottom -> resumes following new arrivals.
    scrollTop = 490;
    fireEvent.scroll(scroller!);
    scrollHeight = 950;
    act(() => {
      useAgentStatusesStore.getState().pushDiscoveredAgent({
        ...foundAgent,
        kind: "agent-four",
        label: "Agent four",
      });
    });
    expect(scrollToSpy).toHaveBeenCalledWith({ top: 650, behavior: "smooth" });
  });
});
