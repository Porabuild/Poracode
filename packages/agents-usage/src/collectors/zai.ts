import { toEpochMs } from "../formatters";
import type { CollectOptions, HostPort, HttpClient, HttpResponse, OAuthToken } from "../host";
import type { UsageSnapshot, UsageWindow, UsageWindowId } from "../types";

/**
 * z.ai / Zhipu GLM Coding Plan. The plan's quota lives behind the same private
 * monitoring API the official tools call; it authenticates with a long-lived
 * API key (Bearer), not a browser cookie. Lightcode sources that key two ways
 * (mirroring CodexBar, github.com/steipete/CodexBar): the native `Z_AI_API_KEY`
 * environment / config resolved host-side (`getOAuthToken`), or a key the user
 * pasted into the in-app sign-in (`getSecret(id,"apiKey")`). The pasted key wins.
 *
 *   GET {host}/api/monitor/usage/quota/limit
 *     headers: Authorization: Bearer <key>, Accept: application/json
 *     → { code, msg, success, data: { limits: [...], planName? } }
 *
 * `data.limits[]` carries `TOKENS_LIMIT` entries (the 5-hour and weekly token
 * windows) and an optional `TIME_LIMIT` entry (the MCP/monthly marker). Each
 * entry's `usage` is the TOTAL cap, `remaining`/`currentValue` the consumption,
 * `number`+`unit` the window length, and `nextResetTime` an epoch-ms reset. The
 * endpoint is private and may rotate without notice; responses are normalized
 * into the shared `UsageSnapshot` shape.
 */

export const ZAI_PROVIDER_ID = "zai" as const;

export const ZAI_GLOBAL_QUOTA_ENDPOINT = "https://api.z.ai/api/monitor/usage/quota/limit";
export const ZAI_BIGMODEL_QUOTA_ENDPOINT = "https://open.bigmodel.cn/api/monitor/usage/quota/limit";
const ZAI_QUOTA_PATH = "api/monitor/usage/quota/limit";

/** z.ai limit `unit` codes (see CodexBar's ZaiLimitUnit). */
const ZAI_UNIT_DAYS = 1;
const ZAI_UNIT_HOURS = 3;
const ZAI_UNIT_MINUTES = 5;
const ZAI_UNIT_WEEKS = 6;

interface ZaiLimitRaw {
  type?: string;
  unit?: number;
  number?: number;
  /** TOTAL cap for the window (confusingly named on the wire). */
  usage?: number;
  currentValue?: number;
  remaining?: number;
  /** API-provided utilization, 0-100. Used only when we can't compute it. */
  percentage?: number;
  /** Epoch milliseconds. */
  nextResetTime?: number;
}

interface ZaiQuotaData {
  limits?: ZaiLimitRaw[];
  planName?: string;
  plan?: string;
  plan_type?: string;
  packageName?: string;
  /** The coding-plan tier on real responses, lowercase (e.g. "pro"). */
  level?: string;
}

export interface ZaiQuotaResponse {
  code?: number;
  msg?: string;
  success?: boolean;
  data?: ZaiQuotaData;
}

function finite(value: number | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, value));
}

/** Window length in minutes from a limit's `unit` + `number`, or undefined. */
function windowMinutes(raw: ZaiLimitRaw): number | undefined {
  const number = finite(raw.number);
  if (number === undefined || number <= 0) return undefined;
  switch (raw.unit) {
    case ZAI_UNIT_MINUTES:
      return number;
    case ZAI_UNIT_HOURS:
      return number * 60;
    case ZAI_UNIT_DAYS:
      return number * 24 * 60;
    case ZAI_UNIT_WEEKS:
      return number * 7 * 24 * 60;
    default:
      return undefined;
  }
}

/**
 * Utilization for a limit entry. Mirrors CodexBar: prefer a value computed from
 * the real cap (`usage`) and consumption (`remaining`/`currentValue`) over the
 * API's own `percentage`, and never invent missing fields (which would read as
 * 100% used). Returns the API `percentage` as a fallback when the cap is absent.
 */
function usedPercentFor(raw: ZaiLimitRaw): number {
  const limit = finite(raw.usage);
  if (limit !== undefined && limit > 0) {
    const remaining = finite(raw.remaining);
    const currentValue = finite(raw.currentValue);
    let usedRaw: number | undefined;
    if (remaining !== undefined) {
      const fromRemaining = limit - remaining;
      usedRaw = currentValue !== undefined ? Math.max(fromRemaining, currentValue) : fromRemaining;
    } else if (currentValue !== undefined) {
      usedRaw = currentValue;
    }
    if (usedRaw !== undefined) {
      const used = Math.max(0, Math.min(limit, usedRaw));
      return clampPercent((used / limit) * 100);
    }
  }
  return clampPercent(finite(raw.percentage) ?? 0);
}

const WINDOW_LABELS: Record<string, string> = {
  "session-5h": "Session (5h)",
  weekly: "Weekly",
  monthly: "Monthly",
};

// The TIME_LIMIT entry is z.ai's monthly MCP-tools quota — the dashboard's
// "Total Monthly Web Search / Reader / Zread Quota". It rides the `monthly`
// window id (so it reuses calendar-month pacing) but carries this label so the
// panel shows "MCP" instead of the generic "Monthly" (and so it never collides
// with a token-based monthly window's "Monthly" label). Matches CodexBar's card.
export const ZAI_MCP_LABEL = "MCP";

function toWindow(raw: ZaiLimitRaw, id: UsageWindowId, label?: string): UsageWindow {
  const resetsAt = toEpochMs(raw.nextResetTime);
  const window: UsageWindow = {
    id,
    label: label ?? WINDOW_LABELS[id] ?? id,
    usedPercent: usedPercentFor(raw),
  };
  if (resetsAt !== undefined) window.resetsAt = resetsAt;
  return window;
}

/** Map a single token window's duration onto a canonical window id. */
function tokenWindowId(minutes: number | undefined): UsageWindowId {
  if (minutes !== undefined && minutes <= 6 * 60) return "session-5h";
  if (minutes !== undefined && minutes <= 10 * 24 * 60) return "weekly";
  return "monthly";
}

// z.ai coding-plan tiers arrive lowercase in `level` ("lite"/"pro"/"max");
// title-case the known ones for display. The name keys are shown as-is.
const ZAI_LEVEL_LABELS: Record<string, string> = { lite: "Lite", pro: "Pro", max: "Max" };

function planLabel(data: ZaiQuotaData): string | undefined {
  for (const candidate of [data.planName, data.plan, data.plan_type, data.packageName]) {
    const trimmed = typeof candidate === "string" ? candidate.trim() : "";
    if (trimmed) return trimmed;
  }
  // Real responses carry the tier in `level` (none of the name keys above).
  const level = typeof data.level === "string" ? data.level.trim() : "";
  if (level) return ZAI_LEVEL_LABELS[level.toLowerCase()] ?? level;
  return undefined;
}

/**
 * Pure: map a parsed `data` block (the `data` field of the quota response) to a
 * `UsageSnapshot`. Two `TOKENS_LIMIT` entries become the shorter window
 * (`session-5h`) and the longer one (`weekly`); a lone token entry is placed by
 * its own duration. The `TIME_LIMIT` entry is the monthly MCP-tools quota and
 * surfaces as a `monthly` window labeled "MCP".
 */
export function parseZaiUsage(data: unknown, nowMs: number): UsageSnapshot {
  const block = (data ?? {}) as ZaiQuotaData;
  const limits = Array.isArray(block.limits) ? block.limits : [];

  const tokenLimits: { raw: ZaiLimitRaw; minutes: number | undefined }[] = [];
  let timeLimit: ZaiLimitRaw | undefined;
  for (const raw of limits) {
    if (!raw || typeof raw !== "object") continue;
    if (raw.type === "TOKENS_LIMIT") tokenLimits.push({ raw, minutes: windowMinutes(raw) });
    else if (raw.type === "TIME_LIMIT") timeLimit = raw;
  }

  const windows: UsageWindow[] = [];
  if (tokenLimits.length >= 2) {
    const sorted = [...tokenLimits].sort(
      (a, b) => (a.minutes ?? Number.POSITIVE_INFINITY) - (b.minutes ?? Number.POSITIVE_INFINITY),
    );
    windows.push(toWindow(sorted[0]!.raw, "session-5h"));
    windows.push(toWindow(sorted[sorted.length - 1]!.raw, "weekly"));
  } else if (tokenLimits.length === 1) {
    windows.push(toWindow(tokenLimits[0]!.raw, tokenWindowId(tokenLimits[0]!.minutes)));
  }
  if (timeLimit) windows.push(toWindow(timeLimit, "monthly", ZAI_MCP_LABEL));

  const plan = planLabel(block);
  const snapshot: UsageSnapshot = {
    providerId: ZAI_PROVIDER_ID,
    status: "ok",
    windows,
    fetchedAt: nowMs,
  };
  if (plan) snapshot.plan = plan;
  return snapshot;
}

/** Append the quota path to a host/base URL the way CodexBar's `quotaURL` does. */
function buildQuotaUrl(value: string): string {
  const withScheme = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return ZAI_GLOBAL_QUOTA_ENDPOINT;
  }
  if (url.pathname === "" || url.pathname === "/") {
    url.pathname = `/${ZAI_QUOTA_PATH}`;
  }
  return url.toString();
}

/**
 * Resolve the quota endpoint. A host-side resolver may attach `quotaUrl` (a full
 * URL override, e.g. a coding-plan endpoint) or `apiHost` (BigModel CN) to the
 * token's `raw` bag from the `Z_AI_QUOTA_URL` / `Z_AI_API_HOST` environment
 * overrides; absent those, the global endpoint is used.
 */
export function resolveZaiQuotaUrl(token: OAuthToken | undefined): string {
  const raw = token?.raw as { quotaUrl?: unknown; apiHost?: unknown } | undefined;
  const quotaUrl = typeof raw?.quotaUrl === "string" ? raw.quotaUrl.trim() : "";
  if (quotaUrl) return buildQuotaUrl(quotaUrl);
  const apiHost = typeof raw?.apiHost === "string" ? raw.apiHost.trim() : "";
  if (apiHost) return buildQuotaUrl(apiHost);
  return ZAI_GLOBAL_QUOTA_ENDPOINT;
}

function zaiRequest(http: HttpClient, url: string, apiKey: string): Promise<HttpResponse> {
  return http.request({
    method: "GET",
    url,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
    },
    timeoutMs: 15_000,
  });
}

function authMissing(now: number, error?: string): UsageSnapshot {
  return {
    providerId: ZAI_PROVIDER_ID,
    status: "auth-missing",
    windows: [],
    fetchedAt: now,
    ...(error ? { error } : {}),
  };
}

function errorSnapshot(now: number, error: string): UsageSnapshot {
  return { providerId: ZAI_PROVIDER_ID, status: "error", windows: [], fetchedAt: now, error };
}

/**
 * Collect z.ai GLM Coding Plan usage. Reads the pasted API key first (an explicit
 * user action), then the host-resolved native key; returns `auth-missing` when
 * neither is present so the card can prompt for sign-in.
 */
export async function collectZai(host: HostPort, _opts?: CollectOptions): Promise<UsageSnapshot> {
  const now = host.now();
  const pasted = (await host.credentials.getSecret(ZAI_PROVIDER_ID, "apiKey"))?.trim();
  const token = await host.credentials.getOAuthToken(ZAI_PROVIDER_ID);
  const apiKey = pasted || token?.accessToken?.trim();
  if (!apiKey) return authMissing(now);

  const res = await zaiRequest(host.http, resolveZaiQuotaUrl(token), apiKey);
  if (res.status === 401 || res.status === 403) {
    return authMissing(now, `token rejected (${res.status})`);
  }
  if (res.status === 429) {
    return { providerId: ZAI_PROVIDER_ID, status: "rate-limited", windows: [], fetchedAt: now };
  }
  if (res.status < 200 || res.status >= 300) {
    return errorSnapshot(now, `HTTP ${res.status}`);
  }

  const body = res.body?.trim();
  if (!body) {
    // A 200 with an empty body usually means the wrong region/host or a stale token.
    return errorSnapshot(now, "empty response (check API region or token)");
  }

  let parsed: ZaiQuotaResponse;
  try {
    parsed = JSON.parse(body) as ZaiQuotaResponse;
  } catch {
    return errorSnapshot(now, "invalid JSON response");
  }

  // Some auth failures arrive as HTTP 200 with `success:false`.
  if (parsed.success === false || (typeof parsed.code === "number" && parsed.code !== 200)) {
    const msg =
      typeof parsed.msg === "string" && parsed.msg.trim() ? parsed.msg.trim() : "request failed";
    if (/auth|token|unauth|forbidden|login|鉴权|登录/i.test(msg)) return authMissing(now, msg);
    return errorSnapshot(now, msg);
  }
  if (!parsed.data) return errorSnapshot(now, "missing data");

  return parseZaiUsage(parsed.data, now);
}
