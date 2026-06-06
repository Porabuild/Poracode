import { DEFAULT_CLIENT_VERSIONS } from "../clientVersions";
import { normalizePercent, toEpochMs } from "../formatters";
import type { CollectOptions, HostPort } from "../host";
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
  normalize: (value: number | undefined) => number | undefined = normalizePercent,
): UsageWindow | undefined {
  const usedPercent = normalize(raw?.utilization);
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

function normalizeClaudeSessionPercent(value: number | undefined): number | undefined {
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
    windowFrom("session-5h", "Session (5h)", data.five_hour, normalizeClaudeSessionPercent),
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
      normalizePercent(data.extra_usage.utilization) ??
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
