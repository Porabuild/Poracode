import { parseRetryAfter, toEpochMs } from "../formatters";
import type { CollectOptions, HostPort, HttpResponse } from "../host";
import type { UsageSnapshot, UsageWindow } from "../types";
import { collectMuseDashboard, readMuseDashboardAccount, MUSE_PROVIDER_ID } from "./museDashboard";

/**
 * Reuses the Muse CLI's device-code login for quota, plan, and account details.
 * The optional dashboard session supplies fallback meters and billed spend.
 * Inference API keys cannot authenticate the CLI's `/muse-code/key` endpoint.
 */

export { MUSE_PROVIDER_ID };

export const MUSE_KEY_ENDPOINT = "https://api.meta.ai/muse-code/key";

interface MuseUsageWindowRaw {
  used_percent?: number;
  resets_at?: string | number;
  window_duration_mins?: number;
}

interface MuseSubsUsageRaw {
  /** The current (rolling 5-hour) request window. */
  window?: MuseUsageWindowRaw;
  weekly?: MuseUsageWindowRaw;
}

interface MuseKeyResponse {
  subs_tier_name?: unknown;
  user_email?: unknown;
  user_full_name?: unknown;
  subs_usage?: MuseSubsUsageRaw;
}

/** `used_percent` is already 0-100; clamp and round, never rescale. */
function normalizeMusePercent(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return undefined;
  return Math.min(100, Math.max(0, Math.round(value * 10) / 10));
}

function museWindow(
  id: UsageWindow["id"],
  label: string,
  raw: MuseUsageWindowRaw | undefined,
): UsageWindow | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const usedPercent = normalizeMusePercent(raw.used_percent);
  if (usedPercent === undefined) return undefined;
  const resetsAt = toEpochMs(raw.resets_at);
  return {
    id,
    label,
    usedPercent,
    unit: "percent",
    ...(resetsAt !== undefined ? { resetsAt } : {}),
  };
}

function nonEmpty(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

/**
 * Pure: map a parsed `/muse-code/key` body to a `UsageSnapshot`. The tier name
 * arrives as a full display name ("Muse Code Everyday Usage"), so it is used
 * verbatim as the plan. Windows come from `subs_usage` when the endpoint
 * reports it; otherwise the snapshot carries plan + account only.
 */
export function parseMuseUsage(body: unknown, nowMs: number): UsageSnapshot {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return errorSnapshot(nowMs, "invalid account response");
  }
  const data = body as MuseKeyResponse;
  const subsUsage =
    data.subs_usage && typeof data.subs_usage === "object" ? data.subs_usage : undefined;
  const windows: UsageWindow[] = [];
  // Current window first, weekly second — the Claude/Codex card order.
  const current = museWindow("session-5h", "Session (5h)", subsUsage?.window);
  if (current) windows.push(current);
  const weekly = museWindow("weekly", "Weekly", subsUsage?.weekly);
  if (weekly) windows.push(weekly);

  const plan = nonEmpty(data.subs_tier_name);
  const authenticatedAs = nonEmpty(data.user_email) ?? nonEmpty(data.user_full_name);
  if (!plan && !authenticatedAs && windows.length === 0) {
    return errorSnapshot(nowMs, "missing account and usage data");
  }
  return {
    providerId: MUSE_PROVIDER_ID,
    status: "ok",
    windows,
    fetchedAt: nowMs,
    ...(plan ? { plan } : {}),
    ...(authenticatedAs ? { authenticatedAs } : {}),
  };
}

function authMissing(now: number, error?: string): UsageSnapshot {
  return {
    providerId: MUSE_PROVIDER_ID,
    status: "auth-missing",
    windows: [],
    fetchedAt: now,
    ...(error ? { error } : {}),
  };
}

function errorSnapshot(now: number, error: string): UsageSnapshot {
  return { providerId: MUSE_PROVIDER_ID, status: "error", windows: [], fetchedAt: now, error };
}

/** CLI quota takes precedence; browser sign-in remains optional for extra data. */
export async function collectMuse(host: HostPort, _opts?: CollectOptions): Promise<UsageSnapshot> {
  const now = host.now();
  const primary = await collectMuseKeyEndpoint(host, now);
  // Honor the primary endpoint's backoff instead of masking it with another source.
  if (primary.status === "rate-limited") return primary;
  const cookie = (await host.credentials.getSecret(MUSE_PROVIDER_ID, "cookie"))?.trim();
  if (!cookie) return primary;
  const dashboard = await collectMuseDashboard(host, cookie, now);
  let selected = primary;
  let accountRetryAt: number | undefined;
  if (primary.status === "ok" && primary.windows.length > 0) {
    // Optional billing must belong to the CLI account, not another browser login.
    const account =
      dashboard.cost && primary.authenticatedAs
        ? await readMuseDashboardAccount(host, cookie, now)
        : undefined;
    const sameAccount =
      account?.email !== undefined &&
      account.email.toLowerCase() === primary.authenticatedAs?.toLowerCase();
    accountRetryAt = account?.rateLimitedUntil;
    selected = { ...primary, ...(sameAccount && dashboard.cost ? { cost: dashboard.cost } : {}) };
  } else if (dashboard.status === "ok" || primary.status !== "ok") {
    // Select a complete fallback without attaching another account's identity.
    selected = dashboard;
  }
  const retryAt = Math.max(
    accountRetryAt ?? 0,
    dashboard.rateLimitedUntil ?? (dashboard.status === "rate-limited" ? now + 5 * 60_000 : 0),
  );
  // An optional endpoint's cooldown still applies when primary quota is healthy.
  return { ...selected, ...(retryAt > 0 ? { rateLimitedUntil: retryAt } : {}) };
}

/** The CLI key-endpoint path: plan + account, meters only when reported. */
async function collectMuseKeyEndpoint(host: HostPort, now: number): Promise<UsageSnapshot> {
  const token = await host.credentials.getOAuthToken(MUSE_PROVIDER_ID);
  if (!token?.accessToken?.startsWith("dca:")) return authMissing(now);

  let res: HttpResponse;
  try {
    res = await host.http.request({
      method: "POST",
      url: MUSE_KEY_ENDPOINT,
      headers: {
        Authorization: `Bearer ${token.accessToken}`,
        Accept: "application/json",
        "Content-Type": "application/json",
        "x-api-version": "1.0.0",
        "User-Agent": "Poracode",
      },
      // The endpoint requires a (possibly empty-object) JSON body.
      body: "{}",
      timeoutMs: 15_000,
    });
  } catch {
    return errorSnapshot(now, "request failed");
  }
  if (res.status === 401 || res.status === 403) {
    return authMissing(now, `token rejected (${res.status})`);
  }
  if (res.status === 429) {
    const snapshot: UsageSnapshot = {
      providerId: MUSE_PROVIDER_ID,
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

  let parsed: unknown;
  try {
    parsed = JSON.parse(res.body);
  } catch {
    return errorSnapshot(now, "invalid JSON response");
  }
  return parseMuseUsage(parsed, now);
}
