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
 *   { used (cents), limit (cents), breakdown { included, bonus, total },
 *     totalPercentUsed, autoPercentUsed, apiPercentUsed } + billingCycleEnd +
 *   membershipType. Surfaced as Auto and API windows. API dollars use real
 *   spend over the vendor plan limit; the bar uses apiPercentUsed separately.
 */

export const CURSOR_USAGE_ENDPOINT = "https://cursor.com/api/usage-summary";
/**
 * cursor-agent exchanges a User API key (`crsr_…`) for a short-lived session
 * JWT through this endpoint, then reads DashboardService over api2. Cursor
 * profiles have no isolated CLI login, so this is the documented-for-CLI path
 * that can collect a second account's usage from its key.
 */
export const CURSOR_API_KEY_EXCHANGE_ENDPOINT = "https://api2.cursor.sh/auth/exchange_user_api_key";
export const CURSOR_PERIOD_USAGE_ENDPOINT =
  "https://api2.cursor.sh/aiserver.v1.DashboardService/GetCurrentPeriodUsage";
export const CURSOR_PLAN_INFO_ENDPOINT =
  "https://api2.cursor.sh/aiserver.v1.DashboardService/GetPlanInfo";

interface CursorPlanUsage {
  used?: number;
  limit?: number;
  /** Cents: `included` is the nominal plan allowance; `total` adds any bonus credit. */
  breakdown?: { included?: number; bonus?: number; total?: number };
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
  "pro+": "Cursor Pro+",
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

/**
 * Cursor plan dollars vs API percent are different meters:
 *
 * - `used`/`limit` clamp at the nominal plan price (e.g. $20/$20) and can
 *   understate real spend once bonus credit is consumed.
 * - `breakdown.total` is credits *consumed* (included + bonus spend), not the
 *   allowance — treating it as the limit was CodexBar regression #240.
 * - `apiPercentUsed` drives the bar / "% by reset" pace; it is not a fraction
 *   of the plan dollar cap. Deriving `limit = spend / apiPercent` invents a
 *   nonsense ceiling (e.g. $35.61 / $775 at 4.5%) that is neither spend nor
 *   the Pro included allowance.
 *
 * Surface honest money: real spend over the vendor plan limit. The bar may
 * then disagree with the dollar ratio — that is correct; they measure different
 * things.
 */
function apiDollars(plan: CursorPlanUsage): { used?: number; limit?: number } {
  const reportedUsed = centsToUsd(plan.used);
  const reportedLimit = centsToUsd(plan.limit);
  const breakdownTotal = centsToUsd(plan.breakdown?.total);
  const spend =
    breakdownTotal !== undefined && breakdownTotal > (reportedUsed ?? 0)
      ? breakdownTotal
      : reportedUsed;

  if (spend === undefined) {
    return reportedLimit !== undefined && reportedLimit > 0 ? { limit: reportedLimit } : {};
  }
  return {
    used: spend,
    ...(reportedLimit !== undefined && reportedLimit > 0 ? { limit: reportedLimit } : {}),
  };
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
    windows.push({
      id: "cursor-api",
      label: "API",
      usedPercent: apiPercent,
      unit: "percent",
      currency: "USD",
      ...apiDollars(plan),
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

interface CursorPeriodPlanUsage {
  totalSpend?: number;
  includedSpend?: number;
  remaining?: number;
  limit?: number;
  autoPercentUsed?: number;
  apiPercentUsed?: number;
  totalPercentUsed?: number;
}

interface CursorPeriodUsage {
  billingCycleStart?: string;
  billingCycleEnd?: string;
  membershipType?: string;
  planUsage?: CursorPeriodPlanUsage;
}

interface CursorPlanInfo {
  planInfo?: { planName?: string };
}

/** Map api2 `GetCurrentPeriodUsage` onto the dashboard usage-summary parser. */
export function parseCursorPeriodUsage(
  body: unknown,
  account: { plan?: string; email?: string },
  nowMs: number,
  providerId = "cursor",
): UsageSnapshot {
  const period = (body ?? {}) as CursorPeriodUsage;
  const plan = period.planUsage ?? {};
  const snapshot = parseCursorUsage(
    {
      billingCycleEnd: period.billingCycleEnd,
      membershipType: period.membershipType,
      individualUsage: {
        plan: {
          used: plan.totalSpend,
          limit: plan.limit,
          autoPercentUsed: plan.autoPercentUsed,
          apiPercentUsed: plan.apiPercentUsed,
          totalPercentUsed: plan.totalPercentUsed,
          breakdown: {
            included: plan.includedSpend,
            total: plan.totalSpend,
          },
        },
      },
    },
    account,
    nowMs,
  );
  return { ...snapshot, providerId };
}

function emailFromJwt(accessToken: string): string | undefined {
  const payload = accessToken.split(".")[1];
  if (!payload) return undefined;
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      email?: unknown;
    };
    return typeof claims.email === "string" && claims.email.trim()
      ? claims.email.trim()
      : undefined;
  } catch {
    return undefined;
  }
}

function cursorDashboardHeaders(accessToken: string): Record<string, string> {
  return {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    "Connect-Protocol-Version": "1",
  };
}

async function postCursorJson(
  host: HostPort,
  url: string,
  headers: Record<string, string>,
): Promise<HttpResponse> {
  return host.http.request({
    method: "POST",
    url,
    headers,
    body: "{}",
    timeoutMs: 15_000,
  });
}

function httpFailureSnapshot(
  providerId: string,
  now: number,
  status: number,
): UsageSnapshot | undefined {
  if (status === 401 || status === 403) {
    return {
      providerId,
      status: "auth-missing",
      windows: [],
      fetchedAt: now,
      error: `session rejected (${status})`,
    };
  }
  if (status === 429) {
    return { providerId, status: "rate-limited", windows: [], fetchedAt: now };
  }
  if (status < 200 || status >= 300) {
    return {
      providerId,
      status: "error",
      windows: [],
      fetchedAt: now,
      error: `HTTP ${status}`,
    };
  }
  return undefined;
}

/**
 * Collect Cursor usage for an account that authenticates with a User API key
 * (Cursor profiles). Exchanges the key the same way `cursor-agent` does, then
 * reads the current billing-period summary. Failures never throw.
 */
export async function collectCursorFromApiKey(
  host: HostPort,
  apiKey: string,
  providerId = "cursor",
): Promise<UsageSnapshot> {
  const now = host.now();
  try {
    return await collectCursorFromApiKeyUnchecked(host, apiKey, providerId, now);
  } catch (error) {
    return {
      providerId,
      status: "error",
      windows: [],
      fetchedAt: now,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function collectCursorFromApiKeyUnchecked(
  host: HostPort,
  apiKey: string,
  providerId: string,
  now: number,
): Promise<UsageSnapshot> {
  const key = apiKey.trim();
  if (!key) {
    return { providerId, status: "auth-missing", windows: [], fetchedAt: now };
  }

  const exchanged = await postCursorJson(host, CURSOR_API_KEY_EXCHANGE_ENDPOINT, {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  });
  const exchangeFailure = httpFailureSnapshot(providerId, now, exchanged.status);
  if (exchangeFailure) return exchangeFailure;

  let accessToken: string | undefined;
  try {
    const parsed = JSON.parse(exchanged.body) as { accessToken?: unknown };
    accessToken = typeof parsed.accessToken === "string" ? parsed.accessToken.trim() : undefined;
  } catch {
    return {
      providerId,
      status: "error",
      windows: [],
      fetchedAt: now,
      error: "invalid JSON response",
    };
  }
  if (!accessToken) {
    return { providerId, status: "auth-missing", windows: [], fetchedAt: now };
  }

  const headers = cursorDashboardHeaders(accessToken);
  const [usageRes, planRes] = await Promise.all([
    postCursorJson(host, CURSOR_PERIOD_USAGE_ENDPOINT, headers),
    postCursorJson(host, CURSOR_PLAN_INFO_ENDPOINT, headers).catch(() => undefined),
  ]);
  const usageFailure = httpFailureSnapshot(providerId, now, usageRes.status);
  if (usageFailure) return usageFailure;

  let usageBody: unknown;
  try {
    usageBody = JSON.parse(usageRes.body);
  } catch {
    return {
      providerId,
      status: "error",
      windows: [],
      fetchedAt: now,
      error: "invalid JSON response",
    };
  }

  let planName: string | undefined;
  if (planRes && planRes.status >= 200 && planRes.status < 300) {
    try {
      const planBody = JSON.parse(planRes.body) as CursorPlanInfo;
      const name = planBody.planInfo?.planName?.trim();
      planName = name ? (MEMBERSHIP_LABELS[name.toLowerCase()] ?? name) : undefined;
    } catch {
      planName = undefined;
    }
  }

  const email = emailFromJwt(accessToken);
  return parseCursorPeriodUsage(
    usageBody,
    {
      ...(planName ? { plan: planName } : {}),
      ...(email ? { email } : {}),
    },
    now,
    providerId,
  );
}
