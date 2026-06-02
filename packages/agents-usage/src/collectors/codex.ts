import { DEFAULT_CLIENT_VERSIONS } from "../clientVersions";
import { toEpochMs } from "../formatters";
import type { CollectOptions, HostPort, HttpResponse } from "../host";
import type { UsageSnapshot, UsageWindow } from "../types";

/**
 * Codex (OpenAI / ChatGPT). Reuses the Codex CLI OAuth token the host resolves
 * from ~/.codex/auth.json and reads the ChatGPT usage endpoint. The token is a
 * short-lived JWT — the host must read it fresh each call, never cache it.
 *
 * Codex exposes a 300-minute "primary" window (session, 5h) and a 10080-minute
 * "secondary" window (weekly). There is no monthly window. `used_percent` is
 * already 0-100; reset times are epoch seconds. Percentages are also mirrored
 * in `x-codex-primary-used-percent` / `x-codex-secondary-used-percent` headers,
 * used as a fallback when the JSON body omits them.
 *
 * Note: a more robust path spawns `codex app-server` and calls
 * `account/rateLimits/read` over JSON-RPC; that requires a ProcessRunner host
 * capability and is deferred to a later phase. This collector uses the HTTP
 * endpoint, which is fully testable from fixtures.
 */

export const CODEX_USAGE_ENDPOINT = "https://chatgpt.com/backend-api/wham/usage";

const SESSION_WINDOW_MINUTES = 300;
const WEEKLY_WINDOW_MINUTES = 10_080;

interface CodexWindowRaw {
  used_percent?: number;
  reset_at?: number;
  resets_at?: number;
  reset_after_seconds?: number;
  limit_window_seconds?: number;
  window_minutes?: number;
}

interface CodexUsageResponse {
  plan_type?: string;
  rate_limit?: {
    primary_window?: CodexWindowRaw;
    secondary_window?: CodexWindowRaw;
  };
  additional_rate_limits?: Array<{
    limit_name?: string;
    metered_feature?: string;
    rate_limit?: {
      primary_window?: CodexWindowRaw;
      secondary_window?: CodexWindowRaw;
    };
  }>;
  credits?: { has_credits?: boolean; unlimited?: boolean; balance?: number };
}

const CODEX_PLAN_LABELS: Record<string, string> = {
  free: "ChatGPT Free",
  go: "ChatGPT Go",
  plus: "ChatGPT Plus",
  pro: "ChatGPT Pro 20x",
  prolite: "ChatGPT Pro 5x",
  team: "ChatGPT Team",
  business: "ChatGPT Business",
  enterprise: "ChatGPT Enterprise",
  edu: "ChatGPT Edu",
};

export function formatCodexPlanLabel(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  const lower = trimmed.toLowerCase();
  return CODEX_PLAN_LABELS[lower] ?? trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

function resetFrom(raw: CodexWindowRaw | undefined, nowMs: number): number | undefined {
  const explicit = toEpochMs(raw?.reset_at ?? raw?.resets_at);
  if (explicit !== undefined) return explicit;
  if (raw?.reset_after_seconds !== undefined && Number.isFinite(raw.reset_after_seconds)) {
    return nowMs + raw.reset_after_seconds * 1000;
  }
  return undefined;
}

function codexWindow(
  id: UsageWindow["id"],
  label: string,
  raw: CodexWindowRaw | undefined,
  headerPercent: number | undefined,
  nowMs: number,
): UsageWindow | undefined {
  const usedPercent = codexPercent(raw?.used_percent ?? headerPercent);
  if (usedPercent === undefined) return undefined;
  const resetsAt = resetFrom(raw, nowMs);
  return {
    id,
    label,
    usedPercent,
    unit: "percent",
    ...(resetsAt !== undefined ? { resetsAt } : {}),
  };
}

function codexPercent(value: number | undefined): number | undefined {
  if (value === undefined || !Number.isFinite(value) || value < 0) return undefined;
  return Math.min(100, Math.max(0, Math.round(value * 10) / 10));
}

function codexLimitId(value: string | undefined): string {
  const id = value
    ?.trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return id || "additional";
}

function readHeaderPercent(headers: Record<string, string>, name: string): number | undefined {
  // Headers may arrive with any casing; scan case-insensitively.
  const target = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === target) {
      const parsed = Number.parseFloat(value);
      return Number.isFinite(parsed) ? parsed : undefined;
    }
  }
  return undefined;
}

/** Pure: map a parsed `/wham/usage` body + response headers to a snapshot. */
export function parseCodexUsage(
  body: unknown,
  headers: Record<string, string>,
  nowMs: number,
): UsageSnapshot {
  const data = (body ?? {}) as CodexUsageResponse;
  const primaryHeader = readHeaderPercent(headers, "x-codex-primary-used-percent");
  const secondaryHeader = readHeaderPercent(headers, "x-codex-secondary-used-percent");

  const windows: UsageWindow[] = [];
  const session = codexWindow(
    "session-5h",
    "Session (5h)",
    data.rate_limit?.primary_window,
    primaryHeader,
    nowMs,
  );
  if (session) windows.push(session);
  const weekly = codexWindow(
    "weekly",
    "Weekly",
    data.rate_limit?.secondary_window,
    secondaryHeader,
    nowMs,
  );
  if (weekly) windows.push(weekly);
  for (const extra of data.additional_rate_limits ?? []) {
    const id = codexLimitId(extra.metered_feature ?? extra.limit_name);
    const label = extra.limit_name?.trim() || "Additional Codex";
    const extraSession = codexWindow(
      `codex:${id}:session-5h`,
      `${label} (5h)`,
      extra.rate_limit?.primary_window,
      undefined,
      nowMs,
    );
    if (extraSession) windows.push(extraSession);
    const extraWeekly = codexWindow(
      `codex:${id}:weekly`,
      `${label} Weekly`,
      extra.rate_limit?.secondary_window,
      undefined,
      nowMs,
    );
    if (extraWeekly) windows.push(extraWeekly);
  }

  const plan = formatCodexPlanLabel(data.plan_type);
  const balance = data.credits?.balance;

  return {
    providerId: "codex",
    status: "ok",
    windows,
    fetchedAt: nowMs,
    ...(plan ? { plan } : {}),
    ...(typeof balance === "number"
      ? { credits: { balance, ...(data.credits?.unlimited ? { unlimited: true } : {}) } }
      : {}),
  };
}

export async function collectCodex(host: HostPort, _opts?: CollectOptions): Promise<UsageSnapshot> {
  const now = host.now();
  const token = await host.credentials.getOAuthToken("codex");
  if (!token?.accessToken) {
    return { providerId: "codex", status: "auth-missing", windows: [], fetchedAt: now };
  }

  const version = host.clientVersions?.codex ?? DEFAULT_CLIENT_VERSIONS.codex;
  const res: HttpResponse = await host.http.request({
    method: "GET",
    url: CODEX_USAGE_ENDPOINT,
    headers: {
      Authorization: `Bearer ${token.accessToken}`,
      Accept: "application/json",
      "User-Agent": `codex-cli/${version}`,
      ...(token.accountId ? { "ChatGPT-Account-Id": token.accountId } : {}),
    },
    timeoutMs: 15_000,
  });

  if (res.status === 401) {
    return {
      providerId: "codex",
      status: "auth-missing",
      windows: [],
      fetchedAt: now,
      error: "access token rejected (401)",
    };
  }
  if (res.status === 429) {
    return { providerId: "codex", status: "rate-limited", windows: [], fetchedAt: now };
  }
  if (res.status < 200 || res.status >= 300) {
    return {
      providerId: "codex",
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
      providerId: "codex",
      status: "error",
      windows: [],
      fetchedAt: now,
      error: "invalid JSON response",
    };
  }

  return parseCodexUsage(parsed, res.headers, now);
}

export { SESSION_WINDOW_MINUTES, WEEKLY_WINDOW_MINUTES };
