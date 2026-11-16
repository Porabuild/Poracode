import { act, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import type { AgentCapability, AgentStatus } from "@/shared/contracts";
import type { MachineDescriptor } from "@/renderer/state/machines";
import { dynamicActivate } from "@/renderer/i18n/i18n";
import { useAgentStatusesStore } from "@/renderer/state/agentStatusesStore";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { ModelVisibilitySection } from "./ModelVisibilitySection";

const envMocks = vi.hoisted(() => ({
  mobile: false,
  machine: {
    id: "local",
    kind: "local" as MachineDescriptor["kind"],
    label: "Local",
    status: "online" as MachineDescriptor["status"],
    ref: { host: "local" as const, env: { kind: "native" as const } },
  } as MachineDescriptor,
}));

vi.mock("@/renderer/state/machines", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/renderer/state/machines")>();
  return {
    ...actual,
    useSelectedMachine: () => envMocks.machine,
  };
});

vi.mock("@/renderer/components/common/ResponsiveMenuSurface", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/renderer/components/common/ResponsiveMenuSurface")>();
  return {
    ...actual,
    useResponsiveMenu: () => ({ mobile: envMocks.mobile, stackSubmenus: false }),
  };
});

function makeCapabilities(overrides: Partial<AgentCapability> = {}): AgentCapability {
  return {
    models: [{ id: "m1", label: "Model 1" }],
    efforts: [],
    modelEfforts: {},
    modes: ["agent"],
    approvalPolicies: [],
    sandboxModes: [],
    supportsResume: true,
    supportsDirectInput: true,
    liveInputMode: "terminal",
    presentationMode: "terminal",
    settingDefs: [],
    ...overrides,
  };
}

function makeOrbitDualAgent(): AgentStatus {
  return {
    kind: "orbit",
    label: "Orbit",
    installed: true,
    authState: "authenticated",
    capabilities: makeCapabilities({
      presentationModes: ["terminal", "gui"],
      models: [
        { id: "shared-model", label: "Shared Model" },
        { id: "cli-only-model", label: "CLI Only Model" },
      ],
      presentationCapabilities: {
        gui: {
          presentationMode: "gui",
          liveInputMode: "server",
          models: [
            { id: "shared-model", label: "Shared Model" },
            { id: "chat-only-model", label: "Chat Only Model" },
          ],
        },
      },
    }),
    runtimeVariants: {
      cli: {
        presentationMode: "terminal",
        installed: true,
        authState: "authenticated",
        authUsesProviderLogin: true,
        capabilities: makeCapabilities({
          runtimeLabel: "CLI",
          presentationMode: "terminal",
          presentationModes: ["terminal"],
          models: [
            { id: "shared-model", label: "Shared Model" },
            { id: "cli-only-model", label: "CLI Only Model" },
          ],
        }),
      },
      acp: {
        presentationMode: "gui",
        installed: true,
        authState: "authenticated",
        authUsesProviderLogin: true,
        capabilities: makeCapabilities({
          runtimeLabel: "ACP",
          showRuntimeLabelInPicker: false,
          presentationMode: "gui",
          presentationModes: ["gui"],
          liveInputMode: "server",
          models: [
            { id: "shared-model", label: "Shared Model" },
            { id: "chat-only-model", label: "Chat Only Model" },
          ],
        }),
      },
    },
  };
}

describe("ModelVisibilitySection", () => {
  beforeEach(() => {
    envMocks.mobile = false;
    envMocks.machine = {
      id: "local",
      kind: "local",
      label: "Local",
      status: "online",
      ref: { host: "local", env: { kind: "native" } },
    };
    useAgentStatusesStore.setState({ agentStatuses: [], wslAgentStatuses: [] });
    useRemoteServersStore.setState({ servers: [], runtime: {} });
    useSharedSettings.setState({
      hiddenModels: {},
      providerOrder: [],
      machineScopeModes: {
        providerOrder: "synced",
        hiddenModels: "synced",
        disabledAgents: "synced",
      },
      machineSettings: {},
    });
  });

  afterEach(async () => {
    await act(async () => {
      await dynamicActivate("en");
    });
  });

  it("deduplicates multi-surface CLI and Chat providers, honors providerOrder, and scopes surface tabs", async () => {
    const dualSurfaceAgent = makeOrbitDualAgent();
    const singleSurfaceAgent: AgentStatus = {
      kind: "nova",
      label: "Nova",
      installed: true,
      authState: "authenticated",
      capabilities: makeCapabilities({
        models: [
          { id: "nova-pro", label: "Nova Pro" },
          { id: "nova-mini", label: "Nova Mini" },
        ],
      }),
    };

    useAgentStatusesStore.setState({
      agentStatuses: [singleSurfaceAgent, dualSurfaceAgent],
    });
    useSharedSettings.setState({
      providerOrder: ["orbit", "nova"],
    });

    render(<ModelVisibilitySection />);

    // Unique total across Orbit (3 unique models, not 4) + Nova (2 models) = 5.
    const trigger = screen.getByRole("button", { name: "Visible models" });
    expect(trigger).toHaveTextContent("5 / 5");
    fireEvent.click(trigger);

    const rail = await screen.findByRole("group", { name: "Providers" });
    const railButtons = within(rail).getAllByRole("button");
    expect(railButtons).toHaveLength(2);
    expect(railButtons[0]).toHaveTextContent(/Orbit.*3\/3/);
    expect(railButtons[1]).toHaveTextContent(/Nova.*2\/2/);

    // Surface tabs appear for multi-surface Orbit and support Left/Right arrow roving.
    const surfaceTabs = screen.getByRole("tablist", { name: "Model surface" });
    const tabs = within(surfaceTabs).getAllByRole("tab");
    expect(tabs.map((tab) => tab.textContent)).toEqual(["All3", "CLI2", "ACP2"]);
    expect(tabs[0]).toHaveAttribute("tabIndex", "0");
    expect(tabs[1]).toHaveAttribute("tabIndex", "-1");

    // In All view, Shared Model appears once; surface-specific models carry their badge.
    const listbox = screen.getByRole("listbox", { name: "Visible models" });
    expect(listbox).toHaveAttribute("aria-multiselectable", "true");
    expect(within(listbox).getAllByRole("option")).toHaveLength(3);
    expect(within(listbox).getByText("CLI")).toBeInTheDocument();
    expect(within(listbox).getByText("ACP")).toBeInTheDocument();

    // Toggling Shared Model in All view hides it on both CLI and ACP surfaces.
    fireEvent.click(within(listbox).getByRole("option", { name: /Shared Model/ }));
    expect(useSharedSettings.getState().hiddenModels).toEqual({
      orbit: ["shared-model"],
      "orbit-acp": ["shared-model"],
    });

    // ArrowRight on the active surface tab moves to CLI, then ArrowRight again moves to ACP.
    fireEvent.keyDown(tabs[0]!, { key: "ArrowRight" });
    fireEvent.keyDown(within(surfaceTabs).getAllByRole("tab")[1]!, { key: "ArrowRight" });
    expect(screen.getByRole("checkbox", { name: "Orbit · ACP" })).toBeInTheDocument();

    fireEvent.click(within(listbox).getByRole("option", { name: /Shared Model/ }));
    expect(useSharedSettings.getState().hiddenModels).toEqual({
      orbit: ["shared-model"],
      "orbit-acp": [],
    });

    // Switching to single-surface Nova hides the surface tab bar.
    fireEvent.click(within(rail).getByRole("button", { name: /Nova/ }));
    expect(screen.queryByRole("tablist", { name: "Model surface" })).toBeNull();
  });

  it("supports keyboard ArrowDown/ArrowUp/Space navigation, search scope reset on backspace, and single-provider surface search", async () => {
    const orbit = makeOrbitDualAgent();
    useAgentStatusesStore.setState({ agentStatuses: [orbit] });

    const { rerender } = render(<ModelVisibilitySection />);
    fireEvent.click(screen.getByRole("button", { name: "Visible models" }));

    // Single-provider search keeps surface tabs and respects the selected surface.
    const surfaceTabs = await screen.findByRole("tablist", { name: "Model surface" });
    fireEvent.click(within(surfaceTabs).getByRole("tab", { name: /ACP/ }));
    const searchInput = screen.getByRole("textbox", { name: "Search models" });
    await act(async () => {
      fireEvent.change(searchInput, { target: { value: "shared" } });
    });
    expect(screen.getByRole("tablist", { name: "Model surface" })).toBeInTheDocument();

    // ArrowDown from search focuses the first option; Space toggles only ACP's key.
    fireEvent.keyDown(searchInput, { key: "ArrowDown" });
    const focusedOption = document.activeElement as HTMLElement;
    expect(focusedOption).toHaveAttribute("role", "option");
    fireEvent.keyDown(focusedOption, { key: " " });
    expect(useSharedSettings.getState().hiddenModels).toEqual({ "orbit-acp": ["shared-model"] });

    // Add a second provider, scope search to Orbit, backspace query to "", and verify scope resets to All.
    await act(async () => {
      fireEvent.change(searchInput, { target: { value: "" } });
    });
    const peer: AgentStatus = {
      kind: "peer",
      label: "Peer Agent",
      installed: true,
      authState: "authenticated",
      capabilities: makeCapabilities({
        models: [{ id: "peer-shared", label: "Shared Model" }],
      }),
    };
    act(() => {
      useAgentStatusesStore.setState({ agentStatuses: [orbit, peer] });
    });
    rerender(<ModelVisibilitySection />);

    await act(async () => {
      fireEvent.change(searchInput, { target: { value: "shared" } });
    });
    const searchRail = screen.getByRole("group", { name: "Providers" });
    fireEvent.click(within(searchRail).getByRole("button", { name: /Orbit/ }));
    await act(async () => {
      fireEvent.change(searchInput, { target: { value: "" } });
    });
    await act(async () => {
      fireEvent.change(searchInput, { target: { value: "shared" } });
    });

    // Both providers appear in cross-provider results because clearing reset searchScopeKind.
    const listbox = screen.getByRole("listbox", { name: "Visible models" });
    expect(within(listbox).getByRole("group", { name: "Orbit" })).toBeInTheDocument();
    expect(within(listbox).getByRole("group", { name: "Peer Agent" })).toBeInTheDocument();
  });

  it("scopes providers and model catalogs to the selected native, WSL, or remote machine", () => {
    const winClaude: AgentStatus = {
      kind: "claude",
      label: "Claude Code",
      installed: true,
      authState: "authenticated",
      envKind: "windows",
      capabilities: makeCapabilities({ models: [{ id: "win-model", label: "Win Model" }] }),
    };
    const ubuntuClaude: AgentStatus = {
      kind: "claude",
      label: "Claude Code",
      installed: true,
      authState: "authenticated",
      envKind: "wsl",
      envDistro: "Ubuntu",
      capabilities: makeCapabilities({
        models: [
          { id: "ubuntu-1", label: "Ubuntu 1" },
          { id: "ubuntu-2", label: "Ubuntu 2" },
        ],
      }),
    };
    const wslOnlyFx: AgentStatus = {
      kind: "fx",
      label: "fx",
      installed: true,
      authState: "authenticated",
      envKind: "wsl",
      envDistro: "Ubuntu",
      capabilities: makeCapabilities({ models: [{ id: "fx-1", label: "FX 1" }] }),
    };

    useAgentStatusesStore.setState({
      agentStatuses: [winClaude],
      wslAgentStatuses: [ubuntuClaude, wslOnlyFx],
    });

    const { rerender } = render(<ModelVisibilitySection />);
    // Native local machine sees only Windows Claude (1 model), not WSL-only fx.
    expect(screen.getByRole("button", { name: "Visible models" })).toHaveTextContent("1 / 1");

    // Selecting WSL Ubuntu switches to Ubuntu's Claude (2 models) + WSL-only fx (1 model) = 3.
    envMocks.machine = {
      id: "local/wsl:Ubuntu",
      kind: "local-wsl",
      label: "Ubuntu",
      wslDistro: "Ubuntu",
      status: "online",
      ref: { host: "local", env: { kind: "wsl", distro: "Ubuntu" } },
    };
    rerender(<ModelVisibilitySection />);
    expect(screen.getByRole("button", { name: "Visible models" })).toHaveTextContent("3 / 3");
  });

  it("disambiguates the 'All' filter chip in Japanese so it translates to 'すべて' rather than '全期間'", async () => {
    await act(async () => {
      await dynamicActivate("ja");
    });
    useAgentStatusesStore.setState({ agentStatuses: [makeOrbitDualAgent()] });

    render(<ModelVisibilitySection />);
    fireEvent.click(screen.getByRole("button", { name: "可視モデル" }));

    const surfaceTabs = await screen.findByRole("tablist");
    const firstTab = within(surfaceTabs).getAllByRole("tab")[0]!;
    expect(firstTab).toHaveTextContent("すべて");
    expect(firstTab).not.toHaveTextContent("全期間");
  });

  it("renders a compact bottom sheet with non-orphaned provider chips on mobile", async () => {
    envMocks.mobile = true;
    const peer: AgentStatus = {
      kind: "nova",
      label: "Nova",
      installed: true,
      authState: "authenticated",
      capabilities: makeCapabilities({ models: [{ id: "nova-shared", label: "Shared Model" }] }),
    };
    useAgentStatusesStore.setState({ agentStatuses: [makeOrbitDualAgent(), peer] });

    render(<ModelVisibilitySection />);
    fireEvent.click(screen.getByRole("button", { name: "Visible models" }));

    const strip = await screen.findByRole("group", { name: "Providers" });
    expect(within(strip).getAllByRole("button")).toHaveLength(2);

    const searchInput = screen.getByRole("textbox", { name: "Search models" });
    await act(async () => {
      fireEvent.change(searchInput, { target: { value: "shared" } });
    });
    const searchStrip = screen.getByRole("group", { name: "Providers" });
    expect(within(searchStrip).queryAllByRole("tab")).toHaveLength(0);
    expect(within(searchStrip).getAllByRole("button")).toHaveLength(3);
  });
});
