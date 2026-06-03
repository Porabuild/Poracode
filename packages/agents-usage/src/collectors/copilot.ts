import { DEFAULT_CLIENT_VERSIONS } from "../clientVersions";
import { toEpochMs } from "../formatters";
import type { CollectOptions, HostPort } from "../host";
import type { UsageSnapshot, UsageWindow } from "../types";

/**
 * GitHub Copilot. Uses a Copilot-specific GitHub OAuth token (browser device
 * flow, Copilot CLI, or explicit env var) and reads the Copilot entitlement
 * endpoint. Paid plans report a premium-interaction quota; free plans report
 * limited-user quotas.
 */

export const COPILOT_USER_ENDPOINT = "https://api.github.com/copilot_internal/user";

interface CopilotQuota {
  entitlement?: number;
  remaining?: number;
  percent_remaining?: number;
  unlimited?: boolean;
}

interface CopilotUserResponse {
  login?: string;
  copilot_plan?: string;
  access_type_sku?: string;
  quota_reset_date?: string;
  quota_snapshots?: {
    chat?: CopilotQuota;
    completions?: CopilotQuota;
    premium_interactions?: CopilotQuota;
  };
  limited_user_quotas?: { chat?: number; completions?: number };
  monthly_quotas?: { chat?: number; completions?: number };
  limited_user_reset_date?: string;
}

function planLabel(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  const map: Record<string, string> = {
    free: "Copilot Free",
    individual: "Copilot Pro",
    copilot_pro: "Copilot Pro",
    copilot_pro_plus: "Copilot Pro+",
    business: "Copilot Business",
    enterprise: "Copilot Enterprise",
  };
  return map[trimmed.toLowerCase()] ?? trimmed;
}

/** Build a premium-interactions window from a paid-plan quota snapshot. */
function premiumWindow(
  quota: CopilotQuota | undefined,
  resetsAt: number | undefined,
): UsageWindow | undefined {
  if (!quota || quota.unlimited) return undefined;
  let usedPercent: number | undefined;
  if (typeof quota.percent_remaining === "number" && Number.isFinite(quota.percent_remaining)) {
    usedPercent = 100 - quota.percent_remaining;
  } else if (
    typeof quota.entitlement === "number" &&
    quota.entitlement > 0 &&
    typeof quota.remaining === "number"
  ) {
    usedPercent = ((quota.entitlement - quota.remaining) / quota.entitlement) * 100;
  }
  if (usedPercent === undefined) return undefined;
  usedPercent = Math.min(100, Math.max(0, Math.round(usedPercent * 10) / 10));
  return {
    id: "monthly",
    label: "Premium requests",
    usedPercent,
    unit: "requests",
    ...(resetsAt !== undefined ? { resetsAt } : {}),
    ...(typeof quota.entitlement === "number" ? { limit: quota.entitlement } : {}),
    ...(typeof quota.entitlement === "number" && typeof quota.remaining === "number"
      ? { used: quota.entitlement - quota.remaining }
      : {}),
  };
}

/** Build a window for free-tier limited quotas (remaining vs monthly cap). */
function freeWindow(
  remaining: number | undefined,
  cap: number | undefined,
  resetsAt: number | undefined,
): UsageWindow | undefined {
  if (typeof remaining !== "number" || typeof cap !== "number" || cap <= 0) return undefined;
  const used = Math.min(100, Math.max(0, Math.round(((cap - remaining) / cap) * 1000) / 10));
  return {
    id: "monthly",
    label: "Chat (monthly)",
    usedPercent: used,
    unit: "requests",
    limit: cap,
    used: cap - remaining,
    ...(resetsAt !== undefined ? { resetsAt } : {}),
  };
}

/** Pure: map a parsed `copilot_internal/user` body to a snapshot. */
export function parseCopilotUsage(body: unknown, nowMs: number): UsageSnapshot {
  const data = (body ?? {}) as CopilotUserResponse;
  const plan = planLabel(data.copilot_plan);
  const planKind = data.copilot_plan?.trim().toLowerCase();
  const skuKind = data.access_type_sku?.trim().toLowerCase();
  const windows: UsageWindow[] = [];

  const paidReset = toEpochMs(data.quota_reset_date);
  const premiumQuota = data.quota_snapshots?.premium_interactions;
  const premium = premiumWindow(premiumQuota, paidReset);
  if (premium) {
    windows.push(premium);
  } else if (!planKind || planKind === "free" || skuKind === "free_limited_copilot") {
    const freeReset = toEpochMs(data.limited_user_reset_date ?? data.quota_reset_date);
    const free = freeWindow(data.limited_user_quotas?.chat, data.monthly_quotas?.chat, freeReset);
    if (free) windows.push(free);
  }

  // Copilot's premium-request quota is now credit-billed: an org that sets no
  // spending limit reports `premium_interactions.unlimited`, so there's no
  // window to chart. Surface it as unlimited credits rather than dropping it —
  // otherwise the card reads as "No windows reported" for a working account.
  const unlimitedPremium = premiumQuota?.unlimited === true;

  return {
    providerId: "copilot",
    status: "ok",
    windows,
    fetchedAt: nowMs,
    ...(plan ? { plan } : {}),
    ...(data.login ? { authenticatedAs: data.login } : {}),
    ...(unlimitedPremium ? { credits: { balance: 0, unlimited: true } } : {}),
  };
}

export async function collectCopilot(
  host: HostPort,
  _opts?: CollectOptions,
): Promise<UsageSnapshot> {
  const now = host.now();
  const storedToken = await host.credentials.getSecret("copilot", "token");
  const token = storedToken
    ? { accessToken: storedToken }
    : await host.credentials.getOAuthToken("copilot");
  if (!token?.accessToken) {
    return { providerId: "copilot", status: "auth-missing", windows: [], fetchedAt: now };
  }

  const res = await host.http.request({
    method: "GET",
    url: COPILOT_USER_ENDPOINT,
    headers: {
      Authorization: `token ${token.accessToken}`,
      Accept: "application/json",
      "Editor-Version": host.clientVersions?.editor ?? DEFAULT_CLIENT_VERSIONS.editor,
      "Editor-Plugin-Version": `copilot-chat/${
        host.clientVersions?.copilotChat ?? DEFAULT_CLIENT_VERSIONS.copilotChat
      }`,
      "User-Agent": `GitHubCopilotChat/${
        host.clientVersions?.copilotChat ?? DEFAULT_CLIENT_VERSIONS.copilotChat
      }`,
      "X-GitHub-Api-Version": "2025-04-01",
    },
    timeoutMs: 15_000,
  });

  if (res.status === 401 || res.status === 403) {
    return {
      providerId: "copilot",
      status: "auth-missing",
      windows: [],
      fetchedAt: now,
      error: `token rejected (${res.status})`,
    };
  }
  if (res.status === 429) {
    return { providerId: "copilot", status: "rate-limited", windows: [], fetchedAt: now };
  }
  if (res.status < 200 || res.status >= 300) {
    return {
      providerId: "copilot",
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
      providerId: "copilot",
      status: "error",
      windows: [],
      fetchedAt: now,
      error: "invalid JSON response",
    };
  }

  const snapshot = parseCopilotUsage(parsed, now);
  // A 200 with neither a plan nor any quota window means the token isn't entitled
  // to Copilot — treat that as needing login. But a real plan with no displayable
  // window (e.g. Business/Enterprise with unlimited premium interactions, or a
  // paid plan whose only quotas are chat which we don't surface) is genuinely
  // signed in — keep it "ok" so the card shows the plan instead of "Not signed in".
  if (snapshot.status === "ok" && snapshot.windows.length === 0 && !snapshot.plan) {
    return {
      ...snapshot,
      status: "auth-missing",
      error: "Copilot usage login required",
    };
  }
  return snapshot;
}
