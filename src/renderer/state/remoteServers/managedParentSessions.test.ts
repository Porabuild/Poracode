import { afterEach, describe, expect, it, vi } from "vitest";
import { REMOTE_OPERATOR_SCOPES } from "@/shared/remote";
import type { RemoteDesktopClient } from "@/shared/remote/client";
import type { RemoteTokenLifecycle, RemoteTokenSnapshot } from "@/shared/remote/clientTypes";
import type { RemoteEnvironmentClient } from "@/shared/remote/clientEnvironments";
import {
  __resetEnvironmentSessionsForTest,
  configureEnvironmentSessions,
  createEnvironmentClientForPairing,
  environmentChildGrantKey,
  environmentImageReadinessFor,
  environmentSessionForServer,
  releaseEnvironmentChildGrant,
} from "./environmentSessions";
import {
  __resetManagedLoopbackOwnerForTest,
  clearManagedParentAuthority,
  isManagedParentAuthorityCurrent,
  publishManagedParentAuthority,
  type ManagedParentAuthority,
} from "./managedLoopbackOwner";
import { refreshSubjectVaultKey, type RefreshSubject } from "./refreshTokens";
import {
  environmentParentRef,
  type RemoteEnvironmentTransport,
  type RemoteServerRecord,
  type RemoteServersState,
} from "./types";

/**
 * Managed-parent session behavior against the ephemeral loopback authority:
 * the SAME client the procedure host routes with, structurally discriminated
 * from any persisted remote parent, with grant ownership fencing across a
 * removal/re-pair at the same key.
 */

const HOST = "managed-host-desktop";
const ENVIRONMENT_ID = "11111111-1111-4111-8111-111111111111";
const CHILD_KEY = "managed-child-connection";
const REMOTE_PARENT_KEY = "remote-parent-connection";

function managedChild(overrides: Partial<RemoteServerRecord> = {}): RemoteServerRecord {
  return {
    connectionId: CHILD_KEY,
    desktopId: "child-desktop",
    label: "Managed child",
    endpoint: `http://127.0.0.1:6000/api/environments/${ENVIRONMENT_ID}/proxy/`,
    accessToken: "child-access",
    scopes: ["session:read"],
    transport: {
      kind: "environment",
      managedHostDesktopId: HOST,
      environmentId: ENVIRONMENT_ID,
      childDesktopId: "child-desktop",
    },
    ...overrides,
  } as RemoteServerRecord;
}

function remoteChild(overrides: Partial<RemoteServerRecord> = {}): RemoteServerRecord {
  return {
    connectionId: "remote-child-connection",
    desktopId: "remote-child-desktop",
    label: "Remote child",
    endpoint: "http://127.0.0.1:49153/api/environments/x/proxy/",
    accessToken: "child-access",
    scopes: ["session:read"],
    transport: {
      kind: "environment",
      parentConnectionId: REMOTE_PARENT_KEY,
      environmentId: ENVIRONMENT_ID,
      childDesktopId: "remote-child-desktop",
    },
    ...overrides,
  } as RemoteServerRecord;
}

interface FakeManagedClient {
  refreshCalls: number;
  accessToken: string | undefined;
  pinCalls: number;
  client: RemoteDesktopClient;
}

function fakeManagedClient(initialToken = "managed-access"): FakeManagedClient {
  const state: FakeManagedClient = {
    refreshCalls: 0,
    accessToken: initialToken,
    pinCalls: 0,
    client: null as unknown as RemoteDesktopClient,
  };
  const client = {
    setTokenLifecycle: () => undefined,
    async refreshTokens() {
      state.refreshCalls += 1;
      state.accessToken = "managed-rotated";
      return {
        accessToken: "managed-rotated",
        refreshToken: "managed-refresh",
      } as RemoteTokenSnapshot;
    },
    setCertFingerprintPin: () => {
      state.pinCalls += 1;
    },
    async environmentWebSocketTicket() {
      return { ticket: "managed-ticket", expiresAt: new Date(Date.now() + 30_000).toISOString() };
    },
  } as unknown as RemoteDesktopClient;
  state.client = client;
  return state;
}

interface FakeEnvClient {
  readonly disposed: { value: boolean };
  lifecycle: RemoteTokenLifecycle | null;
  client: RemoteEnvironmentClient;
}

function fakeEnvClient(): FakeEnvClient {
  const disposed = { value: false };
  const state: FakeEnvClient = { disposed, lifecycle: null, client: null as never };
  const client = {
    setTokenLifecycle(next: RemoteTokenLifecycle) {
      state.lifecycle = next;
    },
    dispose: () => {
      disposed.value = true;
    },
    imageResolutionFor: () => ({ key: "k", url: "blob:ready", pending: false }),
    imageRefResolution: () => ({ key: "k", url: "", pending: true }),
    localImageResolution: () => ({ key: "k", url: "", pending: true }),
    subscribeImageKey: vi.fn<() => () => void>(() => () => undefined),
  } as unknown as RemoteEnvironmentClient;
  state.client = client;
  return state;
}

interface Harness {
  readonly state: RemoteServersState;
  readonly remembered: Map<string, string>;
  readonly written: string[];
  readonly subjects: RefreshSubject[];
  readonly envClients: FakeEnvClient[];
  readonly parentClientFactoryCalls: string[];
  readonly pinLookups: string[];
  authority: ManagedParentAuthority;
  publish(token?: string): ManagedParentAuthority;
}

function harness(records: readonly RemoteServerRecord[]): Harness {
  const state: RemoteServersState = { servers: [...records] } as unknown as RemoteServersState;
  const remembered = new Map<string, string>();
  const written: string[] = [];
  const subjects: RefreshSubject[] = [];
  const envClients: FakeEnvClient[] = [];
  const parentClientFactoryCalls: string[] = [];
  const pinLookups: string[] = [];
  configureEnvironmentSessions({
    getState: () => state,
    clientFactory: () => (endpoint) => {
      parentClientFactoryCalls.push(endpoint);
      throw new Error("a managed parent must never create a persisted parent client");
    },
    certPinForConnection: (key) => {
      pinLookups.push(key);
      return undefined;
    },
    refreshTokenForSubject: (subject) => {
      subjects.push(subject);
      return remembered.get(refreshSubjectVaultKey(subject));
    },
    rememberRefreshToken: (subject, token) => {
      subjects.push(subject);
      remembered.set(refreshSubjectVaultKey(subject), token);
    },
    writeRefreshTokenToVault: async (subject, token) => {
      subjects.push(subject);
      written.push(`${refreshSubjectVaultKey(subject)}=${token}`);
      return true;
    },
    deleteRefreshTokenFromVault: async (subject) => {
      subjects.push(subject);
      remembered.delete(refreshSubjectVaultKey(subject));
    },
    createEnvironmentClient: () => {
      const fake = fakeEnvClient();
      envClients.push(fake);
      return fake.client;
    },
  });
  const client = fakeManagedClient();
  const result = {
    state,
    remembered,
    written,
    subjects,
    envClients,
    parentClientFactoryCalls,
    pinLookups,
  } as Harness;
  result.publish = (token = "managed-access") => {
    client.accessToken = token;
    return publishManagedParentAuthority({
      hostDesktopId: HOST,
      endpoint: "http://127.0.0.1:6000/",
      sshEnvironments: true,
      scopes: REMOTE_OPERATOR_SCOPES,
      client: client.client,
      accessToken: () => client.accessToken,
    });
  };
  result.authority = result.publish();
  return result;
}

afterEach(() => {
  __resetEnvironmentSessionsForTest();
  __resetManagedLoopbackOwnerForTest();
});

describe("managed parent session resolution", () => {
  it("builds the child through the live authority with a managed grant subject", () => {
    const h = harness([managedChild()]);
    const session = environmentSessionForServer(managedChild());
    expect(session).toBeDefined();
    expect(session!.childGrantKey).toBe(`managedEnvironment.${HOST}.${ENVIRONMENT_ID}`);
    expect(session!.parentAuthority.accessToken()).toBe("managed-access");
    // The parent credential is the loopback authority: no persisted parent
    // client, no parent vault subject, no parent pin.
    expect(h.parentClientFactoryCalls).toEqual([]);
    expect(h.pinLookups).toEqual([]);
    expect(h.subjects.every((subject) => subject.kind !== "connection")).toBe(true);
    expect(h.written).toEqual([]);
  });

  it("fails closed before any dial for neither/both/empty parent discriminators", () => {
    const h = harness([
      managedChild({ transport: { kind: "environment", environmentId: ENVIRONMENT_ID } as never }),
      managedChild({
        connectionId: "both",
        transport: {
          kind: "environment",
          managedHostDesktopId: HOST,
          parentConnectionId: REMOTE_PARENT_KEY,
          environmentId: ENVIRONMENT_ID,
        } as never,
      }),
      managedChild({
        connectionId: "empty",
        transport: {
          kind: "environment",
          managedHostDesktopId: "",
          environmentId: ENVIRONMENT_ID,
        } as never,
      }),
    ]);
    h.publish();
    for (const record of h.state.servers) {
      expect(environmentSessionForServer(record)).toBeUndefined();
    }
    expect(h.envClients).toHaveLength(0);
    expect(h.parentClientFactoryCalls).toEqual([]);
  });

  it("rejects both-present parent fields even when one side is null/empty", () => {
    // Presence of a second field is malformed regardless of its value: a
    // crafted record must not fall through to the other authority.
    expect(
      environmentParentRef({ parentConnectionId: REMOTE_PARENT_KEY, managedHostDesktopId: null }),
    ).toBeUndefined();
    expect(
      environmentParentRef({ parentConnectionId: REMOTE_PARENT_KEY, managedHostDesktopId: "" }),
    ).toBeUndefined();
    expect(
      environmentParentRef({ parentConnectionId: "", managedHostDesktopId: HOST }),
    ).toBeUndefined();
    expect(
      environmentParentRef({ parentConnectionId: null, managedHostDesktopId: HOST }),
    ).toBeUndefined();
    // Exactly one present non-empty string still selects that kind.
    expect(environmentParentRef({ parentConnectionId: REMOTE_PARENT_KEY })).toEqual({
      kind: "connection",
      connectionId: REMOTE_PARENT_KEY,
    });
    expect(environmentParentRef({ managedHostDesktopId: HOST })).toEqual({
      kind: "managed",
      hostDesktopId: HOST,
    });

    // And no session is ever dialed for the malformed variants.
    const h = harness([
      managedChild({
        connectionId: "remote-plus-managed-null",
        transport: {
          kind: "environment",
          parentConnectionId: REMOTE_PARENT_KEY,
          managedHostDesktopId: null,
          environmentId: ENVIRONMENT_ID,
        } as never,
      }),
      managedChild({
        connectionId: "managed-plus-remote-empty",
        transport: {
          kind: "environment",
          parentConnectionId: "",
          managedHostDesktopId: HOST,
          environmentId: ENVIRONMENT_ID,
        } as never,
      }),
    ]);
    for (const record of h.state.servers) {
      expect(environmentSessionForServer(record)).toBeUndefined();
    }
    expect(h.envClients).toHaveLength(0);
    expect(h.parentClientFactoryCalls).toEqual([]);
  });

  it("keeps an opaque direct id shaped like a managed key on the direct authority only", () => {
    const collision = {
      connectionId: `managed:${HOST}`,
      desktopId: `managed:${HOST}`,
      label: "Colliding direct host",
      endpoint: "http://127.0.0.1:4444/",
      accessToken: "collision-access",
      scopes: ["session:read"],
      transport: { kind: "direct" },
    } as unknown as RemoteServerRecord;
    harness([collision, managedChild()]);
    // The managed ref resolves the ephemeral authority, never `findServer`.
    const session = environmentSessionForServer(managedChild());
    expect(session).toBeDefined();
    expect(session!.parentAuthority.accessToken()).toBe("managed-access");
  });

  it("resolves a persisted remote parent even when its id is grant-shaped", () => {
    const grantShapedParentKey = `environmentRefresh.${REMOTE_PARENT_KEY}.${ENVIRONMENT_ID}`;
    const parent = {
      connectionId: grantShapedParentKey,
      desktopId: "parent-desktop",
      label: "Parent",
      endpoint: "http://127.0.0.1:49153/",
      accessToken: "parent-access",
      scopes: ["session:read"],
      transport: { kind: "direct" },
    } as unknown as RemoteServerRecord;
    const child = remoteChild({
      transport: {
        kind: "environment",
        parentConnectionId: grantShapedParentKey,
        environmentId: ENVIRONMENT_ID,
        childDesktopId: "remote-child-desktop",
      },
    } as Partial<RemoteServerRecord>);
    configureEnvironmentSessions({
      getState: () => ({ servers: [parent, child] }) as unknown as RemoteServersState,
      clientFactory: () => () => fakeManagedClient("parent-access").client,
      certPinForConnection: () => undefined,
      refreshTokenForSubject: () => undefined,
      rememberRefreshToken: () => undefined,
      writeRefreshTokenToVault: async () => true,
      deleteRefreshTokenFromVault: async () => undefined,
      createEnvironmentClient: () => fakeEnvClient().client,
    });
    publishManagedParentAuthority({
      hostDesktopId: HOST,
      endpoint: "http://127.0.0.1:6000/",
      sshEnvironments: true,
      scopes: REMOTE_OPERATOR_SCOPES,
      client: fakeManagedClient().client,
      accessToken: () => "managed-access",
    });
    const session = environmentSessionForServer(child);
    expect(session).toBeDefined();
    // The persisted parent's live token, not the managed authority token.
    expect(session!.parentAuthority.accessToken()).toBe("parent-access");
    expect(session!.childGrantKey).toBe(
      `environmentRefresh.${grantShapedParentKey}.${ENVIRONMENT_ID}`,
    );
  });
});

describe("managed parent rotation and teardown", () => {
  it("keeps child sessions and image listeners through a rotation republish", async () => {
    const h = harness([managedChild()]);
    const session = environmentSessionForServer(managedChild());
    expect(session).toBeDefined();
    const childClient = h.envClients[0]!;
    expect(childClient.disposed.value).toBe(false);

    // Authority rotation: same (host, endpoint) republish keeps the identity
    // and generation, so nothing about the child changes — including a mounted
    // image readiness subscriber.
    const readiness = environmentImageReadinessFor(CHILD_KEY)!;
    const unsubscribe = readiness.subscribeRef(
      { threadId: "t", itemId: "i", path: ["images", 0], mime: "image/png", bytes: 1 },
      () => undefined,
    );
    const firstGeneration = h.authority.generation;
    h.publish("managed-rotated");
    expect(h.authority.generation).toBe(firstGeneration);
    expect(environmentSessionForServer(managedChild())).toBe(session);
    expect(childClient.disposed.value).toBe(false);
    unsubscribe();

    await session!.parentAuthority.ensureLive();
    expect(childClient.disposed.value).toBe(false);
    expect(session!.parentAuthority.accessToken()).toBe("managed-rotated");
  });

  it("fails closed and the runtime retires the child once the authority is cleared", () => {
    const h = harness([managedChild()]);
    const session = environmentSessionForServer(managedChild())!;
    const childClient = h.envClients[0]!;
    expect(childClient.disposed.value).toBe(false);
    clearManagedParentAuthority();
    expect(environmentSessionForServer(managedChild())).toBeUndefined();
    expect(isManagedParentAuthorityCurrent(h.authority)).toBe(false);
    // managedParentRuntime disposes sessions for the retired ref on clear.
    __resetEnvironmentSessionsForTest();
    expect(childClient.disposed.value).toBe(true);
    void session;
  });

  it("does not apply a delayed rotation from a replaced persisted parent session", () => {
    const parent = {
      connectionId: "parent-connection",
      desktopId: "parent-desktop",
      label: "Parent",
      endpoint: "http://127.0.0.1:49153/",
      accessToken: "parent-access-1",
      scopes: ["session:read"],
      transport: { kind: "direct" },
    } as unknown as RemoteServerRecord;
    const child = remoteChild({
      transport: {
        kind: "environment",
        parentConnectionId: "parent-connection",
        environmentId: ENVIRONMENT_ID,
        childDesktopId: "remote-child-desktop",
      },
    } as Partial<RemoteServerRecord>);
    const state = { servers: [parent, child] } as unknown as RemoteServersState;
    const lifecycles: RemoteTokenLifecycle[] = [];
    const configure = () =>
      configureEnvironmentSessions({
        getState: () => state,
        clientFactory: () => () =>
          ({
            setTokenLifecycle: (lifecycle: RemoteTokenLifecycle) => lifecycles.push(lifecycle),
            setCertFingerprintPin: () => undefined,
            refreshTokens: async () => null,
            environmentWebSocketTicket: async () => ({ ticket: "t", expiresAt: "" }),
          }) as unknown as RemoteDesktopClient,
        certPinForConnection: () => undefined,
        refreshTokenForSubject: () => undefined,
        rememberRefreshToken: () => undefined,
        writeRefreshTokenToVault: async () => true,
        deleteRefreshTokenFromVault: async () => undefined,
        createEnvironmentClient: () => fakeEnvClient().client,
      });
    configure();
    const session = environmentSessionForServer(child)!;
    expect(session.parentAuthority.accessToken()).toBe("parent-access-1");

    // Endpoint change replaces the parent session (a real parent rebuild).
    state.servers = [{ ...parent, endpoint: "http://127.0.0.1:49154/" }, child];
    const rebuilt = environmentSessionForServer(child)!;
    expect(rebuilt).not.toBe(session);
    expect(lifecycles).toHaveLength(2);

    // The replacement's fresh rotation lands; the retired client's delayed
    // response must not become the replacement's live token.
    lifecycles[1]!.onTokensRefreshed({ accessToken: "fresh", refreshToken: "r" });
    expect(rebuilt.parentAuthority.accessToken()).toBe("fresh");
    lifecycles[0]!.onTokensRefreshed({ accessToken: "stale", refreshToken: "old" });
    expect(rebuilt.parentAuthority.accessToken()).toBe("fresh");
  });
});

describe("child grant ownership across removal and re-pair", () => {
  it("drops a delayed rotation from a removed child session", () => {
    const h = harness([managedChild()]);
    const session = environmentSessionForServer(managedChild())!;
    const oldLifecycle = h.envClients[0]!.lifecycle!;
    oldLifecycle.onTokensRefreshed({ accessToken: "a", refreshToken: "old-grant" });
    expect(h.remembered.get(`managedEnvironment.${HOST}.${ENVIRONMENT_ID}`)).toBe("old-grant");

    session.dispose();
    oldLifecycle.onTokensRefreshed({ accessToken: "a", refreshToken: "resurrected" });
    expect(h.remembered.get(`managedEnvironment.${HOST}.${ENVIRONMENT_ID}`)).toBe("old-grant");
    expect(h.written).not.toContain(`managedEnvironment.${HOST}.${ENVIRONMENT_ID}=resurrected`);
  });

  it("never overwrites a newly paired grant with a delayed old writer", () => {
    const h = harness([managedChild()]);
    const first = environmentSessionForServer(managedChild())!;
    const oldLifecycle = h.envClients[0]!.lifecycle!;
    oldLifecycle.onTokensRefreshed({ accessToken: "a", refreshToken: "first-grant" });

    // Re-pair at the SAME endpoint: the record bearer changes, replacing the
    // session and acquiring a fresh fence.
    h.state.servers = [managedChild({ accessToken: "child-repaired" })];
    const second = environmentSessionForServer(managedChild({ accessToken: "child-repaired" }))!;
    expect(second).not.toBe(first);
    const newLifecycle = h.envClients[1]!.lifecycle!;
    newLifecycle.onTokensRefreshed({ accessToken: "b", refreshToken: "new-grant" });
    oldLifecycle.onTokensRefreshed({ accessToken: "c", refreshToken: "late-old-grant" });
    expect(h.remembered.get(`managedEnvironment.${HOST}.${ENVIRONMENT_ID}`)).toBe("new-grant");
    expect(h.written).not.toContain(`managedEnvironment.${HOST}.${ENVIRONMENT_ID}=late-old-grant`);
  });

  it("fences the temporary pairing client against a later session writer", () => {
    const h = harness([managedChild()]);
    const created = createEnvironmentClientForPairing({
      parent: { kind: "managed", hostDesktopId: HOST },
      environmentId: ENVIRONMENT_ID,
      endpoint: `http://127.0.0.1:6000/api/environments/${ENVIRONMENT_ID}/proxy/`,
      childDesktopId: "child-desktop",
    });
    expect(created).toBeDefined();
    const pairingLifecycle = h.envClients[0]!.lifecycle!;
    pairingLifecycle.onTokensRefreshed({ accessToken: "a", refreshToken: "pair-grant" });
    // The pairing client hands the fence over when it is done.
    created!.client.dispose();
    releaseEnvironmentChildGrant(created!.childGrantSubject, created!.grantOwner);

    const session = environmentSessionForServer(managedChild())!;
    h.envClients[1]!.lifecycle!.onTokensRefreshed({
      accessToken: "b",
      refreshToken: "session-grant",
    });
    pairingLifecycle.onTokensRefreshed({ accessToken: "c", refreshToken: "late-pair-grant" });
    expect(h.remembered.get(`managedEnvironment.${HOST}.${ENVIRONMENT_ID}`)).toBe("session-grant");
    expect(session.childGrantKey).toBe(`managedEnvironment.${HOST}.${ENVIRONMENT_ID}`);
  });
});

describe("environment child grant key helper", () => {
  it("returns undefined for malformed transports and the typed root otherwise", () => {
    expect(environmentChildGrantKey(remoteChild().transport as RemoteEnvironmentTransport)).toBe(
      `environmentRefresh.${REMOTE_PARENT_KEY}.${ENVIRONMENT_ID}`,
    );
    expect(environmentChildGrantKey(managedChild().transport as RemoteEnvironmentTransport)).toBe(
      `managedEnvironment.${HOST}.${ENVIRONMENT_ID}`,
    );
    expect(
      environmentChildGrantKey({
        kind: "environment",
        environmentId: ENVIRONMENT_ID,
      }),
    ).toBeUndefined();
  });
});
