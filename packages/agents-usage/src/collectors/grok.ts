import { toEpochMs } from "../formatters";
import type { CollectOptions, HostPort, HttpClient, HttpResponse } from "../host";
import type { UsageSnapshot, UsageWindow } from "../types";
import {
  GROK_GRPC_EMPTY_FRAME_BYTES,
  GROK_GRPC_ENDPOINT,
  parseGrokGrpcBillingResponse,
} from "./grokGrpc";

/**
 * Grok (xAI). Reuses the Grok CLI bearer token the host reads from
 * `~/.grok/auth.json` and queries the CLI proxy's billing endpoint. The billing
 * cycle is surfaced as one "monthly" credit window.
 *
 * Reverse-engineered, undocumented API (per openusage): endpoints/fields may
 * change without notice. `/billing` returns:
 *   { config: { monthlyLimit: {val}, used: {val}, onDemandCap: {val},
 *               billingPeriodStart, billingPeriodEnd, history: [...] } }
 */

export const GROK_BILLING_ENDPOINT = "https://cli-chat-proxy.grok.com/v1/billing";
export const GROK_SETTINGS_ENDPOINT = "https://cli-chat-proxy.grok.com/v1/settings";
const GROK_TOKEN_AUTH_HEADER = "xai-grok-cli";

interface GrokVal {
  val?: number;
}

interface GrokBillingResponse {
  config?: {
    monthlyLimit?: GrokVal;
    used?: GrokVal;
    onDemandCap?: GrokVal;
    billingPeriodStart?: string;
    billingPeriodEnd?: string;
  };
}

function num(v: GrokVal | undefined): number | undefined {
  return typeof v?.val === "number" && Number.isFinite(v.val) ? v.val : undefined;
}

/** Best-effort plan name from the (loosely specified) /settings body. */
function planFromSettings(settingsBody: unknown): string | undefined {
  const s = (settingsBody ?? {}) as Record<string, unknown>;
  const tier = s.tier as { displayName?: string; name?: string } | undefined;
  const candidate =
    tier?.displayName ??
    tier?.name ??
    (typeof s.subscriptionTier === "string" ? s.subscriptionTier : undefined) ??
    (typeof s.plan === "string" ? s.plan : undefined);
  const trimmed = candidate?.trim();
  return trimmed ? trimmed : undefined;
}

/** Pure: map a parsed `/billing` body (+ optional `/settings`) to a snapshot. */
export function parseGrokUsage(
  billingBody: unknown,
  settingsBody: unknown,
  nowMs: number,
): UsageSnapshot {
  const config = ((billingBody ?? {}) as GrokBillingResponse).config ?? {};
  const limit = num(config.monthlyLimit);
  const used = num(config.used);
  const usedPercent =
    limit !== undefined && limit > 0 && used !== undefined
      ? Math.min(100, Math.max(0, (used / limit) * 100))
      : 0;
  const resetsAt = toEpochMs(config.billingPeriodEnd);

  const window: UsageWindow = {
    id: "monthly",
    label: "Monthly credits",
    usedPercent,
    unit: "credits",
    ...(used !== undefined ? { used } : {}),
    ...(limit !== undefined ? { limit } : {}),
    ...(resetsAt !== undefined ? { resetsAt } : {}),
  };

  const plan = planFromSettings(settingsBody);
  return {
    providerId: "grok",
    status: "ok",
    windows: [window],
    fetchedAt: nowMs,
    ...(plan ? { plan } : {}),
  };
}

/** Cycle-length-driven label, per codexbar (Weekly / Monthly / Credits). */
function grokWindowLabel(periodStartMs: number | undefined, resetsAt: number | undefined): string {
  if (periodStartMs !== undefined && resetsAt !== undefined) {
    const days = (resetsAt - periodStartMs) / 864e5;
    if (days > 0 && days <= 10) return "Weekly credits";
    if (days <= 40) return "Monthly credits";
  }
  return "Credits";
}

function grokGrpcRequest(http: HttpClient, cookie: string): Promise<HttpResponse> {
  return http.request({
    method: "POST",
    url: GROK_GRPC_ENDPOINT,
    headers: {
      Cookie: cookie,
      Origin: "https://grok.com",
      Referer: "https://grok.com/?_s=usage",
      Accept: "*/*",
      "Content-Type": "application/grpc-web+proto",
      "x-grpc-web": "1",
      "x-user-agent": "connect-es/2.1.1",
      "User-Agent": "Poracode",
    },
    bodyBytes: GROK_GRPC_EMPTY_FRAME_BYTES,
    timeoutMs: 15_000,
  });
}

/**
 * Collect via the grok.com browser session cookie (codexbar's path): POST the
 * gRPC-web `GetGrokCreditsConfig` endpoint and parse the protobuf for used
 * percent + reset. Returns undefined to let the caller fall back to the CLI token
 * path on any transient failure.
 */
async function collectGrokViaCookie(
  host: HostPort,
  cookie: string,
  nowMs: number,
): Promise<UsageSnapshot | undefined> {
  const res = await grokGrpcRequest(host.http, cookie);
  if (res.status === 401 || res.status === 403) {
    return { providerId: "grok", status: "auth-missing", windows: [], fetchedAt: nowMs };
  }
  if (res.status < 200 || res.status >= 300) return undefined;

  const parsed = parseGrokGrpcBillingResponse({
    headers: res.headers,
    ...(res.body ? { body: res.body } : {}),
    ...(res.bodyBytes ? { bodyBytes: res.bodyBytes } : {}),
    nowMs,
  });
  if (parsed.kind === "unauthenticated") {
    return { providerId: "grok", status: "auth-missing", windows: [], fetchedAt: nowMs };
  }
  if (parsed.kind !== "ok") return undefined;

  const window: UsageWindow = {
    id: "monthly",
    label: grokWindowLabel(undefined, parsed.billing.resetsAt),
    usedPercent: parsed.billing.usedPercent,
    unit: "credits",
    ...(parsed.billing.resetsAt !== undefined ? { resetsAt: parsed.billing.resetsAt } : {}),
  };
  return { providerId: "grok", status: "ok", windows: [window], fetchedAt: nowMs };
}

function grokRequest(host: HostPort, url: string, accessToken: string): Promise<HttpResponse> {
  return host.http.request({
    method: "GET",
    url,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "X-XAI-Token-Auth": GROK_TOKEN_AUTH_HEADER,
      Accept: "application/json",
    },
    timeoutMs: 15_000,
  });
}

export async function collectGrok(host: HostPort, _opts?: CollectOptions): Promise<UsageSnapshot> {
  const now = host.now();

  // Preferred path: the grok.com browser session cookie captured via the in-app
  // login (the CLI rarely leaves a token on disk). Falls through to the CLI
  // token path when no cookie is stored or the gRPC-web call fails.
  const cookie = await host.credentials.getSecret("grok", "cookie");
  if (cookie) {
    let viaCookie: UsageSnapshot | undefined;
    try {
      viaCookie = await collectGrokViaCookie(host, cookie, now);
    } catch {
      // Network throw — treat as transient below, not a sign-out.
    }
    if (viaCookie && viaCookie.status === "ok") return viaCookie;

    // The cookie path produced no usage. Distinguish a hard rejection (401/403 →
    // auth-missing) from a transient failure (network throw, 5xx, or an
    // unparseable frame → undefined). Only the CLI token can substitute, so when
    // there is none we keep the stored session visible: surface a hard rejection
    // as auth-missing (re-login needed), but a transient failure as a preserved
    // `error` so a blip (e.g. a not-yet-ready network at startup) never
    // masquerades as signed out and forces a needless re-login.
    const token = await host.credentials.getOAuthToken("grok");
    if (!token?.accessToken) {
      if (viaCookie?.status === "auth-missing") return viaCookie;
      return {
        providerId: "grok",
        status: "error",
        windows: [],
        fetchedAt: now,
        error: "grok.com session check failed",
      };
    }
    // A CLI token exists — fall through to the token path below.
  }

  const token = await host.credentials.getOAuthToken("grok");
  if (!token?.accessToken) {
    return { providerId: "grok", status: "auth-missing", windows: [], fetchedAt: now };
  }

  const res = await grokRequest(host, GROK_BILLING_ENDPOINT, token.accessToken);
  if (res.status === 401 || res.status === 403) {
    return {
      providerId: "grok",
      status: "auth-missing",
      windows: [],
      fetchedAt: now,
      error: `token rejected (${res.status})`,
    };
  }
  if (res.status === 429) {
    return { providerId: "grok", status: "rate-limited", windows: [], fetchedAt: now };
  }
  if (res.status < 200 || res.status >= 300) {
    return {
      providerId: "grok",
      status: "error",
      windows: [],
      fetchedAt: now,
      error: `HTTP ${res.status}`,
    };
  }

  let billing: unknown;
  try {
    billing = JSON.parse(res.body);
  } catch {
    return {
      providerId: "grok",
      status: "error",
      windows: [],
      fetchedAt: now,
      error: "invalid JSON response",
    };
  }

  // Plan name is best-effort; usage stands on its own without it.
  let settings: unknown;
  try {
    const settingsRes = await grokRequest(host, GROK_SETTINGS_ENDPOINT, token.accessToken);
    if (settingsRes.status >= 200 && settingsRes.status < 300)
      settings = JSON.parse(settingsRes.body);
  } catch {
    // ignore — plan name is optional
  }

  return parseGrokUsage(billing, settings, now);
}
