import { act, cleanup, fireEvent, renderHook, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ProfileCoreStats,
  ProfileDevicesResponse,
  ProfileIdentityResponse,
  ProfileTokenStats,
} from "@/shared/contracts";
import { I18nTestWrapper, renderWithI18n } from "@/renderer/testUtils/i18n";
import { ProfileSettings } from "@/renderer/views/SettingsOverlay/parts/ProfileSettings";
import { resetProfileDataCacheForTest, useProfileData } from "./useProfileData";

const bridgeState = vi.hoisted(() => ({
  remote: false,
  getProfileDevices: vi.fn<() => Promise<ProfileDevicesResponse>>(),
  getProfileIdentity: vi.fn<() => Promise<ProfileIdentityResponse>>(),
  getProfileCoreStats: vi.fn<(...args: unknown[]) => Promise<ProfileCoreStats>>(),
  getProfileTokenStats: vi.fn<(...args: unknown[]) => Promise<ProfileTokenStats>>(),
  setProfileIdentity: vi.fn<(...args: unknown[]) => Promise<ProfileIdentityResponse>>(),
}));

const remoteStoreState = vi.hoisted(() => ({
  servers: [] as Array<{
    connectionId?: string;
    desktopId: string;
    label: string;
    endpoint: string;
    accessToken: string;
    scopes: string[];
    platform?: "win32" | "darwin" | "linux";
  }>,
  runtime: {} as Record<string, { status: "online" | "offline" | "connecting" | "error" }>,
  withClient:
    vi.fn<
      (
        connectionKey: string,
        invoke: (client: {
          profileCoreStats: (...args: unknown[]) => Promise<ProfileCoreStats>;
          profileTokenStats: (...args: unknown[]) => Promise<ProfileTokenStats>;
          setProfileIdentity?: (...args: unknown[]) => Promise<ProfileIdentityResponse>;
        }) => Promise<unknown>,
      ) => Promise<unknown>
    >(),
}));

vi.mock("@/renderer/bridge", () => ({
  isRemoteSession: () => bridgeState.remote,
  readBridge: () => ({
    getProfileDevices: bridgeState.getProfileDevices,
    getProfileIdentity: bridgeState.getProfileIdentity,
    getProfileCoreStats: bridgeState.getProfileCoreStats,
    getProfileTokenStats: bridgeState.getProfileTokenStats,
    setProfileIdentity: bridgeState.setProfileIdentity,
    copyShareImage: vi.fn<() => Promise<void>>(async () => undefined),
  }),
}));

vi.mock("@/renderer/adaptiveLayout", () => ({
  useCompactLayout: () => false,
}));

vi.mock("@/renderer/state/sharedSettingsStore", () => ({
  useSharedSettings: (selector: (state: { locale: string }) => unknown) =>
    selector({ locale: "en" }),
}));

vi.mock("@/renderer/state/remoteServersStore", () => ({
  useRemoteServersStore: Object.assign(
    (selector: (state: typeof remoteStoreState) => unknown) => selector(remoteStoreState),
    { getState: () => remoteStoreState },
  ),
}));

vi.mock("@/renderer/state/remoteServers/browserBridge", () => ({
  selectBrowserBridgeClientServer: (state: typeof remoteStoreState) => state.servers[0],
}));

vi.mock("@/renderer/components/providers/ProviderIcon", () => ({
  ProviderIcon: () => <span />,
}));

function sampleCore(deviceId: string, label: string, prompts: number): ProfileCoreStats {
  return {
    scope: "device",
    device: { id: deviceId, label, platform: "linux", isCurrent: deviceId === "local-1" },
    generatedAt: 1000,
    timezoneOffsetMinutes: 0,
    identity: {
      name: "Sdsle",
      handle: "sdsle",
      avatarColor: "oklch(0.6 0.13 150)",
      plan: "Local",
    },
    totals: {
      totalThreads: prompts,
      totalPrompts: prompts,
      messagesSent: prompts * 2,
      goalsSet: 1,
      longestTaskMs: 60_000,
      currentStreakDays: 2,
      longestStreakDays: 3,
      activeDays: 2,
    },
    promptHeatmap: {
      metric: "prompts",
      windowDays: 364,
      max: prompts,
      cells: [{ day: "2026-11-14", count: prompts, intensity: 4 }],
    },
    insights: {
      topProvider: { key: "codex", label: "Codex", count: prompts, percent: 100 },
      fastModePercent: 25,
      skillsExplored: 1,
      totalSkillsUsed: 2,
      workflowRuns: 1,
      subagentRuns: 2,
      mcpToolCalls: 3,
    },
    providers: [{ key: "codex", label: "Codex", count: prompts, percent: 100 }],
    accounts: [{ key: "codex:default", label: "Codex - default", count: prompts, percent: 100 }],
    models: [],
    modes: [{ key: "chat", label: "Chat", count: prompts, percent: 100 }],
    skills: [],
    mcps: [],
    aiActions: [],
    availableAccounts: [{ key: "codex:default", label: "Codex - default" }],
  };
}

function sampleTokens(deviceId: string, label: string, lifetimeTokens: number): ProfileTokenStats {
  return {
    available: lifetimeTokens > 0,
    scope: "device",
    device: { id: deviceId, label, platform: "linux", isCurrent: deviceId === "local-1" },
    generatedAt: 1000,
    timezoneOffsetMinutes: 0,
    windowDays: 364,
    lifetimeTokens,
    peakDayTokens: lifetimeTokens,
    peakDay: "2026-11-14",
    providers: [{ provider: "codex", label: "Codex", tokens: lifetimeTokens, percent: 100 }],
    accounts: [
      { provider: "codex:default", label: "Codex - default", tokens: lifetimeTokens, percent: 100 },
    ],
    models: [],
    tokenHeatmap: {
      metric: "tokens",
      windowDays: 364,
      max: lifetimeTokens,
      cells: [{ day: "2026-11-14", count: lifetimeTokens, intensity: 4 }],
    },
    unavailableProviders: [],
  };
}

describe("Profile progressive loading, skeletons, and remote devices", () => {
  beforeEach(() => {
    resetProfileDataCacheForTest();
    bridgeState.remote = false;
    remoteStoreState.servers = [];
    remoteStoreState.runtime = {};
    bridgeState.getProfileDevices.mockReset();
    bridgeState.getProfileIdentity.mockReset();
    bridgeState.getProfileCoreStats.mockReset();
    bridgeState.getProfileTokenStats.mockReset();
    bridgeState.setProfileIdentity.mockReset();
    remoteStoreState.withClient.mockReset();
  });

  afterEach(() => {
    cleanup();
    resetProfileDataCacheForTest();
  });

  it("shows completed token tiles while core activity is still pending", async () => {
    const local = sampleCore("local-1", "Local", 1);
    const coreRead = Promise.withResolvers<ProfileCoreStats>();
    bridgeState.getProfileDevices.mockResolvedValue({
      currentDeviceId: "local-1",
      devices: [local.device],
    });
    bridgeState.getProfileIdentity.mockResolvedValue({
      identity: local.identity,
      device: local.device,
    });
    bridgeState.getProfileCoreStats.mockReturnValue(coreRead.promise);
    bridgeState.getProfileTokenStats.mockResolvedValue(sampleTokens("local-1", "Local", 321));
    renderWithI18n(<ProfileSettings />);
    await waitFor(() =>
      expect(screen.getByText("Lifetime tokens").parentElement?.textContent).toContain("321"),
    );
    expect(screen.getByRole("tabpanel", { name: "Activity" }).getAttribute("aria-busy")).toBe(
      "true",
    );
    await act(async () => coreRead.resolve(local));
  });

  it.each(["core", "identity"] as const)(
    "keeps an identity edit when an older %s read arrives late",
    async (late) => {
      const local = sampleCore("local-1", "Local", 1);
      const coreRead = Promise.withResolvers<ProfileCoreStats>();
      const identityRead = Promise.withResolvers<ProfileIdentityResponse>();
      const edited = { ...local.identity, name: "Edited identity" };
      bridgeState.getProfileDevices.mockResolvedValue({
        currentDeviceId: "local-1",
        devices: [local.device],
      });
      bridgeState.getProfileIdentity.mockReturnValue(
        late === "identity"
          ? identityRead.promise
          : Promise.resolve({ identity: local.identity, device: local.device }),
      );
      bridgeState.getProfileCoreStats.mockReturnValue(
        late === "core" ? coreRead.promise : Promise.resolve(local),
      );
      bridgeState.getProfileTokenStats.mockResolvedValue(sampleTokens("local-1", "Local", 100));
      bridgeState.setProfileIdentity.mockResolvedValue({ identity: edited, device: local.device });
      const { result } = renderHook(() => useProfileData(), { wrapper: I18nTestWrapper });
      await waitFor(() => expect(result.current.identity?.name).toBe(local.identity.name));
      await act(async () => result.current.saveIdentity(edited));
      await act(async () => {
        coreRead.resolve(local);
        identityRead.resolve({ identity: local.identity, device: local.device });
      });
      expect(result.current.identity?.name).toBe("Edited identity");
      expect(result.current.core?.identity.name).toBe("Edited identity");
    },
  );

  it("waits for the selected remote identity and keeps a late save scoped to that device", async () => {
    const local = sampleCore("local-1", "Local", 1);
    const remote = sampleCore("remote-1", "Remote", 2);
    remote.identity = { ...remote.identity, name: "Remote user", handle: "remote" };
    const remoteCore = Promise.withResolvers<ProfileCoreStats>();
    const remoteSave = Promise.withResolvers<ProfileIdentityResponse>();
    remoteStoreState.servers = [
      {
        connectionId: "srv-1",
        desktopId: "remote-1",
        label: "Remote",
        endpoint: "https://remote.local/",
        accessToken: "fixture",
        scopes: ["session:read"],
      },
    ];
    remoteStoreState.runtime = { "srv-1": { status: "online" } };
    bridgeState.getProfileDevices.mockResolvedValue({
      currentDeviceId: "local-1",
      devices: [local.device],
    });
    bridgeState.getProfileIdentity.mockResolvedValue({
      identity: local.identity,
      device: local.device,
    });
    bridgeState.getProfileCoreStats.mockResolvedValue(local);
    bridgeState.getProfileTokenStats.mockResolvedValue(sampleTokens("local-1", "Local", 100));
    remoteStoreState.withClient.mockImplementation(async (_key, invoke) =>
      invoke({
        profileCoreStats: () => remoteCore.promise,
        profileTokenStats: async () => sampleTokens("remote-1", "Remote", 200),
        setProfileIdentity: () => remoteSave.promise,
      }),
    );
    const { result } = renderHook(() => useProfileData(), { wrapper: I18nTestWrapper });
    await waitFor(() => expect(result.current.identity?.name).toBe(local.identity.name));
    act(() =>
      result.current.setSelection({ scope: "device", deviceId: "remote:srv-1", window: "all" }),
    );
    expect(result.current.identity).toBeNull();
    await act(async () => remoteCore.resolve(remote));
    await waitFor(() => expect(result.current.identity?.name).toBe("Remote user"));
    let saving: Promise<void>;
    act(() => {
      saving = result.current.saveIdentity({ ...remote.identity, name: "Edited remote" });
    });
    act(() => result.current.setSelection({ scope: "device", window: "all" }));
    await waitFor(() => expect(result.current.identity?.name).toBe(local.identity.name));
    await act(async () => {
      remoteSave.resolve({
        identity: { ...remote.identity, name: "Edited remote" },
        device: remote.device,
      });
      await saving;
    });
    expect(result.current.identity?.name).toBe(local.identity.name);
    expect(bridgeState.setProfileIdentity).not.toHaveBeenCalled();
  });

  it("renders a full page skeleton immediately without a PixelLoader and removes Syncs with Cloud", async () => {
    const coreDeferred = Promise.withResolvers<ProfileCoreStats>();
    const tokenDeferred = Promise.withResolvers<ProfileTokenStats>();

    bridgeState.getProfileDevices.mockResolvedValue({
      currentDeviceId: "local-1",
      devices: [{ id: "local-1", label: "amd-pc-12-25", platform: "win32", isCurrent: true }],
    });
    bridgeState.getProfileIdentity.mockResolvedValue({
      identity: {
        name: "Sdsle",
        handle: "sdsle",
        avatarColor: "oklch(0.6 0.13 150)",
        plan: "Local",
      },
      device: { id: "local-1", label: "amd-pc-12-25", platform: "win32" },
    });
    bridgeState.getProfileCoreStats.mockReturnValue(coreDeferred.promise);
    bridgeState.getProfileTokenStats.mockReturnValue(tokenDeferred.promise);

    renderWithI18n(<ProfileSettings />);

    expect(screen.getByRole("status").textContent).toBe("Loading");
    // No single PixelLoader blocking the screen while loading!
    expect(screen.queryByRole("img", { name: "Loading" })).toBeNull();
    // Structured section headings and StatStrip labels render immediately with skeletons.
    expect(screen.getByText("Lifetime tokens")).toBeTruthy();
    expect(screen.getByText("Activity insights")).toBeTruthy();

    // Fast identity + devices arrive before heavy stats finish.
    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 1, name: "Sdsle" })).toBeTruthy();
    });

    // Open device picker (defaults to All devices) and verify "Syncs with Cloud" is gone while device hints render.
    await waitFor(() => {
      expect(screen.getAllByRole("button", { name: /All devices/ }).length).toBeGreaterThan(0);
    });
    const deviceButtons = screen.getAllByRole("button", { name: /All devices/ });
    fireEvent.click(deviceButtons[deviceButtons.length - 1]!);
    await waitFor(() => {
      expect(screen.getByText("amd-pc-12-25")).toBeTruthy();
      expect(screen.getByText("This device")).toBeTruthy();
    });
    expect(screen.queryByText("Syncs with Cloud")).toBeNull();

    // Close the device picker popover before clicking tabs.
    fireEvent.click(deviceButtons[deviceButtons.length - 1]!);
    await waitFor(() => {
      expect(screen.queryByText("This device")).toBeNull();
    });

    // Switching to Costs while tokens are still loading renders structured skeleton (no PixelLoader).
    fireEvent.click(screen.getByRole("tab", { name: "Costs" }));
    expect(screen.getByTestId("profile-cost-skeleton")).toBeTruthy();
    expect(screen.queryByRole("img", { name: "Loading" })).toBeNull();

    // Resolve core + tokens cleanly.
    await act(async () => {
      coreDeferred.resolve(sampleCore("local-1", "amd-pc-12-25", 10));
      tokenDeferred.resolve(sampleTokens("local-1", "amd-pc-12-25", 1000));
    });
  });

  it("includes remote devices in devices list and aggregates them progressively in All devices", async () => {
    remoteStoreState.servers = [
      {
        connectionId: "srv-remote",
        desktopId: "remote-desk-1",
        label: "mac-studio",
        endpoint: "https://mac.local:49152/",
        accessToken: "tok",
        scopes: ["session:read"],
        platform: "darwin",
      },
    ];
    remoteStoreState.runtime = {
      "srv-remote": { status: "online" },
    };

    const localCore = sampleCore("local-1", "amd-pc-12-25", 5);
    const localTokens = sampleTokens("local-1", "amd-pc-12-25", 1000);
    const remoteCore = sampleCore("remote-desk-1", "mac-studio", 7);
    const remoteTokens = sampleTokens("remote-desk-1", "mac-studio", 4000);

    const remoteCoreDeferred = Promise.withResolvers<ProfileCoreStats>();
    const remoteTokenDeferred = Promise.withResolvers<ProfileTokenStats>();

    bridgeState.getProfileDevices.mockResolvedValue({
      currentDeviceId: "local-1",
      devices: [{ id: "local-1", label: "amd-pc-12-25", platform: "win32", isCurrent: true }],
    });
    bridgeState.getProfileIdentity.mockResolvedValue({
      identity: localCore.identity,
      device: localCore.device,
    });
    bridgeState.getProfileCoreStats.mockResolvedValue(localCore);
    bridgeState.getProfileTokenStats.mockResolvedValue(localTokens);

    remoteStoreState.withClient.mockImplementation(async (_key, invoke) =>
      invoke({
        profileCoreStats: () => remoteCoreDeferred.promise,
        profileTokenStats: () => remoteTokenDeferred.promise,
      }),
    );

    const { result } = renderHook(() => useProfileData(), { wrapper: I18nTestWrapper });

    // Defaults to All devices: local resolves first without waiting for remote!
    expect(result.current.selection.scope).toBe("all");
    await waitFor(() => {
      expect(result.current.devices.map((d) => d.label)).toEqual(["amd-pc-12-25", "mac-studio"]);
      expect(result.current.core?.totals.totalPrompts).toBe(5);
      expect(result.current.tokens?.lifetimeTokens).toBe(1000);
    });

    // Now remote resolves and folds into the combined All devices stats.
    await act(async () => {
      remoteCoreDeferred.resolve(remoteCore);
      remoteTokenDeferred.resolve(remoteTokens);
    });

    await waitFor(() => {
      expect(result.current.core?.totals.totalPrompts).toBe(12);
      expect(result.current.tokens?.lifetimeTokens).toBe(5000);
    });
  });

  it("does not duplicate the active bridge server in remote session mode", async () => {
    bridgeState.remote = true;
    remoteStoreState.servers = [
      {
        connectionId: "srv-1",
        desktopId: "remote-1",
        label: "Primary Server",
        endpoint: "http://localhost:49152/",
        accessToken: "tok1",
        scopes: ["session:read"],
        platform: "darwin",
      },
      {
        connectionId: "srv-2",
        desktopId: "remote-2",
        label: "Secondary Server",
        endpoint: "http://10.0.0.2:49152/",
        accessToken: "tok2",
        scopes: ["session:read"],
        platform: "linux",
      },
    ];
    remoteStoreState.runtime = {
      "srv-1": { status: "online" },
      "srv-2": { status: "online" },
    };

    bridgeState.getProfileDevices.mockResolvedValue({
      currentDeviceId: "dev-1",
      devices: [{ id: "dev-1", label: "Primary Server", platform: "darwin", isCurrent: true }],
    });
    bridgeState.getProfileCoreStats.mockResolvedValue(sampleCore("dev-1", "Primary Server", 3));
    bridgeState.getProfileTokenStats.mockResolvedValue(
      sampleTokens("dev-1", "Primary Server", 200),
    );
    remoteStoreState.withClient.mockImplementation(async (_key, invoke) =>
      invoke({
        profileCoreStats: async () => sampleCore("dev-2", "Secondary Server", 4),
        profileTokenStats: async () => sampleTokens("dev-2", "Secondary Server", 300),
      }),
    );

    const { result } = renderHook(() => useProfileData(), { wrapper: I18nTestWrapper });

    await waitFor(() => {
      expect(result.current.devices.map((d) => d.label)).toEqual([
        "Primary Server",
        "Secondary Server",
      ]);
      expect(result.current.core?.totals.totalPrompts).toBe(7);
    });
    expect(remoteStoreState.withClient.mock.calls.every(([key]) => key === "srv-2")).toBe(true);
  });

  it("keeps ProfileHeader and DevicePicker mounted with Retry when a selected remote device fails", async () => {
    remoteStoreState.servers = [
      {
        connectionId: "srv-offline",
        desktopId: "remote-desk-off",
        label: "offline-box",
        endpoint: "https://offline.local:49152/",
        accessToken: "tok",
        scopes: ["session:read"],
        platform: "linux",
      },
    ];
    remoteStoreState.runtime = {
      "srv-offline": { status: "offline" },
    };

    const localCore = sampleCore("local-1", "amd-pc-12-25", 5);
    const localTokens = sampleTokens("local-1", "amd-pc-12-25", 1000);
    bridgeState.getProfileDevices.mockResolvedValue({
      currentDeviceId: "local-1",
      devices: [{ id: "local-1", label: "amd-pc-12-25", platform: "win32", isCurrent: true }],
    });
    bridgeState.getProfileIdentity.mockResolvedValue({
      identity: localCore.identity,
      device: localCore.device,
    });
    bridgeState.getProfileCoreStats.mockResolvedValue(localCore);
    bridgeState.getProfileTokenStats.mockResolvedValue(localTokens);
    remoteStoreState.withClient.mockRejectedValue(new Error("Remote server is offline."));

    renderWithI18n(<ProfileSettings />);
    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 1, name: "Sdsle" })).toBeTruthy();
    });

    const deviceButtons = screen.getAllByRole("button", { name: /All devices/ });
    fireEvent.click(deviceButtons[deviceButtons.length - 1]!);
    await waitFor(() => {
      expect(screen.getByText("offline-box")).toBeTruthy();
      expect(screen.getByText("Offline")).toBeTruthy();
    });
    fireEvent.click(screen.getByText("offline-box"));

    await waitFor(() => {
      expect(remoteStoreState.withClient).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(screen.getByText("Remote server is offline.")).toBeTruthy();
    });
    // ProfileHeader + DevicePicker + Retry remain mounted so the user isn't trapped.
    expect(screen.queryByRole("heading", { level: 1, name: "Sdsle" })).toBeNull();
    expect((screen.getByRole("button", { name: "Edit" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /offline-box/ }).length).toBeGreaterThan(0);
  });
});
