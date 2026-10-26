import { describe, expect, it, vi } from "vitest";
import {
  ENVIRONMENT_AUTH_AUTHORITY_HEADER,
  ENVIRONMENT_AUTHORIZATION_HEADER,
} from "@/shared/environments";
import { RemoteDesktopClient, type RemoteFetch, type RemoteTokenLifecycle } from "./client";
import { RemoteEnvironmentClient } from "./clientEnvironments";
import {
  TEST_ENVIRONMENT_ID,
  accessTokenResponse,
  errorResponse,
  testAuthority,
  testChildLifecycle,
  testEnvironmentEndpoint,
} from "./clientEnvironments.testSupport";

const endpoint = "https://paired.example/";

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function pairing(label: string, holdFirstUnauthorized?: () => Promise<void>) {
  const owned: { accessToken: string | undefined; refreshToken: string | undefined } = {
    accessToken: `${label}-expired`,
    refreshToken: `${label}-refresh-0`,
  };
  let validAccessToken = `${label}-valid-0`;
  let validRefreshToken = owned.refreshToken;
  let refreshes = 0;
  let unauthorized = 0;
  const authorizations: (string | null)[] = [];
  const fetch = vi.fn<RemoteFetch>(async (url, init) => {
    if (new URL(String(url)).pathname === "/oauth/token") {
      const body = JSON.parse(String(init?.body)) as { refreshToken: string };
      if (body.refreshToken !== validRefreshToken)
        return json(401, { error: { code: "invalid_refresh_token", message: "Invalid grant." } });
      refreshes += 1;
      validAccessToken = `${label}-access-${refreshes}`;
      validRefreshToken = `${label}-refresh-${refreshes}`;
      return json(200, {
        accessToken: validAccessToken,
        refreshToken: validRefreshToken,
        tokenType: "Bearer",
        expiresAt: "2099-01-01T00:00:00.000Z",
        scopes: ["session:read"],
      });
    }
    const authorization = new Headers(init?.headers).get("authorization");
    authorizations.push(authorization);
    if (authorization !== `Bearer ${validAccessToken}`) {
      unauthorized += 1;
      if (unauthorized === 1) await holdFirstUnauthorized?.();
      return json(401, { error: { code: "invalid_access_token", message: "Expired bearer." } });
    }
    return json(200, { ticket: `${label}-ticket`, expiresAt: "2099-01-01T00:00:00.000Z" });
  });
  const rotated = vi.fn<RemoteTokenLifecycle["onTokensRefreshed"]>((tokens) => {
    owned.accessToken = tokens.accessToken;
    owned.refreshToken = tokens.refreshToken;
  });
  const lifecycle: RemoteTokenLifecycle = {
    accessToken: () => owned.accessToken,
    refreshToken: () => owned.refreshToken,
    onTokensRefreshed: rotated,
  };
  return {
    owned,
    rotated,
    authorizations,
    refreshes: () => refreshes,
    unauthorized: () => unauthorized,
    expire: () => {
      validAccessToken = "expired-again";
    },
    client: () =>
      new RemoteDesktopClient(endpoint, owned.accessToken, fetch, { tokenLifecycle: lifecycle }),
  };
}

function deferred() {
  let resolve = () => {};
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("caller-owned bearer sharing", () => {
  it("lets existing clients adopt a sibling's bearer without another rotation", async () => {
    const session = pairing("first");
    const first = session.client();
    const second = session.client();
    await expect(first.websocketTicket()).resolves.toBe("first-ticket");
    await expect(second.websocketTicket()).resolves.toBe("first-ticket");
    await expect(first.websocketTicket()).resolves.toBe("first-ticket");
    expect(session.refreshes()).toBe(1);
    expect(session.rotated).toHaveBeenCalledTimes(1);
    // Adopting a peer's rotation does not prevent a later genuine expiry.
    session.expire();
    await expect(second.websocketTicket()).resolves.toBe("first-ticket");
    await expect(first.websocketTicket()).resolves.toBe("first-ticket");
    expect(session.refreshes()).toBe(2);
  });

  it("adopts a sibling's bearer when an old 401 arrives after its refresh finished", async () => {
    const gate = deferred();
    const session = pairing("late", () => gate.promise);
    const first = session.client();
    const second = session.client();
    const pending = first.websocketTicket();
    await vi.waitFor(() => expect(session.unauthorized()).toBe(1));
    await expect(second.websocketTicket()).resolves.toBe("late-ticket");
    gate.resolve();
    await expect(pending).resolves.toBe("late-ticket");
    expect(session.refreshes()).toBe(1);
    expect(session.rotated).toHaveBeenCalledTimes(1);
  });

  it("renews an expired shared bearer when an idle parent recovers an environment child", async () => {
    const proxyPrefix = new URL(testEnvironmentEndpoint()).pathname;
    const saved = { accessToken: "parent-a", refreshToken: "parent-refresh-a" };
    let validParent = saved.accessToken;
    let validRefresh = saved.refreshToken;
    let refreshes = 0;
    const childParentAuthorizations: (string | null)[] = [];
    const fetch = vi.fn<RemoteFetch>(async (url, init) => {
      const { pathname } = new URL(String(url));
      const headers = new Headers(init?.headers);
      if (pathname === "/oauth/token") {
        const body = JSON.parse(String(init?.body)) as { refreshToken: string };
        if (body.refreshToken !== validRefresh)
          return json(401, { error: { code: "invalid_refresh_token", message: "Invalid grant." } });
        refreshes += 1;
        validParent = `parent-access-${refreshes}`;
        validRefresh = `parent-refresh-${refreshes}`;
        return accessTokenResponse(validParent, validRefresh);
      }
      if (pathname.startsWith(proxyPrefix)) {
        const parentAuthorization = headers.get(ENVIRONMENT_AUTHORIZATION_HEADER);
        childParentAuthorizations.push(parentAuthorization);
        if (parentAuthorization !== `Bearer ${validParent}`)
          return errorResponse(401, "invalid_access_token", {
            [ENVIRONMENT_AUTH_AUTHORITY_HEADER]: "parent",
          });
        return pathname.endsWith("/oauth/token")
          ? accessTokenResponse("child-access-2", "child-refresh-2")
          : json(200, { environments: [] });
      }
      if (headers.get("authorization") !== `Bearer ${validParent}`)
        return json(401, { error: { code: "invalid_access_token", message: "Expired bearer." } });
      return json(200, { ticket: "parent-ticket", expiresAt: "2099-01-01T00:00:00.000Z" });
    });
    const lifecycle: RemoteTokenLifecycle = {
      accessToken: () => saved.accessToken,
      refreshToken: () => saved.refreshToken,
      onTokensRefreshed: (tokens) => {
        saved.accessToken = tokens.accessToken;
        if (tokens.refreshToken !== undefined) saved.refreshToken = tokens.refreshToken;
      },
    };
    const parentEndpoint = new URL("/", testEnvironmentEndpoint()).href;
    const idleParent = new RemoteDesktopClient(parentEndpoint, saved.accessToken, fetch, {
      tokenLifecycle: lifecycle,
    });
    const sibling = new RemoteDesktopClient(parentEndpoint, saved.accessToken, fetch, {
      tokenLifecycle: lifecycle,
    });

    // A sibling rotates A to B while the parent client stays idle with A.
    validParent = "expired-a";
    await expect(sibling.websocketTicket()).resolves.toBe("parent-ticket");
    expect(saved.accessToken).toBe("parent-access-1");
    // B then expires; the child sends the saved bearer B and is rejected.
    validParent = "expired-b";
    const child = new RemoteEnvironmentClient(testEnvironmentEndpoint(), "child-access", fetch, {
      environmentId: TEST_ENVIRONMENT_ID,
      parentAuthority: {
        ...testAuthority().authority,
        accessToken: () => saved.accessToken,
        ensureLive: async () => {
          if (!(await idleParent.refreshTokens())) throw new Error("Parent grant not renewed.");
        },
      },
      tokenLifecycle: testChildLifecycle().lifecycle,
    });

    await expect(child.listEnvironments()).resolves.toEqual([]);
    expect(refreshes).toBe(2);
    expect(saved.accessToken).toBe("parent-access-2");
    expect(childParentAuthorizations.at(-1)).toBe("Bearer parent-access-2");
  });

  it("keeps distinct pairings at the same endpoint isolated", async () => {
    const first = pairing("device-one");
    const second = pairing("device-two");
    expect(
      await Promise.all([first.client().websocketTicket(), second.client().websocketTicket()]),
    ).toEqual(["device-one-ticket", "device-two-ticket"]);
    expect(first.owned.accessToken).toBe("device-one-access-1");
    expect(second.owned.accessToken).toBe("device-two-access-1");
    expect(first.refreshes()).toBe(1);
    expect(second.refreshes()).toBe(1);
  });

  it("does not reuse a client-local bearer after its caller clears custody", async () => {
    const session = pairing("removed");
    const client = session.client();
    session.owned.accessToken = undefined;
    session.owned.refreshToken = undefined;
    await expect(client.websocketTicket()).rejects.toMatchObject({ status: 401 });
    expect(session.authorizations).toEqual([null]);
    expect(session.refreshes()).toBe(0);
    expect(session.rotated).not.toHaveBeenCalled();
  });
});
