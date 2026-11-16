import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import type { UsageSnapshot } from "@/shared/contracts";
import { useHostUsageStore } from "@/renderer/state/hostUsageStore";
import { useProviderUsageStore } from "@/renderer/state/providerUsageStore";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { useHostProviderUsage } from "./useHostProviderUsage";

function snapshot(providerId: string, account: string): UsageSnapshot {
  return { providerId, authenticatedAs: account, status: "ok", windows: [], fetchedAt: 100 };
}

const codex = { kind: "codex", instanceId: undefined } as const;

beforeEach(() => {
  useProviderUsageStore.setState({ snapshots: {} });
  useHostUsageStore.setState({ hosts: {} });
  useSharedSettings.setState({ agentInstances: {} });
  useRemoteServersStore.setState({
    servers: [
      {
        desktopId: "studio",
        label: "Studio",
        endpoint: "http://127.0.0.1:1234",
        accessToken: "token",
        scopes: ["session:read"],
      },
    ],
    runtime: { studio: { status: "offline", projects: [], threads: [] } },
  });
  const request = useHostUsageStore.getState().begin("studio");
  useHostUsageStore.getState().complete("studio", request, [snapshot("codex", "host-account")]);
  useProviderUsageStore.getState().mergeSnapshot(snapshot("codex", "device-account"));
});

describe("useHostProviderUsage", () => {
  it("reads the managed host's live snapshot from the supervisor-fed store", () => {
    const { result } = renderHook(() => useHostProviderUsage(undefined, codex));
    expect(result.current.providerId).toBe("codex");
    expect(result.current.snapshot?.authenticatedAs).toBe("device-account");
  });

  it("reads a paired host's snapshot from its own connection, never the managed one", () => {
    const { result } = renderHook(() => useHostProviderUsage("studio", codex));
    expect(result.current.snapshot?.authenticatedAs).toBe("host-account");
    expect(result.current.view.canRead).toBe(true);
  });

  it("returns no paired snapshot without read permission", () => {
    useRemoteServersStore.setState({
      servers: [
        {
          desktopId: "studio",
          label: "Studio",
          endpoint: "http://127.0.0.1:1234",
          accessToken: "token",
          scopes: [],
        },
      ],
    });
    const { result } = renderHook(() => useHostProviderUsage("studio", codex));
    expect(result.current.snapshot).toBeUndefined();
  });

  it("has no provider without an agent", () => {
    const { result } = renderHook(() => useHostProviderUsage(undefined, undefined));
    expect(result.current.providerId).toBe("");
    expect(result.current.snapshot).toBeUndefined();
  });
});
