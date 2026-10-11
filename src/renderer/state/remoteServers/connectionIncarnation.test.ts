import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PORACODE_REMOTE_PROTOCOL_VERSION } from "@/shared/remote";
import { hostServiceCapabilities } from "@/shared/hostControlProtocol";
import type { RemoteDesktopClient } from "@/shared/remote/client";
import type { RemoteTokenLifecycle } from "@/shared/remote/clientTypes";
import type { SshConnectionConfig } from "@/shared/ssh";
import {
  __resetRemoteServersStoreForTest,
  useRemoteServersStore,
} from "@/renderer/state/remoteServersStore";
import {
  __resetEnvironmentSessionsForTest,
  environmentSessionForServer,
  parentClientForConnection,
} from "@/renderer/state/remoteServers/environmentSessions";
import {
  __forgetRefreshTokenForTest,
  __resetRefreshTokensForTest,
  connectionRefreshSubject,
  hydrateRefreshTokens,
  refreshTokenForSubject,
  type RefreshSubject,
} from "@/renderer/state/remoteServers/refreshTokens";
import { forgetCertPin } from "@/renderer/state/remoteServers/pairing";
import {
  __resetTokenVaultForTest,
  setDesktopToken,
} from "@/renderer/state/remoteServers/tokenVault";
import type { RemoteServerRecord, RemoteSocketLike } from "@/renderer/state/remoteServers/types";

/**
 * The connection incarnation across the REAL store actions (C1 managed-parent
 * review F1 corrections): an explicit re-pair through any pairing route
 * (direct, SSH, standalone attach) and a removal retire the long-lived parent
 * session and its refresh fence, so a delayed rotation can neither overwrite
 * the newly paired grant nor resurrect a deleted one — in memory AND in the
 * real encrypted vault.
 *
 * The pairing, removal, and parent-session lookups all run through the actual
 * `useRemoteServersStore` actions; only the network client is a fixture, and
 * the refresh vault is the real fake-indexeddb-backed custody.
 */

const bridge = vi.hoisted(() => ({
  sshConnect: vi.fn<() => Promise<unknown>>(),
  sshDisconnect: vi.fn<() => Promise<void>>(async () => {}),
}));
vi.mock("@/renderer/bridge", () => ({ readBridge: () => bridge }));

const PARENT_KEY = "parent-desktop";
const PARENT_ENDPOINT = "http://127.0.0.1:49153/";
const ENVIRONMENT_ID = "11111111-1111-4111-8111-111111111111";
const CHILD_KEY = "environment-child-connection";
const connectionSubject = connectionRefreshSubject(PARENT_KEY);

function parentRecord(overrides: Partial<RemoteServerRecord> = {}): RemoteServerRecord {
  return {
    connectionId: PARENT_KEY,
    desktopId: PARENT_KEY,
    label: "Parent",
    endpoint: PARENT_ENDPOINT,
    accessToken: "parent-access",
    scopes: ["session:read", "session:operate", "projects:manage"],
    transport: { kind: "direct" },
    ...overrides,
  } as RemoteServerRecord;
}

function childRecord(): RemoteServerRecord {
  return {
    connectionId: CHILD_KEY,
    desktopId: "child-desktop",
    label: "Child",
    endpoint: `${PARENT_ENDPOINT}api/environments/${ENVIRONMENT_ID}/proxy/`,
    accessToken: "child-access",
    scopes: ["session:read"],
    transport: {
      kind: "environment",
      parentConnectionId: PARENT_KEY,
      environmentId: ENVIRONMENT_ID,
      childDesktopId: "child-desktop",
    },
  } as unknown as RemoteServerRecord;
}

interface CapturedClient {
  readonly pins: string[];
  lifecycle: RemoteTokenLifecycle | null;
  client: RemoteDesktopClient;
}

let created: CapturedClient[] = [];

function descriptor(): Awaited<ReturnType<RemoteDesktopClient["environment"]>> {
  return {
    protocolVersion: PORACODE_REMOTE_PROTOCOL_VERSION,
    hostMode: "desktop",
    desktopId: PARENT_KEY,
    label: "Parent",
    appVersion: "1.0",
    auth: {
      policy: "remote-reachable",
      bootstrapMethods: ["one-time-token"],
      sessionMethods: ["bearer-access-token"],
      scopes: ["session:read", "projects:manage"],
    },
    endpoints: {
      httpBaseUrl: PARENT_ENDPOINT,
      wsBaseUrl: "ws://127.0.0.1:49153/",
    },
  };
}

function fakeClient(): RemoteDesktopClient {
  const entry: CapturedClient = {
    pins: [],
    lifecycle: null,
    client: null as unknown as RemoteDesktopClient,
  };
  const client = {
    setTokenLifecycle: (lifecycle: RemoteTokenLifecycle) => {
      entry.lifecycle = lifecycle;
    },
    setCertFingerprintPin: (fingerprint: string) => {
      entry.pins.push(fingerprint);
    },
    refreshTokens: async () => null,
    exchangePairingCredential: async () => ({
      accessToken: "fresh-access",
      tokenType: "Bearer",
      expiresAt: "2099-01-01T00:00:00.000Z",
      scopes: ["session:read", "projects:manage"],
      refreshToken: "fresh-grant",
    }),
    environment: async () => descriptor(),
    snapshot: async () => ({
      snapshotSeq: 1,
      projects: [],
      threads: [],
      runtimeSummariesByThread: {},
      updatedAt: "now",
    }),
    agentStatuses: async () => ({ windows: [], wsl: [], updatedAt: "now" }),
    describeHost: async () => hostServiceCapabilities({}),
    websocketTicket: async () => "ticket-1",
    websocketUrl: () => "ws://127.0.0.1:49153/ws?ticket=ticket-1",
    parseSocketMessage: (value: string) => JSON.parse(value),
  } as unknown as RemoteDesktopClient;
  entry.client = client;
  created.push(entry);
  return client;
}

function makeSocket(): RemoteSocketLike {
  return { close: () => {}, onmessage: null, onclose: null };
}

async function deleteVaultDatabase(): Promise<void> {
  await new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase("lightcode-mobile-vault");
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
    request.onblocked = () => resolve();
  });
}

/** Hydrates from the real vault and asserts the persisted slot value. */
async function expectVault(subject: RefreshSubject, token: string | undefined): Promise<void> {
  await vi.waitFor(
    async () => {
      __forgetRefreshTokenForTest(subject);
      await hydrateRefreshTokens({ subjects: [subject] });
      expect(refreshTokenForSubject(subject)).toBe(token);
    },
    { timeout: 5_000 },
  );
}

const RE_PAIR_FINGERPRINT = "c".repeat(64);

async function rePairVia(route: "direct" | "ssh" | "standalone"): Promise<void> {
  if (route === "direct") {
    await useRemoteServersStore.getState().pairServer({
      endpoint: PARENT_ENDPOINT,
      token: `${PARENT_ENDPOINT}#token=lc_pair_test&fp=sha256%3A${RE_PAIR_FINGERPRINT}`,
    });
    return;
  }
  if (route === "ssh") {
    bridge.sshConnect.mockResolvedValueOnce({
      endpoint: PARENT_ENDPOINT,
      pairingCredential: "lc_pair_ssh",
    });
    await useRemoteServersStore
      .getState()
      .pairSshServer({ id: "ssh-connection" } as SshConnectionConfig);
    return;
  }
  await useRemoteServersStore.getState().ensureStandaloneOwner({
    endpoint: PARENT_ENDPOINT,
    pairingUrl: `${PARENT_ENDPOINT}#token=lc_pair_standalone&fp=sha256%3A${RE_PAIR_FINGERPRINT}`,
    ownerGeneration: "owner-generation-1",
    remoteProtocolVersion: PORACODE_REMOTE_PROTOCOL_VERSION,
  });
}

beforeEach(async () => {
  localStorage.clear();
  // The pin map is module state: drop the previous route's pin so each pairing
  // case starts from the record's own assertion.
  forgetCertPin(PARENT_KEY);
  __resetRemoteServersStoreForTest();
  __resetRefreshTokensForTest();
  __resetTokenVaultForTest();
  await deleteVaultDatabase();
  await setDesktopToken("vault-warmup", "warm");
  created = [];
  bridge.sshConnect.mockReset();
  bridge.sshDisconnect.mockClear();
  useRemoteServersStore.getState().setClientFactory(() => fakeClient());
  useRemoteServersStore.getState().setSocketFactory(() => makeSocket());
});

afterEach(() => {
  __resetEnvironmentSessionsForTest();
  __resetRemoteServersStoreForTest();
  __resetRefreshTokensForTest();
  localStorage.clear();
});

describe("connection incarnation across store re-pair and removal", () => {
  it.each([
    { route: "direct" as const, assertsNewPin: true },
    // The SSH route carries no QR fingerprint, so only the session/token
    // adoption is asserted (its pin handling is unchanged).
    { route: "ssh" as const, assertsNewPin: false },
    { route: "standalone" as const, assertsNewPin: true },
  ])(
    "retires the captured parent incarnation on a $route re-pair before the commit",
    async ({ route, assertsNewPin }) => {
      useRemoteServersStore.setState({ servers: [parentRecord(), childRecord()] });
      const firstParent = parentClientForConnection(PARENT_KEY);
      expect(firstParent).toBeDefined();
      const retired = created.at(-1)!;
      expect(retired.lifecycle).not.toBeNull();

      retired.lifecycle!.onTokensRefreshed({
        accessToken: "old-access",
        refreshToken: "old-grant",
      });
      await expectVault(connectionSubject, "old-grant");

      await rePairVia(route);
      await expectVault(connectionSubject, "fresh-grant");

      // The old session is gone: the next lookup is a different client that
      // carries the new QR pin (direct/standalone) and serves the new bearer.
      const repaired = parentClientForConnection(PARENT_KEY);
      expect(repaired).not.toBe(firstParent);
      expect(created.at(-1)!.pins.includes(RE_PAIR_FINGERPRINT)).toBe(assertsNewPin);
      const childSession = environmentSessionForServer(childRecord())!;
      expect(childSession.parentAuthority.accessToken()).toBe("fresh-access");

      // A delayed rotation from the retired pairing is inert in memory and in
      // the vault: the fresh grant survives.
      retired.lifecycle!.onTokensRefreshed({ accessToken: "stale", refreshToken: "stale-old" });
      expect(refreshTokenForSubject(connectionSubject)).toBe("fresh-grant");
      await expectVault(connectionSubject, "fresh-grant");
    },
    30_000,
  );

  it("removes the parent session and fences delayed writes, including an in-flight vault write", async () => {
    useRemoteServersStore.setState({ servers: [parentRecord(), childRecord()] });
    parentClientForConnection(PARENT_KEY);
    const retired = created.at(-1)!;
    retired.lifecycle!.onTokensRefreshed({ accessToken: "live", refreshToken: "grant-1" });
    await expectVault(connectionSubject, "grant-1");

    // Hold the next encryption, so a rotation is mid-write when removal runs.
    const realEncrypt = crypto.subtle.encrypt.bind(crypto.subtle);
    let release: (() => void) | null = null;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let held = false;
    const encryptSpy = vi.spyOn(crypto.subtle, "encrypt").mockImplementation(async (...args) => {
      if (!held) {
        held = true;
        await gate;
      }
      return realEncrypt(...args);
    });
    try {
      retired.lifecycle!.onTokensRefreshed({ accessToken: "live-2", refreshToken: "grant-2" });
      await vi.waitFor(() => expect(held).toBe(true), { timeout: 5_000 });

      // The actual store removal (the dependent child needs the explicit
      // cascade confirmation).
      useRemoteServersStore.getState().removeServer(PARENT_KEY, { cascadeEnvironments: true });
      expect(useRemoteServersStore.getState().servers).toHaveLength(0);
      expect(refreshTokenForSubject(connectionSubject)).toBeUndefined();

      // A delayed rotation after removal is refused outright.
      retired.lifecycle!.onTokensRefreshed({ accessToken: "stale", refreshToken: "resurrected" });
      expect(refreshTokenForSubject(connectionSubject)).toBeUndefined();

      // The in-flight write lands first, then the removal's queued delete
      // wins: the deleted grant stays deleted.
      release!();
      await expectVault(connectionSubject, undefined);
    } finally {
      release!();
      encryptSpy.mockRestore();
    }
  }, 30_000);
});
