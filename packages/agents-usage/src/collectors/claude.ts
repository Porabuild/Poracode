import { DEFAULT_CLIENT_VERSIONS } from "../clientVersions";
import { toEpochMs } from "../formatters";
import type { CollectOptions, HostPort, HttpClient, HttpResponse } from "../host";
import type { UsageSnapshot, UsageWindow, UsageWindowId } from "../types";

/**
 * Claude (Anthropic / Claude Code). Reuses the Claude Code OAuth access token
 * the host resolves from ~/.claude/.credentials.json (or, on native Windows,
 * the Windows Credential Manager) and reads the same usage endpoint the CLI
 * uses. Utilization windows are reported directly by the API — never estimated.
 */

export const CLAUDE_USAGE_ENDPOINT = "https://api.anthropic.com/api/oauth/usage";
export const CLAUDE_OAUTH_BETA = "oauth-2025-04-20";

interface ClaudeWindowRaw {
  utilization?: number;
  resets_at?: string | null;
}

interface ClaudeUsageResponse {
  five_hour?: ClaudeWindowRaw;
  seven_day?: ClaudeWindowRaw;
  seven_day_opus?: ClaudeWindowRaw;
  seven_day_sonnet?: ClaudeWindowRaw;
  /** Pay-as-you-go overage, billed in `currency` (USD) — not a rate window. */
  extra_usage?: {
    is_enabled?: boolean;
    monthly_limit?: number;
    used_credits?: number;
    utilization?: number;
    currency?: string;
  };
}

function titleCase(value: string): string {
  return value
    .split(/[\s_-]+/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

/** Render a subscription type like "claude_pro" as "Claude Pro Subscription". */
export function formatClaudePlan(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  return /subscription$/i.test(trimmed) ? titleCase(trimmed) : `${titleCase(trimmed)} Subscription`;
}

function windowFrom(
  id: UsageWindowId,
  label: string,
  raw: ClaudeWindowRaw | undefined,
): UsageWindow | undefined {
  const usedPercent = normalizeClaudePercent(raw?.utilization);
  if (usedPercent === undefined) return undefined;
  const resetsAt = toEpochMs(raw?.resets_at);
  return {
    id,
    label,
    usedPercent,
    unit: "percent",
    ...(resetsAt !== undefined ? { resetsAt } : {}),
  };
}

/**
 * The Claude `/api/oauth/usage` endpoint reports `utilization` already in
 * percent (0-100) for every window — session, weekly, and overage alike. Clamp
 * to 0-100 and round to one decimal; never rescale (a value of 1 means 1%, not
 * the fraction 1.0 → 100%).
 */
function normalizeClaudePercent(value: number | undefined): number | undefined {
  if (value === undefined || !Number.isFinite(value) || value < 0) return undefined;
  return Math.min(100, Math.max(0, Math.round(value * 10) / 10));
}

/** Pure: map a parsed `/api/oauth/usage` body to a snapshot. */
export function parseClaudeUsage(
  body: unknown,
  nowMs: number,
  meta: { plan?: string; authenticatedAs?: string } = {},
): UsageSnapshot {
  const data = (body ?? {}) as ClaudeUsageResponse;
  const windows: UsageWindow[] = [];
  for (const w of [
    windowFrom("session-5h", "Session (5h)", data.five_hour),
    windowFrom("weekly", "Weekly", data.seven_day),
    windowFrom("weekly-opus", "Weekly (Opus)", data.seven_day_opus),
    windowFrom("weekly-sonnet", "Weekly (Sonnet)", data.seven_day_sonnet),
  ]) {
    if (w) windows.push(w);
  }

  // Pay-as-you-go overage: surfaced as its own dollar-denominated "Extra usage"
  // line, NOT as a rate-limit window.
  if (data.extra_usage?.is_enabled) {
    // Anthropic reports these amounts in cents — store dollars for display.
    const usedCents = data.extra_usage.used_credits;
    const limitCents = data.extra_usage.monthly_limit;
    const pct =
      normalizeClaudePercent(data.extra_usage.utilization) ??
      (usedCents !== undefined && limitCents ? Math.min(100, (usedCents / limitCents) * 100) : 0);
    windows.push({
      id: "extra-usage",
      label: "Extra usage",
      usedPercent: pct,
      unit: "usd",
      ...(usedCents !== undefined ? { used: usedCents / 100 } : {}),
      ...(limitCents !== undefined ? { limit: limitCents / 100 } : {}),
      currency: data.extra_usage.currency ?? "USD",
    });
  }

  return {
    providerId: "claude",
    status: "ok",
    windows,
    fetchedAt: nowMs,
    ...(meta.plan ? { plan: meta.plan } : {}),
    ...(meta.authenticatedAs ? { authenticatedAs: meta.authenticatedAs } : {}),
  };
}

export async function collectClaude(
  host: HostPort,
  _opts?: CollectOptions,
): Promise<UsageSnapshot> {
  const now = host.now();
  const token = await host.credentials.getOAuthToken("claude");
  if (!token?.accessToken) {
    return { providerId: "claude", status: "auth-missing", windows: [], fetchedAt: now };
  }

  const version = host.clientVersions?.claudeCode ?? DEFAULT_CLIENT_VERSIONS.claudeCode;
  const res = await host.http.request({
    method: "GET",
    url: CLAUDE_USAGE_ENDPOINT,
    headers: {
      Authorization: `Bearer ${token.accessToken}`,
      "anthropic-beta": CLAUDE_OAUTH_BETA,
      "User-Agent": `claude-code/${version}`,
      Accept: "application/json",
    },
    timeoutMs: 15_000,
  });

  if (res.status === 401) {
    return {
      providerId: "claude",
      status: "auth-missing",
      windows: [],
      fetchedAt: now,
      error: "access token rejected (401)",
    };
  }
  if (res.status === 429) {
    return { providerId: "claude", status: "rate-limited", windows: [], fetchedAt: now };
  }
  if (res.status < 200 || res.status >= 300) {
    return {
      providerId: "claude",
      status: "error",
      windows: [],
      fetchedAt: now,
      error: `HTTP ${res.status}`,
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(res.body);
  } catch {
    return {
      providerId: "claude",
      status: "error",
      windows: [],
      fetchedAt: now,
      error: "invalid JSON response",
    };
  }

  const plan = formatClaudePlan(token.subscriptionType);
  return parseClaudeUsage(parsed, now, plan ? { plan } : {});
}

/**
 * Claude Code OAuth token endpoint and public client id, used to exchange a
 * stored refresh token for a fresh access token — the same grant the CLI runs.
 * The access token is short-lived (~8h); when no running CLI keeps it fresh it
 * expires and the usage endpoint 401s, so a caller that can persist the rotated
 * token uses {@link refreshClaudeOAuthToken} to renew it before collecting.
 */
export const CLAUDE_OAUTH_TOKEN_ENDPOINT = "https://console.anthropic.com/v1/oauth/token";
export const CLAUDE_OAUTH_CLIENT_ID = "9d1c250a-e61b-44d9-88ed-5944d1962f5e";

export interface ClaudeRefreshedToken {
  accessToken: string;
  refreshToken: string;
  /** Epoch milliseconds. */
  expiresAt: number;
}

interface ClaudeRefreshResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
}

/**
 * Pure: map a parsed `/v1/oauth/token` refresh response to a token bundle.
 * Anthropic rotates the refresh token but may omit it from the body, in which
 * case the current one is retained. Every field is type-checked at runtime (the
 * body is untrusted network JSON, not the `as`-cast shape) so a malformed 200 —
 * e.g. from a proxy or captive portal — yields undefined (a failed refresh that
 * keeps the stale token) instead of writing garbage into the credentials file.
 * Requires a finite, positive `expires_in`; otherwise the derived expiry would
 * be "now", marking the token instantly stale and re-refreshing every cycle.
 */
export function parseClaudeRefreshResponse(
  body: unknown,
  nowMs: number,
  currentRefreshToken: string,
): ClaudeRefreshedToken | undefined {
  const data = (body ?? {}) as ClaudeRefreshResponse;
  if (typeof data.access_token !== "string" || !data.access_token) return undefined;
  if (
    typeof data.expires_in !== "number" ||
    !Number.isFinite(data.expires_in) ||
    data.expires_in <= 0
  ) {
    return undefined;
  }
  const refreshToken =
    typeof data.refresh_token === "string" && data.refresh_token
      ? data.refresh_token
      : currentRefreshToken;
  return {
    accessToken: data.access_token,
    refreshToken,
    expiresAt: nowMs + data.expires_in * 1000,
  };
}

/**
 * Exchange a Claude Code refresh token for a fresh access token via the same
 * OAuth endpoint + public client id the CLI uses. Returns undefined on any
 * network error, non-2xx, or unparseable body — the caller then keeps the
 * existing (stale) token, which degrades to "not signed in" exactly as before.
 * Secrets are never logged.
 */
export async function refreshClaudeOAuthToken(
  http: HttpClient,
  refreshToken: string,
  nowMs: number,
  clientVersion?: string,
): Promise<ClaudeRefreshedToken | undefined> {
  const version = clientVersion ?? DEFAULT_CLIENT_VERSIONS.claudeCode;
  let res: HttpResponse;
  try {
    res = await http.request({
      method: "POST",
      url: CLAUDE_OAUTH_TOKEN_ENDPOINT,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": `claude-code/${version}`,
      },
      body: JSON.stringify({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: CLAUDE_OAUTH_CLIENT_ID,
      }),
      timeoutMs: 15_000,
    });
  } catch {
    return undefined;
  }
  if (res.status < 200 || res.status >= 300) return undefined;
  try {
    return parseClaudeRefreshResponse(JSON.parse(res.body), nowMs, refreshToken);
  } catch {
    return undefined;
  }
}
