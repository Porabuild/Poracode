import { CookieJar } from "../cookieJar";
import type { CollectOptions, HostPort, HttpResponse, OAuthToken } from "../host";
import type { UsageSnapshot, UsageWindow } from "../types";

export const QWEN_PROVIDER_ID = "qwen" as const;

export type AlibabaCodingPlanRegion = "intl" | "cn";

const REGION_CONFIG = {
  intl: {
    baseUrl: "https://modelstudio.console.alibabacloud.com",
    consoleRpcBaseUrl: "https://bailian-singapore-cs.alibabacloud.com",
    consoleRpcAction: "IntlBroadScopeAspnGateway",
    consoleDomain: "modelstudio.console.alibabacloud.com",
    consoleSite: "MODELSTUDIO_ALBABACLOUD",
    currentRegionId: "ap-southeast-1",
    commodityCode: "sfm_codingplan_public_intl",
    tokenPlanCommodityCode: "sfm_tokenplansolo_public_intl",
    dashboardUrl:
      "https://modelstudio.console.alibabacloud.com/ap-southeast-1/?tab=plan#/efm/subscription/token-plan/personal",
    consoleRefererUrl: "https://modelstudio.console.alibabacloud.com/ap-southeast-1/?tab=plan",
  },
  cn: {
    baseUrl: "https://bailian.console.aliyun.com",
    consoleRpcBaseUrl: "https://bailian-cs.console.aliyun.com",
    consoleRpcAction: "BroadScopeAspnGateway",
    consoleDomain: "bailian.console.aliyun.com",
    consoleSite: "BAILIAN_ALIYUN",
    currentRegionId: "cn-beijing",
    commodityCode: "sfm_codingplan_public_cn",
    tokenPlanCommodityCode: "sfm_tokenplansolo_public_cn",
    dashboardUrl: "https://bailian.console.aliyun.com/cn-beijing/?tab=model#/efm/coding_plan",
    consoleRefererUrl: "https://bailian.console.aliyun.com/cn-beijing/?tab=model",
  },
} as const;

const QUOTA_ACTION = "zeldaEasy.broadscope-bailian.codingPlan.queryCodingPlanInstanceInfoV2";
const TOKEN_PLAN_SUBSCRIPTION_ACTION =
  "zeldaHttp.apikeyMgr./tokenplan/personal/api/v2/subscription";
const TOKEN_PLAN_USAGE_ACTION = "zeldaHttp.apikeyMgr./tokenplan/personal/api/v2/usage";
const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36";

function quotaUrl(region: AlibabaCodingPlanRegion): string {
  const config = REGION_CONFIG[region];
  const query = new URLSearchParams({
    action: QUOTA_ACTION,
    product: "broadscope-bailian",
    api: "queryCodingPlanInstanceInfoV2",
    currentRegionId: config.currentRegionId,
  });
  return `${config.baseUrl}/data/api.json?${query.toString()}`;
}

export const ALIBABA_CODING_PLAN_INTL_QUOTA_URL = quotaUrl("intl");
export const ALIBABA_CODING_PLAN_CN_QUOTA_URL = quotaUrl("cn");

function consoleRpcUrl(region: AlibabaCodingPlanRegion): string {
  const config = REGION_CONFIG[region];
  const query = new URLSearchParams({
    action: config.consoleRpcAction,
    product: "sfm_bailian",
    api: QUOTA_ACTION,
    _v: "undefined",
  });
  return `${config.consoleRpcBaseUrl}/data/api.json?${query.toString()}`;
}

export const ALIBABA_CODING_PLAN_INTL_CONSOLE_RPC_URL = consoleRpcUrl("intl");
export const ALIBABA_TOKEN_PLAN_INTL_DASHBOARD_URL = REGION_CONFIG.intl.dashboardUrl;

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function expandEmbeddedJson(value: unknown): unknown {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return value;
    try {
      return expandEmbeddedJson(JSON.parse(trimmed));
    } catch {
      return value;
    }
  }
  if (Array.isArray(value)) return value.map(expandEmbeddedJson);
  if (!isObject(value)) return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, nested]) => [key, expandEmbeddedJson(nested)]),
  );
}

function findObjectWithKey(value: unknown, keys: readonly string[]): JsonObject | undefined {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findObjectWithKey(item, keys);
      if (found) return found;
    }
    return undefined;
  }
  if (!isObject(value)) return undefined;
  if (keys.some((key) => value[key] !== undefined)) return value;
  for (const nested of Object.values(value)) {
    const found = findObjectWithKey(nested, keys);
    if (found) return found;
  }
  return undefined;
}

function findArray(value: unknown, keys: readonly string[]): unknown[] | undefined {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findArray(item, keys);
      if (found) return found;
    }
    return undefined;
  }
  if (!isObject(value)) return undefined;
  for (const key of keys) {
    if (Array.isArray(value[key])) return value[key];
  }
  for (const nested of Object.values(value)) {
    const found = findArray(nested, keys);
    if (found) return found;
  }
  return undefined;
}

function stringValue(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function firstString(value: unknown, keys: readonly string[]): string | undefined {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = firstString(item, keys);
      if (found) return found;
    }
    return undefined;
  }
  if (!isObject(value)) return undefined;
  for (const key of keys) {
    const found = stringValue(value[key]);
    if (found) return found;
  }
  for (const nested of Object.values(value)) {
    const found = firstString(nested, keys);
    if (found) return found;
  }
  return undefined;
}

function planName(value: unknown): string | undefined {
  const explicit = firstString(value, [
    "planName",
    "plan_name",
    "instanceName",
    "instance_name",
    "packageName",
    "package_name",
  ]);
  if (explicit) return explicit;

  // Alibaba's current personal Token Plan subscription endpoint calls the
  // tier `specCode`; the older Coding Plan endpoint calls it `instanceType`.
  // Keep the provider-native field names at this boundary and expose one
  // display-ready plan value to shared consumers.
  const tier = firstString(value, ["specCode", "spec_code", "instanceType", "instance_type"]);
  if (!tier) return undefined;
  switch (tier.toLowerCase()) {
    case "lite":
      return "Lite";
    case "standard":
      return "Standard";
    case "pro":
      return "Pro";
    case "max":
      return "Max";
    default:
      return undefined;
  }
}

function cookieValue(cookieHeader: string, name: string): string | undefined {
  for (const segment of cookieHeader.split(";")) {
    const part = segment.trim();
    const separator = part.indexOf("=");
    if (separator < 0 || part.slice(0, separator).trim() !== name) continue;
    return stringValue(part.slice(separator + 1));
  }
  return undefined;
}

function consoleSecTokenFromHtml(html: string): string | undefined {
  const patterns = [
    /SEC_TOKEN\s*:\s*["']([^"']+)["']/u,
    /secToken\s*:\s*["']([^"']+)["']/u,
    /sec_token\s*:\s*["']([^"']+)["']/u,
    /["']SEC_TOKEN["']\s*:\s*["']([^"']+)["']/u,
    /["']sec_token["']\s*:\s*["']([^"']+)["']/u,
  ];
  for (const pattern of patterns) {
    const value = pattern.exec(html)?.[1]?.trim();
    if (value) return value;
  }
  return undefined;
}

function finiteNumber(value: unknown): number | undefined {
  const number =
    typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(number) ? number : undefined;
}

function firstNumber(value: JsonObject, keys: readonly string[]): number | undefined {
  for (const key of keys) {
    const number = finiteNumber(value[key]);
    if (number !== undefined) return number;
  }
  return undefined;
}

function epochMs(value: unknown): number | undefined {
  const numeric = finiteNumber(value);
  if (numeric !== undefined && numeric >= 0) return numeric < 1e12 ? numeric * 1000 : numeric;
  if (typeof value !== "string") return undefined;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function firstEpochMs(value: JsonObject, keys: readonly string[]): number | undefined {
  for (const key of keys) {
    const parsed = epochMs(value[key]);
    if (parsed !== undefined) return parsed;
  }
  return undefined;
}

function activeScore(instance: JsonObject, now: number): number {
  const status = stringValue(instance.status ?? instance.instanceStatus)?.toUpperCase();
  if (status === "VALID" || status === "ACTIVE") return 3;
  if (
    status &&
    ["EXPIRED", "INVALID", "INACTIVE", "DISABLED", "TERMINATED", "STOPPED"].includes(status)
  ) {
    return -1;
  }
  const active = instance.isActive ?? instance.active;
  if (typeof active === "boolean") return active ? 3 : -1;
  const expiry = epochMs(
    instance.endTime ?? instance.periodEndTime ?? instance.expireTime ?? instance.expirationTime,
  );
  return expiry !== undefined && expiry > now ? 1 : 0;
}

function selectInstance(payload: unknown, now: number): JsonObject | undefined {
  const candidates = findArray(payload, [
    "codingPlanInstanceInfos",
    "coding_plan_instance_infos",
  ])?.filter(isObject);
  if (!candidates?.length) return undefined;
  return [...candidates].sort((a, b) => activeScore(b, now) - activeScore(a, now))[0];
}

function quotaObject(payload: unknown): JsonObject | undefined {
  return findObjectWithKey(payload, [
    "codingPlanQuotaInfo",
    "coding_plan_quota_info",
    "per5HourUsedQuota",
    "per5HourTotalQuota",
    "perWeekUsedQuota",
    "perWeekTotalQuota",
    "perBillMonthUsedQuota",
    "perBillMonthTotalQuota",
  ]);
}

function nestedQuotaObject(payload: unknown): JsonObject | undefined {
  const container = findObjectWithKey(payload, ["codingPlanQuotaInfo", "coding_plan_quota_info"]);
  if (!container) return quotaObject(payload);
  const quota = container.codingPlanQuotaInfo ?? container.coding_plan_quota_info;
  return isObject(quota) ? quota : quotaObject(container);
}

function quotaWindow(
  id: "session-5h" | "weekly" | "monthly",
  label: string,
  quota: JsonObject,
  usedKeys: readonly string[],
  totalKeys: readonly string[],
  resetKeys: readonly string[],
): UsageWindow | undefined {
  const limit = firstNumber(quota, totalKeys);
  if (limit === undefined || limit <= 0) return undefined;
  const used = Math.max(0, firstNumber(quota, usedKeys) ?? 0);
  const resetsAt = firstEpochMs(quota, resetKeys);
  return {
    id,
    label,
    usedPercent: Math.max(0, Math.min(100, (used / limit) * 100)),
    used,
    limit,
    unit: "requests",
    ...(resetsAt !== undefined ? { resetsAt } : {}),
  };
}

function percentageRatioWindow(
  id: "session-5h" | "weekly",
  label: string,
  quota: JsonObject,
  percentKey: string,
  resetKey: string,
): UsageWindow | undefined {
  const ratio = finiteNumber(quota[percentKey]);
  if (ratio === undefined) return undefined;
  const resetsAt = epochMs(quota[resetKey]);
  return {
    id,
    label,
    // Despite their `Percentage` names, the Token Plan endpoint returns these
    // fields as 0-1 ratios (for example, 0.03 means 3%). Normalize them at the
    // provider boundary so every shared consumer receives percentage points.
    usedPercent: Math.max(0, Math.min(100, ratio * 100)),
    ...(resetsAt !== undefined ? { resetsAt } : {}),
  };
}

function statusFailure(payload: unknown): "auth" | "login" | string | undefined {
  const status = findObjectWithKey(payload, [
    "statusCode",
    "status_code",
    "code",
    "message",
    "msg",
  ]);
  if (!status) return undefined;
  const code = finiteNumber(status.statusCode ?? status.status_code ?? status.code);
  const codeText = stringValue(status.code ?? status.status ?? status.statusCode) ?? "";
  const message = firstString(status, ["statusMessage", "status_msg", "message", "msg"]) ?? "";
  const combined = `${codeText} ${message}`.toLowerCase();
  if (
    code === 401 ||
    code === 403 ||
    /api.?key|unauthori[sz]ed|invalid.?token|forbidden/u.test(combined)
  ) {
    return "auth";
  }
  if (/need.?login|log.?in|console.?session/u.test(combined)) return "login";
  if (code !== undefined && code !== 0 && code !== 200) return message || `status code ${code}`;
  return undefined;
}

export function parseQwenCodingPlanUsage(payload: unknown, now: number): UsageSnapshot {
  const expanded = expandEmbeddedJson(payload);
  const failure = statusFailure(expanded);
  if (failure === "auth") {
    return {
      providerId: QWEN_PROVIDER_ID,
      status: "auth-missing",
      windows: [],
      fetchedAt: now,
      error: "API key rejected",
    };
  }
  if (failure === "login") {
    return {
      providerId: QWEN_PROVIDER_ID,
      status: "auth-missing",
      windows: [],
      fetchedAt: now,
      error: "Token Plan quota requires an Alibaba console session",
    };
  }
  if (failure) {
    return {
      providerId: QWEN_PROVIDER_ID,
      status: "error",
      windows: [],
      fetchedAt: now,
      error: failure,
    };
  }

  const instance = selectInstance(expanded, now);
  const plan = planName(instance) ?? planName(expanded);
  const tokenPlanQuota = findObjectWithKey(expanded, ["per5HourPercentage", "per1WeekPercentage"]);
  if (tokenPlanQuota) {
    const windows = [
      percentageRatioWindow(
        "session-5h",
        "Session (5h)",
        tokenPlanQuota,
        "per5HourPercentage",
        "per5HourResetTime",
      ),
      percentageRatioWindow(
        "weekly",
        "Weekly",
        tokenPlanQuota,
        "per1WeekPercentage",
        "per1WeekResetTime",
      ),
    ].filter((window): window is UsageWindow => window !== undefined);
    if (windows.length > 0) {
      return {
        providerId: QWEN_PROVIDER_ID,
        status: "ok",
        ...(plan ? { plan } : {}),
        windows,
        fetchedAt: now,
      };
    }
  }

  const quota = nestedQuotaObject(instance) ?? nestedQuotaObject(expanded);
  if (!quota) {
    if (instance && activeScore(instance, now) > 0 && plan) {
      return { providerId: QWEN_PROVIDER_ID, status: "ok", plan, windows: [], fetchedAt: now };
    }
    return {
      providerId: QWEN_PROVIDER_ID,
      status: "error",
      windows: [],
      fetchedAt: now,
      error: "Missing Token Plan quota data",
    };
  }

  const windows = [
    quotaWindow(
      "session-5h",
      "Session (5h)",
      quota,
      ["per5HourUsedQuota", "perFiveHourUsedQuota"],
      ["per5HourTotalQuota", "perFiveHourTotalQuota"],
      ["per5HourQuotaNextRefreshTime", "perFiveHourQuotaNextRefreshTime"],
    ),
    quotaWindow(
      "weekly",
      "Weekly",
      quota,
      ["perWeekUsedQuota"],
      ["perWeekTotalQuota"],
      ["perWeekQuotaNextRefreshTime"],
    ),
    quotaWindow(
      "monthly",
      "Monthly",
      quota,
      ["perBillMonthUsedQuota", "perMonthUsedQuota"],
      ["perBillMonthTotalQuota", "perMonthTotalQuota"],
      ["perBillMonthQuotaNextRefreshTime", "perMonthQuotaNextRefreshTime"],
    ),
  ].filter((window): window is UsageWindow => window !== undefined);

  if (windows.length === 0 && !(instance && activeScore(instance, now) > 0 && plan)) {
    return {
      providerId: QWEN_PROVIDER_ID,
      status: "error",
      windows: [],
      fetchedAt: now,
      error: "No Token Plan quota windows found",
    };
  }
  return {
    providerId: QWEN_PROVIDER_ID,
    status: "ok",
    ...(plan ? { plan } : {}),
    windows,
    fetchedAt: now,
  };
}

function normalizedOverrideUrl(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" || url.username || url.password) return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}

function rawTokenSettings(token: OAuthToken | undefined): {
  region?: AlibabaCodingPlanRegion;
  quotaUrl?: string;
} {
  const raw = token?.raw;
  const region = raw?.region === "cn" || raw?.region === "intl" ? raw.region : undefined;
  const overrideUrl = normalizedOverrideUrl(raw?.quotaUrl);
  return {
    ...(region ? { region } : {}),
    ...(overrideUrl ? { quotaUrl: overrideUrl } : {}),
  };
}

function requestQuota(
  host: HostPort,
  apiKey: string,
  region: AlibabaCodingPlanRegion,
  overrideUrl?: string,
): Promise<HttpResponse> {
  const config = REGION_CONFIG[region];
  return host.http.request({
    method: "POST",
    url: overrideUrl ?? quotaUrl(region),
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "x-api-key": apiKey,
      "X-DashScope-API-Key": apiKey,
      "Content-Type": "application/json",
      Accept: "application/json",
      Origin: config.baseUrl,
      Referer: config.dashboardUrl,
    },
    body: JSON.stringify({
      queryCodingPlanInstanceInfoRequest: { commodityCode: config.commodityCode },
    }),
    timeoutMs: 15_000,
  });
}

async function resolveConsoleSecToken(
  host: HostPort,
  jar: CookieJar,
  region: AlibabaCodingPlanRegion,
): Promise<string | undefined> {
  const config = REGION_CONFIG[region];
  const dashboard = await host.http.request({
    method: "GET",
    url: config.dashboardUrl,
    headers: {
      Cookie: jar.header,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "User-Agent": BROWSER_USER_AGENT,
    },
    timeoutMs: 15_000,
  });
  // The console rotates its session ticket on the dashboard load, so absorb
  // before issuing the next request — exactly what a browser would send.
  jar.absorb(dashboard);
  if (dashboard.status === 200) {
    const fromHtml = consoleSecTokenFromHtml(dashboard.body);
    if (fromHtml) return fromHtml;
  }

  const userInfo = await host.http.request({
    method: "GET",
    url: `${config.baseUrl}/tool/user/info.json`,
    headers: {
      Cookie: jar.header,
      Accept: "application/json, text/plain, */*",
      Referer: `${config.baseUrl}/`,
      "User-Agent": BROWSER_USER_AGENT,
    },
    timeoutMs: 15_000,
  });
  jar.absorb(userInfo);
  if (userInfo.status === 200) {
    try {
      const fromUserInfo = firstString(expandEmbeddedJson(JSON.parse(userInfo.body)), [
        "secToken",
        "sec_token",
      ]);
      if (fromUserInfo) return fromUserInfo;
    } catch {
      // Continue to the cookie fallback.
    }
  }
  return cookieValue(jar.header, "sec_token");
}

function consoleRequestBody(
  region: AlibabaCodingPlanRegion,
  secToken: string,
  anonymousId?: string,
  api = QUOTA_ACTION,
): string {
  const config = REGION_CONFIG[region];
  const cornerstoneParam: Record<string, unknown> = {
    feTraceId: crypto.randomUUID().toLowerCase(),
    feURL: config.dashboardUrl,
    protocol: "V2",
    console: "ONE_CONSOLE",
    productCode: "p_efm",
    domain: config.consoleDomain,
    consoleSite: config.consoleSite,
    userNickName: "",
    userPrincipalName: "",
    xsp_lang: "en-US",
  };
  if (anonymousId) cornerstoneParam["X-Anonymous-Id"] = anonymousId;
  const params = JSON.stringify({
    Api: api,
    V: "1.0",
    Data: {
      ...(api === QUOTA_ACTION
        ? {
            queryCodingPlanInstanceInfoRequest: {
              commodityCode: config.commodityCode,
              onlyLatestOne: true,
            },
          }
        : api === TOKEN_PLAN_SUBSCRIPTION_ACTION
          ? {
              queryInstanceInfoRequest: {
                commodityCode: config.tokenPlanCommodityCode,
              },
            }
          : {}),
      cornerstoneParam,
    },
  });
  return new URLSearchParams({
    params,
    region: config.currentRegionId,
    sec_token: secToken,
  }).toString();
}

function requestConsoleApi(
  host: HostPort,
  cookieHeader: string,
  region: AlibabaCodingPlanRegion,
  secToken: string,
  api = QUOTA_ACTION,
): Promise<HttpResponse> {
  const config = REGION_CONFIG[region];
  const csrf =
    cookieValue(cookieHeader, "login_aliyunid_csrf") ?? cookieValue(cookieHeader, "csrf");
  return host.http.request({
    method: "POST",
    url: consoleRpcUrl(region),
    headers: {
      Cookie: cookieHeader,
      Accept: "*/*",
      "Content-Type": "application/x-www-form-urlencoded",
      Origin: config.baseUrl,
      Referer: config.consoleRefererUrl,
      "X-Requested-With": "XMLHttpRequest",
      "User-Agent": BROWSER_USER_AGENT,
      ...(csrf ? { "x-xsrf-token": csrf, "x-csrf-token": csrf } : {}),
    },
    body: consoleRequestBody(region, secToken, cookieValue(cookieHeader, "cna"), api),
    timeoutMs: 15_000,
  });
}

function planFromResponse(response: HttpResponse | undefined): string | undefined {
  if (!response || response.status < 200 || response.status >= 300) return undefined;
  try {
    return planName(expandEmbeddedJson(JSON.parse(response.body)));
  } catch {
    return undefined;
  }
}

function responseSnapshot(
  response: HttpResponse,
  now: number,
  authMode: "api-key" | "web-session" = "api-key",
): UsageSnapshot {
  if (response.status === 401 || response.status === 403) {
    return {
      providerId: QWEN_PROVIDER_ID,
      status: "auth-missing",
      windows: [],
      fetchedAt: now,
      error:
        authMode === "web-session"
          ? `Alibaba console session rejected (${response.status})`
          : `API key rejected (${response.status})`,
    };
  }
  if (response.status === 429) {
    return { providerId: QWEN_PROVIDER_ID, status: "rate-limited", windows: [], fetchedAt: now };
  }
  if (response.status < 200 || response.status >= 300) {
    return {
      providerId: QWEN_PROVIDER_ID,
      status: "error",
      windows: [],
      fetchedAt: now,
      error: `HTTP ${response.status}`,
    };
  }
  const body = response.body.trim();
  if (!body) {
    return {
      providerId: QWEN_PROVIDER_ID,
      status: "error",
      windows: [],
      fetchedAt: now,
      error: "Empty Token Plan quota response",
    };
  }
  try {
    return parseQwenCodingPlanUsage(JSON.parse(body), now);
  } catch {
    return {
      providerId: QWEN_PROVIDER_ID,
      status: "error",
      windows: [],
      fetchedAt: now,
      error: "Invalid Token Plan quota response",
    };
  }
}

export async function collectQwen(host: HostPort, _opts?: CollectOptions): Promise<UsageSnapshot> {
  const now = host.now();
  const cookie = (await host.credentials.getSecret(QWEN_PROVIDER_ID, "cookie"))?.trim();
  let cookieSnapshot: UsageSnapshot | undefined;
  if (cookie) {
    const jar = new CookieJar(cookie);
    // Alibaba issues its `login_*` console cookies as session cookies, so the
    // browser's own jar drops them when the app quits — this sealed copy is the
    // only thing that survives a restart. Persist the rotated ticket the console
    // just handed back, or the captured value goes stale and the provider reads
    // as signed out until the user runs browser sign-in again. Only persist on a
    // successful pass: a rejected session's `Set-Cookie` lines are logout
    // instructions, and a transient failure must not clobber a good ticket.
    const persistRotation = async (): Promise<void> => {
      if (!jar.rotated || !host.credentials.setSecret) return;
      try {
        await host.credentials.setSecret(QWEN_PROVIDER_ID, "cookie", jar.header);
      } catch {
        // A failed write only costs freshness; never fail collection over it.
      }
    };

    // The in-app login captures cookies scoped to the international console.
    // Never replay those cookies to the China-mainland domain; API-key fallback
    // below may still try both official regions when no region is configured.
    const secToken = await resolveConsoleSecToken(host, jar, "intl");
    const [tokenPlanResponse, tokenPlanSubscriptionResponse] = secToken
      ? await Promise.all([
          requestConsoleApi(host, jar.header, "intl", secToken, TOKEN_PLAN_USAGE_ACTION),
          requestConsoleApi(
            host,
            jar.header,
            "intl",
            secToken,
            TOKEN_PLAN_SUBSCRIPTION_ACTION,
          ).catch(() => undefined),
        ])
      : [undefined, undefined];
    jar.absorb(tokenPlanResponse);
    jar.absorb(tokenPlanSubscriptionResponse);
    const tokenPlanSnapshot = tokenPlanResponse
      ? responseSnapshot(tokenPlanResponse, now, "web-session")
      : {
          providerId: QWEN_PROVIDER_ID,
          status: "auth-missing" as const,
          windows: [],
          fetchedAt: now,
          error: "Alibaba console session expired",
        };
    if (tokenPlanSnapshot.status === "ok" || tokenPlanSnapshot.status === "rate-limited") {
      await persistRotation();
      const plan = tokenPlanSnapshot.plan ?? planFromResponse(tokenPlanSubscriptionResponse);
      return plan ? { ...tokenPlanSnapshot, plan } : tokenPlanSnapshot;
    }

    const response = secToken
      ? await requestConsoleApi(host, jar.header, "intl", secToken)
      : undefined;
    jar.absorb(response);
    cookieSnapshot = response ? responseSnapshot(response, now, "web-session") : tokenPlanSnapshot;
    if (cookieSnapshot.status === "ok" || cookieSnapshot.status === "rate-limited") {
      await persistRotation();
      return cookieSnapshot;
    }
  }

  const [pastedValue, token] = await Promise.all([
    host.credentials.getSecret(QWEN_PROVIDER_ID, "apiKey"),
    host.credentials.getOAuthToken(QWEN_PROVIDER_ID),
  ]);
  const pasted = pastedValue?.trim();
  const apiKey = pasted || token?.accessToken.trim();
  if (!apiKey) {
    return (
      cookieSnapshot ?? {
        providerId: QWEN_PROVIDER_ID,
        status: "auth-missing",
        windows: [],
        fetchedAt: now,
      }
    );
  }

  const settings = rawTokenSettings(token);
  const regions: AlibabaCodingPlanRegion[] = settings.region ? [settings.region] : ["intl", "cn"];
  let last: UsageSnapshot | undefined;
  for (const region of regions) {
    const response = await requestQuota(host, apiKey, region, settings.quotaUrl);
    const snapshot = responseSnapshot(response, now);
    if (snapshot.status === "ok" || snapshot.status === "rate-limited") return snapshot;
    last = snapshot;
    if (settings.quotaUrl) break;
  }
  return last ?? { providerId: QWEN_PROVIDER_ID, status: "error", windows: [], fetchedAt: now };
}
