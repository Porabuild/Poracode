import { toEpochMs } from "../formatters";
import type { CollectOptions, HostPort, HttpClient, HttpResponse } from "../host";
import type { UsageSnapshot, UsageWindow } from "../types";

/**
 * Factory / Droid (factory.ai). The `droid` CLI seals its token in an encrypted
 * `~/.factory/auth.v2.file`, and — unlike most web apps — app.factory.ai keeps
 * NO session cookie: it stores WorkOS AuthKit tokens in `localStorage`
 * (`workos:access-token` / `workos:refresh-token`). So the in-app browser login
 * captures those from localStorage, we hold the long-lived (rotating) refresh
 * token, exchange it for a short-lived access token via WorkOS, and call the
 * Factory API with that Bearer. This mirrors macOS [codexbar]'s Factory
 * provider, the reference for the request/response shapes below.
 *
 *   POST api.workos.com/user_management/authenticate → refresh → access token
 *   GET  /api/billing/limits                         → token-rate-limit pools
 *       { usesTokenRateLimitsBilling, limits: { standard, core? }, ... }
 *       Each pool has fiveHour/weekly/monthly windows with `usedPercent`
 *       (already 0-100), `windowEnd`, and `secondsRemaining`.
 *   GET  /api/organization/subscription/usage        → legacy per-cycle tokens
 *       { usage: { startDate, endDate, standard, premium } } (epoch ms dates)
 *   GET  /api/app/auth/me                            → plan/tier/org identity
 *
 * Endpoints are private/undocumented and may rotate without notice; responses
 * are normalized into the shared `UsageSnapshot` shape. The standard pool maps
 * to the canonical session-5h/weekly/monthly windows; the optional "core" pool
 * and the legacy "premium" pool flow through as `factory:<pool>` ids.
 *
 * [codexbar]: https://github.com/steipete/CodexBar (Sources/.../Factory)
 */

export const FACTORY_PROVIDER_ID = "factory" as const;

// auth/me + the legacy usage route are on app.factory.ai; only /api/billing/limits
// lives on api.factory.ai (codexbar hardcodes that host). All three are
// authenticated with the WorkOS access token as a Bearer.
const FACTORY_APP_BASE = "https://app.factory.ai";
const FACTORY_API_BASE = "https://api.factory.ai";
export const FACTORY_AUTH_ME_ENDPOINT = `${FACTORY_APP_BASE}/api/app/auth/me`;
export const FACTORY_BILLING_LIMITS_ENDPOINT = `${FACTORY_API_BASE}/api/billing/limits`;
export const FACTORY_USAGE_ENDPOINT = `${FACTORY_APP_BASE}/api/organization/subscription/usage`;

const UNLIMITED_TOKEN_THRESHOLD = 1_000_000_000_000;
/** Token count treated as "100%" for plans with an effectively unlimited allowance. */
const UNLIMITED_REFERENCE_TOKENS = 100_000_000;

const FACTORY_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36";

// --- Response shapes (subset of codexbar's, only the fields we read) ---

interface FactoryAuthResponse {
  organization?: {
    name?: string;
    subscription?: {
      factoryTier?: string;
      orbSubscription?: { plan?: { name?: string } };
    };
  };
  userProfile?: { id?: string; email?: string };
}

interface FactoryBillingWindowRaw {
  usedPercent?: number;
  windowEnd?: string | number | null;
  secondsRemaining?: number | null;
}

interface FactoryLimitPool {
  fiveHour?: FactoryBillingWindowRaw;
  weekly?: FactoryBillingWindowRaw;
  monthly?: FactoryBillingWindowRaw;
}

interface FactoryBillingLimitsResponse {
  usesTokenRateLimitsBilling?: boolean;
  limits?: { standard?: FactoryLimitPool; core?: FactoryLimitPool };
  extraUsageBalanceCents?: number;
  overagePreference?: string;
}

interface FactoryTokenUsage {
  userTokens?: number;
  totalAllowance?: number;
  usedRatio?: number;
}

interface FactoryUsageResponse {
  usage?: {
    startDate?: number;
    endDate?: number;
    standard?: FactoryTokenUsage;
    premium?: FactoryTokenUsage;
  };
}

// --- Pure helpers ---

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value * 10) / 10));
}

/**
 * When the reset is resolvable. `secondsRemaining` wins (it's relative to now);
 * otherwise an absolute `windowEnd` is used only when it's still in the future.
 */
function factoryResetAt(raw: FactoryBillingWindowRaw, nowMs: number): number | undefined {
  if (typeof raw.secondsRemaining === "number" && raw.secondsRemaining > 0) {
    return nowMs + raw.secondsRemaining * 1000;
  }
  const end = toEpochMs(raw.windowEnd ?? undefined);
  return end !== undefined && end > nowMs ? end : undefined;
}

/**
 * Factory leaves stale `usedPercent` after a short rolling window expires; the
 * web UI treats an unresolvable reset (windowEnd in the past, no
 * secondsRemaining) as a fresh window, so mirror that and report 0 instead of
 * the expired value.
 */
function factoryEffectivePercent(
  raw: FactoryBillingWindowRaw,
  resetsAt: number | undefined,
): number {
  if (resetsAt === undefined && raw.windowEnd != null && raw.secondsRemaining == null) {
    return 0;
  }
  return clampPercent(raw.usedPercent ?? 0);
}

function factoryRateWindow(
  id: UsageWindow["id"],
  label: string,
  raw: FactoryBillingWindowRaw | undefined,
  nowMs: number,
): UsageWindow | undefined {
  if (!raw) return undefined;
  const resetsAt = factoryResetAt(raw, nowMs);
  return {
    id,
    label,
    usedPercent: factoryEffectivePercent(raw, resetsAt),
    unit: "percent",
    ...(resetsAt !== undefined ? { resetsAt } : {}),
  };
}

function poolHasUsageData(pool: FactoryLimitPool | undefined): boolean {
  if (!pool) return false;
  return [pool.fiveHour, pool.weekly, pool.monthly].some(
    (w) =>
      w != null && ((w.usedPercent ?? 0) > 0 || w.windowEnd != null || w.secondsRemaining != null),
  );
}

/**
 * Percent used for the legacy per-cycle token model. Prefers the API-provided
 * `usedRatio` (0-1) when it's sane, falling back to used/allowance and treating
 * an allowance above ~1T tokens as unlimited (token-count pseudo-percentage).
 */
function factoryTokenPercent(used: number, allowance: number, ratio: number | undefined): number {
  if (
    ratio !== undefined &&
    Number.isFinite(ratio) &&
    !(ratio === 0 && used > 0 && allowance > 0 && allowance <= UNLIMITED_TOKEN_THRESHOLD)
  ) {
    if (ratio >= -0.001 && ratio <= 1.001) return clampPercent(ratio * 100);
    // Percent-scale fallback only when the allowance can't be trusted, to avoid
    // misreading a slightly-over-1 ratio when used/allowance is computable.
    const allowanceReliable = allowance > 0 && allowance <= UNLIMITED_TOKEN_THRESHOLD;
    if (!allowanceReliable && ratio >= -0.1 && ratio <= 100.1) return clampPercent(ratio);
  }
  if (allowance > UNLIMITED_TOKEN_THRESHOLD) {
    return clampPercent((used / UNLIMITED_REFERENCE_TOKENS) * 100);
  }
  if (allowance <= 0) return 0;
  return clampPercent((used / allowance) * 100);
}

function capitalize(value: string): string {
  return value.length <= 1 ? value.toUpperCase() : value[0]!.toUpperCase() + value.slice(1);
}

/**
 * Plan label as "Factory <Tier>" optionally suffixed with the Orb plan name,
 * matching codexbar's "tier - plan" rendering (e.g. "Factory Pro - Starter").
 */
export function formatFactoryPlanLabel(auth: FactoryAuthResponse | undefined): string | undefined {
  const subscription = auth?.organization?.subscription;
  const parts: string[] = [];
  const tier = subscription?.factoryTier?.trim();
  if (tier) parts.push(`Factory ${capitalize(tier)}`);
  const planName = subscription?.orbSubscription?.plan?.name?.trim();
  if (planName && !planName.toLowerCase().includes("factory")) parts.push(planName);
  return parts.length > 0 ? parts.join(" - ") : undefined;
}

function readIdentity(auth: FactoryAuthResponse | undefined): {
  plan?: string;
  authenticatedAs?: string;
  userId?: string;
} {
  const plan = formatFactoryPlanLabel(auth);
  const authenticatedAs = auth?.userProfile?.email?.trim() || auth?.organization?.name?.trim();
  const userId = auth?.userProfile?.id?.trim();
  return {
    ...(plan ? { plan } : {}),
    ...(authenticatedAs ? { authenticatedAs } : {}),
    ...(userId ? { userId } : {}),
  };
}

/** Windows for the modern token-rate-limit billing model (standard + core pools). */
function tokenRateLimitWindows(
  limits: FactoryBillingLimitsResponse["limits"],
  nowMs: number,
): UsageWindow[] {
  const windows: UsageWindow[] = [];
  const standard = limits?.standard;
  const push = (w: UsageWindow | undefined) => {
    if (w) windows.push(w);
  };
  push(factoryRateWindow("session-5h", "Session (5h)", standard?.fiveHour, nowMs));
  push(factoryRateWindow("weekly", "Weekly", standard?.weekly, nowMs));
  push(factoryRateWindow("monthly", "Monthly", standard?.monthly, nowMs));

  // The "core" pool only exists on some accounts; surface it only when it
  // actually carries usage so empty plans don't render three zero bars.
  if (poolHasUsageData(limits?.core)) {
    const core = limits!.core!;
    push(factoryRateWindow("factory:core:session-5h", "Core (5h)", core.fiveHour, nowMs));
    push(factoryRateWindow("factory:core:weekly", "Core Weekly", core.weekly, nowMs));
    push(factoryRateWindow("factory:core:monthly", "Core Monthly", core.monthly, nowMs));
  }
  return windows;
}

/** Windows for the legacy per-cycle token model (standard + premium pools). */
function legacyUsageWindows(usage: FactoryUsageResponse["usage"]): UsageWindow[] {
  const resetsAt = toEpochMs(usage?.endDate);
  const windows: UsageWindow[] = [];

  const standard = usage?.standard;
  windows.push({
    id: "monthly",
    label: "Standard",
    usedPercent: factoryTokenPercent(
      standard?.userTokens ?? 0,
      standard?.totalAllowance ?? 0,
      standard?.usedRatio,
    ),
    unit: "percent",
    ...(resetsAt !== undefined ? { resetsAt } : {}),
  });

  const premium = usage?.premium;
  const premiumUsed = premium?.userTokens ?? 0;
  const premiumAllowance = premium?.totalAllowance ?? 0;
  if (premiumAllowance > 0 || premiumUsed > 0 || premium?.usedRatio !== undefined) {
    windows.push({
      id: "factory:premium",
      label: "Premium",
      usedPercent: factoryTokenPercent(premiumUsed, premiumAllowance, premium?.usedRatio),
      unit: "percent",
      ...(resetsAt !== undefined ? { resetsAt } : {}),
    });
  }
  return windows;
}

/**
 * Pure: map the parsed Factory responses to a snapshot. Prefers the modern
 * token-rate-limit pools when the account is on that billing model, otherwise
 * the legacy per-cycle token usage.
 */
export function parseFactoryUsage(
  auth: unknown,
  billingLimits: unknown,
  legacyUsage: unknown,
  nowMs: number,
): UsageSnapshot {
  const authData = (auth ?? {}) as FactoryAuthResponse;
  const limits = (billingLimits ?? {}) as FactoryBillingLimitsResponse;
  const identity = readIdentity(authData);

  let windows: UsageWindow[];
  if (limits.usesTokenRateLimitsBilling && limits.limits) {
    windows = tokenRateLimitWindows(limits.limits, nowMs);
  } else {
    windows = legacyUsageWindows((legacyUsage as FactoryUsageResponse)?.usage);
  }

  return {
    providerId: FACTORY_PROVIDER_ID,
    status: "ok",
    windows,
    fetchedAt: nowMs,
    ...(identity.plan ? { plan: identity.plan } : {}),
    ...(identity.authenticatedAs ? { authenticatedAs: identity.authenticatedAs } : {}),
  };
}

// --- HTTP / WorkOS auth ---

const WORKOS_AUTH_ENDPOINT = "https://api.workos.com/user_management/authenticate";
// AuthKit client ids Factory's web app authenticates against. The first is the
// app's live `VITE_WORKOS_CLIENT_ID`; the second is a legacy/relay id WorkOS now
// rejects with "Invalid client id" — kept only as a fallback. Try in order.
const WORKOS_CLIENT_IDS = [
  "client_01HNM792M5G5G1A2THWPXKFMXB",
  "client_01HXRMBQ9BJ3E7QSTQ9X2PHVB7",
];

function parseJsonBody(res: HttpResponse): unknown {
  try {
    return JSON.parse(res.body);
  } catch {
    return undefined;
  }
}

/**
 * Unwrap a token that the web app may have JSON-stringified before storing it in
 * localStorage (a quoted string, or an object wrapping the token). A bare token
 * is returned as-is. Without this, a quoted/`{token}` value would be sent
 * verbatim as the Bearer / refresh token and rejected.
 */
function unwrapStoredToken(raw: string | undefined): string | undefined {
  const trimmed = raw?.trim();
  if (!trimmed) return undefined;
  if (trimmed[0] === '"' || trimmed[0] === "{") {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (typeof parsed === "string") return parsed.trim() || undefined;
      if (parsed && typeof parsed === "object") {
        for (const k of [
          "token",
          "value",
          "accessToken",
          "access_token",
          "refreshToken",
          "refresh_token",
        ]) {
          const v = (parsed as Record<string, unknown>)[k];
          if (typeof v === "string" && v.trim()) return v.trim();
        }
      }
    } catch {
      // not JSON — fall through to the raw value
    }
  }
  return trimmed;
}

function factorySnap(status: UsageSnapshot["status"], now: number, error?: string): UsageSnapshot {
  return {
    providerId: FACTORY_PROVIDER_ID,
    status,
    windows: [],
    fetchedAt: now,
    ...(error ? { error } : {}),
  };
}

/** GET a Factory API route authenticated with the WorkOS access token. */
function factoryRequest(
  http: HttpClient,
  url: string,
  accessToken: string,
  timeoutMs: number,
): Promise<HttpResponse> {
  return http.request({
    method: "GET",
    url,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      Origin: "https://app.factory.ai",
      Referer: "https://app.factory.ai/",
      "x-factory-client": "web-app",
      "User-Agent": FACTORY_USER_AGENT,
    },
    timeoutMs,
  });
}

interface WorkOSAuthBody {
  access_token?: string;
  refresh_token?: string;
}

export type WorkOSRefreshResult =
  | { kind: "ok"; accessToken: string; refreshToken?: string }
  | { kind: "invalid" }
  | { kind: "transient" };

/**
 * Exchange a WorkOS refresh token for a fresh access token. WorkOS rotates the
 * refresh token on each exchange, so a returned `refreshToken` MUST be persisted
 * by the caller or the next exchange fails. `invalid` means the refresh token is
 * dead (re-login needed); `transient` is a network/5xx blip worth retrying.
 */
export async function refreshWorkOSToken(
  http: HttpClient,
  refreshToken: string,
): Promise<WorkOSRefreshResult> {
  if (!refreshToken) return { kind: "invalid" };
  let sawTransient = false;
  for (const clientId of WORKOS_CLIENT_IDS) {
    let res: HttpResponse;
    try {
      res = await http.request({
        method: "POST",
        url: WORKOS_AUTH_ENDPOINT,
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: clientId,
          grant_type: "refresh_token",
          refresh_token: refreshToken,
        }),
        timeoutMs: 15_000,
      });
    } catch {
      sawTransient = true;
      continue;
    }
    if (res.status === 200) {
      const body = parseJsonBody(res) as WorkOSAuthBody | undefined;
      if (body && typeof body.access_token === "string") {
        return {
          kind: "ok",
          accessToken: body.access_token,
          ...(typeof body.refresh_token === "string" ? { refreshToken: body.refresh_token } : {}),
        };
      }
      sawTransient = true; // 200 but unparseable — treat as a blip, try the other client
      continue;
    }
    // 5xx/429 → transient; 400/401/403 → this client rejected the token (wrong
    // client or dead refresh token). Either way, try the other client id.
    if (res.status >= 500 || res.status === 429) sawTransient = true;
  }
  return sawTransient ? { kind: "transient" } : { kind: "invalid" };
}

/**
 * True iff a WorkOS access token authenticates a live Factory session.
 * `GET /api/app/auth/me` 200s with a JSON body when valid and 401s when not, so
 * a 200 + non-null object is the signal — deliberately not requiring a specific
 * field, the same login-gate lesson the Grok provider calls out.
 */
export async function isFactoryAccessTokenLive(
  http: HttpClient,
  accessToken: string,
): Promise<boolean> {
  if (!accessToken) return false;
  let res: HttpResponse;
  try {
    res = await factoryRequest(http, FACTORY_AUTH_ME_ENDPOINT, accessToken, 5_000);
  } catch {
    return false;
  }
  if (res.status < 200 || res.status >= 300) return false;
  const parsed = parseJsonBody(res);
  return parsed !== null && typeof parsed === "object";
}

/**
 * Fetch usage with a given access token. Returns a snapshot, or the sentinel
 * `"expired"` when the token is rejected (401/403) so the caller can refresh and
 * retry. Prefers the modern token-rate-limit billing, falling back to legacy.
 */
async function fetchFactoryUsage(
  http: HttpClient,
  now: number,
  accessToken: string,
): Promise<UsageSnapshot | "expired"> {
  let authRes: HttpResponse;
  let limitsRes: HttpResponse;
  try {
    [authRes, limitsRes] = await Promise.all([
      factoryRequest(http, FACTORY_AUTH_ME_ENDPOINT, accessToken, 15_000),
      factoryRequest(http, FACTORY_BILLING_LIMITS_ENDPOINT, accessToken, 15_000),
    ]);
  } catch {
    return factorySnap("error", now);
  }
  if (authRes.status === 401 || authRes.status === 403) return "expired";
  if (authRes.status === 429) return factorySnap("rate-limited", now);
  if (authRes.status < 200 || authRes.status >= 300) {
    return factorySnap("error", now, `HTTP ${authRes.status}`);
  }
  // A 200 already proves the token authenticated; identity is best-effort (the
  // body shape can vary and the windows come from billing/limits).
  const auth = (parseJsonBody(authRes) ?? {}) as FactoryAuthResponse;
  const limits =
    limitsRes.status >= 200 && limitsRes.status < 300
      ? (parseJsonBody(limitsRes) as FactoryBillingLimitsResponse | undefined)
      : undefined;

  // TODO(factory-debug): remove. Raw billing/limits body — usage %s + reset
  // times only, no secrets — to confirm the Core pool numbers are correct.
  console.error(
    `[factory-debug] limits ${limitsRes.status}: ${limitsRes.body.slice(0, 700).replace(/\s+/g, " ")}`,
  );

  if (limits?.usesTokenRateLimitsBilling && limits.limits) {
    return parseFactoryUsage(auth, limits, undefined, now);
  }

  const userId = readIdentity(auth).userId;
  const usageUrl = `${FACTORY_USAGE_ENDPOINT}?useCache=true${
    userId ? `&userId=${encodeURIComponent(userId)}` : ""
  }`;
  let usageRes: HttpResponse;
  try {
    usageRes = await factoryRequest(http, usageUrl, accessToken, 15_000);
  } catch {
    return factorySnap("error", now);
  }
  if (usageRes.status === 401 || usageRes.status === 403) return "expired";
  if (usageRes.status === 429) return factorySnap("rate-limited", now);
  if (usageRes.status < 200 || usageRes.status >= 300) {
    return factorySnap("error", now, `HTTP ${usageRes.status}`);
  }
  return parseFactoryUsage(auth, undefined, parseJsonBody(usageRes), now);
}

/**
 * Collect Factory/Droid usage. Factory keeps no session cookie — the in-app
 * login captures the WorkOS tokens from app.factory.ai localStorage. We hold the
 * (long-lived, rotating) refresh token, exchange it for a short-lived access
 * token as needed, and call the Factory API with that Bearer. Returns
 * `auth-missing` when no token is stored or the refresh token is dead.
 */
export async function collectFactory(
  host: HostPort,
  _opts?: CollectOptions,
): Promise<UsageSnapshot> {
  const now = host.now();
  const refreshToken = unwrapStoredToken(
    await host.credentials.getSecret(FACTORY_PROVIDER_ID, "refresh-token"),
  );
  if (!refreshToken) return factorySnap("auth-missing", now);

  // Try a cached access token first to avoid a WorkOS round-trip — and the
  // refresh-token rotation it triggers — on every poll; refresh only when the
  // cached token is missing or rejected.
  const cached = unwrapStoredToken(
    await host.credentials.getSecret(FACTORY_PROVIDER_ID, "access-token"),
  );
  if (cached) {
    const result = await fetchFactoryUsage(host.http, now, cached);
    if (result !== "expired") return result;
  }

  const refreshed = await refreshWorkOSToken(host.http, refreshToken);
  if (refreshed.kind === "invalid") return factorySnap("auth-missing", now);
  if (refreshed.kind === "transient") {
    return factorySnap("error", now, "WorkOS token refresh failed");
  }

  await host.credentials.setSecret?.(FACTORY_PROVIDER_ID, "access-token", refreshed.accessToken);
  if (refreshed.refreshToken) {
    await host.credentials.setSecret?.(
      FACTORY_PROVIDER_ID,
      "refresh-token",
      refreshed.refreshToken,
    );
  }

  const result = await fetchFactoryUsage(host.http, now, refreshed.accessToken);
  // A freshly minted token still rejected means the session is gone.
  return result === "expired" ? factorySnap("auth-missing", now) : result;
}
