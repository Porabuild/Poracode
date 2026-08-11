import { toEpochMs } from "../formatters";
import type { CollectOptions, HostPort, HttpClient, HttpResponse } from "../host";
import type { UsageSnapshot, UsageWindow } from "../types";

/**
 * Command Code reads the CLI API key from
 * `COMMAND_CODE_API_KEY`/`~/.commandcode/auth.json` and calls its authenticated
 * `/alpha/*` API directly. The usage flow mirrors the CLI (`/usage` overlay):
 *
 *   GET /alpha/whoami
 *   GET /alpha/billing/credits
 *   GET /alpha/billing/subscriptions
 *   GET /alpha/usage/summary?since=<currentPeriodStart>
 *
 * Organization accounts include `orgId` on the three billing requests. Usage is
 * a monthly USD credit pool plus rolling 5-hour and weekly USD caps from
 * `credits.windowLimits` (30% / 60% of the plan's monthly credits on most
 * plans), normalized into the shared snapshot shape.
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

/** Rolling 5h / weekly USD caps from GET /alpha/billing/credits (CLI ≥1.15). */
interface CommandCodeWindowLimit {
  used?: number | string;
  cap?: number | string;
  /** Epoch ms (or seconds) when the rolling window resets. */
  resetAt?: number | string;
}

interface CommandCodeWindowLimits {
  limited?: boolean;
  fiveHour?: CommandCodeWindowLimit | null;
  weekly?: CommandCodeWindowLimit | null;
}

interface CommandCodeCreditsFields {
  monthlyCredits?: number | string;
  purchasedCredits?: number | string;
  freeCredits?: number | string;
  /** Some responses nest windowLimits under the credits object. */
  windowLimits?: CommandCodeWindowLimits;
}

interface CommandCodeCreditsBody {
  credits?: CommandCodeCreditsFields;
  /**
   * Present on current APIs: plan has rolling rate limits. Sibling of the
   * nested `credits` object — same shape the CLI's `projectUsageView` reads
   * (`usageData.credits.windowLimits` where `credits` is the full HTTP body).
   */
  windowLimits?: CommandCodeWindowLimits;
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

/** Plan table aligned with command-code CLI (`$n` / `Fn` maps). */
const COMMANDCODE_PLANS: Record<string, { label: string; monthlyCredits: number }> = {
  "individual-go": { label: "Go", monthlyCredits: 10 },
  "individual-goat": { label: "GOAT", monthlyCredits: 70 },
  "individual-pro": { label: "Pro", monthlyCredits: 30 },
  "individual-pro-v1": { label: "Pro", monthlyCredits: 80 },
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

/** Map a Command Code plan id to the CLI display name. */
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
 * Map a Command Code rolling window (`fiveHour` / `weekly`) into a shared
 * UsageWindow. Caps are USD slices of the monthly credit pool; the CLI shows
 * them as "5-hour" / "Weekly" meters next to the monthly bar.
 */
function commandCodeRollingWindow(
  id: "session-5h" | "weekly",
  label: string,
  limit: CommandCodeWindowLimit | null | undefined,
): UsageWindow | undefined {
  if (!limit || typeof limit !== "object") return undefined;
  const used = numeric(limit.used);
  const cap = numeric(limit.cap);
  if (used === undefined && cap === undefined) return undefined;
  const usedValue = Math.max(0, used ?? 0);
  const capValue = cap !== undefined && cap > 0 ? cap : undefined;
  const usedPercent =
    capValue !== undefined ? Math.min(100, (usedValue / capValue) * 100) : usedValue > 0 ? 100 : 0;
  const resetsAt = toEpochMs(limit.resetAt);
  return {
    id,
    label,
    usedPercent,
    unit: "usd",
    currency: "USD",
    used: Number(usedValue.toFixed(4)),
    ...(capValue !== undefined ? { limit: Number(capValue.toFixed(4)) } : {}),
    ...(resetsAt !== undefined ? { resetsAt } : {}),
  };
}

/**
 * Pure: project the billing responses into monthly credits plus rolling 5h /
 * weekly USD caps. For an active known plan, use the plan allocation as the
 * monthly pool floor exactly as the CLI does; otherwise reconstruct the pool
 * from remaining + reported spend. Rolling windows come from
 * `credits.windowLimits` when the API returns them.
 */
export function parseCommandCodeUsage(
  creditsBody: unknown,
  summaryBody: unknown,
  subscriptionsBody: unknown,
  nowMs: number,
  whoamiBody?: unknown,
): UsageSnapshot {
  const body = (creditsBody ?? {}) as CommandCodeCreditsBody;
  // windowLimits is a sibling of the nested `credits` object on the HTTP body
  // (CLI: `usageData.credits?.windowLimits`). Tolerate a nested copy too.
  const credits = body.credits;
  const windowLimits = body.windowLimits ?? credits?.windowLimits;
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

  // Match CLI / Studio order: 5-hour, weekly, then monthly pool.
  const windows: UsageWindow[] = [];
  const fiveHour = commandCodeRollingWindow("session-5h", "5-hour limit", windowLimits?.fiveHour);
  const weekly = commandCodeRollingWindow("weekly", "Weekly limit", windowLimits?.weekly);
  if (fiveHour) windows.push(fiveHour);
  if (weekly) windows.push(weekly);
  windows.push(monthlyWindow);

  const plan = formatCommandCodePlanLabel(subscription?.planId);
  const authenticatedAs =
    whoami.user?.email?.trim() ||
    whoami.user?.userName?.trim() ||
    whoami.user?.name?.trim() ||
    whoami.org?.name?.trim();
  return {
    providerId: COMMANDCODE_PROVIDER_ID,
    status: "ok",
    windows,
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

/** Collect usage with the same API-key and `/alpha/*` flow as the Command Code CLI. */
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
