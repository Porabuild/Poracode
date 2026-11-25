import type { CollectOptions, HostPort, HttpResponse } from "../host";
import type { UsageSnapshot, UsageTokens, UsageWindow, UsageWindowBreakdownItem } from "../types";

/**
 * Cursor. Reuses Cursor Agent's session token (which the host reads from the
 * CLI auth file or keychain) as the
 * `WorkosCursorSessionToken` cookie and reads the dashboard usage summary — the
 * same endpoint Cursor's own settings page uses. No cookie capture, no browser
 * involvement.
 *
 * Schema (per codexbar) of GET /api/usage-summary → individualUsage.plan:
 *   { used (cents), limit (cents), breakdown { included, bonus, total },
 *     totalPercentUsed, autoPercentUsed, apiPercentUsed } + billingCycleEnd +
 *   membershipType. Surfaced as Cursor Models (`autoPercentUsed`) and API
 *   windows. When `DashboardService/GetAggregatedUsageEvents` is available for
 *   the active billing cycle, included API-equivalent spend, per-model
 *   breakdowns, and cycle token counts are split across Cursor Models (tier 2 /
 *   `autoBucketModels`) and API (tier 1). Without those rows the plan's combined
 *   dollars are not attributed to API alone.
 */

export const CURSOR_USAGE_ENDPOINT = "https://cursor.com/api/usage-summary";
export const CURSOR_SHARED_USAGE_ENDPOINT =
  "https://cursor.com/api/dashboard/get-sand-usage-status";
export const CURSOR_BILLING_USAGE_ENDPOINT =
  "https://cursor.com/api/dashboard/v2/usage-status?scope=user";
export const CURSOR_AGGREGATED_USAGE_ENDPOINT =
  "https://api2.cursor.sh/aiserver.v1.DashboardService/GetAggregatedUsageEvents";
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

/** Protobuf int64 fields in ConnectRPC JSON may arrive as numeric strings. */
type NumericValue = number | string | null | undefined;

interface CursorPlanUsage {
  used?: NumericValue;
  limit?: NumericValue;
  /** Cents: `included` is the nominal plan allowance; `total` adds any bonus credit. */
  breakdown?: { included?: NumericValue; bonus?: NumericValue; total?: NumericValue };
  totalPercentUsed?: number;
  autoPercentUsed?: number;
  apiPercentUsed?: number;
}
interface CursorOnDemand {
  used?: NumericValue;
  limit?: NumericValue;
  enabled?: boolean;
}
/** Team/period on-demand meter from `GetCurrentPeriodUsage.spendLimitUsage`. Cents. */
interface CursorSpendLimitUsage {
  totalSpend?: NumericValue;
  individualUsed?: NumericValue;
  pooledUsed?: NumericValue;
  individualLimit?: NumericValue;
  pooledLimit?: NumericValue;
  /** `user` means an individual cap; `team` means the pooled team cap is authoritative. */
  limitType?: string;
}
interface CursorUsageSummary {
  billingCycleStart?: string;
  billingCycleEnd?: string;
  membershipType?: string;
  isUnlimited?: boolean;
  /** Present on some usage-summary payloads when the spend policy is user- or team-scoped. */
  limitType?: string;
  individualUsage?: { plan?: CursorPlanUsage; onDemand?: CursorOnDemand };
  teamUsage?: { onDemand?: CursorOnDemand };
  spendLimitUsage?: CursorSpendLimitUsage;
  autoBucketModels?: readonly string[];
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
  plus: "Cursor Plus",
  premium: "Cursor Premium",
  super: "Cursor Super",
  unified_plus: "Cursor Plus",
  unified_premium: "Cursor Premium",
  unified_super: "Cursor Super",
  unified_ultra: "Cursor Ultra",
};

interface CursorSharedUsage {
  isUnified?: boolean;
  usagePercent?: number;
  hasNonZeroIncludedLimit?: boolean;
  includedLimitZero?: boolean;
  nextResetTimestampUtc?: string;
}

interface CursorBillingUsage {
  availability?: string;
  monthlyUsage?: {
    usedCents?: number;
    limitCents?: number | null;
    periodStart?: string;
    resetsAt?: string;
  };
}

interface CursorAggregatedUsageEvent {
  modelIntent?: string;
  /** Cursor usage tier: `2` = Cursor Models (Auto/Composer/Grok), `1` = API / Other Models. */
  tier?: number;
  totalCents?: NumericValue;
  inputTokens?: NumericValue;
  outputTokens?: NumericValue;
  cacheReadTokens?: NumericValue;
  cacheWriteTokens?: NumericValue;
}

interface CursorAggregatedUsage {
  aggregations?: readonly CursorAggregatedUsageEvent[];
  totalInputTokens?: NumericValue;
  totalOutputTokens?: NumericValue;
  totalCacheReadTokens?: NumericValue;
  totalCacheWriteTokens?: NumericValue;
}

function parseNumeric(value: NumericValue): number | undefined {
  const num =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim() !== ""
        ? Number(value)
        : Number.NaN;
  return Number.isFinite(num) ? num : undefined;
}

function parseTokenCount(value: NumericValue): number {
  const num = parseNumeric(value);
  return num !== undefined && num > 0 ? Math.round(num) : 0;
}

function centsToUsd(value: NumericValue): number | undefined {
  const num = parseNumeric(value);
  if (num === undefined) return undefined;
  return Math.max(0, num) / 100;
}

function clampPercent(value: number | undefined): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return Math.min(100, Math.max(0, value));
}

function finalizeBreakdown(
  byModel: Map<string, { cents: number; tokens: number }>,
): UsageWindowBreakdownItem[] {
  return [...byModel.entries()]
    .map(([label, { cents, tokens }]) => ({
      label,
      used: Math.round(cents) / 100,
      tokens,
    }))
    .filter((item) => item.used > 0 || item.tokens > 0)
    .sort((a, b) => b.used - a.used || b.tokens - a.tokens || a.label.localeCompare(b.label))
    .map(({ label, used, tokens }) => ({
      label,
      ...(used > 0 ? { used, currency: "USD" } : {}),
      ...(tokens > 0 ? { tokens } : {}),
    }));
}

interface ParsedAggregatedUsage {
  autoUsd: number;
  apiUsd: number;
  autoBreakdown: UsageWindowBreakdownItem[];
  apiBreakdown: UsageWindowBreakdownItem[];
  tokens?: UsageTokens;
}

/**
 * Split aggregated included-usage events into Cursor Models (`tier === 2` or in
 * `autoBucketModels`) and API / Other Models (`tier === 1` or outside
 * `autoBucketModels`), capturing per-model breakdowns and cycle token totals.
 * Returns undefined when the payload is absent, empty, or has no classifiable
 * rows so callers leave dollar amounts unsplit rather than guessing.
 */
function parseAggregatedUsage(
  aggregated: unknown,
  autoBucketModels?: readonly string[],
): ParsedAggregatedUsage | undefined {
  if (!aggregated || typeof aggregated !== "object") return undefined;
  const payload = aggregated as CursorAggregatedUsage;
  const entries = payload.aggregations;
  if (!Array.isArray(entries) || entries.length === 0) return undefined;

  const autoModels = new Set(
    (autoBucketModels ?? []).filter((m): m is string => typeof m === "string" && m.length > 0),
  );
  let autoCents = 0;
  let apiCents = 0;
  let classifiedWithSpend = 0;
  const autoByModel = new Map<string, { cents: number; tokens: number }>();
  const apiByModel = new Map<string, { cents: number; tokens: number }>();
  let summedInput = 0;
  let summedOutput = 0;
  let summedCacheRead = 0;
  let summedCacheWrite = 0;

  for (const entry of entries) {
    if (!entry || typeof entry !== "object") continue;

    const input = parseTokenCount(entry.inputTokens);
    const output = parseTokenCount(entry.outputTokens);
    const cacheRead = parseTokenCount(entry.cacheReadTokens);
    const cacheWrite = parseTokenCount(entry.cacheWriteTokens);
    const entryTokens = input + output + cacheRead + cacheWrite;

    const parsedCents = parseNumeric(entry.totalCents);
    let cents: number;
    let hasExplicitSpend = false;
    if (parsedCents !== undefined) {
      if (parsedCents < 0) continue;
      cents = parsedCents;
      hasExplicitSpend = true;
    } else if ((entry.totalCents === undefined || entry.totalCents === null) && entryTokens > 0) {
      // Proto3 JSON omits zero-valued scalar fields; retain $0 token-bearing rows.
      cents = 0;
    } else {
      continue;
    }

    let bucket: "auto" | "api" | undefined;
    if (entry.tier === 2) {
      bucket = "auto";
    } else if (entry.tier === 1) {
      bucket = "api";
    } else if (typeof entry.modelIntent === "string" && autoModels.size > 0) {
      bucket = autoModels.has(entry.modelIntent) ? "auto" : "api";
    }
    if (!bucket) {
      // Never silently drop positive spend we cannot assign to a pool.
      if (cents > 0) return undefined;
      continue;
    }

    if (hasExplicitSpend) classifiedWithSpend++;
    summedInput += input;
    summedOutput += output;
    summedCacheRead += cacheRead;
    summedCacheWrite += cacheWrite;

    if (bucket === "auto") {
      autoCents += cents;
    } else {
      apiCents += cents;
    }

    const modelLabel = typeof entry.modelIntent === "string" ? entry.modelIntent.trim() : "";
    if (modelLabel) {
      const target = bucket === "auto" ? autoByModel : apiByModel;
      const existing = target.get(modelLabel) ?? { cents: 0, tokens: 0 };
      existing.cents += cents;
      existing.tokens += entryTokens;
      target.set(modelLabel, existing);
    }
  }

  if (classifiedWithSpend === 0) return undefined;

  const resolveTokenTotal = (topLevel: NumericValue, summed: number): number => {
    const parsed = parseNumeric(topLevel);
    return parsed !== undefined && parsed >= 0 ? Math.round(parsed) : summed;
  };
  const input = resolveTokenTotal(payload.totalInputTokens, summedInput);
  const output = resolveTokenTotal(payload.totalOutputTokens, summedOutput);
  const cacheRead = resolveTokenTotal(payload.totalCacheReadTokens, summedCacheRead);
  const cacheWrite = resolveTokenTotal(payload.totalCacheWriteTokens, summedCacheWrite);
  const totalTokens = input + output + cacheRead + cacheWrite;

  return {
    autoUsd: Math.round(autoCents) / 100,
    apiUsd: Math.round(apiCents) / 100,
    autoBreakdown: finalizeBreakdown(autoByModel),
    apiBreakdown: finalizeBreakdown(apiByModel),
    ...(totalTokens > 0
      ? {
          tokens: {
            total: totalTokens,
            input,
            output,
            cacheRead,
            ...(cacheWrite > 0 ? { cacheWrite } : {}),
            period: "cycle",
          },
        }
      : {}),
  };
}

interface OnDemandScope {
  used: number;
  limit?: number;
}

function hasPositiveLimit(limit: number | undefined): boolean {
  return limit !== undefined && limit > 0;
}

function hasOnDemandScope(scope: OnDemandScope): boolean {
  return scope.used > 0 || hasPositiveLimit(scope.limit);
}

/**
 * Select one on-demand scope as a unit. Cursor's individual and pooled team
 * meters are not interchangeable: pooled spend must pair with the pooled cap,
 * and personal spend with the personal cap. When the payload does not declare
 * `limitType`, a positive pooled cap means the shared team budget is the
 * authoritative meter.
 */
function selectOnDemandScope(
  limitType: string | undefined,
  individual: OnDemandScope,
  pooled: OnDemandScope,
): OnDemandScope | undefined {
  const normalized = limitType?.trim().toLowerCase();
  const individualValid = hasOnDemandScope(individual);
  const pooledValid = hasOnDemandScope(pooled);
  if ((normalized === "team" || normalized === "pooled") && pooledValid) return pooled;
  if ((normalized === "user" || normalized === "individual") && individualValid) {
    return individual;
  }
  if (pooledValid && hasPositiveLimit(pooled.limit)) return pooled;
  if (individualValid && hasPositiveLimit(individual.limit)) return individual;
  if (pooledValid && pooled.used > 0) return pooled;
  if (individualValid) return individual;
  return pooledValid ? pooled : undefined;
}

function buildOnDemandBreakdown(
  individualUsed: number | undefined,
  individualLimit: number | undefined,
  pooledUsed: number | undefined,
  pooledLimit: number | undefined,
): UsageWindowBreakdownItem[] | undefined {
  if (individualUsed === undefined || pooledUsed === undefined) return undefined;
  const hasTeamPool =
    pooledUsed !== individualUsed ||
    (pooledLimit !== undefined &&
      pooledLimit > 0 &&
      !(individualLimit !== undefined && individualLimit > 0));
  if (!hasTeamPool) return undefined;
  return [
    {
      label: "Personal",
      used: individualUsed,
      currency: "USD",
      ...(individualLimit !== undefined && individualLimit > 0 ? { limit: individualLimit } : {}),
    },
    {
      label: "Team pooled",
      used: pooledUsed,
      currency: "USD",
      ...(pooledLimit !== undefined && pooledLimit > 0 ? { limit: pooledLimit } : {}),
    },
  ];
}

/**
 * Show on-demand when enabled, even before the first charge. Period payloads
 * have no enabled flag, so require a positive spending allowance there.
 * An explicit disabled individual bucket takes precedence over historical spend.
 */
function onDemandDollars(
  summary: CursorUsageSummary,
): { used: number; limit?: number; breakdown?: UsageWindowBreakdownItem[] } | undefined {
  const onDemand = summary.individualUsage?.onDemand;
  if (onDemand?.enabled === false) return undefined;
  if (onDemand?.enabled === true) {
    const individualLimit = centsToUsd(onDemand.limit);
    const teamOnDemand =
      summary.teamUsage?.onDemand?.enabled === false ? undefined : summary.teamUsage?.onDemand;
    const teamLimit = centsToUsd(teamOnDemand?.limit);
    const individualUsed = centsToUsd(onDemand.used) ?? 0;
    const teamUsed = teamOnDemand ? (centsToUsd(teamOnDemand.used) ?? 0) : undefined;
    const individual: OnDemandScope = {
      used: individualUsed,
      ...(individualLimit !== undefined ? { limit: individualLimit } : {}),
    };
    const pooled: OnDemandScope = {
      used: teamUsed ?? 0,
      ...(teamLimit !== undefined ? { limit: teamLimit } : {}),
    };
    const selected =
      selectOnDemandScope(
        summary.limitType ?? summary.spendLimitUsage?.limitType,
        individual,
        pooled,
      ) ?? individual;
    const breakdown = buildOnDemandBreakdown(individualUsed, individualLimit, teamUsed, teamLimit);
    return {
      used: selected.used,
      ...(selected.limit !== undefined && selected.limit > 0 ? { limit: selected.limit } : {}),
      ...(breakdown ? { breakdown } : {}),
    };
  }

  const spend = summary.spendLimitUsage;
  const individualLimit = centsToUsd(spend?.individualLimit);
  const pooledLimit = centsToUsd(spend?.pooledLimit);
  const totalUsed = centsToUsd(spend?.totalSpend);
  const individualUsed = centsToUsd(spend?.individualUsed) ?? totalUsed ?? 0;
  const pooledUsed = centsToUsd(spend?.pooledUsed) ?? totalUsed ?? 0;
  const selected = selectOnDemandScope(
    spend?.limitType ?? summary.limitType,
    {
      used: individualUsed,
      ...(individualLimit !== undefined ? { limit: individualLimit } : {}),
    },
    {
      used: pooledUsed,
      ...(pooledLimit !== undefined ? { limit: pooledLimit } : {}),
    },
  );
  const selectedLimit = selected?.limit;
  if (!selected || selectedLimit === undefined || selectedLimit <= 0) return undefined;
  const breakdown = buildOnDemandBreakdown(
    centsToUsd(spend?.individualUsed),
    individualLimit,
    centsToUsd(spend?.pooledUsed ?? spend?.totalSpend),
    pooledLimit,
  );
  return {
    used: selected.used,
    limit: selectedLimit,
    ...(breakdown ? { breakdown } : {}),
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
  additional?: { shared?: unknown; billing?: unknown; aggregated?: unknown },
): UsageSnapshot {
  const summary = (body ?? {}) as CursorUsageSummary;
  const plan = summary.individualUsage?.plan ?? {};
  const resetsAt = toResetMs(summary.billingCycleEnd);
  const withReset = resetsAt !== undefined ? { resetsAt } : {};
  const membership = summary.membershipType?.trim();
  const planName =
    (membership ? (MEMBERSHIP_LABELS[membership.toLowerCase()] ?? membership) : undefined) ??
    account.plan;

  const windows: UsageWindow[] = [];
  const shared = additional?.shared as CursorSharedUsage | undefined;
  // Ultra exists on both billing systems; the shared-pool flag distinguishes it.
  const unified =
    shared?.isUnified === true ||
    /^(?:unified_|plus$|premium$|super$)/i.test(
      membership ?? account.plan?.replace(/^Cursor /, "") ?? "",
    );

  if (unified) {
    const percent = clampPercent(shared?.usagePercent);
    const reset = toResetMs(shared?.nextResetTimestampUtc);
    const hasLimit =
      shared?.includedLimitZero === undefined
        ? shared?.hasNonZeroIncludedLimit
        : !shared.includedLimitZero;
    if (percent !== undefined && hasLimit === true && reset !== undefined && reset > nowMs) {
      windows.push({
        id: "weekly",
        label: "Weekly",
        usedPercent: percent,
        unit: "percent",
        resetsAt: reset,
      });
    }
    const billing = additional?.billing as CursorBillingUsage | undefined;
    const monthly = billing?.monthlyUsage;
    let cost: UsageSnapshot["cost"];
    const used =
      typeof monthly?.usedCents === "number" && monthly.usedCents >= 0
        ? centsToUsd(monthly.usedCents)
        : undefined;
    const limit =
      typeof monthly?.limitCents === "number" && monthly.limitCents >= 0
        ? centsToUsd(monthly.limitCents)
        : undefined;
    const start = toResetMs(monthly?.periodStart);
    const end = toResetMs(monthly?.resetsAt);
    if (
      billing?.availability === "available" &&
      used !== undefined &&
      start !== undefined &&
      start <= nowMs &&
      end !== undefined &&
      end > nowMs &&
      (used > 0 || (limit ?? 0) > 0)
    ) {
      if (limit !== undefined && limit > 0) {
        windows.push({
          id: "extra-usage",
          label: "Extra usage",
          unit: "usd",
          currency: "USD",
          used,
          limit,
          usedPercent: Math.min(100, (used / limit) * 100),
          resetsAt: end,
        });
      } else {
        cost = { amount: used, currency: "USD", period: "cycle", estimated: false };
      }
    }
    return {
      providerId: "cursor",
      status: windows.some((w) => w.id === "weekly") ? "ok" : "error",
      windows,
      fetchedAt: nowMs,
      ...(cost ? { cost } : {}),
      ...(!windows.some((w) => w.id === "weekly")
        ? { error: "Shared weekly usage unavailable" }
        : {}),
      ...(planName ? { plan: planName } : {}),
      ...(account.email ? { authenticatedAs: account.email } : {}),
    };
  }

  const aggregated = parseAggregatedUsage(additional?.aggregated, summary.autoBucketModels);

  const autoPercent = clampPercent(plan.autoPercentUsed);
  if (autoPercent !== undefined) {
    windows.push({
      id: "cursor-auto",
      label: "Cursor Models",
      usedPercent: autoPercent,
      unit: "percent",
      ...(aggregated && aggregated.autoUsd > 0
        ? { currency: "USD", used: aggregated.autoUsd }
        : {}),
      ...(aggregated && aggregated.autoBreakdown.length > 0
        ? { breakdown: aggregated.autoBreakdown }
        : {}),
      ...withReset,
    });
  }

  // Cursor plan dollars are combined Cursor Models + API spend, while
  // `apiPercentUsed` is a separate utilization meter. The nominal plan price is
  // not an API cap, so unsplit plan dollars must not be presented as API spend.
  const apiPercent = clampPercent(plan.apiPercentUsed);
  if (apiPercent !== undefined) {
    windows.push({
      id: "cursor-api",
      label: "API",
      usedPercent: apiPercent,
      unit: "percent",
      currency: "USD",
      ...(aggregated ? { used: aggregated.apiUsd } : {}),
      ...(aggregated && aggregated.apiBreakdown.length > 0
        ? { breakdown: aggregated.apiBreakdown }
        : {}),
      ...withReset,
    });
  }

  const onDemandSpend = onDemandDollars(summary);
  if (onDemandSpend) {
    const { used, limit, breakdown } = onDemandSpend;
    windows.push({
      id: "extra-usage",
      label: "On-demand",
      usedPercent: limit !== undefined && limit > 0 ? Math.min(100, (used / limit) * 100) : 0,
      unit: "usd",
      currency: "USD",
      used,
      ...(limit !== undefined ? { limit } : {}),
      ...(breakdown ? { breakdown } : {}),
      ...withReset,
    });
  }

  return {
    providerId: "cursor",
    status: "ok",
    windows,
    ...(aggregated?.tokens ? { tokens: aggregated.tokens } : {}),
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
  const additional = await collectCursorAdditionalUsage(
    host,
    cookieValue,
    token.accessToken,
    (parsed ?? {}) as CursorUsageSummary,
  );
  return parseCursorUsage(parsed, account, now, additional);
}

/** Optional dashboard reads use the same account as the primary usage request. */
async function collectCursorAdditionalUsage(
  host: HostPort,
  cookieValue: string | undefined,
  accessToken: string | undefined,
  cycle?: { billingCycleStart?: string; billingCycleEnd?: string },
): Promise<{ shared?: unknown; billing?: unknown; aggregated?: unknown }> {
  async function readWeb(url: string, method: "GET" | "POST"): Promise<unknown> {
    if (!cookieValue) return undefined;
    try {
      const res = await host.http.request({
        url,
        method,
        headers: {
          Cookie: `WorkosCursorSessionToken=${cookieValue}`,
          "Content-Type": "application/json",
          Origin: "https://cursor.com",
        },
        ...(method === "POST" ? { body: "{}" } : {}),
        timeoutMs: 5_000,
      });
      return res.status >= 200 && res.status < 300 ? JSON.parse(res.body) : undefined;
    } catch {
      return undefined;
    }
  }

  async function readAggregated(startDate: number, endDate: number): Promise<unknown> {
    if (!accessToken) return undefined;
    try {
      const res = await host.http.request({
        url: CURSOR_AGGREGATED_USAGE_ENDPOINT,
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "Connect-Protocol-Version": "1",
        },
        // Connect JSON represents int64 timestamps as strings. The dashboard's
        // current-cycle view ends at now, not at the future billing-cycle end.
        body: JSON.stringify({ startDate: String(startDate), endDate: String(endDate) }),
        timeoutMs: 5_000,
      });
      return res.status >= 200 && res.status < 300 ? JSON.parse(res.body) : undefined;
    } catch {
      return undefined;
    }
  }

  const shared = await readWeb(CURSOR_SHARED_USAGE_ENDPOINT, "POST");
  if ((shared as CursorSharedUsage | undefined)?.isUnified === true) {
    const billing = await readWeb(CURSOR_BILLING_USAGE_ENDPOINT, "GET");
    return { shared, billing };
  }
  const startDate = toResetMs(cycle?.billingCycleStart);
  const cycleEnd = toResetMs(cycle?.billingCycleEnd);
  const endDate = cycleEnd !== undefined ? Math.min(cycleEnd, host.now()) : host.now();
  const aggregated = startDate !== undefined ? await readAggregated(startDate, endDate) : undefined;
  return {
    ...(shared !== undefined ? { shared } : {}),
    ...(aggregated !== undefined ? { aggregated } : {}),
  };
}

interface CursorPeriodPlanUsage {
  totalSpend?: NumericValue;
  includedSpend?: NumericValue;
  remaining?: NumericValue;
  limit?: NumericValue;
  autoPercentUsed?: number;
  apiPercentUsed?: number;
  totalPercentUsed?: number;
}

interface CursorPeriodUsage {
  billingCycleStart?: string;
  billingCycleEnd?: string;
  membershipType?: string;
  planUsage?: CursorPeriodPlanUsage;
  spendLimitUsage?: CursorSpendLimitUsage;
  autoBucketModels?: readonly string[];
}

interface CursorPlanInfo {
  planInfo?: { planName?: string; includedAmountCents?: number };
}

/** Map api2 `GetCurrentPeriodUsage` onto the dashboard usage-summary parser. */
export function parseCursorPeriodUsage(
  body: unknown,
  account: { plan?: string; email?: string },
  nowMs: number,
  providerId = "cursor",
  includedAmountCents?: number,
  additional?: { shared?: unknown; billing?: unknown; aggregated?: unknown },
): UsageSnapshot {
  const period = (body ?? {}) as CursorPeriodUsage;
  const plan = period.planUsage ?? {};
  const snapshot = parseCursorUsage(
    {
      ...(period.billingCycleStart ? { billingCycleStart: period.billingCycleStart } : {}),
      billingCycleEnd: period.billingCycleEnd,
      membershipType: period.membershipType,
      ...(period.spendLimitUsage ? { spendLimitUsage: period.spendLimitUsage } : {}),
      ...(period.autoBucketModels ? { autoBucketModels: period.autoBucketModels } : {}),
      individualUsage: {
        plan: {
          used: plan.totalSpend,
          limit: includedAmountCents ?? plan.limit,
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
    additional,
  );
  return { ...snapshot, providerId };
}

function accountFromJwt(accessToken: string): { email?: string; userId?: string } {
  const payload = accessToken.split(".")[1];
  if (!payload) return {};
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      email?: unknown;
      sub?: unknown;
    };
    const email = typeof claims.email === "string" ? claims.email.trim() : undefined;
    const userId = typeof claims.sub === "string" ? claims.sub.split("|").pop()?.trim() : undefined;
    return { ...(email ? { email } : {}), ...(userId ? { userId } : {}) };
  } catch {
    return {};
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
  body = "{}",
): Promise<HttpResponse> {
  return host.http.request({
    method: "POST",
    url,
    headers,
    body,
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
    postCursorJson(
      host,
      CURSOR_PERIOD_USAGE_ENDPOINT,
      headers,
      JSON.stringify({ includePooledUsage: true }),
    ),
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
  let includedAmountCents: number | undefined;
  if (planRes && planRes.status >= 200 && planRes.status < 300) {
    try {
      const planBody = JSON.parse(planRes.body) as CursorPlanInfo;
      const name = planBody.planInfo?.planName?.trim();
      planName = name ? (MEMBERSHIP_LABELS[name.toLowerCase()] ?? name) : undefined;
      const included = planBody.planInfo?.includedAmountCents;
      includedAmountCents =
        typeof included === "number" && Number.isFinite(included) ? included : undefined;
    } catch {
      planName = undefined;
      includedAmountCents = undefined;
    }
  }

  const { email, userId } = accountFromJwt(accessToken);
  const cookieValue = userId ? `${encodeURIComponent(userId)}%3A%3A${accessToken}` : undefined;
  const additional = await collectCursorAdditionalUsage(
    host,
    cookieValue,
    accessToken,
    (usageBody ?? {}) as CursorPeriodUsage,
  );
  return parseCursorPeriodUsage(
    usageBody,
    {
      ...(planName ? { plan: planName } : {}),
      ...(email ? { email } : {}),
    },
    now,
    providerId,
    includedAmountCents,
    additional,
  );
}
