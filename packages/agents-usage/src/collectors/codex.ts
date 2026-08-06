import { DEFAULT_CLIENT_VERSIONS } from "../clientVersions";
import { toEpochMs } from "../formatters";
import type { CollectOptions, HostPort, HttpResponse } from "../host";
import type { UsageSnapshot, UsageWindow } from "../types";

/**
 * Codex (OpenAI / ChatGPT). Reuses the Codex CLI OAuth token the host resolves
 * from ~/.codex/auth.json and reads the ChatGPT usage endpoint. The token is a
 * short-lived JWT — the host must read it fresh each call, never cache it.
 *
 * Codex rate-limit windows identify their cadence by duration. The API may
 * temporarily omit either the 300-minute session window or the 10080-minute
 * weekly window, so `primary` / `secondary` positions are only fallbacks when
 * duration metadata is absent. `used_percent` is already 0-100; reset times are
 * epoch seconds. Percentages are also mirrored in `x-codex-primary-used-percent`
 * / `x-codex-secondary-used-percent` headers, used as a fallback when the JSON
 * body omits them.
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
  used_percent?: number | string;
  reset_at?: number | string;
  resets_at?: number | string;
  reset_after_seconds?: number | string;
  limit_window_seconds?: number | string;
  window_minutes?: number | string;
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
  credits?: { has_credits?: boolean; unlimited?: boolean; balance?: number | string };
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
  const resetAfterSeconds = numericValue(raw?.reset_after_seconds);
  if (resetAfterSeconds !== undefined) return nowMs + resetAfterSeconds * 1000;
  return undefined;
}

function codexWindow(
  id: UsageWindow["id"],
  label: string,
  raw: CodexWindowRaw | undefined,
  headerPercent: number | undefined,
  nowMs: number,
): UsageWindow | undefined {
  const usedPercent = codexPercent(numericValue(raw?.used_percent) ?? headerPercent);
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

function codexWindowCadence(
  raw: CodexWindowRaw | undefined,
  fallback: "session-5h" | "weekly",
): "session-5h" | "weekly" {
  const limitSeconds = numericValue(raw?.limit_window_seconds);
  const windowMinutes =
    numericValue(raw?.window_minutes) ??
    (limitSeconds === undefined ? undefined : limitSeconds / 60);
  if (windowMinutes === WEEKLY_WINDOW_MINUTES) return "weekly";
  if (windowMinutes === SESSION_WINDOW_MINUTES) return "session-5h";
  return fallback;
}

function codexPercent(value: number | undefined): number | undefined {
  if (value === undefined || !Number.isFinite(value) || value < 0) return undefined;
  return Math.min(100, Math.max(0, Math.round(value * 10) / 10));
}

function numericValue(value: unknown): number | undefined {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim().length > 0
        ? Number(value)
        : undefined;
  return parsed !== undefined && Number.isFinite(parsed) ? parsed : undefined;
}

function codexLimitId(value: string | undefined): string {
  const id = value
    ?.trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return id || "additional";
}

function capitalize(segment: string): string {
  return segment.length <= 1 ? segment : segment[0]!.toUpperCase() + segment.slice(1);
}

/** Normalize a limit name to a model-id slug (keeps dots, e.g. `gpt-5.3-codex-spark`). */
function codexUsageModelId(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Render a Codex-family model id ("gpt-5.3-codex-spark") as "Codex 5.3 Spark". */
function formatCodexFamilyModelLabel(baseId: string): string | undefined {
  const codex = /^gpt-(\d+(?:\.\d+)?)-codex(?:-(spark|max|mini))?$/i.exec(baseId);
  if (!codex) return undefined;
  const suffix = codex[2] ? ` ${capitalize(codex[2])}` : "";
  return `Codex ${codex[1]}${suffix}`;
}

/**
 * Display label for an additional rate limit: prefer the friendly Codex-family
 * name ("Codex 5.3 Spark") when the limit name is a `gpt-*-codex` model, else
 * the raw limit name. Owned by the collector so the shared UI bar stays
 * provider-agnostic.
 */
function codexLimitLabel(limitName: string | undefined): string {
  const base = limitName?.trim() || "Additional Codex";
  return formatCodexFamilyModelLabel(codexUsageModelId(base)) ?? base;
}

function readHeaderNumber(headers: Record<string, string>, name: string): number | undefined {
  // Headers may arrive with any casing; scan case-insensitively.
  const target = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === target) {
      return numericValue(value);
    }
  }
  return undefined;
}

function readCodexCreditBalance(
  data: CodexUsageResponse,
  headers: Record<string, string>,
): number | undefined {
  const bodyBalance = numericValue(data.credits?.balance);
  if (bodyBalance !== undefined) return Math.max(0, bodyBalance);
  if (data.credits?.has_credits === false) return 0;

  const headerBalance = readHeaderNumber(headers, "x-codex-credits-balance");
  return headerBalance === undefined ? undefined : Math.max(0, headerBalance);
}

/** Pure: map a parsed `/wham/usage` body + response headers to a snapshot. */
export function parseCodexUsage(
  body: unknown,
  headers: Record<string, string>,
  nowMs: number,
): UsageSnapshot {
  const data = (body ?? {}) as CodexUsageResponse;
  const primaryHeader = readHeaderNumber(headers, "x-codex-primary-used-percent");
  const secondaryHeader = readHeaderNumber(headers, "x-codex-secondary-used-percent");

  const windows: UsageWindow[] = [];
  const primaryCadence = codexWindowCadence(data.rate_limit?.primary_window, "session-5h");
  const primaryWindow = codexWindow(
    primaryCadence,
    primaryCadence === "weekly" ? "Weekly" : "Session (5h)",
    data.rate_limit?.primary_window,
    primaryHeader,
    nowMs,
  );
  if (primaryWindow) windows.push(primaryWindow);
  const secondaryCadence = codexWindowCadence(data.rate_limit?.secondary_window, "weekly");
  const secondaryWindow = codexWindow(
    secondaryCadence,
    secondaryCadence === "weekly" ? "Weekly" : "Session (5h)",
    data.rate_limit?.secondary_window,
    secondaryHeader,
    nowMs,
  );
  if (secondaryWindow) windows.push(secondaryWindow);
  for (const extra of data.additional_rate_limits ?? []) {
    const id = codexLimitId(extra.metered_feature ?? extra.limit_name);
    const label = codexLimitLabel(extra.limit_name);
    const extraPrimaryCadence = codexWindowCadence(extra.rate_limit?.primary_window, "session-5h");
    const extraPrimaryWindow = codexWindow(
      `codex:${id}:${extraPrimaryCadence}`,
      extraPrimaryCadence === "weekly" ? `${label} Weekly` : `${label} (5h)`,
      extra.rate_limit?.primary_window,
      undefined,
      nowMs,
    );
    if (extraPrimaryWindow) windows.push(extraPrimaryWindow);
    const extraSecondaryCadence = codexWindowCadence(extra.rate_limit?.secondary_window, "weekly");
    const extraSecondaryWindow = codexWindow(
      `codex:${id}:${extraSecondaryCadence}`,
      extraSecondaryCadence === "weekly" ? `${label} Weekly` : `${label} (5h)`,
      extra.rate_limit?.secondary_window,
      undefined,
      nowMs,
    );
    if (extraSecondaryWindow) windows.push(extraSecondaryWindow);
  }

  const plan = formatCodexPlanLabel(data.plan_type);
  const balance = readCodexCreditBalance(data, headers);
  const credits =
    balance !== undefined || data.credits?.unlimited === true
      ? {
          balance: balance ?? 0,
          ...(data.credits?.unlimited === true ? { unlimited: true } : {}),
        }
      : undefined;

  return {
    providerId: "codex",
    status: "ok",
    windows,
    fetchedAt: nowMs,
    ...(plan ? { plan } : {}),
    ...(credits ? { credits } : {}),
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
