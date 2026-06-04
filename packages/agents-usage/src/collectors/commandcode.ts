import { toEpochMs } from "../formatters";
import type { CollectOptions, HostPort, HttpClient, HttpResponse } from "../host";
import type { UsageSnapshot, UsageWindow } from "../types";

/**
 * Command Code (api.commandcode.ai). The CLI ships a long-lived API key in
 * `~/.commandcode/auth.json`, but the public Provider API at `/provider/v1/*`
 * has no usage or billing endpoints — and the key is rejected (401) by the
 * studio's `/internal/*` routes. Usage therefore flows through the same
 * in-app browser login as Grok/OpenCode: the user signs in at commandcode.ai,
 * we capture the session cookie, and forward it to the studio's undocumented
 * internal billing/usage routes. Endpoints are private and may rotate without
 * notice; responses are normalized into the shared `UsageSnapshot` shape.
 *
 *   GET /auth/get-session            → session probe (null body = signed out)
 *   GET /internal/billing/credits    → { credits: { monthlyCredits, purchasedCredits, ... } }
 *   GET /internal/usage/summary      → { totalCost, totalTokensIn, totalTokensOut, ... }
 *   GET /internal/billing/subscriptions → { success, data: { planId, currentPeriodEnd, ... } }
 *
 * Command Code is pay-as-you-go within a monthly credit cap (no rate-limit
 * windows), so the snapshot surfaces a single `monthly` `usd` window whose
 * `used` is consumed this cycle and whose `limit` is the original monthly
 * allocation (`monthlyCredits + totalCost`). The bar is the single source of
 * truth — the snapshot intentionally does NOT carry `cost`/`credits`/`tokens`,
 * which the panel's meta block would otherwise re-render as duplicates.
 */

const COMMANDCODE_BASE = "https://api.commandcode.ai";
export const COMMANDCODE_AUTH_SESSION_ENDPOINT = `${COMMANDCODE_BASE}/auth/get-session`;
export const COMMANDCODE_BILLING_CREDITS_ENDPOINT = `${COMMANDCODE_BASE}/internal/billing/credits`;
export const COMMANDCODE_USAGE_SUMMARY_ENDPOINT = `${COMMANDCODE_BASE}/internal/usage/summary`;
export const COMMANDCODE_BILLING_SUBSCRIPTIONS_ENDPOINT = `${COMMANDCODE_BASE}/internal/billing/subscriptions`;

export const COMMANDCODE_PROVIDER_ID = "commandcode" as const;

interface CommandCodeCreditsBody {
  credits?: {
    monthlyCredits?: number;
  };
}

interface CommandCodeUsageSummaryBody {
  totalCost?: number;
}

interface CommandCodeSubscriptionsBody {
  success?: boolean;
  data?: {
    planId?: string;
    currentPeriodStart?: string;
    currentPeriodEnd?: string;
    status?: string;
    cancelAtPeriodEnd?: boolean;
  };
}

const COMMANDCODE_PLAN_LABELS: Record<string, string> = {
  "individual-go": "Go",
  "individual-pro": "Pro",
  "individual-max": "Max",
  "individual-ultra": "Ultra",
  "team-pro": "Team Pro",
  "team-business": "Team Business",
  "team-enterprise": "Team Enterprise",
  enterprise: "Enterprise",
  "open-source": "Open Source",
  free: "Free",
};

/** Map a `planId` from /internal/billing/subscriptions to a display name. */
export function formatCommandCodePlanLabel(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  return COMMANDCODE_PLAN_LABELS[trimmed] ?? trimmed;
}

function numeric(value: number | string | undefined): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

/**
 * Pure: map parsed studio responses to a `UsageSnapshot`. The bar already shows
 * used/limit/reset in $ for a `usd` window, so the snapshot intentionally
 * carries NO `cost`, `credits`, or `tokens` field — the panel's meta block
 * would otherwise duplicate the bar (e.g. `~$0.01 · ... · est.` plus
 * `Credits: $9.99` under a bar that already says `$0.01 / $10.00`). The
 * remaining balance is implicit in `limit - used`; the period is implicit in
 * `resetsAt`.
 */
export function parseCommandCodeUsage(
  creditsBody: unknown,
  summaryBody: unknown,
  subscriptionsBody: unknown,
  nowMs: number,
): UsageSnapshot {
  const credits = ((creditsBody ?? {}) as CommandCodeCreditsBody).credits ?? {};
  const summary = (summaryBody ?? {}) as CommandCodeUsageSummaryBody;
  const subscription = ((subscriptionsBody ?? {}) as CommandCodeSubscriptionsBody).data ?? {};

  const remainingMonthly = numeric(credits.monthlyCredits) ?? 0;
  const hasConsumed = summary.totalCost !== undefined;
  const consumed = numeric(summary.totalCost) ?? 0;
  const monthlyAllocation = remainingMonthly + consumed;

  const usedPercent =
    monthlyAllocation > 0 ? Math.min(100, Math.max(0, (consumed / monthlyAllocation) * 100)) : 0;
  const resetsAt = toEpochMs(subscription.currentPeriodEnd);

  const monthlyWindow: UsageWindow = {
    id: "monthly",
    label: "Monthly credits",
    usedPercent,
    unit: "usd",
    currency: "USD",
    ...(hasConsumed ? { used: Number(consumed.toFixed(4)) } : {}),
    ...(monthlyAllocation > 0 ? { limit: Number(monthlyAllocation.toFixed(4)) } : {}),
    ...(resetsAt !== undefined ? { resetsAt } : {}),
  };

  const plan = formatCommandCodePlanLabel(subscription.planId);
  const snapshot: UsageSnapshot = {
    providerId: COMMANDCODE_PROVIDER_ID,
    status: "ok",
    windows: [monthlyWindow],
    fetchedAt: nowMs,
  };
  if (plan) snapshot.plan = plan;
  return snapshot;
}

function commandCodeRequest(
  http: HttpClient,
  method: "GET" | "POST",
  url: string,
  cookie: string,
  timeoutMs: number,
): Promise<HttpResponse> {
  return http.request({
    method,
    url,
    headers: {
      Cookie: cookie,
      Accept: "application/json",
      "Content-Type": "application/json",
      Origin: "https://commandcode.ai",
      Referer: "https://commandcode.ai/",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36",
    },
    timeoutMs,
  });
}

/**
 * True iff the captured `Cookie` header authenticates as a live commandcode.ai
 * session. `GET /auth/get-session` returns 200 + a JSON object when signed in
 * and 200 + literal `null` (or an empty body) when signed out — so a non-null
 * parsed body is the simplest "is live" signal.
 */
export async function isCommandCodeSessionLive(
  http: HttpClient,
  cookieHeader: string,
): Promise<boolean> {
  if (!cookieHeader) return false;
  const res = await commandCodeRequest(
    http,
    "GET",
    COMMANDCODE_AUTH_SESSION_ENDPOINT,
    cookieHeader,
    5_000,
  );
  if (res.status < 200 || res.status >= 300) return false;
  const body = res.body.trim();
  if (!body || body === "null") return false;
  try {
    const parsed = JSON.parse(body) as unknown;
    return parsed !== null && typeof parsed === "object";
  } catch {
    return false;
  }
}

async function fetchJson(http: HttpClient, url: string, cookie: string): Promise<unknown> {
  const res = await commandCodeRequest(http, "GET", url, cookie, 15_000);
  if (res.status === 401 || res.status === 403) {
    return { __authMissing: true, status: res.status };
  }
  if (res.status < 200 || res.status >= 300) {
    return { __error: `HTTP ${res.status}` };
  }
  try {
    return JSON.parse(res.body);
  } catch {
    return { __error: "invalid JSON response" };
  }
}

/**
 * Collect Command Code usage via the captured browser session cookie. Returns
 * an `auth-missing` snapshot when no cookie has been stored, distinguishing it
 * from a transient error so the UI can prompt for sign-in.
 */
export async function collectCommandCode(
  host: HostPort,
  _opts?: CollectOptions,
): Promise<UsageSnapshot> {
  const now = host.now();
  const cookie = await host.credentials.getSecret(COMMANDCODE_PROVIDER_ID, "cookie");
  if (!cookie) {
    return {
      providerId: COMMANDCODE_PROVIDER_ID,
      status: "auth-missing",
      windows: [],
      fetchedAt: now,
    };
  }

  let live = false;
  try {
    live = await isCommandCodeSessionLive(host.http, cookie);
  } catch {
    live = false;
  }
  if (!live) {
    return {
      providerId: COMMANDCODE_PROVIDER_ID,
      status: "auth-missing",
      windows: [],
      fetchedAt: now,
    };
  }

  const [credits, summary, subscriptions] = await Promise.all([
    fetchJson(host.http, COMMANDCODE_BILLING_CREDITS_ENDPOINT, cookie),
    fetchJson(host.http, COMMANDCODE_USAGE_SUMMARY_ENDPOINT, cookie),
    fetchJson(host.http, COMMANDCODE_BILLING_SUBSCRIPTIONS_ENDPOINT, cookie),
  ]);

  if (
    (credits as { __authMissing?: boolean })?.__authMissing ||
    (summary as { __authMissing?: boolean })?.__authMissing ||
    (subscriptions as { __authMissing?: boolean })?.__authMissing
  ) {
    return {
      providerId: COMMANDCODE_PROVIDER_ID,
      status: "auth-missing",
      windows: [],
      fetchedAt: now,
    };
  }

  return parseCommandCodeUsage(credits, summary, subscriptions, now);
}
