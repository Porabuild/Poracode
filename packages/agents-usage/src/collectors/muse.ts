import { parseRetryAfter, toEpochMs } from "../formatters";
import type { CollectOptions, HostPort, HttpResponse } from "../host";
import type { UsageSnapshot, UsageWindow } from "../types";

/**
 * Muse Code (Meta). Usage is read from the same key endpoint the CLI itself
 * calls: it mints (idempotently — the same `api_key` is returned every call)
 * the Meta Model API key for the stored device-code login and reports the
 * subscription state alongside it.
 *
 *   POST https://api.meta.ai/muse-code/key
 *     headers: Authorization: Bearer <dca access_token>, Content-Type: application/json
 *     body: {} (a body is required — empty posts are rejected with 400)
 *     → { subs_tier_name, user_email, user_full_name, is_subs_active,
 *         subs_usage?: { window?: { used_percent, resets_at, window_duration_mins },
 *                         weekly?: { used_percent, resets_at } } }
 *
 * Auth is the `access_token` (`dca:...`) from `~/.config/muse/auth.json
 * `providers.meta` (resolved host-side, see `museCredentials.ts`) — notably
 * NOT `META_API_KEY` / the `api_key` field, which the endpoint rejects with
 * 401. Pay-as-you-go keys have no subscription quota, so a key-only setup
 * correctly reports `auth-missing` and the card prompts for `muse login`.
 *
 * `subs_usage` carries the current-window + weekly quota percents the CLI's
 * `/usage` overlay shows. The endpoint omits it when there is nothing to
 * report (verified: a fresh Everyday Usage subscription returns plan/account
 * only), so windows are emitted only when present — an `ok` snapshot with
 * plan + account and no windows means "signed in, no meters exposed", never
 * a healthy 0%.
 */

export const MUSE_PROVIDER_ID = "muse" as const;

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
  const data = (body ?? {}) as MuseKeyResponse;
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

/**
 * Collect Muse Code subscription state. Reads the CLI's device-code access
 * token host-side; returns `auth-missing` when the user is not logged in
 * (`muse login`) so the card can prompt for sign-in.
 */
export async function collectMuse(host: HostPort, _opts?: CollectOptions): Promise<UsageSnapshot> {
  const now = host.now();
  const token = await host.credentials.getOAuthToken(MUSE_PROVIDER_ID);
  if (!token?.accessToken) return authMissing(now);

  let res: HttpResponse;
  try {
    res = await host.http.request({
      method: "POST",
      url: MUSE_KEY_ENDPOINT,
      headers: {
        Authorization: `Bearer ${token.accessToken}`,
        Accept: "application/json",
        "Content-Type": "application/json",
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
