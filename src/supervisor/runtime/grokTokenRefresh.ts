import { readFileSync } from "node:fs";
import {
  type GrokRefreshedToken,
  type OAuthToken,
  refreshGrokOAuthToken,
} from "@poracode/agents-usage";
import { writeFileAtomic } from "@/shared/atomicFile";
import { coalesceByKey } from "@/shared/coalesce";
import {
  GROK_EXPIRY_KEYS,
  GROK_REFRESH_TOKEN_KEYS,
  grokAuthContainer,
  grokAuthFilePath,
  parseGrokAuth,
  pickGrokField,
  pickGrokRaw,
  resolveGrokToken,
} from "./grokCredentials";
import { createNodeHttpClient } from "./usageHttpClient";

/**
 * Renews the Grok CLI's short-lived access token (the grant openusage runs) so
 * usage collection keeps working when no running CLI keeps `~/.grok/auth.json`
 * fresh. Without this an expired token silently demotes collection to the
 * grok.com cookie path, which carries neither the plan name nor credit amounts.
 *
 * Refresh requires both a refresh token and the CLI's `client_id` from the creds
 * file — xAI publishes no third-party client id, so a file without one simply
 * cannot be renewed. Secrets are never logged.
 */

/** Refresh once the token is inside this window of its expiry. */
const GROK_REFRESH_SKEW_MS = 5 * 60_000;

/** Injectable I/O, defaulted for prod. */
export interface GrokRefreshDeps {
  now(): number;
  refresh(
    input: { refreshToken: string; clientId: string },
    nowMs: number,
  ): Promise<GrokRefreshedToken | undefined>;
  readFile(path: string): string;
  writeFile(path: string, content: string): void;
}

function defaultGrokRefreshDeps(): GrokRefreshDeps {
  const http = createNodeHttpClient();
  return {
    now: () => Date.now(),
    refresh: (input, nowMs) => refreshGrokOAuthToken(http, input, nowMs),
    readFile: (path) => readFileSync(path, "utf8"),
    // Atomic write with owner-only perms, so a torn or crashed write never
    // corrupts or leaks the credentials file.
    writeFile: (path, content) => writeFileAtomic(path, content, { encoding: "utf8", mode: 0o600 }),
  };
}

/** Built once and reused so the http client isn't rebuilt on every resolve. */
let cachedDeps: GrokRefreshDeps | undefined;
function prodGrokRefreshDeps(): GrokRefreshDeps {
  return (cachedDeps ??= defaultGrokRefreshDeps());
}

/** In-flight refresh per creds path, so same-tick callers share one POST. */
const grokRefreshInFlight = new Map<string, Promise<OAuthToken | undefined>>();

function isRefreshDue(token: OAuthToken, nowMs: number): boolean {
  return token.expiresAt !== undefined && token.expiresAt - nowMs <= GROK_REFRESH_SKEW_MS;
}

function clientIdOf(token: OAuthToken): string | undefined {
  const value = token.raw?.clientId;
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/**
 * Pure: write a refreshed pair back into an `auth.json` body, reusing whichever
 * field names and expiry unit the file already used so the Grok CLI keeps reading
 * its own credentials. Returns undefined when the body is not a shape we
 * recognize, so the caller leaves the file untouched.
 */
export function applyGrokRefreshToAuthJson(
  content: string,
  refreshed: GrokRefreshedToken,
): string | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return undefined;
  }
  const found = grokAuthContainer(parsed);
  if (!found) return undefined;
  const { container, tokenKey } = found;

  container[tokenKey] = refreshed.accessToken;
  const refreshKey = pickGrokField(container, GROK_REFRESH_TOKEN_KEYS)?.key ?? "refresh_token";
  container[refreshKey] = refreshed.refreshToken;

  // Match the unit already on disk: ISO, epoch millis, or (default) epoch seconds.
  const previous = pickGrokRaw(container, GROK_EXPIRY_KEYS);
  const expiryKey = previous?.key ?? "expires_at";
  container[expiryKey] =
    typeof previous?.value === "string"
      ? new Date(refreshed.expiresAt).toISOString()
      : typeof previous?.value === "number" && previous.value >= 1e12
        ? refreshed.expiresAt
        : Math.floor(refreshed.expiresAt / 1000);

  return JSON.stringify(parsed, null, 2);
}

async function performGrokRefresh(
  token: OAuthToken,
  deps: GrokRefreshDeps,
  path: string,
  /** File contents the caller already read, to avoid a second sync read. */
  content?: string,
): Promise<OAuthToken | undefined> {
  const clientId = clientIdOf(token);
  if (!token.refreshToken || !clientId) return undefined;

  const refreshed = await deps.refresh({ refreshToken: token.refreshToken, clientId }, deps.now());
  if (!refreshed) return undefined;

  // Persist so the next collection (and the CLI itself) sees the fresh token.
  // A failed write is not fatal — the token in hand is still usable this cycle.
  try {
    const next = applyGrokRefreshToAuthJson(content ?? deps.readFile(path), refreshed);
    if (next) deps.writeFile(path, next);
  } catch {
    // ignore — persistence is best-effort
  }

  return {
    ...token,
    accessToken: refreshed.accessToken,
    refreshToken: refreshed.refreshToken,
    expiresAt: refreshed.expiresAt,
  };
}

/**
 * Renew the token when it is expired or about to be. Returns the original token
 * when it is still good, or when renewal is impossible (no refresh token/client
 * id, network failure) — an expired token is still worth one attempt, and the
 * collector reports the rejection if it fails.
 */
export async function refreshGrokTokenIfDue(
  token: OAuthToken,
  deps: GrokRefreshDeps = prodGrokRefreshDeps(),
  path: string = grokAuthFilePath(),
): Promise<OAuthToken> {
  if (!isRefreshDue(token, deps.now())) return token;
  const refreshed = await coalesceByKey(grokRefreshInFlight, path, () =>
    performGrokRefresh(token, deps, path),
  );
  return refreshed ?? token;
}

/**
 * Called by the usage host after the proxy rejected `rejectedToken`. Re-reads the
 * creds file first: another process (the CLI, or a concurrent collection) may
 * already have rotated it, in which case that token is returned without a POST.
 */
export async function refreshRejectedGrokToken(
  rejectedToken: OAuthToken,
  deps: GrokRefreshDeps = prodGrokRefreshDeps(),
  path: string = grokAuthFilePath(),
): Promise<OAuthToken | undefined> {
  let onDisk: OAuthToken | undefined;
  let content: string | undefined;
  try {
    content = deps.readFile(path);
    onDisk = parseGrokAuth(content);
  } catch {
    // No readable creds file; fall back to refreshing the token we were handed.
  }
  if (onDisk?.accessToken && onDisk.accessToken !== rejectedToken.accessToken) return onDisk;

  const source = onDisk ?? rejectedToken;
  const refreshed = await coalesceByKey(grokRefreshInFlight, path, () =>
    performGrokRefresh(source, deps, path, content),
  );
  return refreshed?.accessToken && refreshed.accessToken !== rejectedToken.accessToken
    ? refreshed
    : undefined;
}

/**
 * Resolver used by the usage credential store: read the CLI's token, renewing it
 * first when it is expired or nearly so. Keeping the refresh here means the shared
 * provider table stays one entry per provider, as it is for every other provider.
 */
export async function resolveFreshGrokToken(): Promise<OAuthToken | undefined> {
  const token = await resolveGrokToken();
  return token ? refreshGrokTokenIfDue(token) : undefined;
}
