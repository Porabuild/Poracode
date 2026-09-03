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
 *     → { data: { total_quota | plan_quota + resource_package_quota + shared_quota:
 *         { quota_summary: { used_value, limit_value } }, next_reset_at, plan_name,
 *         user_profile } }
 *
 * The endpoint is private and may rotate without notice; quota blocks have been
 * seen both nested under `quota_summary` / `quotaSummary` and flat, with both
 * snake_case and camelCase field names. Migrated accounts additionally serve
 * the new quota-system shape (`user_quota` + `add_on_quota` +
 * `org_resource_package` with `{ total | cap, used, remaining }`, plus a
 * server-computed `total_usage_percentage` and `expires_at` — the same shape
 * qodercli reads from `/api/v2/quota/usage`), so the parser falls through
 * those shapes defensively and reports `missing usage data` rather than a
 * healthy 0% ring when none matches. Captured cookies are never replayed to a
 * non-qoder.com host: region overrides exist only as explicit env config
 * (`QODER_BASE_URL` / `QODER_ENDPOINT`).
 */

export const QODER_PROVIDER_ID = "qoder";

export const QODER_USAGES_ENDPOINT = "https://qoder.com/api/v2/me/usages/big_model_credits";

export interface QoderQuotaSummary {
  usedValue?: number | string;
  used_value?: number | string;
  limitValue?: number | string;
  limit_value?: number | string;
  remainingValue?: number | string;
  remaining_value?: number | string;
  usagePercentage?: number | string;
  usage_percentage?: number | string;
  unit?: string;
}

export interface QoderQuotaDetailItem {
  id?: string;
  limitValue?: number | string;
  limit_value?: number | string;
  usedValue?: number | string;
  used_value?: number | string;
  remainingValue?: number | string;
  remaining_value?: number | string;
  unit?: string;
  isActive?: boolean;
  is_active?: boolean;
  usagePercentage?: number | string;
  usage_percentage?: number | string;
  expiresAt?: number | string;
  expires_at?: number | string;
  source?: string;
  status?: string;
}

export interface QoderQuotaBlock {
  quotaSummary?: QoderQuotaSummary;
  quota_summary?: QoderQuotaSummary;
  quotaDetail?: QoderQuotaDetailItem[] | null;
  quota_detail?: QoderQuotaDetailItem[] | null;
  usedValue?: number | string;
  used_value?: number | string;
  limitValue?: number | string;
  limit_value?: number | string;
  nextResetAt?: number | string;
  next_reset_at?: number | string;
  resetType?: string;
  reset_type?: string;
}

export interface QoderUserProfile {
  email?: string;
  username?: string;
  name?: string;
  userId?: string | number;
  user_id?: string | number;
}

/**
 * New quota-system block, as served for migrated accounts (matches what
 * qodercli 1.1.42 `normalizeQuotaUsage` reads from `/api/v2/quota/usage` and
 * what the legacy `big_model_credits` endpoint now returns for those
 * accounts): `{ total | limit | cap, used, remaining, percentage }`, with
 * snake_case and camelCase spellings. `total` may be absent while `used` and
 * `remaining` are present — the total is then `used + remaining` (the CLI's
 * own org-package display renders `used/used+remaining`).
 */
export interface QoderNewQuotaBlock {
  total?: number | string;
  limit?: number | string;
  limit_value?: number | string;
  limitValue?: number | string;
  quota?: number | string;
  quota_value?: number | string;
  quotaValue?: number | string;
  cap?: number | string;
  cap_value?: number | string;
  capValue?: number | string;
  used?: number | string;
  used_value?: number | string;
  usedValue?: number | string;
  remaining?: number | string;
  remaining_value?: number | string;
  remainingValue?: number | string;
  percentage?: number | string;
  percentage_value?: number | string;
  percentageValue?: number | string;
  usage_percentage?: number | string;
  usagePercentage?: number | string;
  unit?: string;
}

export interface QoderUsagesResponseData {
  totalQuota?: QoderQuotaBlock;
  total_quota?: QoderQuotaBlock;
  planQuota?: QoderQuotaBlock;
  plan_quota?: QoderQuotaBlock;
  resourcePackageQuota?: QoderQuotaBlock;
  resource_package_quota?: QoderQuotaBlock;
  sharedQuota?: QoderQuotaBlock;
  shared_quota?: QoderQuotaBlock;
  dedicatedResourcePackageQuota?: QoderQuotaBlock;
  dedicated_resource_package_quota?: QoderQuotaBlock;
  /** New quota system: personal credits block. */
  userQuota?: QoderNewQuotaBlock;
  user_quota?: QoderNewQuotaBlock;
  /** New quota system: add-on credits block. */
  addOnQuota?: QoderNewQuotaBlock;
  add_on_quota?: QoderNewQuotaBlock;
  /** New quota system: org resource-package block (may carry `cap` as its total). */
  orgResourcePackage?: QoderNewQuotaBlock;
  org_resource_package?: QoderNewQuotaBlock;
  /** New quota system: server-computed overall utilization, 0-100. */
  totalUsagePercentage?: number | string;
  total_usage_percentage?: number | string;
  isQuotaExceeded?: boolean;
  is_quota_exceeded?: boolean;
  expiresAt?: number | string;
  expires_at?: number | string;
  usageLimit?: number | string | QoderQuotaBlock;
  usage_limit?: number | string | QoderQuotaBlock;
  usedValue?: number | string;
  used_value?: number | string;
  limitValue?: number | string;
  limit_value?: number | string;
  nextResetAt?: number | string;
  next_reset_at?: number | string;
  lastResetAt?: number | string;
  last_reset_at?: number | string;
  planName?: string;
  plan_name?: string;
  plan?: string;
  planTier?: string;
  plan_tier?: string;
  userId?: string | number;
  user_id?: string | number;
  userProfile?: QoderUserProfile;
  user_profile?: QoderUserProfile;
}

export interface QoderUsagesResponse extends QoderUsagesResponseData {
  data?: QoderUsagesResponseData;
  code?: number | string;
  status?: string;
}

function toNum(v: unknown): number | undefined {
  if (v === undefined || v === null) return undefined;
  const n = typeof v === "number" ? v : Number(String(v).trim());
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

function extractSummary(block: unknown): { used?: number; limit?: number } {
  if (!block || typeof block !== "object") return {};
  const b = block as Record<string, unknown>;
  const summary = (b.quota_summary ?? b.quotaSummary) as Record<string, unknown> | undefined;
  const used = toNum(summary?.used_value ?? summary?.usedValue ?? b.used_value ?? b.usedValue);
  const limit = toNum(summary?.limit_value ?? summary?.limitValue ?? b.limit_value ?? b.limitValue);
  const result: { used?: number; limit?: number } = {};
  if (used !== undefined) result.used = used;
  if (limit !== undefined) result.limit = limit;
  return result;
}

/**
 * Read a new-quota-system block (`user_quota`, `add_on_quota`,
 * `org_resource_package`) into used/limit credit amounts. The total arrives
 * as `total` (org blocks use `cap`); when only `used` + `remaining` are
 * present the total is derived as their sum.
 */
function extractNewSystemQuota(block: unknown): { used?: number; limit?: number } {
  if (!block || typeof block !== "object") return {};
  const b = block as Record<string, unknown>;
  const used = toNum(b.used ?? b.used_value ?? b.usedValue);
  const remaining = toNum(b.remaining ?? b.remaining_value ?? b.remainingValue);
  let limit = toNum(
    b.total ??
      b.limit ??
      b.limit_value ??
      b.limitValue ??
      b.quota ??
      b.quota_value ??
      b.quotaValue ??
      b.cap ??
      b.cap_value ??
      b.capValue,
  );
  if (limit === undefined && used !== undefined && remaining !== undefined) {
    limit = used + remaining;
  }
  const result: { used?: number; limit?: number } = {};
  if (used !== undefined) result.used = used;
  if (limit !== undefined) result.limit = limit;
  return result;
}

/** Format internal or external Qoder plan tier names into displayable labels. */
export function formatQoderPlan(raw?: string): string | undefined {
  if (!raw || typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;

  const upper = trimmed.toUpperCase();
  if (upper === "PLAN_TIER_FREE" || upper === "FREE") return "Free";
  if (upper === "PLAN_TIER_PRO" || upper === "PRO") return "Pro";
  if (upper === "PLAN_TIER_PRO_PLUS" || upper === "PRO_PLUS" || upper === "PRO+") return "Pro+";
  if (upper === "PLAN_TIER_TEAM" || upper === "TEAM") return "Team";
  if (upper === "PLAN_TIER_ENTERPRISE" || upper === "ENTERPRISE") return "Enterprise";

  if (upper.startsWith("PLAN_TIER_")) {
    return upper
      .slice("PLAN_TIER_".length)
      .replace(/_PLUS$/i, "+")
      .replace(/_/g, " ")
      .toLowerCase()
      .replace(/\b[a-z]/g, (c) => c.toUpperCase());
  }

  return trimmed;
}

/**
 * Pure: parse the Qoder big_model_credits API response into a UsageSnapshot.
 * A 2xx body that carries no recognizable quota (an error envelope, a drifted
 * shape) parses to an `error` snapshot, not a healthy 0% window.
 */
export function parseQoderUsage(
  payload: unknown,
  nowMs: number,
  meta?: { plan?: string; authenticatedAs?: string },
): UsageSnapshot {
  const root = (payload ?? {}) as QoderUsagesResponse;
  const data: QoderUsagesResponseData =
    root.data && typeof root.data === "object" ? root.data : (root as QoderUsagesResponseData);

  let used: number | undefined;
  let limit: number | undefined;

  // 1. Prefer total_quota / totalQuota if present
  const total = extractSummary(data.total_quota ?? data.totalQuota);
  if (total.limit !== undefined && total.limit > 0) {
    used = total.used ?? 0;
    limit = total.limit;
  } else {
    // 2. Sum up plan_quota + resource_package_quota + shared/dedicated quota if available
    const plan = extractSummary(data.plan_quota ?? data.planQuota);
    const pkg = extractSummary(data.resource_package_quota ?? data.resourcePackageQuota);
    const shared = extractSummary(
      data.dedicated_resource_package_quota ??
        data.dedicatedResourcePackageQuota ??
        data.shared_quota ??
        data.sharedQuota,
    );

    const totalLim = (plan.limit ?? 0) + (pkg.limit ?? 0) + (shared.limit ?? 0);
    if (totalLim > 0) {
      limit = totalLim;
      used = (plan.used ?? 0) + (pkg.used ?? 0) + (shared.used ?? 0);
    } else {
      // 3. New quota system (migrated accounts): user_quota + add_on_quota +
      // org_resource_package, mirroring the CLI's own remaining-sum. The
      // server-computed total_usage_percentage wins when present.
      const userQ = extractNewSystemQuota(data.user_quota ?? data.userQuota);
      const addOn = extractNewSystemQuota(data.add_on_quota ?? data.addOnQuota);
      const org = extractNewSystemQuota(
        data.org_resource_package ??
          data.orgResourcePackage ??
          data.shared_quota ??
          data.sharedQuota,
      );
      const newLim = (userQ.limit ?? 0) + (addOn.limit ?? 0) + (org.limit ?? 0);
      if (newLim > 0) {
        limit = newLim;
        used = (userQ.used ?? 0) + (addOn.used ?? 0) + (org.used ?? 0);
        const serverPercent = toNum(data.total_usage_percentage ?? data.totalUsagePercentage);
        if (serverPercent !== undefined && serverPercent >= 0 && serverPercent <= 100) {
          used = Math.round((serverPercent / 100) * newLim);
        }
      } else {
        const usageLimitObj = data.usage_limit ?? data.usageLimit;
        if (typeof usageLimitObj === "object" && usageLimitObj !== null) {
          const usageLimitSummary = extractSummary(usageLimitObj as QoderQuotaBlock);
          if (usageLimitSummary.limit !== undefined && usageLimitSummary.limit > 0) {
            limit = usageLimitSummary.limit;
            used = usageLimitSummary.used ?? 0;
          }
        } else {
          const topLevelLimit = toNum(data.limit_value ?? data.limitValue ?? usageLimitObj);
          if (topLevelLimit !== undefined && topLevelLimit > 0) {
            limit = topLevelLimit;
            used = toNum(data.used_value ?? data.usedValue) ?? total.used ?? plan.used ?? 0;
          }
        }
      }
    }
  }

  if (limit === undefined || limit <= 0) {
    return errorSnapshot(nowMs, "missing usage data");
  }

  // Reset timestamp
  const rawReset =
    toEpochMs((data.next_reset_at ?? data.nextResetAt) as string | number) ??
    toEpochMs((data.expires_at ?? data.expiresAt) as string | number) ??
    toEpochMs(
      ((data.total_quota ?? data.totalQuota) as QoderQuotaBlock | undefined)?.next_reset_at ??
        ((data.total_quota ?? data.totalQuota) as QoderQuotaBlock | undefined)?.nextResetAt,
    ) ??
    toEpochMs(
      ((data.plan_quota ?? data.planQuota) as QoderQuotaBlock | undefined)?.next_reset_at ??
        ((data.plan_quota ?? data.planQuota) as QoderQuotaBlock | undefined)?.nextResetAt,
    );
  const resetsAt = rawReset !== undefined && rawReset > 0 ? rawReset : undefined;

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
  const rawPlan =
    meta?.plan ?? data.plan_name ?? data.planName ?? data.plan ?? data.plan_tier ?? data.planTier;
  const plan = formatQoderPlan(typeof rawPlan === "string" ? rawPlan : undefined);

  // Authenticated user identity
  const userProfile = data.user_profile ?? data.userProfile;
  const authenticatedAs =
    meta?.authenticatedAs ||
    userProfile?.email?.trim() ||
    userProfile?.name?.trim() ||
    userProfile?.username?.trim() ||
    (userProfile?.userId !== undefined ? String(userProfile.userId).trim() : undefined) ||
    (userProfile?.user_id !== undefined ? String(userProfile.user_id).trim() : undefined) ||
    (data.user_id !== undefined ? String(data.user_id).trim() : undefined) ||
    (data.userId !== undefined ? String(data.userId).trim() : undefined);

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
  let effectiveAuth: { bearer?: string; cookie?: string };
  if (rawCookie) {
    effectiveAuth = { cookie: rawCookie };
    res = await qoderRequest(host.http, url, effectiveAuth);
    // A stale captured cookie must not mask a valid pasted key / PAT.
    if ((res.status === 401 || res.status === 403) && bearer) {
      effectiveAuth = { bearer };
      res = await qoderRequest(host.http, url, effectiveAuth);
    }
  } else if (bearer) {
    effectiveAuth = { bearer };
    res = await qoderRequest(host.http, url, effectiveAuth);
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

  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return errorSnapshot(now, "invalid json");
  }

  const root = (payload ?? {}) as QoderUsagesResponse;
  const data: QoderUsagesResponseData =
    root.data && typeof root.data === "object" ? root.data : (root as QoderUsagesResponseData);

  // If payload lacks user profile email or plan name, fetch supplementary metadata
  // from /api/v1/me and /api/v1/me/userplan.
  let meta: { plan?: string; authenticatedAs?: string } | undefined;
  const hasProfile = Boolean(data.user_profile?.email || data.userProfile?.email);
  const hasPlan = Boolean(
    data.plan_name || data.planName || data.plan || data.plan_tier || data.planTier,
  );

  if (!hasProfile || !hasPlan) {
    try {
      let origin = "https://qoder.com";
      try {
        origin = new URL(url).origin;
      } catch {
        // ignore
      }
      const [profileRes, planRes] = await Promise.all([
        !hasProfile
          ? qoderRequest(host.http, `${origin}/api/v1/me`, effectiveAuth).catch(() => undefined)
          : undefined,
        !hasPlan
          ? qoderRequest(host.http, `${origin}/api/v1/me/userplan`, effectiveAuth).catch(
              () => undefined,
            )
          : undefined,
      ]);

      let authenticatedAs: string | undefined;
      if (profileRes && profileRes.status >= 200 && profileRes.status < 300) {
        try {
          const p = JSON.parse(profileRes.body) as Record<string, unknown>;
          authenticatedAs =
            (typeof p.email === "string" && p.email.trim()) ||
            (typeof p.name === "string" && p.name.trim()) ||
            (typeof p.username === "string" && p.username.trim()) ||
            undefined;
        } catch {
          // ignore
        }
      }

      let plan: string | undefined;
      if (planRes && planRes.status >= 200 && planRes.status < 300) {
        try {
          const up = JSON.parse(planRes.body) as Record<string, unknown>;
          const rawTier =
            (typeof up.plan_tier_name === "string" && up.plan_tier_name.trim()) ||
            (typeof up.plan_tier === "string" && up.plan_tier.trim()) ||
            undefined;
          plan = formatQoderPlan(rawTier);
        } catch {
          // ignore
        }
      }

      if (authenticatedAs || plan) {
        meta = {
          ...(authenticatedAs ? { authenticatedAs } : {}),
          ...(plan ? { plan } : {}),
        };
      }
    } catch {
      // Supplementary metadata failures must not degrade core usage collection
    }
  }

  return parseQoderUsage(payload, now, meta);
}
