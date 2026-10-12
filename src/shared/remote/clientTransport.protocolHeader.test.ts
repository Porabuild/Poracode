import { describe, expect, it, vi } from "vitest";
import { RemoteDesktopClient } from "./client";
import {
  REMOTE_PROTOCOL_VERSION_HEADER,
  REMOTE_PROTOCOL_VERSION_HEADER_VALUE,
} from "@/shared/remote";
import type { RemoteFetch, RemoteJsonRequestInit } from "./clientTypes";

const endpoint = "http://127.0.0.1:38988/";

/**
 * `requestJson` stays private; drive it through a structural cast instead of
 * widening the public client surface (same pattern as client.test.ts).
 */
function requestJsonFull(
  client: RemoteDesktopClient,
  path: string,
  init: RemoteJsonRequestInit,
): Promise<unknown> {
  return (
    client as unknown as {
      requestJson(path: string, init?: RemoteJsonRequestInit): Promise<unknown>;
    }
  ).requestJson(path, init);
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** Mock fetch recording the full header object of every dispatched request. */
function recordingFetch(handler: (path: string, headers: Record<string, string>) => Response) {
  const seen: Array<{ path: string; headers: Record<string, string> }> = [];
  const fetch = vi.fn<RemoteFetch>(async (url, init) => {
    const headers = { ...init?.headers } as Record<string, string>;
    seen.push({ path: new URL(String(url)).pathname, headers });
    return handler(new URL(String(url)).pathname, headers);
  });
  return { fetch, seen };
}

/**
 * Fence 1 (remote 13), TS producer side: the current client declares the
 * writer generation on every authenticated non-GET request — including the
 * post-refresh retry — from its compiled constant alone. Auth-free calls
 * carry no header, a caller-supplied stale value is replaced only by this
 * producer, and the transport-level mutation hint is never consulted (the
 * host classifies by route/procedure scope, not client intent).
 */
describe("RemoteClientTransport writer generation header (remote 13)", () => {
  it("attaches the exact current generation to an authenticated non-GET request", async () => {
    const { fetch, seen } = recordingFetch(() => jsonResponse(200, { ok: true }));
    const client = new RemoteDesktopClient(endpoint, "lc_access", fetch);
    await expect(
      requestJsonFull(client, "/api/projects/p/notes", {
        method: "POST",
        body: { doc: null },
      }),
    ).resolves.toEqual({ ok: true });
    expect(seen).toHaveLength(1);
    expect(seen[0]!.headers[REMOTE_PROTOCOL_VERSION_HEADER]).toBe(
      REMOTE_PROTOCOL_VERSION_HEADER_VALUE,
    );
    // The constant itself is the settled wire contract.
    expect(REMOTE_PROTOCOL_VERSION_HEADER).toBe("x-poracode-protocol-version");
    expect(REMOTE_PROTOCOL_VERSION_HEADER_VALUE).toBe("13");
  });

  it("does not attach the generation to GET requests", async () => {
    const { fetch, seen } = recordingFetch(() => jsonResponse(200, { ok: true }));
    const client = new RemoteDesktopClient(endpoint, "lc_access", fetch);
    await expect(requestJsonFull(client, "/api/snapshot", {})).resolves.toEqual({ ok: true });
    expect(seen[0]!.headers[REMOTE_PROTOCOL_VERSION_HEADER]).toBeUndefined();
  });

  it("never forces the generation onto an auth-free request", async () => {
    const { fetch, seen } = recordingFetch(() => jsonResponse(200, { ok: true }));
    // No access token: the pairing/exchange shape (POST /oauth/token with no
    // bearer) must reach the host undeclared, like any auth-free old client.
    const client = new RemoteDesktopClient(endpoint, undefined, fetch);
    await expect(
      requestJsonFull(client, "/oauth/token", {
        method: "POST",
        body: { grantType: "pairing-token", credential: "c" },
      }),
    ).resolves.toEqual({ ok: true });
    expect(seen[0]!.headers.authorization).toBeUndefined();
    expect(seen[0]!.headers[REMOTE_PROTOCOL_VERSION_HEADER]).toBeUndefined();
  });

  it("attaches the generation to the request retried after a token refresh", async () => {
    const { fetch, seen } = recordingFetch((path) => {
      if (path === "/api/snapshot") {
        // First attempt answers 401; only the retry succeeds.
        return seen.length === 1
          ? jsonResponse(401, {
              error: { message: "Invalid access token.", code: "invalid_access_token" },
            })
          : jsonResponse(200, { ok: true });
      }
      return jsonResponse(200, {
        accessToken: "lc_access_new",
        tokenType: "Bearer",
        expiresAt: "2099-01-02T00:00:00.000Z",
        scopes: ["session:read"],
        refreshToken: "lc_refresh_new",
        refreshTokenExpiresAt: "2099-02-01T00:00:00.000Z",
      });
    });
    const client = new RemoteDesktopClient(endpoint, "lc_access_stale", fetch, {
      tokenLifecycle: {
        refreshToken: () => "lc_refresh_old",
        onTokensRefreshed: () => {},
      },
    });
    await expect(requestJsonFull(client, "/api/snapshot", { method: "POST" })).resolves.toEqual({
      ok: true,
    });
    const apiCalls = seen.filter((call) => call.path === "/api/snapshot");
    expect(apiCalls).toHaveLength(2);
    // Both the original and the post-refresh retry declare the generation,
    // each with the rotated bearer of its attempt.
    expect(apiCalls[0]!.headers[REMOTE_PROTOCOL_VERSION_HEADER]).toBe(
      REMOTE_PROTOCOL_VERSION_HEADER_VALUE,
    );
    expect(apiCalls[0]!.headers.authorization).toBe("Bearer lc_access_stale");
    expect(apiCalls[1]!.headers[REMOTE_PROTOCOL_VERSION_HEADER]).toBe(
      REMOTE_PROTOCOL_VERSION_HEADER_VALUE,
    );
    expect(apiCalls[1]!.headers.authorization).toBe("Bearer lc_access_new");
  });

  it("replaces a caller-supplied stale generation with its own constant — and nothing else upgrades", async () => {
    const { fetch, seen } = recordingFetch(() => jsonResponse(200, { ok: true }));
    const client = new RemoteDesktopClient(endpoint, "lc_access", fetch);
    await expect(
      requestJsonFull(client, "/api/projects/p/notes", {
        method: "POST",
        body: {},
        headers: { [REMOTE_PROTOCOL_VERSION_HEADER]: "12" },
      }),
    ).resolves.toEqual({ ok: true });
    // This producer is the only upgrade path: the wire carries exactly one
    // current generation value for the authenticated non-GET request.
    expect(seen[0]!.headers[REMOTE_PROTOCOL_VERSION_HEADER]).toBe(
      REMOTE_PROTOCOL_VERSION_HEADER_VALUE,
    );
  });

  it("ignores the transport mutation hint — generation follows authentication, not intent", async () => {
    const { fetch, seen } = recordingFetch(() => jsonResponse(200, { ok: true }));
    const client = new RemoteDesktopClient(endpoint, "lc_access", fetch);
    // No `mutation` flag: the header is still declared (the host classifies
    // by actual route/procedure scope).
    await expect(
      requestJsonFull(client, "/api/auth/websocket-ticket", { method: "POST" }),
    ).resolves.toEqual({ ok: true });
    expect(seen[0]!.headers[REMOTE_PROTOCOL_VERSION_HEADER]).toBe(
      REMOTE_PROTOCOL_VERSION_HEADER_VALUE,
    );
  });
});
