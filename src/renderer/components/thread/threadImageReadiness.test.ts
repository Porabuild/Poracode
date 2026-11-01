import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RemoteImageReadiness } from "@/renderer/state/remoteServers/environmentSessions";
import type { RemoteServerRecord } from "@/renderer/state/remoteServers/types";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import { threadImageReadinessFor, usesBridgeThreadImages } from "./threadImageReadiness";

const session = vi.hoisted(() => ({ remote: true }));
vi.mock("@/renderer/bridge", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/renderer/bridge")>()),
  isRemoteSession: () => session.remote,
}));

const bridgeClient = vi.hoisted(() => ({
  current: { endpoint: "http://bound-bridge.test/" } as { endpoint: string } | null,
}));
vi.mock("@/renderer/browser/remoteBridge", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/renderer/browser/remoteBridge")>()),
  getRemoteBridgeClient: () => bridgeClient.current,
}));

const second: RemoteServerRecord = {
  desktopId: "second-host",
  label: "Second",
  endpoint: "http://second.test/",
  accessToken: "token",
  scopes: [],
};

describe("thread image routing in a remote client", () => {
  const originalImageReadinessFor = useRemoteServersStore.getState().imageReadinessFor;
  const ownerReadiness = { owner: "second-host" } as unknown as RemoteImageReadiness;
  const bridgeReadiness = { owner: "bound-bridge-host" } as unknown as RemoteImageReadiness;

  beforeEach(() => {
    session.remote = true;
    bridgeClient.current = { endpoint: "http://bound-bridge.test/" };
    useRemoteServersStore.setState({
      servers: [second],
      imageReadinessFor: (connectionKey) =>
        connectionKey === "second-host" ? ownerReadiness : undefined,
    });
  });

  afterEach(() => {
    useRemoteServersStore.setState({ servers: [], imageReadinessFor: originalImageReadinessFor });
  });

  it("uses the owning connection for a paired host's thread, not the bound bridge host", () => {
    expect(usesBridgeThreadImages("second-host")).toBe(false);
    expect(
      threadImageReadinessFor({ id: "t1", remoteServerId: "second-host" }, null, bridgeReadiness),
    ).toBe(ownerReadiness);
  });

  it("keeps the bridge cache for the host the bridge client talks to", () => {
    bridgeClient.current = { endpoint: second.endpoint };
    expect(usesBridgeThreadImages("second-host")).toBe(true);
  });

  it("keeps the bridge for owner-less rows and rows whose connection is unknown", () => {
    expect(usesBridgeThreadImages(undefined)).toBe(true);
    expect(usesBridgeThreadImages("unknown-host")).toBe(true);
    expect(threadImageReadinessFor({ id: "t2" }, null, bridgeReadiness)).toBe(bridgeReadiness);
  });

  it("never uses the bridge outside a remote client", () => {
    session.remote = false;
    expect(usesBridgeThreadImages(undefined)).toBe(false);
    expect(usesBridgeThreadImages("second-host")).toBe(false);
  });
});
