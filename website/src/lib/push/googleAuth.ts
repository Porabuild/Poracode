import { createPrivateKey, sign } from "node:crypto";
import type { FcmConfig } from "./config";

/**
 * Google service-account OAuth2 for FCM HTTP v1. We RS256-sign a short-lived
 * assertion JWT with the service-account private key, exchange it at Google's
 * token endpoint for a bearer access token, and cache that token module-scope
 * (refreshing when it's within 5 min of expiry). The `signJwt`/`fetchImpl`
 * seams are injectable so the pure JWT path can be exercised without a network.
 */

const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/firebase.messaging";
const GRANT_TYPE = "urn:ietf:params:oauth:grant-type:jwt-bearer";
/** Refresh once the cached token is within this margin of expiring. */
const REFRESH_MARGIN_MS = 5 * 60 * 1000;
const TOKEN_LIFETIME_SECONDS = 3600;
const REQUEST_TIMEOUT_MS = 10_000;

/** Thrown for auth-side failures (network, non-2xx, malformed response) → 502. */
export class GoogleAuthError extends Error {}

function base64url(input: string | Buffer): string {
  return Buffer.from(input).toString("base64url");
}

export interface GoogleJwtClaims {
  iss: string;
  scope: string;
  aud: string;
  iat: number;
  exp: number;
}

export function buildGoogleJwtClaims(clientEmail: string, nowMs = Date.now()): GoogleJwtClaims {
  const iat = Math.floor(nowMs / 1000);
  return {
    iss: clientEmail,
    scope: SCOPE,
    aud: TOKEN_ENDPOINT,
    iat,
    exp: iat + TOKEN_LIFETIME_SECONDS,
  };
}

/**
 * Sign the assertion JWT with RS256. For an RSA key, Node's `sign("sha256", …)`
 * produces the PKCS#1 v1.5 signature JWS/JOSE requires for `alg: RS256`.
 */
export function signServiceAccountJwt(config: FcmConfig, nowMs = Date.now()): string {
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64url(JSON.stringify(buildGoogleJwtClaims(config.clientEmail, nowMs)));
  const signingInput = `${header}.${claims}`;
  const key = createPrivateKey(config.privateKey);
  const signature = sign("sha256", Buffer.from(signingInput), key);
  return `${signingInput}.${base64url(signature)}`;
}

interface CachedAccessToken {
  clientEmail: string;
  token: string;
  expiresAtMs: number;
}

let cached: CachedAccessToken | null = null;

export interface AccessTokenDeps {
  signJwt?: (config: FcmConfig, nowMs: number) => string;
  fetchImpl?: typeof fetch;
  nowMs?: number;
}

/**
 * Return a fresh-enough OAuth2 access token, exchanging a new assertion JWT when
 * the cache is empty, stale, or belongs to a different service account.
 */
export async function getAccessToken(
  config: FcmConfig,
  deps: AccessTokenDeps = {},
): Promise<string> {
  const nowMs = deps.nowMs ?? Date.now();
  const signJwt = deps.signJwt ?? signServiceAccountJwt;
  const fetchImpl = deps.fetchImpl ?? fetch;

  if (
    cached &&
    cached.clientEmail === config.clientEmail &&
    cached.expiresAtMs - nowMs > REFRESH_MARGIN_MS
  ) {
    return cached.token;
  }

  const assertion = signJwt(config, nowMs);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetchImpl(TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: GRANT_TYPE, assertion }).toString(),
      signal: controller.signal,
    });
  } catch {
    throw new GoogleAuthError("token endpoint unreachable");
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new GoogleAuthError(`token exchange failed with status ${response.status}`);
  }

  let body: { access_token?: unknown; expires_in?: unknown };
  try {
    body = (await response.json()) as typeof body;
  } catch {
    throw new GoogleAuthError("token response was not JSON");
  }

  const accessToken = body.access_token;
  if (typeof accessToken !== "string" || !accessToken) {
    throw new GoogleAuthError("token response missing access_token");
  }
  const expiresIn =
    typeof body.expires_in === "number" && body.expires_in > 0
      ? body.expires_in
      : TOKEN_LIFETIME_SECONDS;

  cached = {
    clientEmail: config.clientEmail,
    token: accessToken,
    expiresAtMs: nowMs + expiresIn * 1000,
  };
  return accessToken;
}

/** Test-only: drop the module-scope token cache. */
export function __resetAccessTokenCache(): void {
  cached = null;
}
