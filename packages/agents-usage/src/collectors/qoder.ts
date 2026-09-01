import { parseRetryAfter, toEpochMs } from "../formatters";
import type { CollectOptions, HostPort, HttpClient, HttpResponse, OAuthToken } from "../host";
import type { UsageSnapshot, UsageWindow } from "../types";

/**
 * Qoder (qoder.com) monthly "big model credits". Authenticates two ways: the
 * browser-login session cookie captured for qoder.com, or a Bearer credential
 * (pasted API key, or `QODER_PERSONAL_ACCESS_TOKEN` resolved host-side — see
 * `src/supervisor/runtime/qoderCredentials.ts`). A stale cookie never masks a
 * valid key: a 401/403 on the cookie pass retries once with the bearer.
 *
 *   GET {base}/api/v2/me/usages/big_model_credits
 *     headers: Cookie <session> | Authorization: Bearer <token>
 *     → { data: { totalQuota | planQuota + resourcePackageQuota + sharedQuota:
 *         { quotaSummary: { usedValue, limitValue } }, nextResetAt, planName,
 *         userProfile } }
 *
 * The endpoint is private and may rotate without notice; quota blocks have been
 * seen both nested under `quotaSummary` and flat, so the parser falls through
 * those shapes defensively and reports `missing usage data` rather than a
 * healthy 0% ring when none matches. Captured cookies are never replayed to a
 * non-qoder.com host: region overrides exist only as explicit env config
 * (`QODER_BASE_URL` / `QODER_ENDPOINT`).
 */

export const QODER_PROVIDER_ID = "qoder";

export const QODER_USAGES_ENDPOINT = "https://qoder.com/api/v2/me/usages/big_model_credits";

export interface QoderQuotaSummary {
  usedValue?: number | string;
  limitValue?: number | string;
  unit?: string;
}

export interface QoderQuotaBlock {
  quotaSummary?: QoderQuotaSummary;
  usedValue?: number | string;
  limitValue?: number | string;
  nextResetAt?: number | string;
  resetType?: string;
}

export interface QoderUserProfile {
  email?: string;
  username?: string;
  name?: string;
  userId?: string | number;
}

export interface QoderUsagesResponseData {
  totalQuota?: QoderQuotaBlock;
  planQuota?: QoderQuotaBlock;
  resourcePackageQuota?: QoderQuotaBlock;
  sharedQuota?: QoderQuotaBlock;
  usageLimit?: number | string | QoderQuotaBlock;
  usedValue?: number | string;
  limitValue?: number | string;
  nextResetAt?: number | string;
  planName?: string;
  plan?: string;
  userProfile?: QoderUserProfile;
}

export interface QoderUsagesResponse {
  data?: QoderUsagesResponseData;
}

function toNum(v: unknown): number | undefined {
  if (v === undefined || v === null) return undefined;
  const n = typeof v === "number" ? v : Number(String(v).trim());
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

function extractSummary(block: QoderQuotaBlock | undefined): { used?: number; limit?: number } {
  if (!block || typeof block !== "object") return {};
  const summary = block.quotaSummary;
  const used = toNum(summary?.usedValue ?? block.usedValue);
  const limit = toNum(summary?.limitValue ?? block.limitValue);
  const result: { used?: number; limit?: number } = {};
  if (used !== undefined) result.used = used;
  if (limit !== undefined) result.limit = limit;
  return result;
}

/**
 * Pure: parse the Qoder big_model_credits API response into a UsageSnapshot.
 * A 2xx body that carries no recognizable quota (an error envelope, a drifted
 * shape) parses to an `error` snapshot, not a healthy 0% window.
 */
export function parseQoderUsage(payload: unknown, nowMs: number): UsageSnapshot {
  const root = (payload ?? {}) as QoderUsagesResponse;
  const data: QoderUsagesResponseData =
    root.data && typeof root.data === "object" ? root.data : (root as QoderUsagesResponseData);

  let used: number | undefined;
  let limit: number | undefined;

  // 1. Prefer totalQuota if present
  const total = extractSummary(data.totalQuota);
  if (total.limit !== undefined && total.limit > 0) {
    used = total.used ?? 0;
    limit = total.limit;
  } else {
    // 2. Sum up planQuota + resourcePackageQuota + sharedQuota if available
    const plan = extractSummary(data.planQuota);
    const pkg = extractSummary(data.resourcePackageQuota);
    const shared = extractSummary(data.sharedQuota);

    const totalLim = (plan.limit ?? 0) + (pkg.limit ?? 0) + (shared.limit ?? 0);
    if (totalLim > 0) {
      limit = totalLim;
      used = (plan.used ?? 0) + (pkg.used ?? 0) + (shared.used ?? 0);
    } else if (typeof data.usageLimit === "object" && data.usageLimit !== null) {
      const usageLimitSummary = extractSummary(data.usageLimit as QoderQuotaBlock);
      if (usageLimitSummary.limit !== undefined && usageLimitSummary.limit > 0) {
        limit = usageLimitSummary.limit;
        used = usageLimitSummary.used ?? 0;
      }
    } else {
      const topLevelLimit = toNum(data.limitValue ?? data.usageLimit);
      if (topLevelLimit !== undefined && topLevelLimit > 0) {
        limit = topLevelLimit;
        used = toNum(data.usedValue) ?? total.used ?? plan.used ?? 0;
      }
    }
  }

  if (limit === undefined || limit <= 0) {
    return errorSnapshot(nowMs, "missing usage data");
  }

  // Reset timestamp
  const resetsAt =
    toEpochMs(data.nextResetAt) ??
    toEpochMs(data.totalQuota?.nextResetAt) ??
    toEpochMs(data.planQuota?.nextResetAt);

  const usedNum = used ?? 0;
  const usedPercent = Math.min(100, Math.max(0, Math.round((usedNum / limit) * 100)));

  const window: UsageWindow = {
    id: "monthly",
    label: "Credits",
    usedPercent,
    unit: "credits",
    limit,
    used: usedNum,
  };
  if (resetsAt !== undefined) {
    window.resetsAt = resetsAt;
  }

  // Plan name
  const rawPlan = data.planName ?? data.plan;
  const plan =
    typeof rawPlan === "string" && rawPlan.trim().length > 0 ? rawPlan.trim() : undefined;

  // Authenticated user identity
  const userProfile = data.userProfile;
  const authenticatedAs =
    userProfile?.email?.trim() ||
    userProfile?.name?.trim() ||
    userProfile?.username?.trim() ||
    (userProfile?.userId !== undefined ? String(userProfile.userId) : undefined);

  const snapshot: UsageSnapshot = {
    providerId: QODER_PROVIDER_ID,
    status: "ok",
    windows: [window],
    fetchedAt: nowMs,
  };

  if (plan) snapshot.plan = plan;
  if (authenticatedAs) snapshot.authenticatedAs = authenticatedAs;

  return snapshot;
}

/**
 * Resolves the usage endpoint URL. `QODER_BASE_URL` / `QODER_ENDPOINT` arrive
 * on the token's `raw` bag (see `qoderCredentials.ts`); a bare host is given a
 * scheme and a path suffix is appended only when missing, mirroring
 * `resolveKimiUsagesUrl`. An override that still doesn't parse falls back to
 * the public endpoint instead of failing the whole collect.
 */
export function resolveQoderUsagesUrl(token?: OAuthToken): string {
  const raw = token?.raw as { endpoint?: unknown; baseUrl?: unknown } | undefined;
  const override =
    typeof raw?.endpoint === "string" && raw.endpoint.trim()
      ? raw.endpoint.trim()
      : typeof raw?.baseUrl === "string" && raw.baseUrl.trim()
        ? raw.baseUrl.trim()
        : undefined;
  if (!override) return QODER_USAGES_ENDPOINT;

  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(override) ? override : `https://${override}`);
  } catch {
    return QODER_USAGES_ENDPOINT;
  }
  // Rewrite only the pathname so a query string on the override survives.
  const path = url.pathname.replace(/\/+$/, "");
  if (path.endsWith("/usages/big_model_credits")) url.pathname = path;
  else if (path.endsWith("/api/v2/me")) url.pathname = `${path}/usages/big_model_credits`;
  else if (path.endsWith("/api/v2")) url.pathname = `${path}/me/usages/big_model_credits`;
  else url.pathname = `${path}/api/v2/me/usages/big_model_credits`;
  return url.toString();
}

/** Full Chrome string — the other cookie-authenticated collectors send the same. */
const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36";

function qoderRequest(
  http: HttpClient,
  url: string,
  auth: { bearer?: string; cookie?: string },
): Promise<HttpResponse> {
  let origin = "https://qoder.com";
  try {
    origin = new URL(url).origin;
  } catch {
    // ignore
  }

  const headers: Record<string, string> = {
    Accept: "application/json, text/plain, */*",
    "User-Agent": BROWSER_USER_AGENT,
  };
  if (auth.cookie) {
    headers.Cookie = auth.cookie;
    headers.Origin = origin;
  } else if (auth.bearer) {
    headers.Authorization = `Bearer ${auth.bearer}`;
  }

  return http.request({
    url,
    method: "GET",
    headers,
    timeoutMs: 15_000,
  });
}

/**
 * True iff the captured `Cookie` header authenticates as a live Qoder session.
 * qoder.com sets non-auth cookies on every page load (locale, anti-bot) whose
 * names match the login pattern, so only an authenticated round-trip reliably
 * gates the "Found a signed-in session" prompt. Throws on 429/5xx — an
 * indeterminate answer — so the capture coordinator's transient path retries
 * instead of caching the header as invalid on a throttled response.
 */
export async function isQoderSessionLive(http: HttpClient, cookieHeader: string): Promise<boolean> {
  const res = await qoderRequest(http, QODER_USAGES_ENDPOINT, { cookie: cookieHeader });
  if (res.status === 429 || res.status >= 500) {
    throw new Error(`qoder session probe indeterminate (HTTP ${res.status})`);
  }
  return res.status >= 200 && res.status < 300;
}

function authMissing(now: number, error?: string): UsageSnapshot {
  const snap: UsageSnapshot = {
    providerId: QODER_PROVIDER_ID,
    status: "auth-missing",
    windows: [],
    fetchedAt: now,
  };
  if (error) snap.error = error;
  return snap;
}

function errorSnapshot(now: number, error: string): UsageSnapshot {
  return { providerId: QODER_PROVIDER_ID, status: "error", windows: [], fetchedAt: now, error };
}

/**
 * Collect Qoder big model credit usage: captured session cookie first, then a
 * pasted API key or the host-resolved PAT; `auth-missing` when neither exists
 * so the card can prompt for sign-in.
 */
export async function collectQoder(host: HostPort, _opts?: CollectOptions): Promise<UsageSnapshot> {
  const now = host.now();
  const [cookie, apiKey, token] = await Promise.all([
    host.credentials.getSecret(QODER_PROVIDER_ID, "cookie"),
    host.credentials.getSecret(QODER_PROVIDER_ID, "apiKey"),
    host.credentials.getOAuthToken(QODER_PROVIDER_ID),
  ]);

  const bearer = apiKey?.trim() || token?.accessToken?.trim() || undefined;
  const rawCookie = cookie?.trim() || undefined;

  const url = resolveQoderUsagesUrl(token);
  let res: HttpResponse;
  if (rawCookie) {
    res = await qoderRequest(host.http, url, { cookie: rawCookie });
    // A stale captured cookie must not mask a valid pasted key / PAT.
    if ((res.status === 401 || res.status === 403) && bearer) {
      res = await qoderRequest(host.http, url, { bearer });
    }
  } else if (bearer) {
    res = await qoderRequest(host.http, url, { bearer });
  } else {
    return authMissing(now);
  }

  if (res.status === 401 || res.status === 403) {
    return authMissing(now, `session expired or invalid (${res.status})`);
  }
  if (res.status === 429) {
    const snapshot: UsageSnapshot = {
      providerId: QODER_PROVIDER_ID,
      status: "rate-limited",
      windows: [],
      fetchedAt: now,
    };
    const retryAt = parseRetryAfter(res.headers["retry-after"], now);
    if (retryAt !== undefined) snapshot.rateLimitedUntil = retryAt;
    return snapshot;
  }
  if (res.status < 200 || res.status >= 300) {
    return errorSnapshot(now, `HTTP ${res.status}`);
  }

  const body = res.body.trim();
  if (!body) return errorSnapshot(now, "empty response");

  try {
    const payload = JSON.parse(body);
    return parseQoderUsage(payload, now);
  } catch {
    return errorSnapshot(now, "invalid json");
  }
}
