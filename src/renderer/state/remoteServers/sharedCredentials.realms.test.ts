import "fake-indexeddb/auto";
import { IDBFactory, IDBObjectStore } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RefreshTokenReuseError, RemoteAuthStore, RemoteHttpError } from "@/host/remote/auth";
import type { RemoteFetch } from "@/shared/remote/client";
import type { RemoteServerRecord } from "./types";

// Every renderer realm (main window, side-chat window, PWA tab) is a separate
// module graph of the real store, token lifecycle, vault and client. They share
// only localStorage and IndexedDB, like real realms. The host is the real
// RemoteAuthStore; refresh reuse revokes the whole family as the server does.

const STORAGE_KEY = "poracode-remote-servers";
const CONNECTION_ID = "paired-connection";
const ENDPOINT = "https://paired.example/";
const MOVED_ENDPOINT = "https://moved.example/";

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function createHost() {
  const auth = new RemoteAuthStore();
  const stats = { rotations: 0, reuseRevocations: 0 };
  const sent: { origin: string; authorization: string | null }[] = [];
  const fetchImpl: RemoteFetch = async (url, init) => {
    const target = new URL(String(url));
    try {
      if (target.pathname === "/oauth/token") {
        const body = JSON.parse(String(init?.body)) as { refreshToken: string };
        try {
          const result = auth.refreshAccessToken({ refreshToken: body.refreshToken });
          stats.rotations += 1;
          return json(200, result);
        } catch (error) {
          if (error instanceof RefreshTokenReuseError) {
            stats.reuseRevocations += 1;
            auth.revokeAccessSession(error.sessionId);
          }
          throw error;
        }
      }
      const authorization = new Headers(init?.headers).get("authorization");
      sent.push({ origin: target.origin, authorization });
      if (target.pathname === "/api/auth/websocket-ticket") {
        return json(
          200,
          auth.issueWebSocketTicket({ accessToken: (authorization ?? "").replace(/^Bearer /, "") }),
        );
      }
      return json(404, { error: { code: "not_found", message: target.pathname } });
    } catch (error) {
      if (error instanceof RemoteHttpError) {
        return json(error.status, { error: { code: error.code, message: error.message } });
      }
      throw error;
    }
  };
  const { credential } = auth.issuePairingCredential();
  // The first bearer is already expired, like a pairing older than its TTL.
  const paired = auth.exchangePairingCredential({ credential, ttlMs: 1 });
  return { auth, fetchImpl, stats, sent, paired };
}

type Host = ReturnType<typeof createHost>;

/** A shared Web Lock manager, as every realm of one origin sees it. */
function installWebLocks(): void {
  const tails = new Map<string, Promise<unknown>>();
  const locks = {
    request: async <T>(name: string, callback: () => Promise<T>): Promise<T> => {
      const previous = tails.get(name) ?? Promise.resolve();
      let release!: () => void;
      tails.set(name, new Promise<void>((resolve) => (release = resolve)));
      await previous;
      try {
        return await callback();
      } finally {
        release();
      }
    },
  };
  Object.defineProperty(navigator, "locks", { configurable: true, value: locks });
}

function record(endpoint = ENDPOINT): RemoteServerRecord {
  return {
    connectionId: CONNECTION_ID,
    desktopId: "paired-desktop",
    endpoint,
    label: "Paired desktop",
    accessToken: "",
    scopes: ["session:read"],
    transport: { kind: "direct" },
  };
}

async function seedPairing(host: Host): Promise<void> {
  vi.resetModules();
  const vault = await import("./tokenVault");
  const refresh = await import("./refreshTokens");
  expect(await vault.setDesktopToken(CONNECTION_ID, host.paired.accessToken)).toBe(true);
  expect(
    await refresh.writeRefreshTokenToVault(
      refresh.connectionRefreshSubject(CONNECTION_ID),
      host.paired.refreshToken!,
    ),
  ).toBe(true);
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      state: {
        servers: [record()],
        excludedProjectIds: {},
        projectWorkspaceIds: {},
        projectNameOverrides: {},
        lastKnownProjects: {},
      },
      version: 2,
    }),
  );
}

/** What a realm started now would load from shared storage. */
async function readDurable(connectionId = CONNECTION_ID) {
  vi.resetModules();
  const vault = await import("./tokenVault");
  const refresh = await import("./refreshTokens");
  const subject = refresh.connectionRefreshSubject(connectionId);
  await refresh.hydrateRefreshTokens({ subjects: [subject] });
  const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as {
    state: { servers: { connectionId?: string; desktopId: string; endpoint: string }[] };
  } | null;
  return {
    listed: stored?.state.servers.find(
      (server) => (server.connectionId ?? server.desktopId) === connectionId,
    )?.endpoint,
    accessToken: await vault.getDesktopToken(connectionId),
    refreshToken: refresh.refreshTokenForSubject(subject),
  };
}

async function openRealm(host: Host) {
  vi.resetModules();
  const { RemoteDesktopClient } = await import("@/shared/remote/client");
  const transport = await import("./transportFactories");
  transport.installRemoteTransportFactories({
    client: (endpoint, accessToken) =>
      new RemoteDesktopClient(endpoint, accessToken, host.fetchImpl),
    socket: () => {
      throw new Error("No event sockets in this test.");
    },
  });
  const store = await import("@/renderer/state/remoteServersStore");
  const refresh = await import("./refreshTokens");
  await store.useRemoteServersStore.persist.rehydrate();
  const subject = refresh.connectionRefreshSubject(CONNECTION_ID);
  await refresh.hydrateRefreshTokens({ subjects: [subject] });
  return {
    store: store.useRemoteServersStore,
    reconcile: store.reconcileRemoteServersFromSharedStorage,
    memory: () => ({
      accessToken: store.useRemoteServersStore
        .getState()
        .servers.find((server) => server.connectionId === CONNECTION_ID)?.accessToken,
      refreshToken: refresh.refreshTokenForSubject(subject),
    }),
    async call(): Promise<"ok" | number | string> {
      try {
        await store.useRemoteServersStore
          .getState()
          .withClient(CONNECTION_ID, (client) => client.websocketTicket());
        return "ok";
      } catch (error) {
        return (error as { status?: number }).status ?? String(error);
      }
    },
  };
}

async function settled(expected: Record<string, unknown>) {
  await vi.waitFor(async () => expect(await readDurable()).toMatchObject(expected), {
    timeout: 5_000,
    interval: 20,
  });
}

beforeEach(async () => {
  vi.stubGlobal("indexedDB", new IDBFactory());
  localStorage.clear();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  // Let the access token issued at pairing expire.
  await new Promise((resolve) => setTimeout(resolve, 5));
});

afterEach(() => {
  Reflect.deleteProperty(navigator, "locks");
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("shared credentials across renderer realms", () => {
  it("adopts another realm's rotation instead of spending the grant again", async () => {
    const host = createHost();
    await seedPairing(host);
    const main = await openRealm(host);
    const sideChat = await openRealm(host);

    expect(await main.call()).toBe("ok");
    const rotated = main.memory();
    await settled(rotated);

    // No Web Locks here: the fresh read alone covers a realm that is behind.
    expect(await sideChat.call()).toBe("ok");
    expect(sideChat.memory()).toEqual(rotated);
    expect(await main.call()).toBe("ok");
    expect(host.stats).toEqual({ rotations: 1, reuseRevocations: 0 });
  });

  it("exchanges once when realms refresh at the same time under the shared lock", async () => {
    installWebLocks();
    const host = createHost();
    await seedPairing(host);
    const main = await openRealm(host);
    const sideChat = await openRealm(host);

    expect(await Promise.all([main.call(), sideChat.call()])).toEqual(["ok", "ok"]);
    expect(host.stats).toEqual({ rotations: 1, reuseRevocations: 0 });
    expect(sideChat.memory()).toEqual(main.memory());
  });

  it("keeps a stale realm's unrelated writes off other realms' pairings and bearers", async () => {
    const host = createHost();
    await seedPairing(host);
    const main = await openRealm(host);
    const sideChat = await openRealm(host);
    expect(await main.call()).toBe("ok");
    const rotated = main.memory();
    const added = {
      ...record("https://second.example/"),
      connectionId: "second",
      accessToken: "b",
    };
    main.store.setState((state) => ({ servers: [...state.servers, added] }));
    await vi.waitFor(async () => expect((await readDurable("second")).accessToken).toBe("b"));

    sideChat.store.setState((state) => ({ runtime: { ...state.runtime } }));
    sideChat.store.setState((state) => ({ excludedProjectIds: { ...state.excludedProjectIds } }));
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(await readDurable()).toMatchObject(rotated);
    expect(await readDurable("second")).toMatchObject({ listed: added.endpoint, accessToken: "b" });
  });

  it("removes a pairing everywhere and never revives or spends its grant", async () => {
    const host = createHost();
    await seedPairing(host);
    const main = await openRealm(host);
    const sideChat = await openRealm(host);

    main.store.getState().removeServer(CONNECTION_ID);
    await settled({ listed: undefined, accessToken: null, refreshToken: undefined });

    // A stale realm writing anything does not bring the record back...
    sideChat.store.setState((state) => ({ runtime: { ...state.runtime } }));
    // ...and its refresh refuses rather than spending the removed grant.
    expect(await sideChat.call()).toBe(401);
    expect(host.stats.rotations).toBe(0);
    await sideChat.reconcile();
    expect(sideChat.store.getState().servers).toEqual([]);
    expect(await readDurable()).toMatchObject({
      listed: undefined,
      accessToken: null,
      refreshToken: undefined,
    });
  });

  it("brings another realm's new pairing into a realm when storage changes", async () => {
    const host = createHost();
    await seedPairing(host);
    const main = await openRealm(host);
    const sideChat = await openRealm(host);
    const added = {
      ...record("https://second.example/"),
      connectionId: "second",
      accessToken: "b",
    };
    main.store.setState((state) => ({ servers: [...state.servers, added] }));
    await vi.waitFor(async () => expect((await readDurable("second")).accessToken).toBe("b"));

    await sideChat.reconcile();
    expect(
      sideChat.store.getState().servers.find((server) => server.connectionId === "second"),
    ).toMatchObject({ endpoint: added.endpoint, accessToken: "b" });
  });

  it("never carries a grant moved to another endpoint to the old one", async () => {
    const host = createHost();
    await seedPairing(host);
    const main = await openRealm(host);
    const sideChat = await openRealm(host);
    // Another realm re-pairs the connection at a new endpoint and rotates there.
    main.store.setState((state) => ({
      servers: state.servers.map((server) => ({ ...server, endpoint: MOVED_ENDPOINT })),
    }));
    expect(await main.call()).toBe("ok");
    const moved = main.memory();
    await settled({ listed: MOVED_ENDPOINT, ...moved });

    expect(await sideChat.call()).toBe(401);
    expect(
      host.sent.filter(
        (request) =>
          request.origin === new URL(ENDPOINT).origin &&
          request.authorization === `Bearer ${moved.accessToken}`,
      ),
    ).toEqual([]);
    expect(host.stats).toEqual({ rotations: 1, reuseRevocations: 0 });
  });

  it("removes a spent grant it could not persist so other realms fail closed", async () => {
    const host = createHost();
    await seedPairing(host);
    const main = await openRealm(host);
    const sideChat = await openRealm(host);
    const put = IDBObjectStore.prototype.put;
    vi.spyOn(IDBObjectStore.prototype, "put").mockImplementation(function (
      this: IDBObjectStore,
      value: unknown,
      key?: IDBValidKey,
    ) {
      if ((value as { key?: string }).key === `refresh.${CONNECTION_ID}`) {
        throw new DOMException("Quota exceeded.", "QuotaExceededError");
      }
      return put.call(this, value, key);
    });

    expect(await main.call()).toBe("ok");
    await settled({ refreshToken: undefined });
    expect(await sideChat.call()).toBe(401);
    expect(host.stats).toEqual({ rotations: 1, reuseRevocations: 0 });
    // The realm that rotated keeps working from memory.
    expect(await main.call()).toBe("ok");
  });
});

describe("environment grant custody across realms", () => {
  it.each(["parent-moved", "child-replaced", "child-removed", "same-target"])(
    "keeps a re-paired child bearer bound to its durable target (%s)",
    async (change) => {
      vi.resetModules();
      const { RemoteDesktopClient } = await import("@/shared/remote/client");
      const { RemoteEnvironmentClient } = await import("@/shared/remote/clientEnvironments");
      const refresh = await import("./refreshTokens");
      const vault = await import("./tokenVault");
      const { createSecureRemoteServersStorage } = await import("./secureStorage");
      const sessions = await import("./environmentSessions");
      const environmentId = "11111111-1111-4111-8111-111111111111";
      const childKey = "child-connection";
      const endpoint = sessions.environmentProxyEndpoint(ENDPOINT, environmentId);
      const child: RemoteServerRecord = {
        connectionId: childKey,
        desktopId: "child-desktop",
        label: "Child",
        endpoint,
        accessToken: "old-child-bearer",
        scopes: ["session:read"],
        transport: {
          kind: "environment",
          parentConnectionId: CONNECTION_ID,
          environmentId,
          childDesktopId: "child-desktop",
        },
      };
      const servers = [{ ...record(), accessToken: "parent-bearer" }, child];
      const subject = refresh.remoteEnvironmentRefreshSubject(CONNECTION_ID, environmentId);
      expect(await vault.setDesktopToken(childKey, "old-child-bearer")).toBe(true);
      expect(await refresh.writeRefreshTokenToVault(subject, "old-child-grant")).toBe(true);
      refresh.rememberRefreshTokenForSubject(subject, "old-child-grant");
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 2, state: { servers } }));
      const shared = createSecureRemoteServersStorage<{ servers: RemoteServerRecord[] }>();
      await shared.getItem(STORAGE_KEY);
      const sent: (string | null)[] = [];
      const fetchImpl: RemoteFetch = async (_url, init) => {
        const bearer = new Headers(init?.headers).get("authorization");
        sent.push(bearer);
        return bearer === "Bearer old-child-bearer"
          ? json(401, { error: { code: "unauthorized", message: "Expired" } })
          : json(200, { windows: [], wsl: [], updatedAt: new Date().toISOString() });
      };
      sessions.configureEnvironmentSessions({
        getState: () =>
          ({ servers }) as ReturnType<
            typeof import("../remoteServersStore").useRemoteServersStore.getState
          >,
        clientFactory: () => (parentEndpoint, bearer) =>
          new RemoteDesktopClient(parentEndpoint, bearer, fetchImpl),
        persistAccessToken: vi.fn<(connectionKey: string, accessToken: string) => void>(),
        certPinForConnection: () => undefined,
        refreshTokenForSubject: refresh.refreshTokenForSubject,
        rememberRefreshToken: refresh.rememberRefreshTokenForSubject,
        forgetRefreshToken: refresh.forgetRefreshTokenForSubject,
        writeRefreshTokenToVault: refresh.writeRefreshTokenToVault,
        deleteRefreshTokenFromVault: refresh.deleteRefreshTokenFromVault,
        shared,
        createEnvironmentClient: (childEndpoint, bearer, options) =>
          new RemoteEnvironmentClient(childEndpoint, bearer, fetchImpl, options),
      });
      const client = sessions.environmentSessionForServer(child)!.client;

      // Another realm commits a new grant before this realm receives its storage event.
      vi.resetModules();
      const otherVault = await import("./tokenVault");
      const otherRefresh = await import("./refreshTokens");
      expect(await otherVault.setDesktopToken(childKey, "new-child-bearer")).toBe(true);
      expect(await otherRefresh.writeRefreshTokenToVault(subject, "new-child-grant")).toBe(true);
      const nextChild =
        change === "child-replaced"
          ? {
              ...child,
              desktopId: "replacement-child",
              transport: { ...child.transport!, childDesktopId: "replacement-child" },
            }
          : child;
      const durableServers =
        change === "child-removed"
          ? [record()]
          : [record(change === "parent-moved" ? MOVED_ENDPOINT : ENDPOINT), nextChild];
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ version: 2, state: { servers: durableServers } }),
      );

      const [result] = await Promise.allSettled([client.agentStatuses()]);
      expect(result?.status).toBe(change === "same-target" ? "fulfilled" : "rejected");
      expect(sent).toEqual(
        change === "same-target"
          ? ["Bearer old-child-bearer", "Bearer new-child-bearer"]
          : ["Bearer old-child-bearer"],
      );
      sessions.__resetEnvironmentSessionsForTest();
    },
  );

  it("exchanges a child grant once and hands the child bearer to the other realm", async () => {
    installWebLocks();
    const host = createHost();
    await seedPairing(host);
    const subject = {
      kind: "remoteEnvironmentGrant" as const,
      parentConnectionId: CONNECTION_ID,
      environmentId: "environment-1",
    };
    vi.resetModules();
    const seed = await import("./refreshTokens");
    expect(await seed.writeRefreshTokenToVault(subject, host.paired.refreshToken!)).toBe(true);

    const realm = async () => {
      vi.resetModules();
      const { RemoteDesktopClient } = await import("@/shared/remote/client");
      const refresh = await import("./refreshTokens");
      const shared = await import("./sharedCredentials");
      await refresh.hydrateRefreshTokens({ subjects: [subject] });
      // The same custody shape environmentSessions gives a child grant.
      let bearer: string | undefined = host.paired.accessToken;
      const custody = {
        subject,
        bearerConnectionKey: "environment-record",
        isCurrent: () => true,
        canAdopt: () => true,
        current: () => ({
          accessToken: bearer,
          refreshToken: refresh.refreshTokenForSubject(subject),
        }),
        apply: (pair: { accessToken: string | undefined; refreshToken: string | undefined }) => {
          if (pair.refreshToken !== undefined)
            refresh.rememberRefreshTokenForSubject(subject, pair.refreshToken);
          if (pair.accessToken !== undefined) bearer = pair.accessToken;
        },
      };
      const client = new RemoteDesktopClient(ENDPOINT, bearer, host.fetchImpl, {
        tokenLifecycle: {
          accessToken: () => bearer,
          refreshToken: () => refresh.refreshTokenForSubject(subject),
          onTokensRefreshed: (tokens) => shared.commitSharedRefresh(custody, tokens),
          runExclusive: (run) => shared.runSharedRefresh(custody, run),
        },
      });
      return { client, bearer: () => bearer };
    };
    const first = await realm();
    const second = await realm();

    expect(
      await Promise.all([first.client.websocketTicket(), second.client.websocketTicket()]),
    ).toHaveLength(2);
    expect(host.stats).toEqual({ rotations: 1, reuseRevocations: 0 });
    expect(second.bearer()).toBe(first.bearer());
  });
});
