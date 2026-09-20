import { parseRetryAfter } from "../formatters";
import type { HostPort } from "../host";
import type { UsageSnapshot, UsageWindow } from "../types";

export const MUSE_PROVIDER_ID = "muse" as const;
export const MUSE_DASHBOARD_URL = "https://dev.meta.ai/usage";
const MUSE_PORTAL_URL = "https://dev.meta.ai/api/portal";
const REQUEST_TIMEOUT_MS = 15_000;
const SPEND_WINDOW_DAYS = 30;

/** UTC dates matching the dashboard's inclusive trailing spend window. */
export function museSpendWindow(nowMs: number): { start: string; end: string } {
  const isoDate = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  return { start: isoDate(nowMs - (SPEND_WINDOW_DAYS - 1) * 86_400_000), end: isoDate(nowMs) };
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function numberFrom(value: unknown): number | undefined {
  if (typeof value !== "number" && (typeof value !== "string" || !value.trim())) return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

/** Portal quota weights are decimal strings; reset timestamps are Unix seconds. */
export function parseMuseQuotaWindows(payload: unknown): UsageWindow[] {
  const quota = record(record(payload)?.subscription_quota);
  if (!quota) return [];
  const windows: UsageWindow[] = [];
  for (const [prefix, id, label] of [
    ["window", "session-5h", "Current usage"],
    ["weekly", "weekly", "Weekly limit"],
  ] as const) {
    const used = numberFrom(quota[`${prefix}_weighted_used`]);
    const limit = numberFrom(quota[`${prefix}_weighted_limit`]);
    if (used === undefined || limit === undefined || limit <= 0) continue;
    const resetsAt = numberFrom(quota[`${prefix}_resets_at`]);
    windows.push({
      id,
      label,
      usedPercent: Math.min(100, Math.max(0, (used / limit) * 100)),
      unit: "percent",
      ...(resetsAt !== undefined && resetsAt > 0 ? { resetsAt: resetsAt * 1000 } : {}),
    });
  }
  return windows;
}

/** Matches the dashboard's usageMetricValue: raw billable cost is 1e-8 USD. */
function billableCost(value: unknown): number | undefined {
  const money = record(value);
  if (money?.formatted_amount != null) {
    return numberFrom(String(money.formatted_amount).replace(/[^0-9.-]/g, ""));
  }
  const raw = numberFrom(money ? (money.amount ?? money.value) : value);
  return raw === undefined ? undefined : raw / 1e8;
}

/** Prefer TOTAL when present, otherwise sum model series without double counting. */
export function parseMuseSpend(payload: unknown): number | undefined {
  const data = record(payload);
  if (data?.metric !== "usage_billable_cost" || !Array.isArray(data.series)) return undefined;
  const total = data.series.find((entry) => record(entry)?.type === "TOTAL");
  const series = total ? [total] : data.series;
  let sum = 0;
  for (const entry of series) {
    const points = record(entry)?.data_points;
    if (!Array.isArray(points)) return undefined;
    for (const point of points) {
      const amount = billableCost(record(point)?.value);
      if (amount === undefined) return undefined;
      sum += amount;
    }
  }
  return Number.isFinite(sum) ? Math.round(sum * 100) / 100 : undefined;
}

type PortalResult =
  | { status: "ok"; payload: unknown }
  | { status: "auth-missing" | "error" }
  | { status: "rate-limited"; rateLimitedUntil?: number };

async function fetchPortal(
  host: HostPort,
  cookie: string,
  path: string,
  nowMs: number,
): Promise<PortalResult> {
  const response = await host.http
    .request({
      url: `${MUSE_PORTAL_URL}${path}`,
      headers: { Cookie: cookie, Accept: "application/json", Referer: MUSE_DASHBOARD_URL },
      timeoutMs: REQUEST_TIMEOUT_MS,
    })
    .catch(() => undefined);
  if (!response) return { status: "error" };
  if (response.status === 401 || response.status === 403) return { status: "auth-missing" };
  if (response.status === 429) {
    const retryAt = parseRetryAfter(response.headers["retry-after"], nowMs);
    return {
      status: "rate-limited",
      ...(retryAt !== undefined ? { rateLimitedUntil: retryAt } : {}),
    };
  }
  if (response.status < 200 || response.status >= 300) return { status: "error" };
  try {
    return { status: "ok", payload: JSON.parse(response.body) as unknown };
  } catch {
    return { status: "error" };
  }
}

/**
 * The signed-in dashboard now uses the portal JSON API, replacing Comet/Relay.
 * Existing llm_sess cookies and selected team IDs remain valid. Accounts with
 * one team can recover a session captured before the team ID was stored.
 */
export async function collectMuseDashboard(
  host: HostPort,
  cookie: string,
  nowMs: number,
): Promise<UsageSnapshot> {
  const base = { providerId: MUSE_PROVIDER_ID, windows: [], fetchedAt: nowMs };
  let teamId = (await host.credentials.getSecret(MUSE_PROVIDER_ID, "teamId"))?.trim();
  if (!teamId) {
    const teams = await fetchPortal(host, cookie, "/teams", nowMs);
    if (teams.status !== "ok") return { ...base, ...teams };
    const list = record(teams.payload)?.teams;
    // Do not silently switch accounts when there is more than one team.
    const id = Array.isArray(list) && list.length === 1 ? record(list[0])?.team_id : undefined;
    if (typeof id !== "string" || !id.trim()) return { ...base, status: "auth-missing" };
    teamId = id.trim();
  }

  const teamPath = `/teams/${encodeURIComponent(teamId)}`;
  const span = museSpendWindow(nowMs);
  const query = new URLSearchParams({
    metric: "USAGE_BILLABLE_COST",
    start_date: span.start,
    end_date: span.end,
    timezone: "UTC",
  });
  const [quota, spend] = await Promise.all([
    fetchPortal(host, cookie, `${teamPath}/subscription-quota`, nowMs),
    fetchPortal(host, cookie, `${teamPath}/usage?${query}`, nowMs),
  ]);
  // Session rejection must offer re-login, even if the other endpoint succeeded.
  if (quota.status === "auth-missing" || spend.status === "auth-missing") {
    return { ...base, status: "auth-missing" };
  }
  const windows = quota.status === "ok" ? parseMuseQuotaWindows(quota.payload) : [];
  const amount = spend.status === "ok" ? parseMuseSpend(spend.payload) : undefined;
  const tier =
    quota.status === "ok" ? record(record(quota.payload)?.subscription_quota)?.tier : undefined;
  const rateLimits = [quota, spend].filter((result) => result.status === "rate-limited");
  const retryAt = Math.max(
    ...rateLimits.flatMap((result) =>
      result.rateLimitedUntil === undefined ? [] : [result.rateLimitedUntil],
    ),
  );
  return {
    ...base,
    status:
      rateLimits.length > 0
        ? "rate-limited"
        : windows.length > 0 || amount !== undefined
          ? "ok"
          : "error",
    windows,
    ...(Number.isFinite(retryAt) ? { rateLimitedUntil: retryAt } : {}),
    ...(typeof tier === "string" && tier.trim() ? { plan: tier.trim() } : {}),
    ...(amount !== undefined
      ? { cost: { currency: "USD", amount, period: "30d", estimated: false } }
      : {}),
  };
}
