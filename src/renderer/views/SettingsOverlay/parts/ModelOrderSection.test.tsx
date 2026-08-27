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
  setProviderOrder: vi.fn<(order: string[]) => void>(),
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

vi.mock("@heroui/react", () => ({
  toast: toastMock,
  Button: (props: {
    children?: ReactNode;
    "aria-label"?: string;
    isPending?: boolean;
    isDisabled?: boolean;
    onPress?: () => void;
  }) => (
    <button
      type="button"
      aria-label={props["aria-label"]}
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
  PixelLoader: () => <span data-testid="loader" />,
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

  it("breaks the version out per environment only when they disagree", async () => {
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

    expect(await screen.findByText("Windows v1.2.3 · WSL (Ubuntu) v1.1.0")).toBeTruthy();
    expect(screen.getByText("v1.0.0")).toBeTruthy();
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

  it("updates each outdated environment of a provider once", async () => {
    statusesState.agentStatuses = [
      makeStatus({ kind: "claude", label: "Claude Code", version: "1.2.3", envKind: "windows" }),
    ];
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

    await waitFor(() => expect(bridge.updateAgentBinary).toHaveBeenCalledTimes(2));
    expect(bridge.updateAgentBinary.mock.calls.map(([payload]) => payload)).toEqual([
      { agentKind: "claude", envKind: "windows" },
      { agentKind: "claude", envKind: "wsl", wslDistro: "Ubuntu" },
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

  it("still updates the remaining environments when one environment fails", async () => {
    statusesState.agentStatuses = [
      makeStatus({ kind: "claude", label: "Claude Code", version: "1.2.3", envKind: "windows" }),
    ];
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
    bridge.updateAgentBinary.mockImplementation(({ envKind }) =>
      Promise.resolve(
        envKind === "windows" ? { ok: true } : { ok: false, output: "npm ERR! EACCES" },
      ),
    );

    render(<ModelOrderSection />);

    fireEvent.click(await screen.findByRole("button", { name: "Update Claude Code to v1.3.0" }));

    await waitFor(() => expect(bridge.updateAgentBinary).toHaveBeenCalledTimes(2));
    expect(bridge.updateAgentBinary.mock.calls.map(([payload]) => payload)).toEqual([
      { agentKind: "claude", envKind: "windows" },
      { agentKind: "claude", envKind: "wsl", wslDistro: "Ubuntu" },
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
