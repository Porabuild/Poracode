import { afterEach, describe, expect, it, vi } from "vitest";
import type { RemoteFetch } from "@/shared/remote/client";
import { createManagedLoopbackClient } from "./loopbackHttpWsTransport";

/**
 * Regression coverage for the managed loopback bearer: every activation builds
 * its own client, but all of them share the intake's refresh token. A client
 * that kept its own copy of the bearer spent the refresh token on a stale 401,
 * which deleted the bearer its sibling held, so the two rotated in turns
 * ("refresh storm") until the host's token rate limit refused the refresh and
 * requests failed with "Invalid access token".
 */

const endpoint = "http://127.0.0.1:49152/";
const ticket = "managed-ticket";

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** Fake host: rotating bearer/refresh pair, where every rotation invalidates
 * the previously issued bearer exactly like the real host. */
function managedHost() {
  let validAccessToken = "access-0";
  let validRefreshToken = "refresh-0";
  let refreshes = 0;
  let expiries = 0;
  const authorizations: (string | null)[] = [];
  let authorizationsAtFirstRotation: number | null = null;
  const fetch = vi.fn<RemoteFetch>(async (url, init) => {
    if (new URL(String(url)).pathname === "/oauth/token") {
      const body = JSON.parse(String(init?.body)) as { refreshToken: string };
      if (body.refreshToken !== validRefreshToken)
        return json(401, {
          error: { code: "invalid_refresh_token", message: "Invalid refresh token." },
        });
      refreshes += 1;
      authorizationsAtFirstRotation ??= authorizations.length;
      validAccessToken = `access-${refreshes}`;
      validRefreshToken = `refresh-${refreshes}`;
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
    if (authorization !== `Bearer ${validAccessToken}`)
      return json(401, {
        error: { code: "invalid_access_token", message: "Invalid access token." },
      });
    return json(200, { ticket, expiresAt: "2099-01-01T00:00:00.000Z" });
  });
  return {
    fetch,
    authorizations,
    refreshes: () => refreshes,
    /** First recorded request made once the host had rotated at least once. */
    firstPostRotationAuthorization: () => authorizationsAtFirstRotation,
    /** Simulates the 24-hour access-token expiry: the valid bearer becomes one
     * no client holds. */
    expire: () => {
      expiries += 1;
      validAccessToken = `expired-${expiries}`;
    },
  };
}

/**
 * One fake intake (`DesktopLoopbackIntake` custody) shared by every client of
 * this session, plus the client factory under test.
 */
function session() {
  const host = managedHost();
  vi.stubGlobal("fetch", host.fetch);
  const custody: {
    accessToken: string | null;
    refreshToken: string | null;
    accessTokenExpiresAt: string | null;
  } = {
    accessToken: "access-0",
    refreshToken: "refresh-0",
    accessTokenExpiresAt: null,
  };
  const intake: Parameters<typeof createManagedLoopbackClient>[2] = {
    getAccessToken: () => custody.accessToken,
    getRefreshToken: () => custody.refreshToken,
    // Same custody rule as `DesktopLoopbackIntake.applyTokens`: a rotation
    // without a new refresh token keeps the current one.
    applyTokens: (tokens) => {
      custody.accessToken = tokens.accessToken;
      if (tokens.refreshToken !== undefined) custody.refreshToken = tokens.refreshToken;
      custody.accessTokenExpiresAt = tokens.accessTokenExpiresAt ?? null;
    },
    isActive: () => true,
  };
  return {
    host,
    custody,
    client: (accessToken: string) => createManagedLoopbackClient(endpoint, accessToken, intake),
  };
}

describe("managed loopback bearer sharing", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("clients of one intake share a rotation instead of refreshing in turns", async () => {
    const { host, custody, client } = session();
    const first = client("access-0");
    const second = client("access-0");
    host.expire();

    for (let round = 0; round < 6; round += 1) {
      await expect(first.websocketTicket()).resolves.toBe(ticket);
      await expect(second.websocketTicket()).resolves.toBe(ticket);
    }

    expect(host.refreshes()).toBe(1);
    expect(custody).toEqual({
      accessToken: "access-1",
      refreshToken: "refresh-1",
      // The host's rotation deadline rides through to the intake, which arms
      // its proactive renewal from it.
      accessTokenExpiresAt: "2099-01-01T00:00:00.000Z",
    });
  });

  it("a genuine later expiry still refreshes exactly once more", async () => {
    const { host, client } = session();
    const first = client("access-0");
    const second = client("access-0");
    host.expire();
    for (let round = 0; round < 6; round += 1) {
      await expect(first.websocketTicket()).resolves.toBe(ticket);
      await expect(second.websocketTicket()).resolves.toBe(ticket);
    }
    expect(host.refreshes()).toBe(1);

    host.expire();
    await expect(second.websocketTicket()).resolves.toBe(ticket);
    await expect(first.websocketTicket()).resolves.toBe(ticket);
    expect(host.refreshes()).toBe(2);
  });

  it("a client built from a stale bearer adopts the intake's current one", async () => {
    const { host, client } = session();
    const first = client("access-0");
    host.expire();
    await expect(first.websocketTicket()).resolves.toBe(ticket);
    expect(host.refreshes()).toBe(1);

    const third = client("access-0");
    await expect(third.websocketTicket()).resolves.toBe(ticket);
    expect(host.refreshes()).toBe(1);

    // The rotation's own retry and the stale-bearer client both read the
    // intake's rotated bearer: `access-0` never returns to the wire.
    expect(host.firstPostRotationAuthorization()).toBe(1);
    expect(host.authorizations.slice(1)).toEqual(["Bearer access-1", "Bearer access-1"]);
  });
});
