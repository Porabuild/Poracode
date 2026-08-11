import { act, renderHook } from "@testing-library/react";
import type { UsageSnapshot } from "@poracode/agents-usage";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { usePanelStore } from "@/renderer/state/panelStore";
import { useProviderUsageStore } from "@/renderer/state/providerUsageStore";
import { useUsageLoginStateStore } from "@/renderer/state/usageLoginStateStore";
import { useUsageProviderLogin } from "./useUsageProviderLogin";

const bridgeMock = vi.hoisted(() => ({
  isRemoteSession: vi.fn<() => boolean>(() => false),
  startUsageLogin: vi.fn<() => Promise<{ ok: boolean; cancelled?: boolean }>>(),
  cancelUsageLogin: vi.fn<() => Promise<void>>(),
  submitUsageApiKey: vi.fn<() => Promise<{ ok: boolean }>>(),
  clearUsageLogin: vi.fn<() => Promise<{ ok: boolean }>>(),
  refreshProviderUsage: vi.fn<() => Promise<{ snapshots: UsageSnapshot[]; fromCache: boolean }>>(),
}));

vi.mock("@/renderer/bridge", () => ({
  isRemoteSession: bridgeMock.isRemoteSession,
  readBridge: () => ({
    startUsageLogin: bridgeMock.startUsageLogin,
    cancelUsageLogin: bridgeMock.cancelUsageLogin,
    submitUsageApiKey: bridgeMock.submitUsageApiKey,
    clearUsageLogin: bridgeMock.clearUsageLogin,
    refreshProviderUsage: bridgeMock.refreshProviderUsage,
  }),
}));

function authMissingSnapshot(providerId: string): UsageSnapshot {
  return {
    providerId,
    status: "auth-missing",
    windows: [],
    fetchedAt: 1,
  } as UsageSnapshot;
}

function okSnapshot(providerId: string): UsageSnapshot {
  return {
    providerId,
    status: "ok",
    plan: "Pro",
    windows: [{ id: "session-5h", label: "Session", usedPercent: 10, resetsAt: 2 }],
    fetchedAt: 2,
  } as UsageSnapshot;
}

describe("useUsageProviderLogin", () => {
  beforeEach(() => {
    bridgeMock.isRemoteSession.mockReturnValue(false);
    bridgeMock.startUsageLogin.mockReset();
    bridgeMock.cancelUsageLogin.mockReset().mockResolvedValue(undefined);
    bridgeMock.submitUsageApiKey.mockReset();
    bridgeMock.clearUsageLogin.mockReset();
    bridgeMock.refreshProviderUsage.mockReset();
    useProviderUsageStore.setState({ snapshots: {} });
    useUsageLoginStateStore.setState({ stored: {} });
    usePanelStore.setState({ browserOverlayOpen: false, browserOverlayMaximized: false });
  });

  it("offers supported usage login on desktop sessions", () => {
    useProviderUsageStore.getState().mergeSnapshot(authMissingSnapshot("grok"));

    const { result } = renderHook(() => useUsageProviderLogin("grok"));

    expect(result.current.supportsLogin).toBe(true);
    expect(result.current.canSignIn).toBe(true);
  });

  it("offers browser-session and API-key paths for Alibaba Token Plan", () => {
    useProviderUsageStore.getState().mergeSnapshot(authMissingSnapshot("qwen"));

    const { result } = renderHook(() => useUsageProviderLogin("qwen"));

    expect(result.current.canBrowserSignIn).toBe(true);
    expect(result.current.canApiKeySignIn).toBe(true);
  });

  it("hides usage login and sign-out controls in remote sessions", () => {
    bridgeMock.isRemoteSession.mockReturnValue(true);
    useProviderUsageStore.getState().mergeSnapshot(authMissingSnapshot("grok"));
    useUsageLoginStateStore.getState().setStored("grok", true);

    const { result } = renderHook(() => useUsageProviderLogin("grok"));

    expect(result.current.supportsLogin).toBe(false);
    expect(result.current.canSignIn).toBe(false);
    expect(result.current.canSignOut).toBe(false);
  });

  it("refreshes usage after a successful browser login even when the overlay closes", async () => {
    // Successful capture closes the login tab, which dismisses the overlay when
    // it was the last tab — that used to win a Promise.race and skip refresh.
    let resolveLogin: ((value: { ok: boolean }) => void) | undefined;
    bridgeMock.startUsageLogin.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveLogin = resolve;
        }),
    );
    bridgeMock.refreshProviderUsage.mockResolvedValue({
      snapshots: [okSnapshot("opencode")],
      fromCache: false,
    });
    useProviderUsageStore.getState().mergeSnapshot(authMissingSnapshot("opencode"));

    const { result } = renderHook(() => useUsageProviderLogin("opencode"));

    let signInDone: Promise<void> | undefined;
    await act(async () => {
      signInDone = result.current.handleSignIn();
    });
    expect(usePanelStore.getState().browserOverlayOpen).toBe(true);

    // Simulate tab cleanup closing the overlay while main is still sealing the cookie.
    await act(async () => {
      usePanelStore.getState().setBrowserOverlayOpen(false);
    });
    expect(bridgeMock.cancelUsageLogin).toHaveBeenCalledWith({ providerId: "opencode" });

    await act(async () => {
      resolveLogin?.({ ok: true });
      await signInDone;
    });

    expect(useUsageLoginStateStore.getState().stored.opencode).toBe(true);
    expect(bridgeMock.refreshProviderUsage).toHaveBeenCalledWith({
      providerIds: ["opencode"],
      force: true,
    });
    expect(useProviderUsageStore.getState().snapshots.opencode?.status).toBe("ok");
    expect(result.current.signingIn).toBe(false);
  });

  it("does not mark signed-in or refresh when browser login is cancelled", async () => {
    bridgeMock.startUsageLogin.mockResolvedValue({ ok: false, cancelled: true });
    useProviderUsageStore.getState().mergeSnapshot(authMissingSnapshot("opencode"));

    const { result } = renderHook(() => useUsageProviderLogin("opencode"));

    await act(async () => {
      await result.current.handleSignIn();
    });

    expect(useUsageLoginStateStore.getState().stored.opencode).toBeUndefined();
    expect(bridgeMock.refreshProviderUsage).not.toHaveBeenCalled();
    expect(result.current.signingIn).toBe(false);
  });

  it("refreshes usage after a successful API-key sign-in", async () => {
    bridgeMock.submitUsageApiKey.mockResolvedValue({ ok: true });
    bridgeMock.refreshProviderUsage.mockResolvedValue({
      snapshots: [okSnapshot("zai")],
      fromCache: false,
    });
    useProviderUsageStore.getState().mergeSnapshot(authMissingSnapshot("zai"));

    const { result } = renderHook(() => useUsageProviderLogin("zai"));

    await act(async () => {
      result.current.setApiKey("sk-test");
    });
    await act(async () => {
      await result.current.handleSubmitApiKey();
    });

    expect(bridgeMock.submitUsageApiKey).toHaveBeenCalledWith({
      providerId: "zai",
      apiKey: "sk-test",
    });
    expect(useUsageLoginStateStore.getState().stored.zai).toBe(true);
    expect(bridgeMock.refreshProviderUsage).toHaveBeenCalledWith({
      providerIds: ["zai"],
      force: true,
    });
    expect(useProviderUsageStore.getState().snapshots.zai?.status).toBe("ok");
  });
});
