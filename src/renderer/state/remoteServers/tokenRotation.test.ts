import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RemoteDesktopClient, type RemoteFetch } from "@/shared/remote/client";
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
  writeRefreshTokenToVault,
} from "./refreshTokens";
import { __resetTokenVaultForTest, getDesktopToken, setDesktopToken } from "./tokenVault";
import type { RemoteClientFactory, RemoteServerRecord } from "./types";
import { createRemoteServerClientBindings } from "./storeClient";

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
  const fetch = vi.fn<RemoteFetch>(async (url, init) => {
    if (new URL(String(url)).pathname === "/oauth/token") {
      refreshAttempts += 1;
      if (refreshAttempts > 20) {
        return json(429, { error: { code: "rate_limited", message: "Too many attempts." } });
      }
      await refreshGate;
      const body = JSON.parse(String(init?.body)) as { grantType: string; refreshToken: string };
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
    expect(new URL(String(url)).pathname).toBe("/api/auth/websocket-ticket");
    const authorization = new Headers(init?.headers).get("authorization");
    if (authorization !== `Bearer ${accessToken}`) {
      return json(401, { error: { code: "invalid_access_token", message: "Expired bearer." } });
    }
    return json(200, { ticket: "ticket", expiresAt: "2099-01-01T00:00:00.000Z" });
  });
  return {
    fetch,
    refreshAttempts: () => refreshAttempts,
    expireAccessToken: () => {
      accessToken = "expired";
    },
  };
}

async function loadReleasedPairing(fetch: RemoteFetch): Promise<void> {
  useRemoteServersStore
    .getState()
    .setClientFactory((endpoint, token) => new RemoteDesktopClient(endpoint, token, fetch));
  // Flush setup writes before seeding the previously released v2 metadata and
  // its existing vault slots. No re-pair or schema migration is required.
  await storage.getItem(STORAGE_KEY);
  await setDesktopToken(CONNECTION_ID, "expired-access");
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
  expect(useRemoteServersStore.getState().servers[0]?.accessToken).toBe("expired-access");
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
});
