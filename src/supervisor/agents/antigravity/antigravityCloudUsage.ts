import { createHash } from "node:crypto";
import {
  antigravityQuotaSummaryWindows,
  type HostPort,
  type HttpResponse,
  type UsageSnapshot,
} from "@poracode/agents-usage";
import type { AntigravityAcpCredentials } from "./antigravityAcpCredentials";
import { ANTIGRAVITY_GOOGLE_TOKEN_URI } from "./antigravityAcpCredentials";

const CLOUD_CODE_BASE_URLS = [
  "https://daily-cloudcode-pa.googleapis.com",
  "https://cloudcode-pa.googleapis.com",
] as const;
const QUOTA_SUMMARY_PATH = "/v1internal:retrieveUserQuotaSummary";
const LOAD_CODE_ASSIST_PATH = "/v1internal:loadCodeAssist";
const ACCESS_TOKEN_EXPIRY_BUFFER_MS = 60_000;

interface CachedAccessToken {
  credentialFingerprint: string;
  accessToken: string;
  expiresAt: number;
}

let cachedAccessToken: CachedAccessToken | undefined;

function credentialFingerprint(credentials: AntigravityAcpCredentials): string {
  return createHash("sha256").update(credentials.refreshToken).digest("hex");
}

function nonOkSnapshot(
  nowMs: number,
  status: UsageSnapshot["status"],
  error: string,
): UsageSnapshot {
  return { providerId: "antigravity", status, windows: [], fetchedAt: nowMs, error };
}

interface AccessTokenResult {
  accessToken?: string;
  failure?: UsageSnapshot;
}

async function resolveAccessToken(
  nowMs: number,
  host: HostPort,
  credentials: AntigravityAcpCredentials,
): Promise<AccessTokenResult> {
  const fingerprint = credentialFingerprint(credentials);
  if (
    cachedAccessToken?.credentialFingerprint === fingerprint &&
    cachedAccessToken.expiresAt > nowMs + ACCESS_TOKEN_EXPIRY_BUFFER_MS
  ) {
    return { accessToken: cachedAccessToken.accessToken };
  }

  let response: HttpResponse;
  try {
    response = await host.http.request({
      method: "POST",
      url: ANTIGRAVITY_GOOGLE_TOKEN_URI,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams({
        client_id: credentials.clientId,
        client_secret: credentials.clientSecret,
        refresh_token: credentials.refreshToken,
        grant_type: "refresh_token",
      }).toString(),
      timeoutMs: 15_000,
      redirect: "error",
    });
  } catch {
    return { failure: nonOkSnapshot(nowMs, "error", "OAuth token refresh failed") };
  }

  if (response.status === 400 || response.status === 401 || response.status === 403) {
    return {
      failure: nonOkSnapshot(nowMs, "auth-missing", `OAuth token rejected (${response.status})`),
    };
  }
  if (response.status === 429) {
    return { failure: nonOkSnapshot(nowMs, "rate-limited", "OAuth token refresh rate limited") };
  }
  if (response.status < 200 || response.status >= 300) {
    return { failure: nonOkSnapshot(nowMs, "error", `OAuth refresh HTTP ${response.status}`) };
  }

  let body: { access_token?: unknown; expires_in?: unknown };
  try {
    body = JSON.parse(response.body) as { access_token?: unknown; expires_in?: unknown };
  } catch {
    return { failure: nonOkSnapshot(nowMs, "error", "OAuth refresh returned invalid JSON") };
  }
  if (typeof body.access_token !== "string" || !body.access_token.trim()) {
    return { failure: nonOkSnapshot(nowMs, "error", "OAuth refresh returned no access token") };
  }
  const expiresIn =
    typeof body.expires_in === "number" && Number.isFinite(body.expires_in)
      ? Math.max(0, body.expires_in)
      : 3600;
  cachedAccessToken = {
    credentialFingerprint: fingerprint,
    accessToken: body.access_token,
    expiresAt: nowMs + expiresIn * 1000,
  };
  return { accessToken: body.access_token };
}

function cloudCodePost(
  host: HostPort,
  baseUrl: string,
  path: string,
  accessToken: string,
): Promise<HttpResponse> {
  return host.http.request({
    method: "POST",
    url: `${baseUrl}${path}`,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      "User-Agent": "antigravity",
    },
    body: "{}",
    timeoutMs: 15_000,
  });
}

function planFromLoadCodeAssist(body: unknown): string | undefined {
  if (!body || typeof body !== "object") return undefined;
  const root = body as Record<string, unknown>;
  const response =
    root.response && typeof root.response === "object"
      ? (root.response as Record<string, unknown>)
      : root;
  const planInfo =
    response.planInfo && typeof response.planInfo === "object"
      ? (response.planInfo as Record<string, unknown>)
      : undefined;
  if (typeof planInfo?.planType === "string" && planInfo.planType.trim()) {
    return planInfo.planType.trim();
  }
  for (const key of ["paidTier", "currentTier"]) {
    const tier = response[key];
    if (!tier || typeof tier !== "object") continue;
    const name = (tier as Record<string, unknown>).name;
    if (typeof name === "string" && name.trim()) return name.trim();
  }
  return undefined;
}

async function loadPlan(
  host: HostPort,
  accessToken: string,
  successfulBaseUrl: (typeof CLOUD_CODE_BASE_URLS)[number],
): Promise<string | undefined> {
  const baseUrls = [
    successfulBaseUrl,
    ...CLOUD_CODE_BASE_URLS.filter((baseUrl) => baseUrl !== successfulBaseUrl),
  ];
  for (const baseUrl of baseUrls) {
    try {
      const response = await cloudCodePost(host, baseUrl, LOAD_CODE_ASSIST_PATH, accessToken);
      if (response.status < 200 || response.status >= 300) continue;
      return planFromLoadCodeAssist(JSON.parse(response.body));
    } catch {
      // try the next Cloud Code host
    }
  }
  return undefined;
}

/** Fetch Antigravity quota using the OAuth artifact persisted by official ACP. */
export async function collectAntigravityCloudUsage(
  nowMs: number,
  host: HostPort,
  credentials: AntigravityAcpCredentials,
): Promise<UsageSnapshot> {
  const token = await resolveAccessToken(nowMs, host, credentials);
  if (!token.accessToken) {
    return token.failure ?? nonOkSnapshot(nowMs, "error", "OAuth token refresh failed");
  }

  let lastStatus: number | undefined;
  for (const baseUrl of CLOUD_CODE_BASE_URLS) {
    let response: HttpResponse;
    try {
      response = await cloudCodePost(host, baseUrl, QUOTA_SUMMARY_PATH, token.accessToken);
    } catch {
      continue;
    }
    lastStatus = response.status;
    if (response.status === 401 || response.status === 403) {
      cachedAccessToken = undefined;
      return nonOkSnapshot(nowMs, "auth-missing", `Cloud Code token rejected (${response.status})`);
    }
    if (response.status === 429) {
      return nonOkSnapshot(nowMs, "rate-limited", "Cloud Code rate limited");
    }
    if (response.status < 200 || response.status >= 300) continue;

    try {
      const windows = antigravityQuotaSummaryWindows(JSON.parse(response.body));
      if (windows.length === 0) continue;
      const plan = await loadPlan(host, token.accessToken, baseUrl);
      return {
        providerId: "antigravity",
        status: "ok",
        windows,
        fetchedAt: nowMs,
        ...(plan ? { plan } : {}),
      };
    } catch {
      // A second Cloud Code host may still have a valid response.
    }
  }

  const error =
    lastStatus === undefined
      ? "Cloud Code quota request failed"
      : lastStatus >= 200 && lastStatus < 300
        ? "Cloud Code quota summary returned no windows"
        : `Cloud Code quota HTTP ${lastStatus}`;
  return nonOkSnapshot(nowMs, "error", error);
}

/** Clear process-local OAuth state between deterministic tests. */
export function resetAntigravityCloudUsageCacheForTests(): void {
  cachedAccessToken = undefined;
}
