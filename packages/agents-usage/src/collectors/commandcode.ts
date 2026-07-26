import { toEpochMs } from "../formatters";
import type { CollectOptions, HostPort, HttpClient, HttpResponse } from "../host";
import type { UsageSnapshot, UsageWindow } from "../types";

/**
 * Command Code v1.4.1 reads the CLI API key from
 * `COMMAND_CODE_API_KEY`/`~/.commandcode/auth.json` and calls its authenticated
 * `/alpha/*` API directly. The usage flow mirrors the CLI:
 *
 *   GET /alpha/whoami
 *   GET /alpha/billing/credits
 *   GET /alpha/billing/subscriptions
 *   GET /alpha/usage/summary?since=<currentPeriodStart>
 *
 * Organization accounts include `orgId` on the three billing requests. Usage
 * is a monthly USD credit pool, normalized into the shared snapshot shape.
 */

const COMMANDCODE_BASE = "https://api.commandcode.ai";
export const COMMANDCODE_WHOAMI_ENDPOINT = `${COMMANDCODE_BASE}/alpha/whoami`;
export const COMMANDCODE_BILLING_CREDITS_ENDPOINT = `${COMMANDCODE_BASE}/alpha/billing/credits`;
export const COMMANDCODE_BILLING_SUBSCRIPTIONS_ENDPOINT = `${COMMANDCODE_BASE}/alpha/billing/subscriptions`;
export const COMMANDCODE_USAGE_SUMMARY_ENDPOINT = `${COMMANDCODE_BASE}/alpha/usage/summary`;

export const COMMANDCODE_PROVIDER_ID = "commandcode" as const;

interface CommandCodeWhoamiBody {
  user?: {
    id?: string;
    name?: string;
    email?: string;
    userName?: string;
  };
  org?: {
    id?: string;
    name?: string;
    login?: string;
  } | null;
}

interface CommandCodeCreditsBody {
  credits?: {
    monthlyCredits?: number | string;
    purchasedCredits?: number | string;
    freeCredits?: number | string;
  };
}

interface CommandCodeUsageSummaryBody {
  totalCost?: number | string;
}

interface CommandCodeSubscriptionsBody {
  data?: {
    planId?: string;
    currentPeriodStart?: string;
    currentPeriodEnd?: string;
    status?: string;
  };
}

const COMMANDCODE_PLANS: Record<string, { label: string; monthlyCredits: number }> = {
  "individual-go": { label: "Go", monthlyCredits: 10 },
  "individual-pro": { label: "Pro", monthlyCredits: 30 },
  "individual-provider": { label: "Provider", monthlyCredits: 15 },
  "individual-max": { label: "Max", monthlyCredits: 150 },
  "individual-ultra": { label: "Ultra", monthlyCredits: 300 },
  "teams-pro": { label: "Teams Pro", monthlyCredits: 40 },
};
const COMMANDCODE_PLAN_IDS = Object.keys(COMMANDCODE_PLANS).sort((a, b) => b.length - a.length);

function commandCodePlan(
  value: string | undefined,
): { label: string; monthlyCredits: number } | undefined {
  const normalized = value?.trim().toLowerCase().replaceAll("_", "-");
  if (!normalized) return undefined;
  const id = COMMANDCODE_PLAN_IDS.find((candidate) => normalized.startsWith(candidate));
  return id ? COMMANDCODE_PLANS[id] : undefined;
}

/** Map a Command Code plan id to the label used by its v1.4.1 CLI. */
export function formatCommandCodePlanLabel(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  return commandCodePlan(trimmed)?.label ?? trimmed;
}

function numeric(value: number | string | undefined): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function nonNegative(value: number | string | undefined): number {
  return Math.max(0, numeric(value) ?? 0);
}

/**
 * Pure: project the v1 billing responses into the monthly credit bar. For an
 * active known plan, use the plan allocation as the pool floor exactly as the
 * CLI does; otherwise reconstruct the pool from remaining + reported spend.
 */
export function parseCommandCodeUsage(
  creditsBody: unknown,
  summaryBody: unknown,
  subscriptionsBody: unknown,
  nowMs: number,
  whoamiBody?: unknown,
): UsageSnapshot {
  const credits = ((creditsBody ?? {}) as CommandCodeCreditsBody).credits;
  const summary = (summaryBody ?? {}) as CommandCodeUsageSummaryBody;
  const subscription = ((subscriptionsBody ?? {}) as CommandCodeSubscriptionsBody).data;
  const whoami = (whoamiBody ?? {}) as CommandCodeWhoamiBody;

  const monthlyRemaining = nonNegative(credits?.monthlyCredits);
  const purchasedRemaining = nonNegative(credits?.purchasedCredits);
  const freeRemaining = nonNegative(credits?.freeCredits);
  const totalRemaining = monthlyRemaining + purchasedRemaining + freeRemaining;
  const totalSpent = nonNegative(summary.totalCost);
  const knownPlan = commandCodePlan(subscription?.planId);
  const activePlanAllocation =
    subscription?.status === "active" ? knownPlan?.monthlyCredits : undefined;
  const totalPool =
    activePlanAllocation !== undefined
      ? Math.max(activePlanAllocation, monthlyRemaining) + purchasedRemaining + freeRemaining
      : totalSpent + totalRemaining;
  const used = Math.max(0, totalPool - totalRemaining);
  const usedPercent = totalPool > 0 ? Math.min(100, (used / totalPool) * 100) : 0;
  const resetsAt = toEpochMs(subscription?.currentPeriodEnd);

  const hasCreditData = credits !== undefined || summary.totalCost !== undefined;
  const monthlyWindow: UsageWindow = {
    id: "monthly",
    label: "Monthly credits",
    usedPercent,
    unit: "usd",
    currency: "USD",
    ...(hasCreditData ? { used: Number(used.toFixed(4)) } : {}),
    ...(totalPool > 0 ? { limit: Number(totalPool.toFixed(4)) } : {}),
    ...(resetsAt !== undefined ? { resetsAt } : {}),
  };

  const plan = formatCommandCodePlanLabel(subscription?.planId);
  const authenticatedAs =
    whoami.user?.email?.trim() ||
    whoami.user?.userName?.trim() ||
    whoami.user?.name?.trim() ||
    whoami.org?.name?.trim();
  return {
    providerId: COMMANDCODE_PROVIDER_ID,
    status: "ok",
    windows: [monthlyWindow],
    fetchedAt: nowMs,
    ...(plan ? { plan } : {}),
    ...(authenticatedAs ? { authenticatedAs } : {}),
  };
}

function commandCodeRequest(http: HttpClient, url: string, apiKey: string): Promise<HttpResponse> {
  return http.request({
    method: "GET",
    url,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    timeoutMs: 15_000,
  });
}

function queryEndpoint(endpoint: string, params: Record<string, string | undefined>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) query.set(key, value);
  }
  const suffix = query.toString();
  return suffix ? `${endpoint}?${suffix}` : endpoint;
}

function parseJson(res: HttpResponse): unknown {
  try {
    return JSON.parse(res.body);
  } catch {
    return undefined;
  }
}

function commandCodeSnapshot(
  status: UsageSnapshot["status"],
  now: number,
  error?: string,
): UsageSnapshot {
  return {
    providerId: COMMANDCODE_PROVIDER_ID,
    status,
    windows: [],
    fetchedAt: now,
    ...(error ? { error } : {}),
  };
}

function responseFailure(responses: HttpResponse[], now: number): UsageSnapshot | undefined {
  if (responses.some((response) => response.status === 401 || response.status === 403)) {
    return commandCodeSnapshot("auth-missing", now);
  }
  if (responses.some((response) => response.status === 429)) {
    return commandCodeSnapshot("rate-limited", now);
  }
  const failed = responses.find((response) => response.status < 200 || response.status >= 300);
  return failed ? commandCodeSnapshot("error", now, `HTTP ${failed.status}`) : undefined;
}

/** Collect usage with the same API-key and `/alpha/*` flow as Command Code v1.4.1. */
export async function collectCommandCode(
  host: HostPort,
  _opts?: CollectOptions,
): Promise<UsageSnapshot> {
  const now = host.now();
  const token = await host.credentials.getOAuthToken(COMMANDCODE_PROVIDER_ID);
  if (!token?.accessToken) return commandCodeSnapshot("auth-missing", now);

  let whoamiResponse: HttpResponse;
  try {
    whoamiResponse = await commandCodeRequest(
      host.http,
      COMMANDCODE_WHOAMI_ENDPOINT,
      token.accessToken,
    );
  } catch {
    return commandCodeSnapshot("error", now);
  }
  const whoamiFailure = responseFailure([whoamiResponse], now);
  if (whoamiFailure) return whoamiFailure;

  const parsedWhoami = parseJson(whoamiResponse);
  if (parsedWhoami === undefined) {
    return commandCodeSnapshot("error", now, "invalid JSON response");
  }
  const whoami = (parsedWhoami ?? {}) as CommandCodeWhoamiBody;
  const orgId = whoami.org?.id?.trim() || undefined;
  let creditsResponse: HttpResponse;
  let subscriptionsResponse: HttpResponse;
  try {
    [creditsResponse, subscriptionsResponse] = await Promise.all([
      commandCodeRequest(
        host.http,
        queryEndpoint(COMMANDCODE_BILLING_CREDITS_ENDPOINT, { orgId }),
        token.accessToken,
      ),
      commandCodeRequest(
        host.http,
        queryEndpoint(COMMANDCODE_BILLING_SUBSCRIPTIONS_ENDPOINT, { orgId }),
        token.accessToken,
      ),
    ]);
  } catch {
    return commandCodeSnapshot("error", now);
  }
  const billingFailure = responseFailure([creditsResponse, subscriptionsResponse], now);
  if (billingFailure) return billingFailure;

  const credits = parseJson(creditsResponse);
  const parsedSubscriptions = parseJson(subscriptionsResponse);
  if (credits === undefined || parsedSubscriptions === undefined) {
    return commandCodeSnapshot("error", now, "invalid JSON response");
  }
  const subscriptions = (parsedSubscriptions ?? {}) as CommandCodeSubscriptionsBody;
  const since = subscriptions.data?.currentPeriodStart;
  let summaryResponse: HttpResponse;
  try {
    summaryResponse = await commandCodeRequest(
      host.http,
      queryEndpoint(COMMANDCODE_USAGE_SUMMARY_ENDPOINT, { orgId, since }),
      token.accessToken,
    );
  } catch {
    return commandCodeSnapshot("error", now);
  }
  const summaryFailure = responseFailure([summaryResponse], now);
  if (summaryFailure) return summaryFailure;
  const summary = parseJson(summaryResponse);
  if (summary === undefined) {
    return commandCodeSnapshot("error", now, "invalid JSON response");
  }

  return parseCommandCodeUsage(credits, summary, subscriptions, now, whoami);
}
