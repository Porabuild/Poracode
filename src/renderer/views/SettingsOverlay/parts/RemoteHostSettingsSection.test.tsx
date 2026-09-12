import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentStatus } from "@/shared/contracts";
import type { RemoteSettings, RemoteSettingsPatch } from "@/shared/remote";
import type { RemoteDesktopClient } from "@/shared/remote/client";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import type { RemoteServersState } from "@/renderer/state/remoteServers/types";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { RemoteHostSettingsSection } from "./RemoteHostSettingsSection";

function makeAgent(kind: string): AgentStatus {
  return {
    kind,
    label: kind === "codex" ? "Codex" : "Claude",
    installed: true,
    authState: "ok",
    capabilities: {
      models: [{ id: `${kind}-model`, label: `${kind} model` }],
      modelEfforts: { [`${kind}-model`]: ["low", "medium", "high"] },
      efforts: ["low", "medium", "high"],
      defaultEffort: "medium",
      supportsOneShot: true,
      supportsTextOnlyOneShot: true,
    },
  } as unknown as AgentStatus;
}

function makeDocument(overrides: Record<string, unknown> = {}): RemoteSettings {
  return {
    titleGenProvider: "auto",
    titleGenModel: "",
    titleGenEffort: "",
    titleGenFast: false,
    commitGenProvider: "auto",
    commitGenModel: "",
    commitGenEffort: "",
    commitGenFast: false,
    conflictResolverProvider: "auto",
    conflictResolverModel: "",
    conflictResolverEffort: "",
    conflictResolverFast: false,
    wslTitleGenProvider: "auto",
    wslTitleGenModel: "",
    wslTitleGenEffort: "",
    wslTitleGenFast: false,
    wslCommitGenProvider: "auto",
    wslCommitGenModel: "",
    wslCommitGenEffort: "",
    wslCommitGenFast: false,
    wslConflictResolverProvider: "auto",
    wslConflictResolverModel: "",
    wslConflictResolverEffort: "",
    wslConflictResolverFast: false,
    ...overrides,
  } as unknown as RemoteSettings;
}

describe("RemoteHostSettingsSection", () => {
  const originalWithClient = useRemoteServersStore.getState().withClient;

  function installClient(client: Partial<RemoteDesktopClient>): void {
    const withClient: RemoteServersState["withClient"] = async (_desktopId, invoke) =>
      invoke(client as RemoteDesktopClient);
    useRemoteServersStore.setState({
      withClient,
      runtime: {
        "desktop-1": {
          status: "online",
          projects: [],
          threads: [],
          agentStatuses: {
            windows: [makeAgent("codex"), makeAgent("claude")],
            wsl: [makeAgent("codex")],
            updatedAt: "2026-09-11T00:00:00.000Z",
          },
        },
      },
    });
  }

  beforeEach(() => {
    useRemoteServersStore.setState({
      withClient: originalWithClient,
      runtime: {},
      servers: [
        {
          desktopId: "desktop-1",
          label: "Studio",
          endpoint: "http://192.168.1.10:3200",
          accessToken: "token",
          scopes: ["session:read", "session:operate"],
        },
      ],
    });
  });

  it("loads the host document and renders the generation sections", async () => {
    const settings = vi.fn<RemoteDesktopClient["settings"]>(async () => makeDocument());
    const updateSettings = vi.fn<RemoteDesktopClient["updateSettings"]>();
    installClient({ settings, updateSettings });

    render(<RemoteHostSettingsSection desktopId="desktop-1" isOnline canRead canWrite />);

    expect(await screen.findByText("Title Generation")).toBeTruthy();
    expect(screen.getByText("Commit Message Generation")).toBeTruthy();
    expect(screen.getByText("Conflict Resolver")).toBeTruthy();
    expect(settings).toHaveBeenCalledTimes(1);
    expect(updateSettings).not.toHaveBeenCalled();
  });

  it("saves only the changed group and refreshes from the host response", async () => {
    const settings = vi.fn<RemoteDesktopClient["settings"]>(async () => makeDocument());
    const updateSettings = vi.fn<RemoteDesktopClient["updateSettings"]>(
      async (patch: RemoteSettingsPatch) => makeDocument(patch as Record<string, unknown>),
    );
    installClient({ settings, updateSettings });

    render(<RemoteHostSettingsSection desktopId="desktop-1" isOnline canRead canWrite />);
    await screen.findByText("Conflict Resolver");

    const saveButton = await screen.findByRole("button", { name: "Save changes" });
    expect(saveButton.hasAttribute("disabled")).toBe(true);

    // Flip the conflict resolver to a custom provider; the other groups stay untouched.
    const conflictSection = screen
      .getAllByText("Conflict Resolver")
      .map((heading) => heading.closest("section"))
      .find((section) => section !== null)!;
    const customToggle = within(conflictSection as HTMLElement).getByRole("radio", {
      name: "Custom",
    });
    fireEvent.click(customToggle);

    await waitFor(() => {
      expect(saveButton.hasAttribute("disabled")).toBe(false);
    });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(updateSettings).toHaveBeenCalledTimes(1);
    });
    const patch = updateSettings.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(patch.conflictResolverProvider).toBeTruthy();
    expect(patch.titleGenProvider).toBeUndefined();
    expect(patch.commitGenProvider).toBeUndefined();
    await waitFor(() => {
      expect(saveButton.hasAttribute("disabled")).toBe(true);
    });
  });

  it("patches WSL groups with the wsl-prefixed keys", async () => {
    const settings = vi.fn<RemoteDesktopClient["settings"]>(async () => makeDocument());
    const updateSettings = vi.fn<RemoteDesktopClient["updateSettings"]>(
      async (patch: RemoteSettingsPatch) => makeDocument(patch as Record<string, unknown>),
    );
    installClient({ settings, updateSettings });

    render(<RemoteHostSettingsSection desktopId="desktop-1" isOnline canRead canWrite />);
    await screen.findByText("Conflict Resolver");

    // Switch the environment toggle to WSL (the host reports WSL agents).
    fireEvent.click(screen.getByRole("radio", { name: "WSL" }));

    const conflictSection = screen
      .getAllByText("Conflict Resolver")
      .map((heading) => heading.closest("section"))
      .find((section) => section !== null)!;
    fireEvent.click(within(conflictSection as HTMLElement).getByRole("radio", { name: "Custom" }));

    const saveButton = screen.getByRole("button", { name: "Save changes" });
    await waitFor(() => {
      expect(saveButton.hasAttribute("disabled")).toBe(false);
    });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(updateSettings).toHaveBeenCalledTimes(1);
    });
    const patch = updateSettings.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(patch.wslConflictResolverProvider).toBeTruthy();
    expect(patch.wslConflictResolverModel).toBeTruthy();
    expect(patch.conflictResolverProvider).toBeUndefined();
    expect(patch.wslTitleGenProvider).toBeUndefined();
  });

  it("surfaces load failures with a working retry", async () => {
    let failFirst = true;
    const settings = vi.fn<RemoteDesktopClient["settings"]>(async () => {
      if (failFirst) {
        failFirst = false;
        throw new Error("host unreachable");
      }
      return makeDocument();
    });
    installClient({ settings });

    render(<RemoteHostSettingsSection desktopId="desktop-1" isOnline canRead canWrite />);

    const retry = await screen.findByRole("button", { name: "Retry" });
    fireEvent.click(retry);
    expect(await screen.findByText("Title Generation")).toBeTruthy();
    expect(settings).toHaveBeenCalledTimes(2);
  });

  it("stays view-only without the operate scope", async () => {
    const settings = vi.fn<RemoteDesktopClient["settings"]>(async () => makeDocument());
    installClient({ settings });

    render(<RemoteHostSettingsSection desktopId="desktop-1" isOnline canRead canWrite={false} />);

    expect(await screen.findByText(/View-only/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Save changes" })).toBeNull();
  });

  it("renders nothing while offline", () => {
    const settings = vi.fn<RemoteDesktopClient["settings"]>();
    installClient({ settings });

    render(<RemoteHostSettingsSection desktopId="desktop-1" isOnline={false} canRead canWrite />);

    expect(screen.queryByText("Host settings")).toBeNull();
    expect(screen.queryByText("Title Generation")).toBeNull();
    expect(settings).not.toHaveBeenCalled();
  });
});
