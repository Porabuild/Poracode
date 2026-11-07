import { afterEach, describe, expect, it, vi } from "vitest";
import { RemoteClientError, type RemoteFetch } from "@/shared/remote/client";
import {
  __setManagedLoopbackIntakeForTest,
  createManagedLoopbackClient,
  renewManagedLoopbackSession,
} from "./loopbackHttpWsTransport";

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
function managedHost(options?: { readonly refreshStatus?: number }) {
  let validAccessToken = "access-0";
  let validRefreshToken = "refresh-0";
  let refreshes = 0;
  let expiries = 0;
  const authorizations: (string | null)[] = [];
  let authorizationsAtFirstRotation: number | null = null;
  const fetch = vi.fn<RemoteFetch>(async (url, init) => {
    if (new URL(String(url)).pathname === "/oauth/token") {
      // The host's token bucket refuses before it looks at the grant.
      if (options?.refreshStatus !== undefined)
        return json(options.refreshStatus, {
          error: { code: "rate_limited", message: "Too many remote access attempts." },
        });
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
function session(options?: { readonly refreshStatus?: number }) {
  const host = managedHost(options);
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
    noteBearerRefused: vi.fn<() => void>(),
  };
  return {
    host,
    custody,
    intake,
    client: (accessToken: string) => createManagedLoopbackClient(endpoint, accessToken, intake),
  };
}

describe("managed loopback bearer sharing", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    // Not the full wiring reset: it disposes the installed intake, and this
    // suite installs a stub without one.
    __setManagedLoopbackIntakeForTest(null);
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

  it("escalates a final 401 to the live intake's re-proof, never to a retired one", async () => {
    // The wiring fence: a request 401 that survives the refresh path reaches
    // the CURRENT, ACTIVE intake's re-proof; the same 401 on a retired or
    // inactive intake must not tear down a successor leg.
    const host = managedHost();
    vi.stubGlobal("fetch", host.fetch);
    const bearerRefused = vi.fn<() => void>();
    let intakeActive = true;
    const intake = {
      getAccessToken: () => "access-0",
      getRefreshToken: () => "refresh-retired",
      applyTokens: () => {},
      isActive: () => intakeActive,
      noteBearerRefused: bearerRefused,
    };
    __setManagedLoopbackIntakeForTest(intake);
    host.expire();

    const client = createManagedLoopbackClient(endpoint, "access-0", intake);
    await expect(client.websocketTicket()).rejects.toMatchObject({ status: 401 });
    expect(bearerRefused).toHaveBeenCalledTimes(1);

    // The intake went away (successor activation): the retired client's 401
    // stays silent.
    bearerRefused.mockClear();
    intakeActive = false;
    await expect(client.websocketTicket()).rejects.toMatchObject({ status: 401 });
    expect(bearerRefused).not.toHaveBeenCalled();
  });
});

describe("managed loopback session renewal", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renews the retained session and reports the rotation through custody", async () => {
    const { host, custody, intake } = session();

    await expect(renewManagedLoopbackSession(endpoint, intake)).resolves.toBe(true);

    expect(host.refreshes()).toBe(1);
    expect(custody).toEqual({
      accessToken: "access-1",
      refreshToken: "refresh-1",
      accessTokenExpiresAt: "2099-01-01T00:00:00.000Z",
    });
  });

  it("reports a refused grant as false without touching custody", async () => {
    const { host, custody, intake } = session();
    custody.refreshToken = "refresh-retired";

    await expect(renewManagedLoopbackSession(endpoint, intake)).resolves.toBe(false);

    expect(host.refreshes()).toBe(0);
    expect(custody).toEqual({
      accessToken: "access-0",
      refreshToken: "refresh-retired",
      accessTokenExpiresAt: null,
    });
  });

  it("rejects a rate-limited renewal as transport-class and leaves custody alone", async () => {
    const { custody, intake } = session({ refreshStatus: 429 });

    const error = await renewManagedLoopbackSession(endpoint, intake).catch(
      (caught: unknown) => caught,
    );

    expect(error).toBeInstanceOf(RemoteClientError);
    expect((error as RemoteClientError).status).toBe(429);
    expect(custody).toEqual({
      accessToken: "access-0",
      refreshToken: "refresh-0",
      accessTokenExpiresAt: null,
    });
  });
});
