import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RemoteImageReadiness } from "@/renderer/state/remoteServers/environmentSessions";
import type { ManagedLoopbackImageSession } from "@/renderer/state/managedLoopbackImages";
import type { RemoteServerRecord } from "@/renderer/state/remoteServers/types";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import { toLocalFileUrl } from "@/shared/promptContent";
import type { RemoteImageRefValue } from "@/shared/remote";
import {
  attachmentImageUrlFor,
  findRemoteImageServer,
  resolveThreadImageAuthority,
} from "./threadImageAuthority";

const session = vi.hoisted(() => ({ remote: true, managed: false }));
vi.mock("@/renderer/bridge", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/renderer/bridge")>()),
  isRemoteSession: () => session.remote,
}));

const bridge = vi.hoisted(() => ({
  client: { endpoint: "http://bound-bridge.test/" } as { endpoint: string } | null,
  readiness: undefined as unknown,
}));
vi.mock("@/renderer/browser/remoteBridge", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/renderer/browser/remoteBridge")>()),
  getRemoteBridgeClient: () => bridge.client,
  getRemoteBridgeImageReadiness: () => bridge.readiness,
  remoteBridgeImageRefUrl: () => "bridge-ref",
  remoteBridgeLocalImageUrl: (path: string) => `bridge-local:${path}`,
}));

vi.mock("@/renderer/state/managedRootCatalog/rootCatalogCommands", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/renderer/state/managedRootCatalog/rootCatalogCommands")
  >()),
  managedRootOwner: (entity: { id: string }) =>
    session.managed ? { kind: "managed-root", threadId: entity.id } : undefined,
}));

const paired: RemoteServerRecord = {
  desktopId: "second-host",
  label: "Second",
  endpoint: "http://second.test/",
  accessToken: "token",
  scopes: [],
};

const ref = { kind: "ref" } as unknown as RemoteImageRefValue;
const browserReadiness = { owner: "bridge" } as unknown as RemoteImageReadiness;
const pairedReadiness = { owner: "second-host" } as unknown as RemoteImageReadiness;
const managedSession = {
  readiness: { owner: "managed", resolveRef: () => "managed-ref" },
} as unknown as ManagedLoopbackImageSession;

describe("resolveThreadImageAuthority", () => {
  const original = useRemoteServersStore.getState();

  beforeEach(() => {
    session.remote = false;
    session.managed = false;
    bridge.client = { endpoint: "http://bound-bridge.test/" };
    bridge.readiness = browserReadiness;
    useRemoteServersStore.setState({
      servers: [paired],
      imageRefUrl: (key, value) => (value === ref ? `paired-ref:${key}` : ""),
      localImageUrl: (key, path) => `paired-local:${key}:${path}`,
      imageReadinessFor: (key) => (key === "second-host" ? pairedReadiness : undefined),
    });
  });

  afterEach(() => {
    useRemoteServersStore.setState({
      servers: [],
      imageRefUrl: original.imageRefUrl,
      localImageUrl: original.localImageUrl,
      imageReadinessFor: original.imageReadinessFor,
    });
  });

  describe("browser runtime (bridge)", () => {
    beforeEach(() => {
      session.remote = true;
    });

    it("routes an owner-less row through the bound bridge host", () => {
      const authority = resolveThreadImageAuthority({ id: "t1" });
      expect(authority.kind).toBe("bridge");
      expect(authority.available).toBe(true);
      expect(authority.refUrl(ref)).toBe("bridge-ref");
      expect(authority.localImageUrl("/a.png")).toBe("bridge-local:/a.png");
      expect(authority.readiness).toBe(browserReadiness);
      expect(authority.custody).toBe(browserReadiness);
    });

    it("prefers hook-held readiness and falls back to the bridge client as custody", () => {
      const held = { owner: "held" } as unknown as RemoteImageReadiness;
      expect(resolveThreadImageAuthority({ id: "t1" }, { browserReadiness: held }).readiness).toBe(
        held,
      );
      bridge.readiness = undefined;
      expect(resolveThreadImageAuthority({ id: "t1" }).custody).toBe(bridge.client);
    });

    it("keeps the bridge for a row whose connection record is absent", () => {
      expect(resolveThreadImageAuthority({ id: "t1", remoteServerId: "gone" }).kind).toBe("bridge");
    });

    it("keeps the bridge for the host the bridge client talks to", () => {
      bridge.client = { endpoint: paired.endpoint };
      expect(resolveThreadImageAuthority({ id: "t1", remoteServerId: "second-host" }).kind).toBe(
        "bridge",
      );
    });

    it("never routes a malformed connection id to the bridge", () => {
      const authority = resolveThreadImageAuthority({ id: "t1", remoteServerId: "" });
      expect(authority.kind).toBe("unavailable");
      expect(authority.available).toBe(false);
      expect(authority.refUrl(ref)).toBe("");
      expect(authority.localImageUrl("/a.png")).toBe("");
      expect(authority.readiness).toBeUndefined();
      expect(authority.custody).toBeUndefined();
    });
  });

  describe("paired thread", () => {
    it("uses the owning connection's image session", () => {
      const authority = resolveThreadImageAuthority({ id: "t1", remoteServerId: "second-host" });
      expect(authority.kind).toBe("paired");
      expect(authority.available).toBe(true);
      expect(authority.refUrl(ref)).toBe("paired-ref:second-host");
      expect(authority.localImageUrl("/a.png")).toBe("paired-local:second-host:/a.png");
      expect(authority.readiness).toBe(pairedReadiness);
      expect(authority.custody).toBe(paired);
    });

    it("does not use the bound bridge host in a remote client that is bound elsewhere", () => {
      session.remote = true;
      const authority = resolveThreadImageAuthority(
        { id: "t1", remoteServerId: "second-host" },
        { browserReadiness },
      );
      expect(authority.kind).toBe("paired");
      expect(authority.readiness).toBe(pairedReadiness);
    });

    it("is unavailable when the connection record is absent or malformed", () => {
      for (const remoteServerId of ["gone", ""]) {
        const authority = resolveThreadImageAuthority({ id: "t1", remoteServerId });
        expect(authority.kind).toBe("unavailable");
        expect(authority.refUrl(ref)).toBe("");
        expect(authority.localImageUrl("/a.png")).toBe("");
        expect(authority.readiness).toBeUndefined();
        expect(authority.custody).toBeUndefined();
      }
    });
  });

  describe("managed thread", () => {
    beforeEach(() => {
      session.managed = true;
    });

    it("uses the managed host's loopback image session", () => {
      const authority = resolveThreadImageAuthority({ id: "t1" }, { managedSession });
      expect(authority.kind).toBe("managed");
      expect(authority.available).toBe(true);
      expect(authority.refUrl(ref)).toBe("managed-ref");
      expect(authority.localImageUrl("/a.png")).toBe(toLocalFileUrl("/a.png"));
      expect(authority.readiness).toBe(managedSession.readiness);
      expect(authority.custody).toBe(managedSession);
    });

    it("stays managed but cannot serve refs while the session is offline", () => {
      const authority = resolveThreadImageAuthority({ id: "t1" }, { managedSession: null });
      expect(authority.kind).toBe("managed");
      expect(authority.refUrl(ref)).toBe("");
      expect(authority.readiness).toBeUndefined();
      expect(authority.custody).toBeNull();
    });
  });

  describe("unavailable", () => {
    it("has no owner without a thread", () => {
      const authority = resolveThreadImageAuthority(undefined);
      expect(authority.kind).toBe("unavailable");
      expect(authority.refUrl(ref)).toBe("");
      expect(authority.readiness).toBeUndefined();
      expect(authority.custody).toBeUndefined();
    });

    it("has no owner for an own-host row that is not a managed root", () => {
      const authority = resolveThreadImageAuthority({ id: "t1" }, { managedSession });
      expect(authority.kind).toBe("unavailable");
      expect(authority.available).toBe(false);
      expect(authority.localImageUrl("/a.png")).toBe("");
      expect(authority.readiness).toBeUndefined();
      expect(authority.custody).toBeUndefined();
    });
  });
});

describe("attachmentImageUrlFor", () => {
  beforeEach(() => {
    session.remote = false;
    useRemoteServersStore.setState({
      servers: [paired],
      localImageUrl: (key, path) => `paired-local:${key}:${path}`,
    });
  });

  afterEach(() => {
    useRemoteServersStore.setState({ servers: [] });
  });

  it("is undefined for the desktop's own attachments", () => {
    expect(attachmentImageUrlFor(undefined)).toBeUndefined();
    expect(attachmentImageUrlFor("")).toBeUndefined();
  });

  it("resolves a paired host's attachment through its connection", () => {
    expect(attachmentImageUrlFor("second-host")?.("/a.png")).toBe(
      "paired-local:second-host:/a.png",
    );
  });

  it("resolves through the bridge in a remote client when the bridge owns the row", () => {
    session.remote = true;
    expect(attachmentImageUrlFor("gone")?.("/a.png")).toBe("bridge-local:/a.png");
  });
});

describe("findRemoteImageServer", () => {
  it("finds a record by its connection key and rejects malformed keys", () => {
    const keyed = { ...paired, connectionId: "conn-1" };
    expect(findRemoteImageServer([keyed], "conn-1")).toBe(keyed);
    expect(findRemoteImageServer([keyed], "second-host")).toBeUndefined();
    expect(findRemoteImageServer([keyed], "")).toBeUndefined();
    expect(findRemoteImageServer([keyed], undefined)).toBeUndefined();
  });
});
