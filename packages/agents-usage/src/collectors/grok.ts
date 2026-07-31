import { toEpochMs } from "../formatters";
import type { CollectOptions, HostPort, HttpClient, HttpResponse, OAuthToken } from "../host";
import type { UsageSnapshot, UsageWindow } from "../types";
import {
  GROK_GRPC_EMPTY_FRAME_BASE64,
  GROK_GRPC_ENDPOINT,
  parseGrokGrpcBillingResponse,
} from "./grokGrpc";

/**
 * Grok (xAI). Two collection paths, tried in that order:
 *
 * 1. The CLI proxy's `/v1/billing` with the Grok CLI bearer token from
 *    `~/.grok/auth.json` — JSON, and the only path carrying real credit amounts
 *    (`used` / `monthlyLimit`). Rejected tokens are refreshed through the host
 *    (see {@link refreshGrokOAuthToken}) and retried, so an expired access token
 *    no longer silently demotes us to the cookie path.
 * 2. grok.com's private gRPC-web credits config with a captured browser session
 *    cookie — percent and period only, and served by an edge that has changed its
 *    accepted encoding under us more than once.
 *
 * The plan name comes from `/v1/settings`, whose `subscription_tier_display`
 * field carries it (e.g. "X Premium+") — verified live. It is bearer-only, so a
 * cookie-only session borrows it when a CLI token also happens to be on disk.
 *
 * Both are reverse-engineered, undocumented APIs (per openusage/codexbar):
 * endpoints and fields may change without notice. `/billing` returns:
 *   { config: { monthlyLimit: {val}, used: {val}, onDemandCap: {val},
 *               billingPeriodStart, billingPeriodEnd, history: [...] } }
 */

const GROK_PROXY_BASE = "https://cli-chat-proxy.grok.com/v1";
/**
 * Plain `/billing`, deliberately not openusage's `?format=credits`. Verified
 * against the live proxy: the `credits` view returns the weekly on-demand cycle
 * (`onDemandCap`, `onDemandUsed`, `prepaidBalance`) and omits `monthlyLimit` /
 * `used` entirely, so reading it would render a confident 0%. The unparameterized
 * view is the one carrying the allowance this ring reports.
 */
export const GROK_BILLING_ENDPOINT = `${GROK_PROXY_BASE}/billing`;
export const GROK_SETTINGS_ENDPOINT = `${GROK_PROXY_BASE}/settings`;
const GROK_TOKEN_AUTH_HEADER = "xai-grok-cli";

interface GrokVal {
  val?: number;
}

interface GrokBillingResponse {
  config?: {
    monthlyLimit?: GrokVal;
    used?: GrokVal;
    onDemandCap?: GrokVal;
    billingPeriodStart?: string;
    billingPeriodEnd?: string;
  };
}

function num(v: GrokVal | undefined): number | undefined {
  return typeof v?.val === "number" && Number.isFinite(v.val) ? v.val : undefined;
}

function grokConfig(billingBody: unknown): NonNullable<GrokBillingResponse["config"]> {
  return ((billingBody ?? {}) as GrokBillingResponse).config ?? {};
}

/** A windowless snapshot: every terminal verdict this collector can report. */
function grokSnapshot(
  status: UsageSnapshot["status"],
  nowMs: number,
  error?: string,
): UsageSnapshot {
  return {
    providerId: "grok",
    status,
    windows: [],
    fetchedAt: nowMs,
    ...(error ? { error } : {}),
  };
}

/**
 * Does a `/billing` body actually carry credit data? A 200 that parses but holds
 * none of the fields we read (a shape change, or a proxy's stub response) would
 * otherwise render as a confident "0% used", so the collector treats it as a
 * failed attempt and falls back instead.
 */
function grokBillingHasData(billingBody: unknown): boolean {
  const config = grokConfig(billingBody);
  // Deliberately not satisfied by a period alone: the proxy's on-demand view
  // carries billing dates with no allowance, and would read as 0% used.
  return num(config.monthlyLimit) !== undefined || num(config.used) !== undefined;
}

/**
 * Plan name from the `/settings` body. `subscription_tier_display` is the field
 * the live proxy returns and the one the Grok CLI itself renders (values like
 * "X Premium+", "SuperGrok"). Earlier guesses at `tier.displayName` /
 * `subscriptionTier` / `plan` were never observed on any response and are gone —
 * an absent plan is reported honestly instead of hunting for invented shapes.
 */
function planFromSettings(settingsBody: unknown): string | undefined {
  const value = (settingsBody as { subscription_tier_display?: unknown } | null | undefined)
    ?.subscription_tier_display;
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/**
 * Best-effort `/settings` fetch for the plan name. Bearer-only: the grok.com
 * session cookie is scoped to a different host, so callers skip this without a
 * CLI token. Never throws — usage stands on its own without a plan name.
 */
async function fetchGrokSettings(host: HostPort, accessToken: string): Promise<unknown> {
  try {
    const res = await grokRequest(host, GROK_SETTINGS_ENDPOINT, accessToken);
    if (res.status < 200 || res.status >= 300) return undefined;
    return JSON.parse(res.body);
  } catch {
    return undefined;
  }
}

/** Pure: map a parsed `/billing` body (+ optional `/settings`) to a snapshot. */
export function parseGrokUsage(
  billingBody: unknown,
  settingsBody: unknown,
  nowMs: number,
): UsageSnapshot {
  const config = grokConfig(billingBody);
  const limit = num(config.monthlyLimit);
  const used = num(config.used);
  const usedPercent =
    limit !== undefined && limit > 0 && used !== undefined
      ? Math.min(100, Math.max(0, (used / limit) * 100))
      : 0;
  const resetsAt = toEpochMs(config.billingPeriodEnd);

  const window: UsageWindow = {
    id: "monthly",
    // The JSON path carries both cycle bounds, so the label is derived rather
    // than assumed — a weekly credit cycle reads as weekly.
    label: grokWindowLabel(toEpochMs(config.billingPeriodStart), resetsAt, nowMs),
    usedPercent,
    unit: "credits",
    ...(used !== undefined ? { used } : {}),
    ...(limit !== undefined ? { limit } : {}),
    ...(resetsAt !== undefined ? { resetsAt } : {}),
  };

  const plan = planFromSettings(settingsBody);
  return {
    providerId: "grok",
    status: "ok",
    windows: [window],
    fetchedAt: nowMs,
    ...(plan ? { plan } : {}),
  };
}

/**
 * Cycle-length-driven label, per codexbar (Weekly / Monthly / Credits).
 *
 * The cookie path only recovers the reset instant, never the period start, so
 * fall back to the distance to that reset: a weekly cycle can never sit more
 * than ~8 days out, so anything further (and still within a plausible monthly
 * cycle) is monthly. Closer resets stay ambiguous — a monthly cycle near its
 * end looks exactly like a weekly one — and keep the bare "Credits" label.
 */
function grokWindowLabel(
  periodStartMs: number | undefined,
  resetsAt: number | undefined,
  nowMs: number,
): string {
  if (periodStartMs !== undefined && resetsAt !== undefined) {
    const days = (resetsAt - periodStartMs) / 864e5;
    if (days > 0 && days <= 10) return "Weekly credits";
    if (days <= 40) return "Monthly credits";
  }
  if (resetsAt !== undefined) {
    const daysUntilReset = (resetsAt - nowMs) / 864e5;
    if (daysUntilReset > 8 && daysUntilReset <= 40) return "Monthly credits";
  }
  return "Credits";
}

function grokGrpcRequest(http: HttpClient, cookie: string): Promise<HttpResponse> {
  return http.request({
    method: "POST",
    url: GROK_GRPC_ENDPOINT,
    headers: {
      Cookie: cookie,
      Origin: "https://grok.com",
      Referer: "https://grok.com/?_s=usage",
      Accept: "*/*",
      // Base64 `grpc-web-text`, not binary `grpc-web+proto`: the edge rejects the
      // binary form of this call outright (grpc-status 13, "Missing request
      // message."). See GROK_GRPC_EMPTY_FRAME_BASE64.
      "Content-Type": "application/grpc-web-text",
      "x-grpc-web": "1",
      "x-user-agent": "connect-es/2.1.1",
      "User-Agent": "Poracode",
    },
    body: GROK_GRPC_EMPTY_FRAME_BASE64,
    timeoutMs: 15_000,
  });
}

/**
 * Outcome of one collection attempt: either a snapshot to use (usage, or a
 * verdict like `auth-missing` / `rate-limited`) or a `detail` describing a
 * transient failure, so the caller can fall back to the other path and still
 * report *why* this one failed.
 */
interface GrokAttempt {
  snapshot?: UsageSnapshot;
  detail?: string;
}

/**
 * Collect via the grok.com browser session cookie (codexbar's path): POST the
 * gRPC-web `GetGrokCreditsConfig` endpoint and parse the protobuf for used
 * percent + reset.
 */
async function collectGrokViaCookie(
  host: HostPort,
  cookie: string,
  nowMs: number,
): Promise<GrokAttempt> {
  const authMissing = (): GrokAttempt => ({ snapshot: grokSnapshot("auth-missing", nowMs) });

  const res = await grokGrpcRequest(host.http, cookie);
  if (res.status === 401 || res.status === 403) return authMissing();
  if (res.status < 200 || res.status >= 300) return { detail: `HTTP ${res.status}` };

  const parsed = parseGrokGrpcBillingResponse({
    headers: res.headers,
    ...(res.body ? { body: res.body } : {}),
    ...(res.bodyBytes ? { bodyBytes: res.bodyBytes } : {}),
    nowMs,
  });
  if (parsed.kind === "unauthenticated") return authMissing();
  if (parsed.kind !== "ok") {
    // The wire dump goes to the logger, never onto the usage card.
    if (parsed.debug) host.log?.debug("grok credits config unparseable", parsed.debug);
    return { detail: parsed.detail ?? "unexpected response" };
  }

  const window: UsageWindow = {
    id: "monthly",
    label: grokWindowLabel(parsed.billing.periodStartsAt, parsed.billing.resetsAt, nowMs),
    usedPercent: parsed.billing.usedPercent,
    unit: "credits",
    ...(parsed.billing.resetsAt !== undefined ? { resetsAt: parsed.billing.resetsAt } : {}),
  };
  return {
    snapshot: { providerId: "grok", status: "ok", windows: [window], fetchedAt: nowMs },
  };
}

/** Parenthesized failure reason for a card error string, or nothing. */
function grokDetail(attempt: GrokAttempt): string {
  return attempt.detail ? ` (${attempt.detail})` : "";
}

function grokRequest(host: HostPort, url: string, accessToken: string): Promise<HttpResponse> {
  return host.http.request({
    method: "GET",
    url,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "X-XAI-Token-Auth": GROK_TOKEN_AUTH_HEADER,
      Accept: "application/json",
    },
    timeoutMs: 15_000,
  });
}

/**
 * Primary path: the CLI proxy's billing JSON. A rejected access token is handed
 * to the host for refresh and retried, so a stale `~/.grok/auth.json` recovers on
 * its own instead of falling through to the cookie path.
 */
async function collectGrokViaToken(
  host: HostPort,
  initialToken: OAuthToken,
  nowMs: number,
): Promise<GrokAttempt> {
  let token = initialToken;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    let res: HttpResponse;
    try {
      res = await grokRequest(host, GROK_BILLING_ENDPOINT, token.accessToken);
    } catch {
      return { detail: "network error" };
    }

    if (res.status === 401 || res.status === 403) {
      // A refresh that hands back the same token is no progress; the attempt
      // bound then stops a host that cycles between two stale tokens.
      const next = await host.credentials.refreshOAuthToken?.("grok", token);
      if (!next?.accessToken || next.accessToken === token.accessToken) {
        return {
          snapshot: grokSnapshot("auth-missing", nowMs, `token rejected (${res.status})`),
        };
      }
      token = next;
      continue;
    }
    if (res.status === 429) return { snapshot: grokSnapshot("rate-limited", nowMs) };
    if (res.status < 200 || res.status >= 300) return { detail: `HTTP ${res.status}` };

    let billing: unknown;
    try {
      billing = JSON.parse(res.body);
    } catch {
      return { detail: "invalid JSON response" };
    }
    if (!grokBillingHasData(billing)) return { detail: "no credit fields in billing response" };

    // Plan name is best-effort; usage stands on its own without it.
    const settings = await fetchGrokSettings(host, token.accessToken);
    return { snapshot: parseGrokUsage(billing, settings, nowMs) };
  }

  return { snapshot: grokSnapshot("auth-missing", nowMs) };
}

export async function collectGrok(host: HostPort, _opts?: CollectOptions): Promise<UsageSnapshot> {
  const now = host.now();
  // Independent lookups: the token resolve may hit disk (and a refresh POST),
  // while the cookie is a safeStorage decrypt.
  const [token, cookie] = await Promise.all([
    host.credentials.getOAuthToken("grok"),
    host.credentials.getSecret("grok", "cookie"),
  ]);
  // Token path first: documented-shaped JSON, refreshable credentials, and the
  // only source of the plan name and real credit amounts.
  let viaToken: GrokAttempt = {};
  if (token?.accessToken) {
    viaToken = await collectGrokViaToken(host, token, now);
    if (viaToken.snapshot?.status === "ok") return viaToken.snapshot;
  }

  if (!cookie) {
    if (!token?.accessToken) return grokSnapshot("auth-missing", now);
    return (
      viaToken.snapshot ??
      grokSnapshot("error", now, `grok billing check failed${grokDetail(viaToken)}`)
    );
  }

  let viaCookie: GrokAttempt;
  try {
    viaCookie = await collectGrokViaCookie(host, cookie, now);
  } catch {
    // Network throw — treat as transient below, not a sign-out.
    viaCookie = { detail: "network error" };
  }

  if (viaCookie.snapshot?.status === "ok") {
    const usage = viaCookie.snapshot;
    // The gRPC-web credits config carries no tier, so borrow it from the CLI
    // proxy — but not with a token the proxy just rejected, which would spend a
    // request per cycle to learn nothing. Without a usable token the card simply
    // shows usage with no plan chip.
    const tierToken = viaToken.snapshot?.status === "auth-missing" ? undefined : token?.accessToken;
    if (!tierToken) return usage;
    const plan = planFromSettings(await fetchGrokSettings(host, tierToken));
    return plan ? { ...usage, plan } : usage;
  }

  // Neither path produced usage. A token verdict (auth-missing / rate-limited)
  // outranks the cookie's, since the token path is the one we ask the user to
  // fix. Otherwise distinguish a hard cookie rejection (401/403 → auth-missing)
  // from a transient failure (network throw, 5xx, or an unparseable frame → a
  // `detail`): keep the stored session visible by reporting a preserved `error`
  // so a blip (e.g. a not-yet-ready network at startup) never masquerades as
  // signed out and forces a needless re-login.
  return (
    viaToken.snapshot ??
    viaCookie.snapshot ??
    grokSnapshot("error", now, `grok.com session check failed${grokDetail(viaCookie)}`)
  );
}

/**
 * xAI's OAuth token endpoint and the grant the Grok CLI itself runs. The CLI's
 * access token is short-lived, so a host that can persist the rotated pair uses
 * this to renew it — the `client_id` comes from `~/.grok/auth.json` rather than
 * being hardcoded, since xAI has not published one for third parties.
 */
export const GROK_OAUTH_TOKEN_ENDPOINT = "https://auth.x.ai/oauth2/token";

export interface GrokRefreshedToken {
  accessToken: string;
  refreshToken: string;
  /** Epoch milliseconds. */
  expiresAt: number;
}

interface GrokRefreshResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
}

/**
 * Pure: map a parsed `/oauth2/token` refresh response to a token bundle. Every
 * field is type-checked at runtime (the body is untrusted network JSON) so a
 * malformed 200 — e.g. from a proxy or captive portal — yields undefined, keeping
 * the stale token rather than writing garbage into the credentials file. A
 * rotated refresh token replaces the current one; xAI may omit it, in which case
 * the current one is retained. Requires a finite, positive `expires_in`, or the
 * derived expiry would be "now" and every cycle would re-refresh.
 */
export function parseGrokRefreshResponse(
  body: unknown,
  nowMs: number,
  currentRefreshToken: string,
): GrokRefreshedToken | undefined {
  const data = (body ?? {}) as GrokRefreshResponse;
  if (typeof data.access_token !== "string" || !data.access_token) return undefined;
  if (
    typeof data.expires_in !== "number" ||
    !Number.isFinite(data.expires_in) ||
    data.expires_in <= 0
  ) {
    return undefined;
  }
  const rotated =
    typeof data.refresh_token === "string" && data.refresh_token
      ? data.refresh_token
      : currentRefreshToken;
  return {
    accessToken: data.access_token,
    refreshToken: rotated,
    expiresAt: nowMs + data.expires_in * 1000,
  };
}

/** Exchange a stored Grok refresh token for a fresh access token. */
export async function refreshGrokOAuthToken(
  http: HttpClient,
  input: { refreshToken: string; clientId: string },
  nowMs: number,
): Promise<GrokRefreshedToken | undefined> {
  let res: HttpResponse;
  try {
    res = await http.request({
      method: "POST",
      url: GROK_OAUTH_TOKEN_ENDPOINT,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
        "User-Agent": "Poracode",
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: input.clientId,
        refresh_token: input.refreshToken,
      }).toString(),
      timeoutMs: 15_000,
    });
  } catch {
    return undefined;
  }
  if (res.status < 200 || res.status >= 300) return undefined;
  try {
    return parseGrokRefreshResponse(JSON.parse(res.body), nowMs, input.refreshToken);
  } catch {
    return undefined;
  }
}
