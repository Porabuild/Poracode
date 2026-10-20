import { act, fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { agentStatusSchema } from "@/shared/contracts/agent";
import { useAgentStatusesStore } from "@/renderer/state/agentStatusesStore";
import { usePanelStore } from "@/renderer/state/panelStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { useSidebarShortcuts } from "./sidebarShortcuts";

const environment = vi.hoisted(() => ({
  remote: false,
  dev: false,
  localBackend: true,
  manageRemote: true,
}));
vi.mock("@/renderer/bridge", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/renderer/bridge")>()),
  isRemoteSession: () => environment.remote,
  isDevApp: () => environment.dev,
}));
vi.mock("@/renderer/clientRuntime", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/renderer/clientRuntime")>()),
  hasClientCapability: (key: string) =>
    key === "localBackend" ? environment.localBackend : environment.manageRemote,
}));

function Shortcuts(props: { all?: boolean }) {
  const shortcuts = useSidebarShortcuts(props.all);
  return shortcuts.map((shortcut) => (
    <button
      type="button"
      key={shortcut.id}
      data-id={shortcut.id}
      aria-pressed={shortcut.isActive}
      onClick={shortcut.onPress}
    >
      {shortcut.label}
    </button>
  ));
}

describe("settings sidebar shortcuts", () => {
  beforeEach(() => {
    Object.assign(environment, {
      remote: false,
      dev: false,
      localBackend: true,
      manageRemote: true,
    });
    useSharedSettings.setState({
      sidebarShortcutOrder: ["pullRequests", "githubActions", "schedules"],
      sidebarHiddenShortcuts: ["githubActions"],
    });
    usePanelStore.setState({
      settingsOpen: false,
      settingsSection: null,
      activeSettingsSection: null,
      mobileUtilityPage: null,
    });
    useAgentStatusesStore.setState({ agentStatuses: [], wslAgentStatuses: [] });
  });

  it("preserves defaults and opens the single Profile settings destination directly", () => {
    const { rerender } = render(<Shortcuts />);
    expect(screen.getAllByRole("button").map((button) => button.textContent)).toEqual([
      "Pull requests",
      "Schedules",
    ]);
    act(() => useSharedSettings.getState().setSidebarShortcutVisible("settings:profile", true));
    fireEvent.click(screen.getByRole("button", { name: "Profile" }));
    expect(usePanelStore.getState()).toMatchObject({
      settingsOpen: true,
      settingsSection: "profile",
    });
    act(() => usePanelStore.getState().clearSettingsSection());
    rerender(<Shortcuts />);
    expect(screen.getByRole("button", { name: "Profile" })).toHaveAttribute("aria-pressed", "true");
    act(() => usePanelStore.getState().setActiveSettingsSection("appearance"));
    expect(screen.getByRole("button", { name: "Profile" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("resolves real pages from current Settings metadata and omits actions and hidden capabilities", () => {
    const { rerender } = render(<Shortcuts all />);
    expect(screen.getByRole("button", { name: "Agent Registry" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Refresh detected agents" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Dev" })).toBeNull();
    environment.localBackend = false;
    environment.remote = true;
    environment.manageRemote = false;
    rerender(<Shortcuts all />);
    expect(screen.queryByRole("button", { name: "Remote Access" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Remote Environments" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Plugins" })).toBeNull();
    expect(screen.getByRole("button", { name: "Models" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Profile" })).toBeInTheDocument();
  });

  it("retains unavailable IDs and restores a provider shortcut in its saved slot when installed", async () => {
    useSharedSettings.setState({
      sidebarShortcutOrder: [
        "settings:agents:fixture",
        "settings:future-page",
        "schedules",
        "settings:profile",
      ],
      sidebarHiddenShortcuts: [],
    });
    render(<Shortcuts />);
    expect(screen.getAllByRole("button").map((button) => button.textContent)).toEqual([
      "Schedules",
      "Profile",
    ]);
    const provider = agentStatusSchema.parse({
      kind: "fixture",
      label: "Fixture",
      installed: true,
      authState: "unknown",
      capabilities: {},
    });
    await act(() =>
      useAgentStatusesStore.setState({ agentStatuses: [provider], wslAgentStatuses: [provider] }),
    );
    expect(screen.getAllByRole("button").map((button) => button.textContent)).toEqual([
      "Fixture",
      "Schedules",
      "Profile",
    ]);
    fireEvent.click(screen.getByRole("button", { name: "Fixture" }));
    expect(usePanelStore.getState().settingsSection).toBe("agents:fixture");
    expect(useSharedSettings.getState().sidebarShortcutOrder).toContain("settings:future-page");
    await act(() => useAgentStatusesStore.setState({ agentStatuses: [], wslAgentStatuses: [] }));
    expect(screen.queryByRole("button", { name: "Fixture" })).toBeNull();
  });
});
