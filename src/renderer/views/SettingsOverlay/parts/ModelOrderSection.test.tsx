import type { ReactNode } from "react";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  AcpRegistryListResult,
  AgentStatus,
  AgentStatusesResponse,
  InstalledAcpRegistryAgent,
  Project,
} from "@/shared/contracts";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";

const statusesState = {
  agentStatuses: [] as AgentStatus[],
  wslAgentStatuses: [] as AgentStatus[],
};

const settingsState = {
  providerOrder: [] as string[],
  machineScopeModes: {
    providerOrder: "synced" as const,
    hiddenModels: "synced" as const,
    disabledAgents: "synced" as const,
  },
  machineSettings: {} as Record<string, { providerOrder?: string[] }>,
  setProviderOrder: vi.fn<(order: string[]) => void>(),
  setMachineScopeMode: vi.fn<(domain: string, mode: string) => void>(),
  setMachineProviderOrder: vi.fn<(machineId: string, order: string[]) => void>(),
  lockProviderOrderToMachine: vi.fn<(machineId: string) => void>(),
  acpRegistryInstalledAgents: {} as Record<string, InstalledAcpRegistryAgent>,
  syncAcpRegistryInstalledAgents: vi.fn<(installed: InstalledAcpRegistryAgent[]) => void>(),
};

const appState = { projects: [] as Project[] };

const bridge = {
  getLatestAgentVersion:
    vi.fn<(payload: { agentKind: string }) => Promise<{ source: string; version?: string }>>(),
  updateAgentBinary: vi.fn<
    (payload: { agentKind: string; envKind: string; wslDistro?: string }) => Promise<{
      ok: boolean;
      output?: string;
    }>
  >(),
  updateAcpRegistryAgent:
    vi.fn<(payload: { agentId: string }) => Promise<{ installed: InstalledAcpRegistryAgent[] }>>(),
  refreshAgentStatuses: vi.fn<() => Promise<AgentStatusesResponse>>(),
  listAcpRegistry: vi.fn<() => Promise<AcpRegistryListResult>>(),
};

const toastMock = vi.hoisted(() => ({
  success: vi.fn<(message: string) => void>(),
  danger: vi.fn<(message: string) => void>(),
}));

vi.mock("@/renderer/state/agentStatusesStore", () => ({
  useAgentStatusesStore: (selector: (state: typeof statusesState) => unknown) =>
    selector(statusesState),
}));

vi.mock("@/renderer/state/sharedSettingsStore", () => ({
  useSharedSettings: (selector: (state: typeof settingsState) => unknown) =>
    selector(settingsState),
}));

vi.mock("@/renderer/state/appStore", () => ({
  useAppStore: Object.assign(
    (selector: (state: typeof appState) => unknown) => selector(appState),
    {
      getState: () => appState,
    },
  ),
}));

vi.mock("@/renderer/bridge", () => ({
  readBridge: () => bridge,
}));

vi.mock("@/renderer/state/remoteServersStore", () => ({
  useRemoteServersStore: (
    selector: (state: { servers: never[]; runtime: Record<string, never> }) => unknown,
  ) => selector({ servers: [], runtime: {} }),
}));

vi.mock("@heroui/react", () => ({
  toast: toastMock,
  Button: (props: {
    children?: ReactNode;
    "aria-label"?: string;
    "aria-disabled"?: boolean;
    isPending?: boolean;
    isDisabled?: boolean;
    onPress?: () => void;
  }) => (
    <button
      type="button"
      aria-label={props["aria-label"]}
      aria-disabled={props["aria-disabled"]}
      disabled={props.isDisabled}
      onClick={props.onPress}
    >
      {props.children}
    </button>
  ),
}));

vi.mock("@dnd-kit/react", () => ({
  DragDropProvider: (props: { children?: ReactNode }) => <div>{props.children}</div>,
}));

vi.mock("@dnd-kit/react/sortable", () => ({
  isSortable: () => false,
  useSortable: () => ({ ref: () => {}, handleRef: () => {}, isDragging: false }),
}));

vi.mock("@/renderer/components/common", () => ({
  PixelLoader: () => <span data-testid="loader" role="img" aria-label="Loading" />,
  ToggleSwitch: (props: { "aria-label"?: string; isSelected?: boolean }) => (
    <input type="checkbox" aria-label={props["aria-label"]} checked={props.isSelected} readOnly />
  ),
}));

vi.mock("@/renderer/components/providers/ProviderIcon", () => ({
  ProviderIcon: (props: { fallbackLabel?: string }) => <span>{props.fallbackLabel}</span>,
}));

import { ModelOrderSection } from "./ModelOrderSection";

function makeStatus(overrides: Partial<AgentStatus> & { kind: string }): AgentStatus {
  return {
    label: overrides.kind,
    installed: true,
    envKind: "posix",
    capabilities: {},
    ...overrides,
  } as AgentStatus;
}

describe("ModelOrderSection provider updates", () => {
  beforeEach(() => {
    statusesState.agentStatuses = [];
    statusesState.wslAgentStatuses = [];
    settingsState.providerOrder = [];
    settingsState.acpRegistryInstalledAgents = {};
    toastMock.success.mockReset();
    toastMock.danger.mockReset();
    bridge.getLatestAgentVersion.mockReset().mockResolvedValue({ source: "unknown" });
    bridge.updateAgentBinary.mockReset().mockResolvedValue({ ok: true });
    bridge.updateAcpRegistryAgent.mockReset().mockResolvedValue({ installed: [] });
    bridge.refreshAgentStatuses
      .mockReset()
      .mockResolvedValue({ windows: [], wsl: [] } as unknown as AgentStatusesResponse);
    bridge.listAcpRegistry.mockReset().mockResolvedValue({ version: "1", agents: [] });
  });

  it("shows the installed version of every provider", async () => {
    statusesState.agentStatuses = [
      makeStatus({ kind: "claude", label: "Claude Code", version: "1.2.3" }),
      makeStatus({ kind: "codex", label: "Codex" }),
    ];

    render(<ModelOrderSection />);

    expect(await screen.findByText("v1.2.3")).toBeTruthy();
    expect(screen.getByText("—")).toBeTruthy();
  });

  it("scopes each provider row's version to the selected machine", async () => {
    statusesState.agentStatuses = [
      makeStatus({ kind: "claude", label: "Claude Code", version: "1.2.3", envKind: "windows" }),
      makeStatus({ kind: "codex", label: "Codex", version: "1.0.0", envKind: "windows" }),
    ];
    statusesState.wslAgentStatuses = [
      makeStatus({
        kind: "claude",
        label: "Claude Code",
        version: "1.1.0",
        envKind: "wsl",
        envDistro: "Ubuntu",
      }),
      makeStatus({
        kind: "codex",
        label: "Codex",
        version: "1.0.0",
        envKind: "wsl",
        envDistro: "Ubuntu",
      }),
    ];

    render(<ModelOrderSection />);

    // The default scope is the local machine, so only its versions render —
    // the WSL copy belongs to the "local/wsl:Ubuntu" machine.
    expect(await screen.findByText("v1.2.3")).toBeTruthy();
    expect(screen.getByText("v1.0.0")).toBeTruthy();
    expect(screen.queryByText(/WSL/)).toBeNull();
  });

  it("offers a per-provider update when the published version is newer", async () => {
    statusesState.agentStatuses = [
      makeStatus({ kind: "claude", label: "Claude Code", version: "1.2.3" }),
    ];
    bridge.getLatestAgentVersion.mockResolvedValue({ source: "npm", version: "1.3.0" });

    render(<ModelOrderSection />);

    fireEvent.click(await screen.findByRole("button", { name: "Update Claude Code to v1.3.0" }));

    await waitFor(() =>
      expect(bridge.updateAgentBinary).toHaveBeenCalledWith({
        agentKind: "claude",
        envKind: "posix",
      }),
    );
    await waitFor(() =>
      expect(toastMock.success).toHaveBeenCalledWith("Claude Code updated to v1.3.0."),
    );
  });

  it("hides the update control while the provider is current", async () => {
    statusesState.agentStatuses = [
      makeStatus({ kind: "claude", label: "Claude Code", version: "1.3.0" }),
    ];
    bridge.getLatestAgentVersion.mockResolvedValue({ source: "npm", version: "1.3.0" });

    render(<ModelOrderSection />);

    await waitFor(() => expect(bridge.getLatestAgentVersion).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: /^Update/u })).toBeNull();
    expect(screen.queryByRole("button", { name: "Update all" })).toBeNull();
  });

  it("updates every outdated provider from the Update all control", async () => {
    statusesState.agentStatuses = [
      makeStatus({ kind: "claude", label: "Claude Code", version: "1.2.3" }),
      makeStatus({ kind: "codex", label: "Codex", version: "0.9.0" }),
      makeStatus({ kind: "gemini", label: "Gemini", version: "2.0.0" }),
    ];
    bridge.getLatestAgentVersion.mockImplementation(({ agentKind }) =>
      Promise.resolve(
        agentKind === "gemini"
          ? { source: "npm", version: "2.0.0" }
          : { source: "npm", version: agentKind === "claude" ? "1.3.0" : "1.0.0" },
      ),
    );

    render(<ModelOrderSection />);

    fireEvent.click(await screen.findByRole("button", { name: "Update all" }));

    await waitFor(() => expect(bridge.updateAgentBinary).toHaveBeenCalledTimes(2));
    expect(bridge.updateAgentBinary.mock.calls.map(([payload]) => payload.agentKind)).toEqual([
      "claude",
      "codex",
    ]);
  });

  it("shows queued, updating, and probing phases during Update all", async () => {
    statusesState.agentStatuses = [
      makeStatus({ kind: "claude", label: "Claude Code", version: "1.2.3" }),
      makeStatus({ kind: "codex", label: "Codex", version: "0.9.0" }),
    ];
    bridge.getLatestAgentVersion.mockImplementation(({ agentKind }) =>
      Promise.resolve({
        source: "npm",
        version: agentKind === "claude" ? "1.3.0" : "1.0.0",
      }),
    );
    let resolveClaudeUpdate!: (value: { ok: boolean }) => void;
    let resolveCodexUpdate!: (value: { ok: boolean }) => void;
    const resolveRefreshes: Array<(value: AgentStatusesResponse) => void> = [];
    bridge.updateAgentBinary.mockImplementation(
      ({ agentKind }) =>
        new Promise((resolve) => {
          if (agentKind === "claude") resolveClaudeUpdate = resolve;
          else resolveCodexUpdate = resolve;
        }),
    );
    bridge.refreshAgentStatuses.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRefreshes.push(resolve);
        }),
    );

    render(<ModelOrderSection />);
    const updateAllButton = await screen.findByRole("button", { name: "Update all" });
    updateAllButton.focus();
    fireEvent.click(updateAllButton);

    const firstProgress = await screen.findByRole("status", {
      name: "Updating Claude Code to v1.3.0",
    });
    expect(firstProgress.querySelector("span.truncate")).toBeTruthy();
    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(document.activeElement).toBe(updateAllButton);
    expect(updateAllButton).toHaveAttribute("aria-disabled", "true");
    expect(screen.queryByRole("img", { name: "Loading" })).toBeNull();
    expect(screen.getByText("Updating to v1.3.0")).toBeTruthy();
    expect(screen.getByText("Queued for v1.0.0")).toBeTruthy();
    expect(bridge.updateAgentBinary).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveClaudeUpdate({ ok: true });
    });

    expect(await screen.findByRole("status", { name: "Probing Claude Code v1.3.0" })).toBeTruthy();
    expect(screen.getByText("Probing v1.3.0")).toBeTruthy();
    expect(screen.getByText("Queued for v1.0.0")).toBeTruthy();

    await act(async () => {
      resolveRefreshes.shift()?.({ windows: [], wsl: [] } as unknown as AgentStatusesResponse);
    });

    expect(await screen.findByText("Updating Codex to v1.0.0")).toBeTruthy();
    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(screen.getByText("Updating to v1.0.0")).toBeTruthy();
    expect(bridge.updateAgentBinary).toHaveBeenCalledTimes(2);

    await act(async () => {
      resolveCodexUpdate({ ok: true });
    });

    expect(await screen.findByRole("status", { name: "Probing Codex v1.0.0" })).toBeTruthy();
    expect(screen.getByText("Probing v1.0.0")).toBeTruthy();

    await act(async () => {
      resolveRefreshes.shift()?.({ windows: [], wsl: [] } as unknown as AgentStatusesResponse);
    });
  });

  it("keeps an individual provider's versioned row status until refresh finishes", async () => {
    statusesState.agentStatuses = [
      makeStatus({ kind: "claude", label: "Claude Code", version: "1.2.3" }),
    ];
    bridge.getLatestAgentVersion.mockResolvedValue({ source: "npm", version: "1.3.0" });
    let resolveUpdate!: (value: { ok: boolean }) => void;
    bridge.updateAgentBinary.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveUpdate = resolve;
        }),
    );
    let resolveRefresh!: (value: AgentStatusesResponse) => void;
    bridge.refreshAgentStatuses.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRefresh = resolve;
        }),
    );

    const view = render(<ModelOrderSection />);
    fireEvent.click(await screen.findByRole("button", { name: "Update Claude Code to v1.3.0" }));

    const rowStatus = await screen.findByRole("status", {
      name: "Updating Claude Code to v1.3.0",
    });
    expect(rowStatus).toHaveClass("min-w-[6.5rem]", "max-w-[45%]", "shrink-0");
    expect(rowStatus.querySelector("span.truncate")).toHaveTextContent("Updating to v1.3.0");

    await act(async () => {
      resolveUpdate({ ok: true });
    });

    await waitFor(() => expect(bridge.refreshAgentStatuses).toHaveBeenCalled());
    expect(screen.getByRole("status", { name: "Probing Claude Code v1.3.0" })).toHaveTextContent(
      "Probing v1.3.0",
    );

    statusesState.agentStatuses = [
      makeStatus({ kind: "claude", label: "Claude Code", version: "1.3.0" }),
    ];
    view.rerender(<ModelOrderSection />);

    expect(screen.getByRole("status", { name: "Probing Claude Code v1.3.0" })).toHaveTextContent(
      "Probing v1.3.0",
    );

    await act(async () => {
      resolveRefresh({ windows: [], wsl: [] } as unknown as AgentStatusesResponse);
    });
  });

  it("offers updates only on base providers, not their profiles", async () => {
    statusesState.agentStatuses = [
      makeStatus({ kind: "claude", label: "Claude Code", version: "1.2.3" }),
      makeStatus({ kind: "claude:work", label: "Claude Z AI", version: "1.2.3" }),
    ];
    bridge.getLatestAgentVersion.mockResolvedValue({ source: "npm", version: "1.3.0" });

    render(<ModelOrderSection />);

    expect(
      await screen.findByRole("button", { name: "Update Claude Code to v1.3.0" }),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Update Claude Z AI to v1.3.0" })).toBeNull();
    expect(bridge.getLatestAgentVersion).toHaveBeenCalledTimes(1);
    expect(bridge.getLatestAgentVersion).toHaveBeenCalledWith({ agentKind: "claude" });

    fireEvent.click(screen.getByRole("button", { name: "Update all" }));

    await waitFor(() => expect(bridge.updateAgentBinary).toHaveBeenCalledTimes(1));
    expect(bridge.updateAgentBinary).toHaveBeenCalledWith({
      agentKind: "claude",
      envKind: "posix",
    });
  });

  it("updates only the selected machine's environment", async () => {
    statusesState.agentStatuses = [
      makeStatus({ kind: "claude", label: "Claude Code", version: "1.2.3", envKind: "windows" }),
    ];
    // A WSL copy belongs to another machine and must not be touched by an
    // update-all run scoped to the local machine.
    statusesState.wslAgentStatuses = [
      makeStatus({
        kind: "claude",
        label: "Claude Code",
        version: "1.1.0",
        envKind: "wsl",
        envDistro: "Ubuntu",
      }),
    ];
    bridge.getLatestAgentVersion.mockResolvedValue({ source: "npm", version: "1.3.0" });

    render(<ModelOrderSection />);

    fireEvent.click(await screen.findByRole("button", { name: "Update all" }));

    await waitFor(() => expect(bridge.updateAgentBinary).toHaveBeenCalledTimes(1));
    expect(bridge.updateAgentBinary.mock.calls.map(([payload]) => payload)).toEqual([
      { agentKind: "claude", envKind: "windows" },
    ]);
  });

  it("reports a failed update without claiming success", async () => {
    statusesState.agentStatuses = [
      makeStatus({ kind: "claude", label: "Claude Code", version: "1.2.3" }),
    ];
    bridge.getLatestAgentVersion.mockResolvedValue({ source: "npm", version: "1.3.0" });
    bridge.updateAgentBinary.mockResolvedValue({ ok: false, output: "npm ERR! EACCES" });

    render(<ModelOrderSection />);

    fireEvent.click(await screen.findByRole("button", { name: "Update Claude Code to v1.3.0" }));

    await waitFor(() =>
      expect(toastMock.danger).toHaveBeenCalledWith(
        "Unable to update Claude Code: npm ERR! EACCES",
      ),
    );
    expect(toastMock.success).not.toHaveBeenCalled();
  });

  it("reports a failed machine update without claiming success", async () => {
    statusesState.agentStatuses = [
      makeStatus({ kind: "claude", label: "Claude Code", version: "1.2.3", envKind: "windows" }),
    ];
    bridge.getLatestAgentVersion.mockResolvedValue({ source: "npm", version: "1.3.0" });
    bridge.updateAgentBinary.mockResolvedValue({ ok: false, output: "npm ERR! EACCES" });

    render(<ModelOrderSection />);

    fireEvent.click(await screen.findByRole("button", { name: "Update Claude Code to v1.3.0" }));

    await waitFor(() => expect(bridge.updateAgentBinary).toHaveBeenCalledTimes(1));
    expect(bridge.updateAgentBinary.mock.calls.map(([payload]) => payload)).toEqual([
      { agentKind: "claude", envKind: "windows" },
    ]);
    expect(toastMock.danger).toHaveBeenCalledWith("Unable to update Claude Code: npm ERR! EACCES");
    expect(toastMock.success).not.toHaveBeenCalled();
  });

  it("disables per-provider updates while an update-all run is active", async () => {
    statusesState.agentStatuses = [
      makeStatus({ kind: "claude", label: "Claude Code", version: "1.2.3" }),
      makeStatus({ kind: "codex", label: "Codex", version: "0.9.0" }),
    ];
    let resolveCodexProbe!: (value: { source: string; version?: string }) => void;
    bridge.getLatestAgentVersion.mockImplementation(({ agentKind }) =>
      agentKind === "claude"
        ? Promise.resolve({ source: "npm", version: "1.3.0" })
        : new Promise((resolve) => {
            resolveCodexProbe = resolve;
          }),
    );
    let resolveClaudeUpdate!: (value: { ok: boolean; output?: string }) => void;
    bridge.updateAgentBinary.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveClaudeUpdate = resolve;
        }),
    );

    render(<ModelOrderSection />);
    fireEvent.click(await screen.findByRole("button", { name: "Update all" }));

    await act(async () => {
      resolveCodexProbe({ source: "npm", version: "1.0.0" });
    });
    const codexButton = screen.getByRole("button", {
      name: "Update Codex to v1.0.0",
    }) as HTMLButtonElement;
    expect(codexButton.disabled).toBe(true);

    await act(async () => {
      resolveClaudeUpdate({ ok: true });
    });
    await waitFor(() => expect(codexButton.disabled).toBe(false));
    await waitFor(() =>
      expect(toastMock.success).toHaveBeenCalledWith("Claude Code updated to v1.3.0."),
    );
  });

  it("routes ACP registry instances through the registry update", async () => {
    statusesState.agentStatuses = [
      makeStatus({ kind: "acp-generic:pi-acp", label: "Pi", version: "0.1.0" }),
    ];
    settingsState.acpRegistryInstalledAgents = {
      "pi-acp": { id: "pi-acp", version: "0.1.0" } as InstalledAcpRegistryAgent,
    };
    bridge.listAcpRegistry.mockResolvedValue({
      version: "1",
      agents: [{ id: "pi-acp", version: "0.2.0" }],
    } as unknown as AcpRegistryListResult);

    render(<ModelOrderSection />);

    fireEvent.click(await screen.findByRole("button", { name: "Update Pi to v0.2.0" }));

    await waitFor(() =>
      expect(bridge.updateAcpRegistryAgent).toHaveBeenCalledWith({ agentId: "pi-acp" }),
    );
    expect(bridge.updateAgentBinary).not.toHaveBeenCalled();
  });
});
