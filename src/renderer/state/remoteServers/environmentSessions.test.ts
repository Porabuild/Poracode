import { afterEach, describe, expect, it, vi } from "vitest";
import type { RemoteDesktopClient } from "@/shared/remote/client";
import type { RemoteTokenLifecycle, RemoteTokenSnapshot } from "@/shared/remote/clientTypes";
import { environmentImageRefKey } from "@/shared/remote/clientEnvironmentImages";
import type { RemoteImageRefValue } from "@/shared/remote";
import {
  __resetEnvironmentSessionsForTest,
  configureEnvironmentSessions,
  disposeEnvironmentParentSession,
  disposeEnvironmentSession,
  disposeEnvironmentSessionsForParent,
  environmentChildGrantKey,
  environmentImageReadinessFor,
  environmentProxyEndpoint,
  environmentSessionForServer,
  parentClientForConnection,
} from "./environmentSessions";
import {
  remoteConnectionKey,
  type RemoteEnvironmentTransport,
  type RemoteServerRecord,
  type RemoteServersState,
} from "./types";
import type { RemoteEnvironmentClient } from "@/shared/remote/clientEnvironments";
import {
  __resetRefreshTokensForTest,
  refreshSubjectVaultKey,
  type RefreshSubject,
} from "./refreshTokens";

function refreshKey(subject: RefreshSubject): string {
  return refreshSubjectVaultKey(subject);
}

const PARENT_KEY = "connection-parent";
const ENVIRONMENT_ID = "11111111-1111-4111-8111-111111111111";
const CHILD_KEY = "connection-child";

function parentRecord(overrides: Partial<RemoteServerRecord> = {}): RemoteServerRecord {
  return {
    connectionId: PARENT_KEY,
    desktopId: "parent-desktop",
    label: "Parent",
    endpoint: "http://127.0.0.1:49153/",
    accessToken: "parent-access",
    scopes: ["session:read", "session:operate", "ports:forward"],
    transport: { kind: "direct" },
    ...overrides,
  } as RemoteServerRecord;
}

function environmentRecord(overrides: Partial<RemoteServerRecord> = {}): RemoteServerRecord {
  return {
    connectionId: CHILD_KEY,
    desktopId: "child-desktop",
    label: "Child",
    endpoint: "http://127.0.0.1:49153/api/environments/x/proxy/",
    accessToken: "child-access",
    scopes: ["session:read"],
    transport: {
      kind: "environment",
      parentConnectionId: PARENT_KEY,
      environmentId: ENVIRONMENT_ID,
      childDesktopId: "child-desktop",
    },
    ...overrides,
  } as RemoteServerRecord;
}

interface FakeParentClient {
  lifecycle: RemoteTokenLifecycle | null;
  refreshCalls: number;
  client: RemoteDesktopClient;
}

function fakeParentClient(endpoint: string): FakeParentClient {
  let lifecycle: RemoteTokenLifecycle | null = null;
  let nextSnapshot: RemoteTokenSnapshot | null = {
    accessToken: `${endpoint}token-2`,
    refreshToken: "refresh-2",
  };
  const state: FakeParentClient = {
    lifecycle: null,
    refreshCalls: 0,
    client: null as unknown as RemoteDesktopClient,
  };
  const client = {
    setTokenLifecycle(next: RemoteTokenLifecycle) {
      lifecycle = next;
      state.lifecycle = next;
    },
    setCertFingerprintPin: vi.fn<() => void>(),
    async refreshTokens() {
      state.refreshCalls += 1;
      if (nextSnapshot) lifecycle?.onTokensRefreshed(nextSnapshot);
      return nextSnapshot;
    },
    environmentWebSocketTicket: vi.fn<() => Promise<{ ticket: string; expiresAt: string }>>(
      async () => ({
        ticket: "parent-ticket",
        expiresAt: new Date(Date.now() + 30_000).toISOString(),
      }),
    ),
    endpoint,
  } as unknown as RemoteDesktopClient;
  state.client = client;
  return state;
}

interface FakeEnvironmentClient {
  readonly disposed: { value: boolean };
  lifecycle: RemoteTokenLifecycle | null;
  client: RemoteEnvironmentClient;
}

function fakeEnvironmentClient(): FakeEnvironmentClient {
  const disposed = { value: false };
  const state: FakeEnvironmentClient = {
    disposed,
    lifecycle: null,
    client: null as unknown as RemoteEnvironmentClient,
  };
  const client = {
    setTokenLifecycle(next: RemoteTokenLifecycle) {
      state.lifecycle = next;
    },
    dispose: () => {
      disposed.value = true;
    },
    imageResolutionFor: vi.fn<() => { key: string; url: string; pending: boolean }>(() => ({
      key: "k",
      url: "blob:ready",
      pending: false,
    })),
    imageRefResolution: vi.fn<() => { key: string; url: string; pending: boolean }>(() => ({
      key: "k",
      url: "",
      pending: true,
    })),
    localImageResolution: vi.fn<() => { key: string; url: string; pending: boolean }>(() => ({
      key: "k",
      url: "",
      pending: true,
    })),
    subscribeImageKey: vi.fn<() => () => void>(() => () => undefined),
  } as unknown as RemoteEnvironmentClient;
  state.client = client;
  return state;
}

const IMAGE_REF: RemoteImageRefValue = {
  threadId: "t",
  itemId: "i",
  path: ["images", 0],
  mime: "image/png",
  bytes: 1,
};

interface FakeReadinessEnvironmentClient {
  readonly urls: Map<string, string>;
  readonly listeners: Map<string, Set<() => void>>;
  readonly requested: Set<string>;
  lifecycle: RemoteTokenLifecycle | null;
  disposed: boolean;
  client: RemoteEnvironmentClient;
}

function fakeReadinessEnvironmentClient(): FakeReadinessEnvironmentClient {
  const state: FakeReadinessEnvironmentClient = {
    urls: new Map(),
    listeners: new Map(),
    requested: new Set(),
    lifecycle: null,
    disposed: false,
    client: null as unknown as RemoteEnvironmentClient,
  };
  const resolution = (key: string) => ({
    key,
    url: state.urls.get(key) ?? "",
    pending: !state.urls.has(key),
  });
  const client = {
    setTokenLifecycle: (next: RemoteTokenLifecycle) => {
      state.lifecycle = next;
    },
    dispose: () => {
      state.disposed = true;
      state.listeners.clear();
    },
    imageResolutionFor: (key: string) => resolution(key),
    imageRefResolution: (ref: RemoteImageRefValue) => {
      const key = environmentImageRefKey(ref);
      state.requested.add(key);
      return resolution(key);
    },
    localImageResolution: (path: string) => {
      state.requested.add(path);
      return resolution(path);
    },
    subscribeImageKey: (key: string, listener: () => void) => {
      let listeners = state.listeners.get(key);
      if (!listeners) {
        listeners = new Set();
        state.listeners.set(key, listeners);
      }
      listeners.add(listener);
      return () => {
        state.listeners.get(key)?.delete(listener);
      };
    },
  } as unknown as RemoteEnvironmentClient;
  state.client = client;
  return state;
}

function setup(records: readonly RemoteServerRecord[]) {
  const parentClients = new Map<string, FakeParentClient>();
  const environmentClients: FakeEnvironmentClient[] = [];
  const refreshTokens = new Map<string, string>();
  const written: string[] = [];
  const state: RemoteServersState = {
    servers: [...records],
  } as unknown as RemoteServersState;
  configureEnvironmentSessions({
    getState: () => state,
    clientFactory: () => (endpoint) => {
      const fake = fakeParentClient(endpoint);
      parentClients.set(endpoint, fake);
      return fake.client;
    },
    certPinForConnection: (key) => (key === PARENT_KEY ? "parent-pin" : undefined),
    refreshTokenForSubject: (subject) => refreshTokens.get(refreshKey(subject)),
    rememberRefreshToken: (subject, token) => refreshTokens.set(refreshKey(subject), token),
    writeRefreshTokenToVault: async (subject, token) => {
      written.push(`${refreshKey(subject)}=${token}`);
      return true;
    },
    deleteRefreshTokenFromVault: async (subject) => {
      refreshTokens.delete(refreshKey(subject));
    },
    createEnvironmentClient: () => {
      const fake = fakeEnvironmentClient();
      environmentClients.push(fake);
      return fake.client;
    },
  });
  return { parentClients, environmentClients, refreshTokens, written, state };
}

afterEach(() => {
  __resetEnvironmentSessionsForTest();
  __resetRefreshTokensForTest();
});

describe("environmentSessions", () => {
  it("fails closed without a parent and refuses an environment-as-parent (no second hop)", () => {
    setup([environmentRecord()]);
    expect(environmentSessionForServer(environmentRecord())).toBeUndefined();

    const nestedParent: RemoteServerRecord = {
      ...parentRecord(),
      connectionId: "nested",
      transport: {
        kind: "environment",
        parentConnectionId: PARENT_KEY,
        environmentId: ENVIRONMENT_ID,
      },
    } as RemoteServerRecord;
    const nestedChild = environmentRecord({
      connectionId: "grandchild",
      transport: {
        kind: "environment",
        parentConnectionId: "nested",
        environmentId: ENVIRONMENT_ID,
        childDesktopId: "grandchild-desktop",
      },
    } as Partial<RemoteServerRecord>);
    setup([parentRecord(), nestedParent, nestedChild]);
    expect(environmentSessionForServer(nestedChild)).toBeUndefined();
  });

  it("builds the child client at the parent proxy endpoint with the parent pin and grant key", () => {
    const { environmentClients } = setup([parentRecord(), environmentRecord()]);
    const session = environmentSessionForServer(environmentRecord());
    expect(session).toBeDefined();
    expect(environmentClients).toHaveLength(1);
    expect(session?.childGrantKey).toBe(
      environmentChildGrantKey(environmentRecord().transport as RemoteEnvironmentTransport),
    );
    // The child lifecycle reads/writes the parent-scoped grant key.
    session?.client.setTokenLifecycle({
      refreshToken: () => undefined,
      onTokensRefreshed: () => undefined,
    });
    expect(session?.parentAuthority.accessToken()).toBe("parent-access");
  });

  it("coalesces parent refresh across environments (single-flight)", async () => {
    const { parentClients } = setup([parentRecord(), environmentRecord()]);
    const session = environmentSessionForServer(environmentRecord());
    const other = environmentSessionForServer(
      environmentRecord({
        connectionId: "connection-child-2",
        transport: {
          kind: "environment",
          parentConnectionId: PARENT_KEY,
          environmentId: "22222222-2222-4222-8222-222222222222",
        },
      } as Partial<RemoteServerRecord>),
    );
    await Promise.all([session!.parentAuthority.ensureLive(), other!.parentAuthority.ensureLive()]);
    const parentClient = [...parentClients.values()][0]!;
    expect(parentClient.refreshCalls).toBe(1);
    expect(session!.parentAuthority.accessToken()).toBe("http://127.0.0.1:49153/token-2");
  });

  it("re-pairing the child disposes the old client and keeps the parent session", () => {
    const { environmentClients } = setup([parentRecord(), environmentRecord()]);
    const first = environmentSessionForServer(environmentRecord());
    const second = environmentSessionForServer(
      environmentRecord({ accessToken: "child-rotated" } as Partial<RemoteServerRecord>),
    );
    expect(second).not.toBe(first);
    expect(environmentClients[0]?.disposed.value).toBe(true);
    expect(environmentClients[1]?.disposed.value).toBe(false);
    // Parent session survives the child rebuild.
    expect(parentClientForConnection(PARENT_KEY)).toBeDefined();
  });

  it("disposal scopes: one child vs all children of a parent", () => {
    const { environmentClients } = setup([parentRecord(), environmentRecord()]);
    environmentSessionForServer(environmentRecord());
    disposeEnvironmentSession(CHILD_KEY);
    expect(environmentClients[0]?.disposed.value).toBe(true);

    const again = setup([parentRecord(), environmentRecord()]);
    environmentSessionForServer(environmentRecord());
    disposeEnvironmentSessionsForParent({ kind: "connection", connectionId: PARENT_KEY });
    expect(again.environmentClients[0]?.disposed.value).toBe(true);
    expect(parentClientForConnection(PARENT_KEY)).toBeDefined();
  });

  it("keeps the child session and its keyed listeners through a parent token rotation (C1 F6)", async () => {
    const created: FakeReadinessEnvironmentClient[] = [];
    const state: RemoteServersState = {
      servers: [parentRecord(), environmentRecord()],
    } as unknown as RemoteServersState;
    configureEnvironmentSessions({
      getState: () => state,
      clientFactory: () => (endpoint) => fakeParentClient(endpoint).client,
      certPinForConnection: () => undefined,
      refreshTokenForSubject: () => undefined,
      rememberRefreshToken: () => undefined,
      writeRefreshTokenToVault: async () => true,
      deleteRefreshTokenFromVault: async () => undefined,
      createEnvironmentClient: () => {
        const fake = fakeReadinessEnvironmentClient();
        created.push(fake);
        return fake.client;
      },
    });
    const session = environmentSessionForServer(environmentRecord());
    const readiness = environmentImageReadinessFor(CHILD_KEY);
    readiness!.subscribeRef(IMAGE_REF, () => undefined);
    expect(created).toHaveLength(1);
    expect(created[0]!.listeners.get(environmentImageRefKey(IMAGE_REF))?.size).toBe(1);

    // A parent refresh rotates the live token; the child session identity
    // (which never consumed the live parent token) must not change.
    await session!.parentAuthority.ensureLive();
    expect(session!.parentAuthority.accessToken()).toBe("http://127.0.0.1:49153/token-2");
    readiness!.resolveRef(IMAGE_REF);

    expect(created).toHaveLength(1);
    expect(created[0]!.disposed).toBe(false);
    expect(created[0]!.listeners.get(environmentImageRefKey(IMAGE_REF))?.size).toBe(1);
  });

  it("rebinds, re-requests, and notifies mounted subscribers on a real rebuild (C1 F6)", async () => {
    const created: FakeReadinessEnvironmentClient[] = [];
    const state: RemoteServersState = {
      servers: [parentRecord(), environmentRecord()],
    } as unknown as RemoteServersState;
    configureEnvironmentSessions({
      getState: () => state,
      clientFactory: () => (endpoint) => fakeParentClient(endpoint).client,
      certPinForConnection: () => undefined,
      refreshTokenForSubject: () => undefined,
      rememberRefreshToken: () => undefined,
      writeRefreshTokenToVault: async () => true,
      deleteRefreshTokenFromVault: async () => undefined,
      createEnvironmentClient: () => {
        const fake = fakeReadinessEnvironmentClient();
        created.push(fake);
        return fake.client;
      },
    });
    const session = environmentSessionForServer(environmentRecord());
    const readiness = environmentImageReadinessFor(CHILD_KEY);
    let notifications = 0;
    const unsubscribe = readiness!.subscribeRef(IMAGE_REF, () => {
      notifications += 1;
    });
    expect(created).toHaveLength(1);

    // Real rebuild: the child bearer changed (re-pair), so the old client and
    // its cache are replaced.
    state.servers = [
      parentRecord(),
      environmentRecord({ accessToken: "child-repaired" } as Partial<RemoteServerRecord>),
    ];
    expect(readiness!.resolveRef(IMAGE_REF)).toBe("");

    expect(created).toHaveLength(2);
    expect(created[0]!.disposed).toBe(true);
    // The mounted listener was rebound to the replacement client and the
    // binding's target was re-requested against it.
    expect(created[1]!.listeners.get(environmentImageRefKey(IMAGE_REF))?.size).toBe(1);
    expect(created[1]!.requested.has(environmentImageRefKey(IMAGE_REF))).toBe(true);
    await vi.waitFor(() => expect(notifications).toBeGreaterThan(0));

    // A ready transition on the replacement client reaches the same listener.
    const key = environmentImageRefKey(IMAGE_REF);
    created[1]!.urls.set(key, "blob:repair");
    for (const listener of created[1]!.listeners.get(key) ?? []) listener();
    expect(readiness!.resolveRef(IMAGE_REF)).toBe("blob:repair");

    unsubscribe();
    expect(created[1]!.listeners.get(key)?.size ?? 0).toBe(0);
    // Parent repairs never touch the child session (already covered above);
    // the child repair above never touched the parent authority.
    expect(session!.parentAuthority.accessToken()).toBe("parent-access");
  });

  it("binds a readiness subscriber that arrived before the parent session existed (C1 F6)", async () => {
    const created: FakeReadinessEnvironmentClient[] = [];
    const state: RemoteServersState = {
      // The environment is known, but its parent is not paired/connected yet.
      servers: [environmentRecord()],
    } as unknown as RemoteServersState;
    configureEnvironmentSessions({
      getState: () => state,
      clientFactory: () => (endpoint) => fakeParentClient(endpoint).client,
      certPinForConnection: () => undefined,
      refreshTokenForSubject: () => undefined,
      rememberRefreshToken: () => undefined,
      writeRefreshTokenToVault: async () => true,
      deleteRefreshTokenFromVault: async () => undefined,
      createEnvironmentClient: () => {
        const fake = fakeReadinessEnvironmentClient();
        created.push(fake);
        return fake.client;
      },
    });
    const readiness = environmentImageReadinessFor(CHILD_KEY);
    let notifications = 0;
    readiness!.subscribeRef(IMAGE_REF, () => {
      notifications += 1;
    });
    expect(created).toHaveLength(0);

    // The parent appears; the next read creates the child session and binds
    // (and re-requests) the retained subscriber.
    state.servers = [parentRecord(), environmentRecord()];
    expect(readiness!.resolveRef(IMAGE_REF)).toBe("");
    expect(created).toHaveLength(1);
    expect(created[0]!.listeners.get(environmentImageRefKey(IMAGE_REF))?.size).toBe(1);
    expect(created[0]!.requested.has(environmentImageRefKey(IMAGE_REF))).toBe(true);
    await vi.waitFor(() => expect(notifications).toBeGreaterThan(0));
  });

  it("exposes keyed image readiness only for environment records", () => {
    setup([parentRecord(), environmentRecord()]);
    expect(environmentImageReadinessFor(PARENT_KEY)).toBeUndefined();
    const readiness = environmentImageReadinessFor(CHILD_KEY);
    expect(readiness).toBeDefined();
    const ref = {
      threadId: "t",
      itemId: "i",
      path: ["images", 0] as const,
      mime: "image/png",
      bytes: 1,
    };
    expect(readiness!.resolveRef(ref)).toBe("blob:ready");
    readiness!.requestRef(ref);
    readiness!.requestPath("/tmp/a.png");
    const listener = vi.fn<() => void>();
    const unsubscribe = readiness!.subscribePath("/tmp/a.png", listener);
    unsubscribe();
    expect(remoteConnectionKey(environmentRecord())).toBe(CHILD_KEY);
    expect(environmentProxyEndpoint(parentRecord().endpoint, ENVIRONMENT_ID)).toBe(
      `http://127.0.0.1:49153/api/environments/${ENVIRONMENT_ID}/proxy/`,
    );
  });
});

describe("persisted parent session lifecycle", () => {
  it("disposes on removal and keeps the retired client's delayed rotation inert", () => {
    const { parentClients, refreshTokens, written } = setup([parentRecord(), environmentRecord()]);
    expect(parentClientForConnection(PARENT_KEY)).toBeDefined();
    const retired = [...parentClients.values()][0]!;
    expect(retired.lifecycle).not.toBeNull();

    retired.lifecycle!.onTokensRefreshed({ accessToken: "live", refreshToken: "grant-1" });
    expect(refreshTokens.get(`refresh.${PARENT_KEY}`)).toBe("grant-1");

    // Production removal disposes the parent session with the deleted grant.
    disposeEnvironmentParentSession(PARENT_KEY);
    refreshTokens.delete(`refresh.${PARENT_KEY}`);
    retired.lifecycle!.onTokensRefreshed({ accessToken: "stale", refreshToken: "resurrected" });
    expect(refreshTokens.get(`refresh.${PARENT_KEY}`)).toBeUndefined();
    expect(written).not.toContain(`refresh.${PARENT_KEY}=resurrected`);

    // The record still exists: the next lookup rebuilds a fresh client from it.
    const rebuilt = parentClientForConnection(PARENT_KEY);
    const rebuiltFake = [...parentClients.values()][0]!;
    expect(rebuilt).toBeDefined();
    expect(rebuiltFake).not.toBe(retired);
    expect(rebuiltFake.client).toBe(rebuilt);
  });

  it("adopts the re-pair's new pin and bearer after the pairing path retires the session", () => {
    let pin = "old-pin";
    interface CapturedParentClient {
      readonly pins: string[];
      lifecycle: RemoteTokenLifecycle | null;
      client: RemoteDesktopClient;
    }
    const parentClients: CapturedParentClient[] = [];
    const state: RemoteServersState = {
      servers: [parentRecord(), environmentRecord()],
    } as unknown as RemoteServersState;
    configureEnvironmentSessions({
      getState: () => state,
      clientFactory: () => () => {
        const entry: CapturedParentClient = {
          pins: [],
          lifecycle: null,
          client: null as unknown as RemoteDesktopClient,
        };
        const client = {
          setTokenLifecycle: (next: RemoteTokenLifecycle) => {
            entry.lifecycle = next;
          },
          setCertFingerprintPin: (fingerprint: string) => {
            entry.pins.push(fingerprint);
          },
          refreshTokens: async () => null,
          environmentWebSocketTicket: async () => ({ ticket: "t", expiresAt: "" }),
        } as unknown as RemoteDesktopClient;
        entry.client = client;
        parentClients.push(entry);
        return client;
      },
      certPinForConnection: () => pin,
      refreshTokenForSubject: () => undefined,
      rememberRefreshToken: () => undefined,
      writeRefreshTokenToVault: async () => true,
      deleteRefreshTokenFromVault: async () => undefined,
      createEnvironmentClient: () => fakeEnvironmentClient().client,
    });

    const first = parentClientForConnection(PARENT_KEY)!;
    expect(parentClients[0]!.pins).toEqual(["old-pin"]);
    expect(first).toBe(parentClients[0]!.client);

    // Explicit re-pair at the same endpoint: `pairAtEndpoint` retires the
    // parent session BEFORE its credential/record commit (new QR pin, new
    // bearer), so the next lookup builds the current pairing's client.
    disposeEnvironmentParentSession(PARENT_KEY);
    pin = "new-pin";
    state.servers = [parentRecord({ accessToken: "fresh-access" }), environmentRecord()];
    const repaired = parentClientForConnection(PARENT_KEY)!;
    expect(repaired).not.toBe(first);
    expect(parentClients).toHaveLength(2);
    expect(parentClients[1]!.pins).toEqual(["new-pin"]);
    const session = environmentSessionForServer(environmentRecord())!;
    expect(session.parentAuthority.accessToken()).toBe("fresh-access");
  });
});

describe("child session parent pin identity", () => {
  interface PinHarness {
    readonly state: RemoteServersState;
    readonly capturedPins: Array<string | null | undefined>;
    readonly created: FakeReadinessEnvironmentClient[];
    readonly refreshTokens: Map<string, string>;
    readonly written: string[];
    readonly parentClients: Map<string, FakeParentClient>;
    setPin(next: string | undefined): void;
  }

  function pinHarness(initialPin: string | undefined): PinHarness {
    let pin = initialPin;
    const capturedPins: Array<string | null | undefined> = [];
    const created: FakeReadinessEnvironmentClient[] = [];
    const refreshTokens = new Map<string, string>();
    const written: string[] = [];
    const parentClients = new Map<string, FakeParentClient>();
    const state = {
      servers: [parentRecord(), environmentRecord()],
    } as unknown as RemoteServersState;
    configureEnvironmentSessions({
      getState: () => state,
      clientFactory: () => (endpoint) => {
        const fake = fakeParentClient(endpoint);
        parentClients.set(endpoint, fake);
        return fake.client;
      },
      certPinForConnection: () => pin,
      refreshTokenForSubject: (subject) => refreshTokens.get(refreshKey(subject)),
      rememberRefreshToken: (subject, token) => refreshTokens.set(refreshKey(subject), token),
      writeRefreshTokenToVault: async (subject, token) => {
        written.push(`${refreshKey(subject)}=${token}`);
        return true;
      },
      deleteRefreshTokenFromVault: async (subject) => {
        refreshTokens.delete(refreshKey(subject));
      },
      createEnvironmentClient: (_endpoint, _accessToken, options) => {
        capturedPins.push(options.certFingerprint);
        const fake = fakeReadinessEnvironmentClient();
        created.push(fake);
        return fake.client;
      },
    });
    return {
      state,
      capturedPins,
      created,
      refreshTokens,
      written,
      parentClients,
      setPin: (next) => {
        pin = next;
      },
    };
  }

  it("rebuilds an existing child when a re-pair replaces the parent pin, adopting the current pin", () => {
    const h = pinHarness("old-pin");
    const first = environmentSessionForServer(environmentRecord())!;
    expect(h.capturedPins).toEqual(["old-pin"]);

    // Production `pairAtEndpoint` retires the parent session BEFORE committing
    // the new credential/pin; the next child lookup must not serve the old pin.
    disposeEnvironmentParentSession(PARENT_KEY);
    h.setPin("new-pin");
    h.state.servers = [parentRecord({ accessToken: "new-parent-access" }), environmentRecord()];
    const second = environmentSessionForServer(environmentRecord())!;

    expect(second).not.toBe(first);
    expect(second.client).not.toBe(first.client);
    expect(h.capturedPins).toEqual(["old-pin", "new-pin"]);
    expect(h.created[0]!.disposed).toBe(true);
    expect(h.created[1]!.disposed).toBe(false);
    // The child grant slot is unchanged: the rebuild only re-pins the client.
    expect(second.childGrantKey).toBe(first.childGrantKey);
  });

  it("adopts a pin added by re-pair and a pin removed with the parent approval", () => {
    const h = pinHarness(undefined);
    const first = environmentSessionForServer(environmentRecord())!;
    expect(h.capturedPins).toEqual([undefined]);

    disposeEnvironmentParentSession(PARENT_KEY);
    h.setPin("added-pin");
    const second = environmentSessionForServer(environmentRecord())!;
    expect(second).not.toBe(first);
    expect(h.capturedPins).toEqual([undefined, "added-pin"]);

    disposeEnvironmentParentSession(PARENT_KEY);
    h.setPin(undefined);
    const third = environmentSessionForServer(environmentRecord())!;
    expect(third).not.toBe(second);
    expect(h.capturedPins).toEqual([undefined, "added-pin", undefined]);
  });

  it("rebinds mounted image subscribers to the replacement client on a pin rebuild", async () => {
    const h = pinHarness("old-pin");
    environmentSessionForServer(environmentRecord());
    const readiness = environmentImageReadinessFor(CHILD_KEY)!;
    const key = environmentImageRefKey(IMAGE_REF);
    let notifications = 0;
    const unsubscribe = readiness.subscribeRef(IMAGE_REF, () => {
      notifications += 1;
    });
    expect(h.created[0]!.listeners.get(key)?.size).toBe(1);

    disposeEnvironmentParentSession(PARENT_KEY);
    h.setPin("new-pin");
    expect(readiness.resolveRef(IMAGE_REF)).toBe("");

    expect(h.created).toHaveLength(2);
    expect(h.created[0]!.disposed).toBe(true);
    // The mounted listener was rebound to the replacement client and the
    // binding's target was re-requested against it.
    expect(h.created[1]!.listeners.get(key)?.size).toBe(1);
    expect(h.created[1]!.requested.has(key)).toBe(true);
    await vi.waitFor(() => expect(notifications).toBeGreaterThan(0));

    h.created[1]!.urls.set(key, "blob:pin-repair");
    for (const listener of h.created[1]!.listeners.get(key) ?? []) listener();
    expect(readiness.resolveRef(IMAGE_REF)).toBe("blob:pin-repair");

    unsubscribe();
    expect(h.created[1]!.listeners.get(key)?.size ?? 0).toBe(0);
  });

  it("keeps the retired child's delayed rotation inert and its grant slot owned after a pin rebuild", () => {
    const h = pinHarness("old-pin");
    const first = environmentSessionForServer(environmentRecord())!;
    const grantKey = first.childGrantKey;
    h.created[0]!.lifecycle!.onTokensRefreshed({ accessToken: "a", refreshToken: "old-grant" });
    expect(h.refreshTokens.get(grantKey)).toBe("old-grant");

    disposeEnvironmentParentSession(PARENT_KEY);
    h.setPin("new-pin");
    const second = environmentSessionForServer(environmentRecord())!;
    expect(second.childGrantKey).toBe(grantKey);
    h.created[1]!.lifecycle!.onTokensRefreshed({ accessToken: "b", refreshToken: "new-grant" });
    expect(h.refreshTokens.get(grantKey)).toBe("new-grant");

    // The retired client's late rotation can neither re-own the slot nor
    // overwrite the replacement's grant.
    h.created[0]!.lifecycle!.onTokensRefreshed({ accessToken: "c", refreshToken: "late-grant" });
    expect(h.refreshTokens.get(grantKey)).toBe("new-grant");
    expect(h.written).not.toContain(`${grantKey}=late-grant`);
  });

  it("preserves the exact child client and listeners through a parent token rotation at an unchanged pin", async () => {
    const h = pinHarness("stable-pin");
    const session = environmentSessionForServer(environmentRecord())!;
    const readiness = environmentImageReadinessFor(CHILD_KEY)!;
    readiness.subscribeRef(IMAGE_REF, () => undefined);
    expect(h.created).toHaveLength(1);

    await session.parentAuthority.ensureLive();
    expect(session.parentAuthority.accessToken()).toBe("http://127.0.0.1:49153/token-2");

    expect(environmentSessionForServer(environmentRecord())).toBe(session);
    expect(h.created).toHaveLength(1);
    expect(h.created[0]!.disposed).toBe(false);
    expect(h.created[0]!.listeners.get(environmentImageRefKey(IMAGE_REF))?.size).toBe(1);
  });
});
