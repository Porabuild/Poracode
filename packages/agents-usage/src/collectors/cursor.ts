import type { CollectOptions, HostPort, HttpResponse } from "../host";
import type { UsageSnapshot, UsageWindow } from "../types";

/**
 * Cursor. Reuses Cursor's session token (which the host reads from the desktop
 * app's `state.vscdb` SQLite store, key `cursorAuth/accessToken`, or — for a
 * CLI-only install — from the `cursor-agent` keychain entry) as the
 * `WorkosCursorSessionToken` cookie and reads the dashboard usage summary — the
 * same endpoint Cursor's own settings page uses. No cookie capture, no browser
 * involvement.
 *
 * Schema (per codexbar) of GET /api/usage-summary → individualUsage.plan:
 *   { used (cents), limit (cents), totalPercentUsed, autoPercentUsed,
 *     apiPercentUsed }  + billingCycleEnd + membershipType. Surfaced as a
 *   Auto and API breakdown windows. The dollar allowance belongs to API usage.
 */

export const CURSOR_USAGE_ENDPOINT = "https://cursor.com/api/usage-summary";

interface CursorPlanUsage {
  used?: number;
  limit?: number;
  totalPercentUsed?: number;
  autoPercentUsed?: number;
  apiPercentUsed?: number;
}
interface CursorOnDemand {
  used?: number;
  limit?: number;
  enabled?: boolean;
}
interface CursorUsageSummary {
  billingCycleStart?: string;
  billingCycleEnd?: string;
  membershipType?: string;
  isUnlimited?: boolean;
  individualUsage?: { plan?: CursorPlanUsage; onDemand?: CursorOnDemand };
}

const MEMBERSHIP_LABELS: Record<string, string> = {
  free: "Cursor Free",
  free_trial: "Cursor Free Trial",
  pro: "Cursor Pro",
  pro_plus: "Cursor Pro+",
  ultra: "Cursor Ultra",
  business: "Cursor Business",
  team: "Cursor Team",
  enterprise: "Cursor Enterprise",
};

function centsToUsd(value: number | undefined): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return Math.max(0, value) / 100;
}

function clampPercent(value: number | undefined): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return Math.min(100, Math.max(0, value));
}

/** billingCycleEnd may be unix seconds/ms (as a string) or ISO-8601. */
function toResetMs(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const n = Number(value);
  if (Number.isFinite(n) && n > 0) return n < 1e12 ? n * 1000 : n;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/** Pure: map a parsed `/api/usage-summary` body to a snapshot. */
export function parseCursorUsage(
  body: unknown,
  account: { plan?: string; email?: string },
  nowMs: number,
): UsageSnapshot {
  const summary = (body ?? {}) as CursorUsageSummary;
  const plan = summary.individualUsage?.plan ?? {};
  const onDemand = summary.individualUsage?.onDemand;
  const resetsAt = toResetMs(summary.billingCycleEnd);
  const withReset = resetsAt !== undefined ? { resetsAt } : {};

  const windows: UsageWindow[] = [];

  const autoPercent = clampPercent(plan.autoPercentUsed);
  if (autoPercent !== undefined) {
    windows.push({
      id: "cursor-auto",
      label: "Auto + Composer",
      usedPercent: autoPercent,
      unit: "percent",
      ...withReset,
    });
  }

  const apiPercent = clampPercent(plan.apiPercentUsed);
  if (apiPercent !== undefined) {
    const used = centsToUsd(plan.used);
    const limit = centsToUsd(plan.limit);
    windows.push({
      id: "cursor-api",
      label: "API",
      usedPercent: apiPercent,
      unit: "percent",
      currency: "USD",
      ...(used !== undefined ? { used } : {}),
      ...(limit !== undefined && limit > 0 ? { limit } : {}),
      ...withReset,
    });
  }

  // On-demand (usage-based) spend, only when the user has enabled it.
  if (onDemand?.enabled) {
    const used = centsToUsd(onDemand.used);
    const limit = centsToUsd(onDemand.limit);
    if (used !== undefined) {
      const pct = limit !== undefined && limit > 0 ? Math.min(100, (used / limit) * 100) : 0;
      windows.push({
        id: "extra-usage",
        label: "On-demand",
        usedPercent: pct,
        unit: "usd",
        currency: "USD",
        used,
        ...(limit !== undefined && limit > 0 ? { limit } : {}),
        ...withReset,
      });
    }
  }

  const membership = summary.membershipType?.trim();
  const planName =
    (membership ? (MEMBERSHIP_LABELS[membership.toLowerCase()] ?? membership) : undefined) ??
    account.plan;

  return {
    providerId: "cursor",
    status: "ok",
    windows,
    fetchedAt: nowMs,
    ...(planName ? { plan: planName } : {}),
    ...(account.email ? { authenticatedAs: account.email } : {}),
  };
}

export async function collectCursor(
  host: HostPort,
  _opts?: CollectOptions,
): Promise<UsageSnapshot> {
  const now = host.now();
  const token = await host.credentials.getOAuthToken("cursor");
  if (!token?.accessToken) {
    return { providerId: "cursor", status: "auth-missing", windows: [], fetchedAt: now };
  }

  // Cursor's web API authenticates via the WorkOS session cookie, whose value is
  // `<userId>::<jwt>` (a bare JWT is rejected with 401). The host derives the
  // userId from the access token's `sub` claim and passes it as `accountId`; when
  // it is absent we fall back to the bare token (preserves prior behavior).
  const cookieValue = token.accountId
    ? `${token.accountId}%3A%3A${token.accessToken}`
    : token.accessToken;
  const res: HttpResponse = await host.http.request({
    method: "GET",
    url: CURSOR_USAGE_ENDPOINT,
    headers: {
      Cookie: `WorkosCursorSessionToken=${cookieValue}`,
      Accept: "application/json",
    },
    timeoutMs: 15_000,
  });

  if (res.status === 401 || res.status === 403) {
    return {
      providerId: "cursor",
      status: "auth-missing",
      windows: [],
      fetchedAt: now,
      error: `session rejected (${res.status})`,
    };
  }
  if (res.status === 429) {
    return { providerId: "cursor", status: "rate-limited", windows: [], fetchedAt: now };
  }
  if (res.status < 200 || res.status >= 300) {
    return {
      providerId: "cursor",
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
      providerId: "cursor",
      status: "error",
      windows: [],
      fetchedAt: now,
      error: "invalid JSON response",
    };
  }

  const account: { plan?: string; email?: string } = {
    ...(token.subscriptionType ? { plan: token.subscriptionType } : {}),
    ...(typeof token.raw?.email === "string" ? { email: token.raw.email } : {}),
  };
  return parseCursorUsage(parsed, account, now);
}
