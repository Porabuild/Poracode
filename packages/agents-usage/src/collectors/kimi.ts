import { parseRetryAfter, toEpochMs } from "../formatters";
import type { CollectOptions, HostPort, HttpClient, HttpResponse, OAuthToken } from "../host";
import type { UsageSnapshot, UsageWindow } from "../types";

/**
 * Kimi For Coding (kimi.com/code). Usage lives behind the Kimi Code API the
 * official CLI calls; it authenticates with a Bearer credential sourced two
 * ways (mirroring CodexBar, github.com/steipete/codexbar): a Kimi Code API key
 * from the console (pasted in-app or `KIMI_CODE_API_KEY`), or the Kimi Code
 * CLI's access token resolved host-side from `~/.kimi-code/credentials/`
 * (`getOAuthToken`). The pasted key wins.
 *
 *   GET {base}/coding/v1/usages
 *     headers: Authorization: Bearer <key>, Accept: application/json
 *     → { usage: { limit, used, remaining, resetTime }, limits: [...] }
 *
 * `usage` is the weekly request quota from the membership tier (Andante 1,024 /
 * Moderato 2,048 / Allegretto 7,168 requests per week); `limits[]` carries the
 * rolling rate limits, in practice one 300-minute (5-hour) request window. All
 * counters arrive as decimal strings, `resetTime` as an ISO timestamp. The
 * endpoint is private and may rotate without notice; responses are normalized
 * into the shared `UsageSnapshot` shape.
 */

export const KIMI_PROVIDER_ID = "kimi" as const;

export const KIMI_USAGES_ENDPOINT = "https://api.kimi.com/coding/v1/usages";

interface KimiUsageDetailRaw {
  /** Total cap for the window, a decimal string (e.g. "2048"). */
  limit?: string | number;
  used?: string | number;
  remaining?: string | number;
  /** ISO-8601 timestamp; snake_case / `resetAt` variants appear in the wild. */
  resetTime?: string | number;
  resetAt?: string | number;
  reset_time?: string | number;
  reset_at?: string | number;
}

interface KimiRateLimitRaw {
  window?: { duration?: number; timeUnit?: string };
  detail?: KimiUsageDetailRaw;
}

export interface KimiUsagesResponse {
  usage?: KimiUsageDetailRaw;
  limits?: KimiRateLimitRaw[];
}

/** Counters arrive as decimal strings ("2048"); tolerate numbers too. */
function toCount(value: string | number | undefined): number | undefined {
  if (value === undefined || value === null) return undefined;
  const n = typeof value === "number" ? value : Number(String(value).trim());
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

function resetEpochMs(detail: KimiUsageDetailRaw): number | undefined {
  return toEpochMs(
    detail.resetTime ?? detail.resetAt ?? detail.reset_time ?? detail.reset_at ?? undefined,
  );
}

/** Used percent from a detail block: prefer `used`, fall back to limit-remaining. */
function usedPercentFor(detail: KimiUsageDetailRaw): number | undefined {
  const limit = toCount(detail.limit);
  if (limit === undefined || limit <= 0) return undefined;
  const used = toCount(detail.used);
  const remaining = toCount(detail.remaining);
  const usedRaw = used ?? (remaining !== undefined ? limit - remaining : undefined);
  if (usedRaw === undefined) return undefined;
  return (Math.max(0, Math.min(limit, usedRaw)) / limit) * 100;
}

function toWindow(
  detail: KimiUsageDetailRaw,
  id: UsageWindow["id"],
  label: string,
): UsageWindow | undefined {
  const usedPercent = usedPercentFor(detail);
  if (usedPercent === undefined) return undefined;
  // Percent only: the raw request counts would just repeat the percentage on
  // the card (the caps are round numbers like 100), so they stay off the window.
  const window: UsageWindow = { id, label, usedPercent };
  const resetsAt = resetEpochMs(detail);
  if (resetsAt !== undefined) window.resetsAt = resetsAt;
  return window;
}

/** Rate-limit window length in minutes from `window.duration` + `timeUnit`. */
function rateLimitMinutes(raw: KimiRateLimitRaw): number | undefined {
  const duration = raw.window?.duration;
  if (typeof duration !== "number" || !Number.isFinite(duration) || duration <= 0) return undefined;
  switch (raw.window?.timeUnit) {
    case "TIME_UNIT_MINUTE":
      return duration;
    case "TIME_UNIT_HOUR":
      return duration * 60;
    case "TIME_UNIT_DAY":
      return duration * 24 * 60;
    default:
      return undefined;
  }
}

/**
 * Pure: map a parsed `/coding/v1/usages` body to a `UsageSnapshot`. The top-level
 * `usage` block is the weekly membership quota; the shortest `limits[]` entry is
 * the rolling 5-hour rate limit. Longer rate limits (none observed today) are
 * ignored rather than guessed into a window id.
 */
export function parseKimiUsage(data: unknown, nowMs: number): UsageSnapshot {
  const block = (data ?? {}) as KimiUsagesResponse;
  // Fast window first: the 5h rate limit leads, the weekly quota follows,
  // matching the Claude/Codex card order.
  const windows: UsageWindow[] = [];

  const limits = Array.isArray(block.limits) ? block.limits : [];
  const rated = limits
    .filter((raw): raw is KimiRateLimitRaw => !!raw && typeof raw === "object" && !!raw.detail)
    .map((raw) => ({ raw, minutes: rateLimitMinutes(raw) }))
    .filter((entry) => entry.minutes === undefined || entry.minutes <= 6 * 60)
    .sort(
      (a, b) => (a.minutes ?? Number.POSITIVE_INFINITY) - (b.minutes ?? Number.POSITIVE_INFINITY),
    );
  const session = rated[0]
    ? toWindow(rated[0].raw.detail!, "session-5h", "Session (5h)")
    : undefined;
  if (session) windows.push(session);

  if (block.usage && typeof block.usage === "object") {
    const weekly = toWindow(block.usage, "weekly", "Weekly");
    if (weekly) windows.push(weekly);
  }

  return {
    providerId: KIMI_PROVIDER_ID,
    status: "ok",
    windows,
    fetchedAt: nowMs,
  };
}

/**
 * Resolve the usages endpoint. A host-side resolver may attach `baseUrl` (the
 * `KIMI_CODE_BASE_URL` override) to the token's `raw` bag; absent that, the
 * public Kimi Code API host is used. Mirrors CodexBar's endpoint builder: a
 * base already ending in `/coding` or `/coding/v1` is not double-suffixed.
 */
export function resolveKimiUsagesUrl(token: OAuthToken | undefined): string {
  const raw = token?.raw as { baseUrl?: unknown } | undefined;
  const base = typeof raw?.baseUrl === "string" ? raw.baseUrl.trim() : "";
  if (!base) return KIMI_USAGES_ENDPOINT;
  const withScheme = /^https?:\/\//i.test(base) ? base : `https://${base}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return KIMI_USAGES_ENDPOINT;
  }
  const path = url.pathname.replace(/\/+$/, "");
  if (path.endsWith("/coding/v1")) url.pathname = `${path}/usages`;
  else if (path.endsWith("/coding")) url.pathname = `${path}/v1/usages`;
  else url.pathname = `${path}/coding/v1/usages`;
  return url.toString();
}

/**
 * Identity headers a host-side resolver attaches for CLI-sourced tokens (the
 * official client sends `X-Msh-*` device identity with them; a plain API key
 * needs none).
 */
function identityHeaders(token: OAuthToken | undefined): Record<string, string> {
  const raw = token?.raw as { identityHeaders?: unknown } | undefined;
  const bag = raw?.identityHeaders;
  if (!bag || typeof bag !== "object") return {};
  const headers: Record<string, string> = {};
  for (const [name, value] of Object.entries(bag as Record<string, unknown>)) {
    if (typeof value === "string" && value.trim()) headers[name] = value;
  }
  return headers;
}

function kimiRequest(
  http: HttpClient,
  url: string,
  bearer: string,
  extraHeaders: Record<string, string>,
): Promise<HttpResponse> {
  return http.request({
    method: "GET",
    url,
    headers: {
      ...extraHeaders,
      Authorization: `Bearer ${bearer}`,
      Accept: "application/json",
    },
    timeoutMs: 15_000,
  });
}

function authMissing(now: number, error?: string): UsageSnapshot {
  return {
    providerId: KIMI_PROVIDER_ID,
    status: "auth-missing",
    windows: [],
    fetchedAt: now,
    ...(error ? { error } : {}),
  };
}

function errorSnapshot(now: number, error: string): UsageSnapshot {
  return { providerId: KIMI_PROVIDER_ID, status: "error", windows: [], fetchedAt: now, error };
}

/**
 * Collect Kimi For Coding usage. Reads the pasted API key first (an explicit
 * user action), then the host-resolved credential (env key or the Kimi Code
 * CLI's access token); returns `auth-missing` when neither is present so the
 * card can prompt for sign-in.
 */
export async function collectKimi(host: HostPort, _opts?: CollectOptions): Promise<UsageSnapshot> {
  const now = host.now();
  const [pastedValue, token] = await Promise.all([
    host.credentials.getSecret(KIMI_PROVIDER_ID, "apiKey"),
    host.credentials.getOAuthToken(KIMI_PROVIDER_ID),
  ]);
  const pasted = pastedValue?.trim();
  const bearer = pasted || token?.accessToken?.trim();
  if (!bearer) return authMissing(now);

  // Identity headers belong to the CLI token; never send them with a pasted key.
  const extraHeaders = pasted ? {} : identityHeaders(token);
  const res = await kimiRequest(host.http, resolveKimiUsagesUrl(token), bearer, extraHeaders);
  if (res.status === 401 || res.status === 403) {
    return authMissing(now, `token rejected (${res.status})`);
  }
  if (res.status === 429) {
    const snapshot: UsageSnapshot = {
      providerId: KIMI_PROVIDER_ID,
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

  const body = res.body?.trim();
  if (!body) return errorSnapshot(now, "empty response");

  let parsed: KimiUsagesResponse;
  try {
    parsed = JSON.parse(body) as KimiUsagesResponse;
  } catch {
    return errorSnapshot(now, "invalid JSON response");
  }
  if (!parsed.usage && !Array.isArray(parsed.limits)) {
    return errorSnapshot(now, "missing usage data");
  }

  return parseKimiUsage(parsed, now);
}
