import { createPrivateKey, sign } from "node:crypto";
import type { ApnsConfig } from "./config";

/**
 * APNs provider authentication token: an ES256-signed JWT. APNs accepts a token
 * for 20–60 min and rejects re-signing more than once every 20 min, so we cache
 * one module-scope and re-sign only when it ages past ~45 min.
 */

const TOKEN_MAX_AGE_MS = 45 * 60 * 1000;

interface JwtHeader {
  alg: "ES256";
  kid: string;
  typ: "JWT";
}

export interface JwtClaims {
  iss: string;
  iat: number;
}

function base64url(input: string | Buffer): string {
  return Buffer.from(input).toString("base64url");
}

export function buildJwtHeader(keyId: string): JwtHeader {
  return { alg: "ES256", kid: keyId, typ: "JWT" };
}

export function buildJwtClaims(teamId: string, nowMs = Date.now()): JwtClaims {
  return { iss: teamId, iat: Math.floor(nowMs / 1000) };
}

/**
 * Sign the header+claims with ES256. `dsaEncoding: "ieee-p1363"` yields the raw
 * r||s signature JWS/JOSE requires (Node's default is DER, which APNs rejects).
 */
export function signJwt(config: ApnsConfig, nowMs = Date.now()): string {
  const header = base64url(JSON.stringify(buildJwtHeader(config.keyId)));
  const claims = base64url(JSON.stringify(buildJwtClaims(config.teamId, nowMs)));
  const signingInput = `${header}.${claims}`;
  const key = createPrivateKey(config.authKey);
  const signature = sign("sha256", Buffer.from(signingInput), {
    key,
    dsaEncoding: "ieee-p1363",
  });
  return `${signingInput}.${base64url(signature)}`;
}

interface CachedToken {
  keyId: string;
  teamId: string;
  token: string;
  createdMs: number;
}

let cached: CachedToken | null = null;

/** Returns a fresh-enough provider token, re-signing when stale or config changed. */
export function getProviderToken(config: ApnsConfig, nowMs = Date.now()): string {
  if (
    cached &&
    cached.keyId === config.keyId &&
    cached.teamId === config.teamId &&
    nowMs - cached.createdMs < TOKEN_MAX_AGE_MS
  ) {
    return cached.token;
  }
  const token = signJwt(config, nowMs);
  cached = { keyId: config.keyId, teamId: config.teamId, token, createdMs: nowMs };
  return token;
}
