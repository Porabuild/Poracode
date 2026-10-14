import type { EnvironmentPublicProjection } from "@/shared/environments";
import type { RemoteEnvironmentParentAuthority } from "./clientEnvironments";
import type { RemoteFetch, RemoteTokenLifecycle, RemoteTokenSnapshot } from "./clientTypes";
import type { RemoteImageRefValue } from "./imageRef";
import type { RemoteWebSocketTicketResult } from "./protocol/core";

/**
 * Small shared test kit for the C1.3a environment client suites. Drives the
 * production transports only: the `RemoteFetch` seam is the same one the app
 * injects, and the authority is the exact interface the renderer implements.
 */

export interface CapturedRequest {
  readonly url: URL;
  readonly method: string;
  readonly headers: Record<string, string>;
  readonly body: unknown;
  readonly certFingerprint: string | null | undefined;
  readonly signal: AbortSignal | undefined;
}

export interface ScriptedFetch {
  readonly fetchImpl: RemoteFetch;
  readonly requests: CapturedRequest[];
}

export type RequestHandler = (request: CapturedRequest) => Response | Promise<Response>;

export function scriptedFetch(handlers: readonly RequestHandler[]): ScriptedFetch {
  const requests: CapturedRequest[] = [];
  const fetchImpl: RemoteFetch = async (rawUrl, init) => {
    const request: CapturedRequest = {
      url: new URL(String(rawUrl)),
      method: init?.method ?? "GET",
      headers: { ...(init?.headers ?? {}) },
      body: typeof init?.body === "string" ? (JSON.parse(init.body) as unknown) : undefined,
      certFingerprint: init?.certFingerprint,
      signal: init?.signal,
    };
    requests.push(request);
    const handler = handlers[requests.length - 1];
    if (!handler) {
      throw new Error(`Unexpected request: ${request.method} ${request.url.pathname}`);
    }
    return handler(request);
  };
  return { fetchImpl, requests };
}

export function jsonResponse(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

export function errorResponse(
  status: number,
  code: string,
  headers: Record<string, string> = {},
): Response {
  return jsonResponse({ error: { code, message: code } }, status, headers);
}

export function accessTokenResponse(accessToken: string, refreshToken: string): Response {
  return jsonResponse({
    accessToken,
    tokenType: "Bearer",
    expiresAt: "2099-01-01T00:00:00.000Z",
    scopes: ["session:read", "session:operate", "ports:forward"],
    refreshToken,
  });
}

export interface TestAuthority {
  readonly authority: RemoteEnvironmentParentAuthority;
  readonly calls: { ensureLive: number; mint: number };
}

export function testAuthority(
  overrides: Partial<RemoteEnvironmentParentAuthority> = {},
): TestAuthority {
  const calls = { ensureLive: 0, mint: 0 };
  const authority: RemoteEnvironmentParentAuthority = {
    accessToken: () => "parent-access",
    ensureLive: async () => {
      calls.ensureLive += 1;
    },
    mintWebSocketTicket: async (): Promise<RemoteWebSocketTicketResult> => {
      calls.mint += 1;
      return {
        ticket: `parent-ws-${calls.mint}`,
        expiresAt: new Date(Date.now() + 30_000).toISOString(),
      };
    },
    ...overrides,
  };
  return { authority, calls };
}

export interface TestChildLifecycle {
  readonly lifecycle: RemoteTokenLifecycle;
  readonly refreshed: RemoteTokenSnapshot[];
  currentRefreshToken: () => string | undefined;
}

export function testChildLifecycle(refreshToken = "child-refresh-1"): TestChildLifecycle {
  let current: string | undefined = refreshToken;
  const refreshed: RemoteTokenSnapshot[] = [];
  return {
    lifecycle: {
      refreshToken: () => current,
      onTokensRefreshed: (tokens) => {
        if (tokens.refreshToken !== undefined) current = tokens.refreshToken;
        refreshed.push(tokens);
      },
    },
    refreshed,
    currentRefreshToken: () => current,
  };
}

export function environmentProjection(
  overrides: Partial<EnvironmentPublicProjection> = {},
): EnvironmentPublicProjection {
  return {
    environmentId: "11111111-1111-4111-8111-111111111111",
    revision: 1,
    label: "Build box",
    target: "user@example-host",
    trust: { state: "unknown" },
    runtime: { hash: "a".repeat(64) },
    credential: "none",
    legacyConnectionIds: [],
    desired: "disabled",
    createdAt: 1,
    updatedAt: 1,
    state: "disconnected",
    ...overrides,
  };
}

export const TEST_ENVIRONMENT_ID = "11111111-1111-4111-8111-111111111111";

export function testEnvironmentEndpoint(): string {
  return `http://127.0.0.1:38987/api/environments/${TEST_ENVIRONMENT_ID}/proxy/`;
}

export function imageRef(overrides: Partial<RemoteImageRefValue> = {}): RemoteImageRefValue {
  return {
    threadId: "thread-1",
    itemId: "item-1",
    path: ["images", 0],
    mime: "image/png",
    bytes: 3,
    ...overrides,
  };
}

export function bytesResponse(bytes: Uint8Array, contentType = "image/png"): Response {
  return new Response(bytes.slice().buffer, {
    status: 200,
    headers: { "content-type": contentType },
  });
}

export function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolver) => {
    resolve = resolver;
  });
  return { promise, resolve };
}
