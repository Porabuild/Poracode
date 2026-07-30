import { renderHook } from "@testing-library/react";
import type { UsageSnapshot } from "@poracode/agents-usage";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useProviderUsageStore } from "@/renderer/state/providerUsageStore";
import { useUsageLoginStateStore } from "@/renderer/state/usageLoginStateStore";
import { useUsageProviderLogin } from "./useUsageProviderLogin";

const bridgeMock = vi.hoisted(() => ({
  isRemoteSession: vi.fn<() => boolean>(() => false),
}));

vi.mock("@/renderer/bridge", () => ({
  isRemoteSession: bridgeMock.isRemoteSession,
  readBridge: () => ({}),
}));

function authMissingSnapshot(providerId: string): UsageSnapshot {
  return {
    providerId,
    status: "auth-missing",
    windows: [],
    fetchedAt: 1,
  } as UsageSnapshot;
}

describe("useUsageProviderLogin", () => {
  beforeEach(() => {
    bridgeMock.isRemoteSession.mockReturnValue(false);
    useProviderUsageStore.setState({ snapshots: {} });
    useUsageLoginStateStore.setState({ stored: {} });
  });

  it("offers supported usage login on desktop sessions", () => {
    useProviderUsageStore.getState().mergeSnapshot(authMissingSnapshot("grok"));

    const { result } = renderHook(() => useUsageProviderLogin("grok"));

    expect(result.current.supportsLogin).toBe(true);
    expect(result.current.canSignIn).toBe(true);
  });

  it("does not offer the base provider's browser login for an auth-missing profile", () => {
    useProviderUsageStore.getState().mergeSnapshot(authMissingSnapshot("grok:work"));

    const { result } = renderHook(() => useUsageProviderLogin("grok:work"));

    expect(result.current.supportsLogin).toBe(false);
    expect(result.current.canSignIn).toBe(false);
    expect(result.current.canSignOut).toBe(false);
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
});
