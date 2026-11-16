import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RemoteDesktopClient, type RemoteFetch } from "@/shared/remote/client";
import { PORACODE_REMOTE_PROTOCOL_VERSION } from "@/shared/remote/protocol";
import {
  __resetRemoteServersStoreForTest,
  useRemoteServersStore,
} from "@/renderer/state/remoteServersStore";
import { parentClientForConnection } from "./environmentSessions";
import {
  __resetRefreshTokensForTest,
  connectionRefreshSubject,
  hydrateRefreshTokens,
  refreshTokenForSubject,
  refreshSubjectVaultKey,
  writeRefreshTokenToVault,
} from "./refreshTokens";
import { __resetTokenVaultForTest, getDesktopToken, setDesktopToken } from "./tokenVault";
import type { RemoteClientFactory, RemoteServerRecord } from "./types";
import { createRemoteServerClientBindings } from "./storeClient";
import {
  failVaultKeyReads,
  failVaultReads,
  webKitKeyRestoreError,
} from "./webKitResultFailure.testFixtures";
import * as refreshTokens from "./refreshTokens";
import { SharedCredentialRefusedError } from "./sharedCredentials";

const STORAGE_KEY = "poracode-remote-servers";
const CONNECTION_ID = "paired-connection";
const ENDPOINT = "https://paired.example/";
const subject = connectionRefreshSubject(CONNECTION_ID);
const storage = useRemoteServersStore.persist.getOptions().storage!;

const record: RemoteServerRecord = {
  connectionId: CONNECTION_ID,
  desktopId: "paired-desktop",
  endpoint: ENDPOINT,
  label: "Paired desktop",
  accessToken: "",
  scopes: ["session:read"],
  transport: { kind: "direct" },
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** Exercise the real HTTP client, store and encrypted vault. Only the host's
 * responses are synthetic; expired bearers and single-use grants are enforced. */
function host(refreshGate: Promise<void> = Promise.resolve()) {
  let accessToken = "access-0";
  let refreshToken = "refresh-0";
  let refreshAttempts = 0;
  let refreshMode: "ok" | "refused" | "rate" = "ok";
  /** The session is dead server-side in a way a rotation cannot heal: the
   * grant exchange still succeeds, but every bearer is refused. */
  let refuseAllBearers = false;
  const fetch = vi.fn<RemoteFetch>(async (url, init) => {
    const path = new URL(String(url)).pathname;
    if (path === "/.well-known/poracode/environment") {
      return json(200, {
        protocolVersion: PORACODE_REMOTE_PROTOCOL_VERSION,
        desktopId: record.desktopId,
        label: record.label,
        appVersion: "2.0.0",
        auth: {
          policy: "remote-reachable",
          bootstrapMethods: ["one-time-token"],
          sessionMethods: ["bearer-access-token"],
          scopes: record.scopes,
        },
        endpoints: { httpBaseUrl: ENDPOINT, wsBaseUrl: "wss://paired.example/" },
      });
    }
    if (path === "/oauth/token") {
      const body = JSON.parse(String(init?.body)) as { grantType: string; refreshToken?: string };
      if (body.grantType === "pairing-token") {
        return json(200, {
          accessToken,
          refreshToken,
          tokenType: "Bearer",
          expiresAt: "2099-01-01T00:00:00.000Z",
          scopes: record.scopes,
        });
      }
      refreshAttempts += 1;
      if (refreshMode === "refused") {
        return json(401, { error: { code: "invalid_refresh_token", message: "Invalid grant." } });
      }
      if (refreshMode === "rate") {
        return json(429, { error: { code: "rate_limited", message: "Too many attempts." } });
      }
      if (refreshAttempts > 20) {
        return json(429, { error: { code: "rate_limited", message: "Too many attempts." } });
      }
      await refreshGate;
      if (body.grantType !== "refresh_token" || body.refreshToken !== refreshToken) {
        return json(401, { error: { code: "invalid_refresh_token", message: "Invalid grant." } });
      }
      accessToken = `access-${refreshAttempts}`;
      refreshToken = `refresh-${refreshAttempts}`;
      return json(200, {
        accessToken,
        refreshToken,
        tokenType: "Bearer",
        expiresAt: "2099-01-01T00:00:00.000Z",
        scopes: ["session:read"],
      });
    }
    const authorization = new Headers(init?.headers).get("authorization");
    if (refuseAllBearers || authorization !== `Bearer ${accessToken}`) {
      return json(401, { error: { code: "invalid_access_token", message: "Expired bearer." } });
    }
    if (path === "/api/snapshot") {
      return json(200, {
        snapshotSeq: 1,
        projects: [],
        threads: [],
        runtimeSummariesByThread: {},
        updatedAt: "now",
      });
    }
    if (path === "/api/agent-statuses") {
      return json(200, { windows: [], wsl: [], updatedAt: "now" });
    }
    if (path === "/api/host/describe") {
      return json(404, { error: { code: "not_found", message: "Older host." } });
    }
    expect(path).toBe("/api/auth/websocket-ticket");
    return json(200, { ticket: "ticket", expiresAt: "2099-01-01T00:00:00.000Z" });
  });
  return {
    fetch,
    refreshAttempts: () => refreshAttempts,
    expireAccessToken: () => {
      accessToken = "expired";
    },
    /** The host no longer knows this session (revoked family, rebuilt auth
     * state): every refresh exchange is refused. */
    refuseRefresh: () => {
      refreshMode = "refused";
    },
    rateLimitRefresh: () => {
      refreshMode = "rate";
    },
    /** Rotations commit, yet no bearer is ever accepted (the rotation healed
     * nothing): the hook's null path. */
    refuseAllBearers: () => {
      refuseAllBearers = true;
    },
  };
}

async function loadReleasedPairing(
  fetch: RemoteFetch,
  accessToken = "expired-access",
): Promise<void> {
  useRemoteServersStore
    .getState()
    .setClientFactory((endpoint, token) => new RemoteDesktopClient(endpoint, token, fetch));
  // Flush setup writes before seeding the previously released v2 metadata and
  // its existing vault slots. No re-pair or schema migration is required.
  await storage.getItem(STORAGE_KEY);
  await setDesktopToken(CONNECTION_ID, accessToken);
  await writeRefreshTokenToVault(subject, "refresh-0");
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      state: {
        servers: [record],
        excludedProjectIds: {},
        projectWorkspaceIds: {},
        projectNameOverrides: {},
        lastKnownProjects: {},
      },
      version: 2,
    }),
  );
  await useRemoteServersStore.persist.rehydrate();
  await hydrateRefreshTokens({ subjects: [subject] });
  expect(useRemoteServersStore.getState().servers[0]?.accessToken).toBe(accessToken);
  expect(refreshTokenForSubject(subject)).toBe("refresh-0");
}

async function ticket(): Promise<string> {
  return useRemoteServersStore
    .getState()
    .withClient(CONNECTION_ID, (client) => client.websocketTicket());
}

beforeEach(async () => {
  __resetRemoteServersStoreForTest();
  useRemoteServersStore.setState({ servers: [], runtime: {} });
  await storage.getItem(STORAGE_KEY);
  localStorage.clear();
  __resetRefreshTokensForTest();
  __resetTokenVaultForTest();
});

afterEach(async () => {
  vi.restoreAllMocks();
  // Join accepted grant writes before resetting their process-local queue.
  await writeRefreshTokenToVault(subject, "test-cleanup");
  __resetRemoteServersStoreForTest();
  useRemoteServersStore.setState({ servers: [], runtime: {} });
  await storage.getItem(STORAGE_KEY);
  localStorage.clear();
  __resetRefreshTokensForTest();
  __resetTokenVaultForTest();
});

describe("persisted connection token rotation", () => {
  it("reports a failed refresh-grant save instead of opening a green connection", async () => {
    const server = host();
    useRemoteServersStore
      .getState()
      .setClientFactory(
        (endpoint, token) => new RemoteDesktopClient(endpoint, token, server.fetch),
      );
    const socket = vi.fn<() => never>(() => {
      throw new Error("A failed pairing must not open a socket.");
    });
    useRemoteServersStore.getState().setSocketFactory(socket);
    const persist = vi
      .spyOn(refreshTokens, "commitSharedCredential")
      .mockResolvedValueOnce("failed");
    try {
      await expect(
        useRemoteServersStore.getState().pairServer({ endpoint: ENDPOINT, token: "pair-qa" }),
      ).rejects.toBeInstanceOf(SharedCredentialRefusedError);
      expect(useRemoteServersStore.getState().runtime[record.desktopId]?.status).toBe("error");
      expect(socket).not.toHaveBeenCalled();
    } finally {
      persist.mockRestore();
    }
  });

  it("keeps fresh pairing pending until its credentials and metadata survive a cold reopen", async () => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase("lightcode-mobile-vault");
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
    const server = host();
    useRemoteServersStore
      .getState()
      .setClientFactory(
        (endpoint, token) => new RemoteDesktopClient(endpoint, token, server.fetch),
      );
    useRemoteServersStore.getState().setSocketFactory(() => ({
      close: vi.fn<() => void>(),
      send: vi.fn<(data: string) => void>(),
      readyState: 1,
      onmessage: null,
      onclose: null,
    }));
    await storage.getItem(STORAGE_KEY);
    const started = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const realEncrypt = crypto.subtle.encrypt.bind(crypto.subtle);
    const encrypt = vi.spyOn(crypto.subtle, "encrypt").mockImplementation(async (...args) => {
      if (new TextDecoder().decode(args[2]) === "access-0") {
        started.resolve();
        await release.promise;
      }
      return realEncrypt(...args);
    });
    const pairing = useRemoteServersStore.getState().pairServer({
      endpoint: ENDPOINT,
      token: "pair-qa",
    });
    try {
      await started.promise;
      expect(useRemoteServersStore.getState().runtime[record.desktopId]?.status).toBe("connecting");
      expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).state.servers).toEqual([]);
    } finally {
      release.resolve();
      await pairing;
      encrypt.mockRestore();
    }
    expect(useRemoteServersStore.getState().runtime[record.desktopId]?.status).toBe("online");
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).state.servers).toEqual([
      expect.objectContaining({ connectionId: record.desktopId, accessToken: "" }),
    ]);
    __resetRemoteServersStoreForTest();
    __resetRefreshTokensForTest();
    __resetTokenVaultForTest();
    await useRemoteServersStore.persist.rehydrate();
    expect(useRemoteServersStore.getState().servers[0]?.accessToken).toBe("access-0");
    expect(refreshTokenForSubject(connectionRefreshSubject(record.desktopId))).toBe("refresh-0");
    await expect(
      useRemoteServersStore
        .getState()
        .withClient(record.desktopId, (client) => client.websocketTicket()),
    ).resolves.toBe("ticket");
  });

  it.each([
    ["access-0", "startup"],
    ["expired-access", "startup"],
    ["access-0", "reconnect"],
    ["expired-access", "reconnect"],
  ] as const)(
    "recovers a saved %s bearer during %s after WebKit could not restore the vault",
    async (accessToken, stage) => {
      const server = host();
      await loadReleasedPairing(server.fetch, accessToken);
      useRemoteServersStore.getState().setSocketFactory(() => ({
        close: vi.fn<() => void>(),
        send: vi.fn<(data: string) => void>(),
        readyState: 1,
        onmessage: null,
        onclose: null,
      }));
      await storage.getItem(STORAGE_KEY);
      __resetRefreshTokensForTest();
      __resetTokenVaultForTest();
      const escaped: unknown[] = [];
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const get = failVaultKeyReads(webKitKeyRestoreError(), escaped);
      try {
        await useRemoteServersStore.persist.rehydrate();
        expect(useRemoteServersStore.getState().servers[0]?.accessToken).toBe("");
        expect(refreshTokenForSubject(subject)).toBeUndefined();
        if (stage === "reconnect") {
          await useRemoteServersStore.getState().connectAll();
        }
        expect(useRemoteServersStore.getState().runtime[CONNECTION_ID]?.status).toBe(
          stage === "reconnect" ? "error" : undefined,
        );
        expect(escaped).toEqual([]);
      } finally {
        get.mockRestore();
        warn.mockRestore();
      }

      if (stage === "startup") await useRemoteServersStore.getState().connectAll();
      else await useRemoteServersStore.getState().reconnectServer(CONNECTION_ID);
      expect(useRemoteServersStore.getState().runtime[CONNECTION_ID]?.status).toBe("online");
      expect(refreshTokenForSubject(subject)).toBe(
        accessToken === "access-0" ? "refresh-0" : "refresh-1",
      );
      expect(server.refreshAttempts()).toBe(accessToken === "access-0" ? 0 : 1);
      await storage.getItem(STORAGE_KEY);
      expect(localStorage.getItem(STORAGE_KEY)).not.toContain("access-0");
      expect(localStorage.getItem(STORAGE_KEY)).not.toContain("refresh-0");
      // A second cold reopen reads the same released metadata and vault slots.
      __resetRemoteServersStoreForTest();
      __resetRefreshTokensForTest();
      __resetTokenVaultForTest();
      await useRemoteServersStore.persist.rehydrate();
      await useRemoteServersStore.getState().connectAll();
      expect(useRemoteServersStore.getState().runtime[CONNECTION_ID]?.status).toBe("online");
      expect(server.refreshAttempts()).toBe(accessToken === "access-0" ? 0 : 1);
    },
  );

  it.each(["moved", "removed"] as const)(
    "refuses another realm's credentials when its saved connection was %s",
    async (change) => {
      const server = host();
      await loadReleasedPairing(server.fetch);
      useRemoteServersStore.setState({ servers: [record] });
      await storage.getItem(STORAGE_KEY);
      const document = JSON.parse(localStorage.getItem(STORAGE_KEY)!) as {
        state: { servers: RemoteServerRecord[] };
      };
      document.state.servers =
        change === "removed" ? [] : [{ ...record, endpoint: "https://replacement.example/" }];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(document));
      await setDesktopToken(CONNECTION_ID, "replacement-access");
      await writeRefreshTokenToVault(subject, "replacement-refresh");
      __resetRefreshTokensForTest();
      __resetTokenVaultForTest();
      server.fetch.mockClear();

      await expect(ticket()).rejects.toThrow(
        "The saved remote credentials could not be confirmed.",
      );
      expect(server.fetch).not.toHaveBeenCalled();
      expect(useRemoteServersStore.getState().servers[0]?.accessToken).toBe("");
      expect(refreshTokenForSubject(subject)).toBeUndefined();
    },
  );

  it("retries a failed refresh-slot read even when the expired bearer restored successfully", async () => {
    const server = host();
    await loadReleasedPairing(server.fetch);
    __resetRefreshTokensForTest();
    __resetTokenVaultForTest();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const failure = failVaultReads(refreshSubjectVaultKey(subject), webKitKeyRestoreError(), []);
    await useRemoteServersStore.persist.rehydrate();
    expect(useRemoteServersStore.getState().servers[0]?.accessToken).toBe("expired-access");
    expect(refreshTokenForSubject(subject)).toBeUndefined();
    server.fetch.mockClear();

    await expect(ticket()).rejects.toThrow("The saved remote credentials could not be confirmed.");
    expect(server.fetch).not.toHaveBeenCalled();
    failure.mockRestore();

    await expect(ticket()).resolves.toBe("ticket");
    expect(server.refreshAttempts()).toBe(1);
    expect(refreshTokenForSubject(subject)).toBe("refresh-1");
  });

  it("recovers a released pairing after a cold startup could not restore its vault key", async () => {
    const server = host();
    await loadReleasedPairing(server.fetch);
    __resetRefreshTokensForTest();
    __resetTokenVaultForTest();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const escaped: unknown[] = [];
    const failure = failVaultKeyReads(webKitKeyRestoreError(), escaped);

    await useRemoteServersStore.persist.rehydrate();
    expect(useRemoteServersStore.getState().servers[0]?.accessToken).toBe("");
    expect(refreshTokenForSubject(subject)).toBeUndefined();
    failure.mockRestore();

    await expect(ticket()).resolves.toBe("ticket");
    expect(server.refreshAttempts()).toBe(1);
    expect(useRemoteServersStore.getState().servers[0]?.accessToken).toBe("access-1");
    expect(escaped).toEqual([]);
    expect(localStorage.getItem(STORAGE_KEY)).not.toContain("access-1");
    __resetTokenVaultForTest();
    expect(await getDesktopToken(CONNECTION_ID)).toBe("access-1");
    __resetRefreshTokensForTest();
    await hydrateRefreshTokens({ subjects: [subject] });
    expect(refreshTokenForSubject(subject)).toBe("refresh-1");
  });

  it("keeps an unreadable saved pairing retryable without sending a missing bearer to the host", async () => {
    const server = host();
    await loadReleasedPairing(server.fetch);
    __resetRefreshTokensForTest();
    __resetTokenVaultForTest();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const failure = failVaultKeyReads(webKitKeyRestoreError(), []);
    await useRemoteServersStore.persist.rehydrate();
    server.fetch.mockClear();

    await expect(ticket()).rejects.toThrow("The saved remote credentials could not be confirmed.");
    expect(server.fetch).not.toHaveBeenCalled();
    expect(useRemoteServersStore.getState().servers).toHaveLength(1);
    failure.mockRestore();

    await expect(ticket()).resolves.toBe("ticket");
    expect(server.refreshAttempts()).toBe(1);
  });

  it("reuses the rotated bearer across sequential clients instead of exhausting refresh limits", async () => {
    const server = host();
    await loadReleasedPairing(server.fetch);
    const results: unknown[] = [];
    for (let index = 0; index < 27; index += 1) {
      results.push(await ticket().catch((error: unknown) => error));
    }
    expect(server.refreshAttempts()).toBe(1);
    expect(results).toEqual(Array.from({ length: 27 }, () => "ticket"));
    // A later genuine expiry still refreshes normally.
    server.expireAccessToken();
    await expect(ticket()).resolves.toBe("ticket");
    await expect(ticket()).resolves.toBe("ticket");
    expect(server.refreshAttempts()).toBe(2);
  });

  it("uses the current bearer when reconnecting from a record captured before rotation", async () => {
    const server = host();
    await loadReleasedPairing(server.fetch);
    const captured = useRemoteServersStore.getState().servers[0]!;
    const bindings = createRemoteServerClientBindings(
      {
        get: useRemoteServersStore.getState,
        set: useRemoteServersStore.setState,
      },
      () => undefined,
    );
    await expect(ticket()).resolves.toBe("ticket");
    for (let index = 0; index < 3; index += 1) {
      await expect(bindings.clientForServer(captured).websocketTicket()).resolves.toBe("ticket");
    }
    expect(server.refreshAttempts()).toBe(1);
  });

  it("does not send a replacement endpoint's bearer to a captured stale endpoint", async () => {
    const server = host();
    await loadReleasedPairing(server.fetch);
    const captured = useRemoteServersStore.getState().servers[0]!;
    const factory = vi.fn<RemoteClientFactory>(
      (endpoint, accessToken) => new RemoteDesktopClient(endpoint, accessToken, server.fetch),
    );
    useRemoteServersStore.getState().setClientFactory(factory);
    useRemoteServersStore.setState({
      servers: [
        {
          ...captured,
          endpoint: "https://replacement.example/",
          accessToken: "replacement-access",
        },
      ],
    });
    const bindings = createRemoteServerClientBindings(
      {
        get: useRemoteServersStore.getState,
        set: useRemoteServersStore.setState,
      },
      () => undefined,
    );
    bindings.clientForServer(captured);
    expect(factory).toHaveBeenCalledExactlyOnceWith(ENDPOINT, "expired-access");
  });

  it.each(["request", "parent"] as const)(
    "saves a %s client's rotated bearer in the existing encrypted slot and restores it on reload",
    async (kind) => {
      const server = host();
      await loadReleasedPairing(server.fetch);
      const unrelated = {
        ...record,
        connectionId: "unrelated-connection",
        accessToken: "unrelated-access",
      };
      useRemoteServersStore.setState((state) => ({ servers: [...state.servers, unrelated] }));
      const request =
        kind === "parent" ? parentClientForConnection(CONNECTION_ID)!.websocketTicket() : ticket();
      await expect(request).resolves.toBe("ticket");
      expect(useRemoteServersStore.getState().servers.map((entry) => entry.accessToken)).toEqual([
        "access-1",
        "unrelated-access",
      ]);
      // Read through the storage queue, then drop the vault caches: this must
      // survive a reload, not merely remain in a client-local token field.
      await storage.getItem(STORAGE_KEY);
      expect(localStorage.getItem(STORAGE_KEY)).not.toContain("access-1");
      expect(localStorage.getItem(STORAGE_KEY)).not.toContain("refresh-1");
      __resetRemoteServersStoreForTest();
      await storage.getItem(STORAGE_KEY);
      __resetRefreshTokensForTest();
      __resetTokenVaultForTest();
      expect(await getDesktopToken(CONNECTION_ID)).toBe("access-1");
      await useRemoteServersStore.persist.rehydrate();
      await hydrateRefreshTokens({ subjects: [subject] });
      expect(refreshTokenForSubject(subject)).toBe("refresh-1");
      await expect(ticket()).resolves.toBe("ticket");
      expect(server.refreshAttempts()).toBe(1);
    },
  );

  it.each(["request", "parent"] as const)(
    "shares the current bearer with a long-lived %s client",
    async (kind) => {
      const server = host();
      await loadReleasedPairing(server.fetch);
      const first = await useRemoteServersStore
        .getState()
        .withClient(CONNECTION_ID, async (client) => client);
      const second =
        kind === "parent"
          ? parentClientForConnection(CONNECTION_ID)!
          : await useRemoteServersStore
              .getState()
              .withClient(CONNECTION_ID, async (client) => client);
      const results: unknown[] = [];
      for (let index = 0; index < 27; index += 1) {
        results.push(
          await (index % 2 === 0 ? first : second)
            .websocketTicket()
            .catch((error: unknown) => error),
        );
      }
      expect(server.refreshAttempts()).toBe(1);
      expect(results).toEqual(Array.from({ length: 27 }, () => "ticket"));
    },
  );

  it("preserves single-flight rotation for concurrent clients", async () => {
    let release = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const server = host(gate);
    await loadReleasedPairing(server.fetch);
    const pending = Promise.all(Array.from({ length: 8 }, () => ticket()));
    await vi.waitFor(() => expect(server.refreshAttempts()).toBe(1));
    release();
    expect(await pending).toEqual(Array.from({ length: 8 }, () => "ticket"));
    await expect(ticket()).resolves.toBe("ticket");
    expect(server.refreshAttempts()).toBe(1);
  });

  it("drops a refused grant from memory and the vault so a dead pairing cannot loop", async () => {
    const server = host();
    await loadReleasedPairing(server.fetch);
    useRemoteServersStore.setState((state) => ({
      runtime: {
        ...state.runtime,
        "paired-desktop": { status: "online", projects: [], threads: [] },
      },
    }));
    server.expireAccessToken();
    server.refuseRefresh();

    // The host revoked the family (reuse detection, rebuilt auth state): the
    // bearer 401s, the refresh exchange is refused, and the custody must
    // treat the grant as dead instead of feeding the reconnect ladder.
    await expect(ticket()).rejects.toMatchObject({ status: 401 });
    expect(refreshTokenForSubject(subject)).toBeUndefined();
    await vi.waitFor(async () => {
      __resetRefreshTokensForTest();
      await hydrateRefreshTokens({ subjects: [subject] });
      expect(refreshTokenForSubject(subject)).toBeUndefined();
    });
    // The connection reports the stable re-pair state, not a transient error.
    expect(useRemoteServersStore.getState().runtime["paired-desktop"]).toMatchObject({
      status: "error",
    });
  });

  it("keeps the grant when a refresh fails transport-class (429 is retryable)", async () => {
    const server = host();
    await loadReleasedPairing(server.fetch);
    server.expireAccessToken();
    server.rateLimitRefresh();

    await expect(ticket()).rejects.toMatchObject({ status: 401 });

    // A rate-limited refresh is not a dead grant: custody keeps it so the
    // next attempt (or the reconnect ladder) can recover normally.
    expect(refreshTokenForSubject(subject)).toBe("refresh-0");
    expect(useRemoteServersStore.getState().runtime["paired-desktop"]?.status).not.toBe("error");
  });

  it("keeps the grant when a rotation commits but the retried request still 401s", async () => {
    const server = host();
    await loadReleasedPairing(server.fetch);
    useRemoteServersStore.setState((state) => ({
      runtime: {
        ...state.runtime,
        "paired-desktop": { status: "online", projects: [], threads: [] },
      },
    }));
    server.expireAccessToken();
    server.refuseAllBearers();

    // The hook's null path: the refresh SUCCEEDED (rotation committed and
    // persisted) yet the retried request is refused. Null means "not proven
    // dead" — custody keeps the rotated grant and sets no terminal state, so
    // the next connect attempt re-proves it instead of dropping a live pair.
    await expect(ticket()).rejects.toMatchObject({ status: 401 });
    expect(server.refreshAttempts()).toBe(1);
    expect(refreshTokenForSubject(subject)).toBe("refresh-1");
    expect(useRemoteServersStore.getState().runtime["paired-desktop"]).toMatchObject({
      status: "online",
    });
  });
});
