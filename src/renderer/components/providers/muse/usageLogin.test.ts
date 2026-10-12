import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useProviderUsageStore } from "@/renderer/state/providerUsageStore";
import { useUsageLoginStateStore } from "@/renderer/state/usageLoginStateStore";
import { useUsageProviderLogin } from "../useUsageProviderLogin";

vi.mock("@/renderer/bridge", () => ({ isRemoteSession: () => false, readBridge: () => ({}) }));

beforeEach(() => {
  useProviderUsageStore.setState({ snapshots: {} });
  useUsageLoginStateStore.setState({ stored: {} });
  useProviderUsageStore.getState().mergeSnapshot({
    providerId: "muse",
    status: "ok",
    fetchedAt: 1,
    windows: [{ id: "weekly", label: "Weekly", usedPercent: 20 }],
  });
});

describe("Muse optional browser billing login", () => {
  it.each([false, true])(
    "offers browser login alongside healthy CLI meters (stored=%s)",
    (stored) => {
      useUsageLoginStateStore.getState().setStored("muse", stored);
      const { result } = renderHook(() => useUsageProviderLogin("muse"));
      expect(result.current.canBrowserSignIn).toBe(true);
      expect(result.current.canSignOut).toBe(stored);
    },
  );
  it("hides login when browser billing is already available", () => {
    useUsageLoginStateStore.getState().setStored("muse", true);
    useProviderUsageStore.getState().mergeSnapshot({
      providerId: "muse",
      status: "ok",
      fetchedAt: 2,
      windows: [{ id: "weekly", label: "Weekly", usedPercent: 20 }],
      cost: { currency: "USD", amount: 0, period: "30d", estimated: false },
    });
    const { result } = renderHook(() => useUsageProviderLogin("muse"));
    expect(result.current.canBrowserSignIn).toBe(false);
    expect(result.current.canSignOut).toBe(true);
  });
});
