import { toEpochMs } from "../formatters";
import type { CollectOptions, HostPort, HttpResponse } from "../host";
import type { UsageCredits, UsageSnapshot, UsageWindow } from "../types";

/**
 * Gemini (Google Code Assist). Reuses the Gemini CLI OAuth token the host reads
 * from `~/.gemini/oauth_creds.json`, encrypted `FileKeychain`, or macOS
 * Keychain. `loadCodeAssist` gives the plan tier (`paidTier` preferred over
 * `currentTier`) and optional AI credits; `retrieveUserQuota` gives daily
 * quota buckets.
 *
 * The wire response is `{ buckets: [{ modelId, tokenType, remainingFraction,
 * resetTime, remainingAmount? }] }` — one entry per (model, tokenType), with no
 * server-side bucket grouping. But GA models share a tier-level daily pool, so
 * the CLI's "Model usage" view groups buckets by TIER (Flash / Flash Lite /
 * Pro) and renders the most-constrained model in each tier as one bar. Models
 * with no known tier (preview/experimental, e.g. `gemini-3.1-pro`) stand alone
 * as their own bar. We mirror that grouping; window ids are `gemini:<group>`.
 *
 * Reverse-engineered private API (cloudcode-pa `v1internal`), confirmed against
 * gemini-cli v0.68.0 (`ModelQuotaDisplay.tsx`, `code_assist/types.ts`).
 * `percentUsed = (1 - remainingFraction) * 100`. The parse is defensive — it
 * walks the response for objects carrying those fields. If nothing parses, the
 * snapshot still carries the plan. Tokens expire ~hourly; a rejected token
 * triggers `refreshOAuthToken("gemini", token)` once before degrading to
 * `auth-missing`.
 */

const CLOUDCODE_BASE = "https://cloudcode-pa.googleapis.com/v1internal";
export const GEMINI_LOAD_ENDPOINT = `${CLOUDCODE_BASE}:loadCodeAssist`;
export const GEMINI_QUOTA_ENDPOINT = `${CLOUDCODE_BASE}:retrieveUserQuota`;

const LOAD_BODY = JSON.stringify({
  metadata: { ideType: "GEMINI_CLI", pluginType: "GEMINI" },
});

interface AvailableCreditEntry {
  creditType?: string;
  creditAmount?: string | number;
}

interface GeminiUserTier {
  id?: string;
  name?: string;
  availableCredits?: AvailableCreditEntry[] | null;
}

interface LoadCodeAssistResponse {
  currentTier?: GeminiUserTier | null;
  paidTier?: GeminiUserTier | null;
  cloudaicompanionProject?: string | null;
}

const TIER_LABELS: Record<string, string> = {
  "free-tier": "Gemini (Free)",
  "legacy-tier": "Gemini (Legacy)",
  "standard-tier": "Gemini Code Assist (Standard)",
  "enterprise-tier": "Gemini Code Assist (Enterprise)",
};

function tierLabel(tier: GeminiUserTier | null | undefined): string | undefined {
  if (!tier) return undefined;
  if (tier.id && TIER_LABELS[tier.id]) return TIER_LABELS[tier.id];
  return tier.name?.trim() || tier.id?.trim() || undefined;
}

function parseAvailableCredits(tier: GeminiUserTier | null | undefined): UsageCredits | undefined {
  const entries = tier?.availableCredits;
  if (!Array.isArray(entries) || entries.length === 0) return undefined;
  let total = 0;
  let sawNumeric = false;
  for (const entry of entries) {
    if (!entry || typeof entry !== "object") continue;
    const rawAmount = entry.creditAmount;
    const parsed =
      typeof rawAmount === "number"
        ? rawAmount
        : typeof rawAmount === "string" && rawAmount.trim().length > 0
          ? Number(rawAmount.trim())
          : Number.NaN;
    if (Number.isFinite(parsed)) {
      total += parsed;
      sawNumeric = true;
    }
  }
  if (!sawNumeric) return undefined;
  return { balance: total, label: "AI credits" };
}

interface GroupBucket {
  /** Group id without the `gemini:` namespace, e.g. "pro" or "gemini-3.1-pro". */
  id: string;
  label: string;
  /** 0-1; lower = more used. The lowest fraction across the group's models wins. */
  remainingFraction: number;
  resetsAt: number | undefined;
}

/**
 * Map a raw `modelId` to its quota GROUP. Code Assist reports quota per model,
 * but we collapse to three broad family tiers (Flash / Flash Lite / Pro) and
 * show the most-constrained model in each — across all versions and the preview
 * channel (e.g. `gemini-2.5-pro`, `gemini-3-pro`, `gemini-3.1-pro-preview` all
 * fold into "Pro"). A model whose family we don't recognize stands alone keyed
 * by a cleaned id, so nothing is silently dropped.
 */
export function geminiQuotaGroup(modelId: string): { id: string; label: string } {
  const lower = modelId.toLowerCase();
  if (lower.includes("flash-lite")) return { id: "flash-lite", label: "Flash Lite" };
  if (lower.includes("flash")) return { id: "flash", label: "Flash" };
  if (lower.includes("pro")) return { id: "pro", label: "Pro" };
  // Unknown family: own bucket; drop the trailing channel suffix for the label.
  const cleaned = modelId.replace(/-(preview|exp)([-.].*)?$/i, "");
  return { id: cleaned, label: cleaned };
}

/** Stable display order: the three GA tiers first, then untiered models. */
const GROUP_ORDER: Record<string, number> = { flash: 0, "flash-lite": 1, pro: 2 };
function groupRank(id: string): number {
  return GROUP_ORDER[id] ?? 3;
}

/**
 * Walk an arbitrary quota response collecting one bucket per quota GROUP. A
 * bucket is any object carrying `modelId` (string) together with
 * `remainingFraction` (0-1). Models in the same tier merge; the lowest fraction
 * (most-constrained model/tokenType) wins for that group.
 */
function collectGroupedBuckets(node: unknown, out: Map<string, GroupBucket>): void {
  if (Array.isArray(node)) {
    for (const item of node) collectGroupedBuckets(item, out);
    return;
  }
  if (!node || typeof node !== "object") return;
  const obj = node as Record<string, unknown>;

  const modelId =
    (typeof obj.modelId === "string" && obj.modelId) ||
    (typeof obj.model === "string" && obj.model) ||
    undefined;
  if (
    modelId &&
    typeof obj.remainingFraction === "number" &&
    Number.isFinite(obj.remainingFraction)
  ) {
    const remainingFraction = Math.min(1, Math.max(0, obj.remainingFraction));
    const resetsAt = toEpochMs(
      (typeof obj.resetTime === "string" && obj.resetTime) ||
        (typeof obj.resetsAt === "string" && obj.resetsAt) ||
        undefined,
    );
    const { id, label } = geminiQuotaGroup(modelId);
    const prev = out.get(id);
    if (!prev || remainingFraction < prev.remainingFraction) {
      // Lowest remaining (most-constrained model) drives the bar. Models in a
      // tier share one daily reset, so fall back to a sibling's resetTime if the
      // winning bucket omits its own.
      out.set(id, { id, label, remainingFraction, resetsAt: resetsAt ?? prev?.resetsAt });
    } else if (prev.resetsAt === undefined && resetsAt !== undefined) {
      prev.resetsAt = resetsAt;
    }
  }

  for (const value of Object.values(obj)) collectGroupedBuckets(value, out);
}

/** Pure: map loadCodeAssist + retrieveUserQuota bodies to a snapshot. */
export function parseGeminiUsage(
  loadBody: unknown,
  quotaBody: unknown,
  nowMs: number,
): UsageSnapshot {
  const load = (loadBody ?? {}) as LoadCodeAssistResponse;
  const activeTier = load.paidTier ?? load.currentTier;
  const plan = tierLabel(activeTier) ?? tierLabel(load.currentTier);
  const credits = parseAvailableCredits(activeTier) ?? parseAvailableCredits(load.currentTier);

  const groups = new Map<string, GroupBucket>();
  collectGroupedBuckets(quotaBody, groups);

  const windows: UsageWindow[] = [...groups.values()]
    .sort((a, b) => groupRank(a.id) - groupRank(b.id))
    .map((g) => ({
      id: `gemini:${g.id}`,
      label: g.label,
      usedPercent: Math.round((1 - g.remainingFraction) * 1000) / 10,
      unit: "requests" as const,
      ...(g.resetsAt !== undefined ? { resetsAt: g.resetsAt } : {}),
    }));

  return {
    providerId: "gemini",
    status: "ok",
    windows,
    fetchedAt: nowMs,
    ...(plan ? { plan } : {}),
    ...(credits ? { credits } : {}),
  };
}

function geminiPost(
  host: HostPort,
  url: string,
  token: string,
  body: string,
): Promise<HttpResponse> {
  return host.http.request({
    method: "POST",
    url,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body,
    timeoutMs: 15_000,
  });
}

export async function collectGemini(
  host: HostPort,
  _opts?: CollectOptions,
): Promise<UsageSnapshot> {
  const now = host.now();
  let token = await host.credentials.getOAuthToken("gemini");
  if (!token?.accessToken) {
    return { providerId: "gemini", status: "auth-missing", windows: [], fetchedAt: now };
  }

  let loadRes = await geminiPost(host, GEMINI_LOAD_ENDPOINT, token.accessToken, LOAD_BODY);
  if (loadRes.status === 401 || loadRes.status === 403) {
    const refreshed = await host.credentials.refreshOAuthToken?.("gemini", token);
    if (refreshed?.accessToken && refreshed.accessToken !== token.accessToken) {
      token = refreshed;
      loadRes = await geminiPost(host, GEMINI_LOAD_ENDPOINT, token.accessToken, LOAD_BODY);
    }
  }
  if (loadRes.status === 401 || loadRes.status === 403) {
    return {
      providerId: "gemini",
      status: "auth-missing",
      windows: [],
      fetchedAt: now,
      error: `token rejected (${loadRes.status})`,
    };
  }
  if (loadRes.status === 429) {
    return { providerId: "gemini", status: "rate-limited", windows: [], fetchedAt: now };
  }
  if (loadRes.status < 200 || loadRes.status >= 300) {
    return {
      providerId: "gemini",
      status: "error",
      windows: [],
      fetchedAt: now,
      error: `HTTP ${loadRes.status}`,
    };
  }

  let load: LoadCodeAssistResponse;
  try {
    load = JSON.parse(loadRes.body) as LoadCodeAssistResponse;
  } catch {
    return {
      providerId: "gemini",
      status: "error",
      windows: [],
      fetchedAt: now,
      error: "invalid JSON response",
    };
  }

  // Quota is best-effort; the plan tier stands without it. Per codexbar the body
  // is `{ project }` (or `{}` when unknown), not a metadata wrapper.
  let quotaBody: unknown;
  try {
    const quotaReq = JSON.stringify(
      load.cloudaicompanionProject ? { project: load.cloudaicompanionProject } : {},
    );
    const quotaRes = await geminiPost(host, GEMINI_QUOTA_ENDPOINT, token.accessToken, quotaReq);
    if (quotaRes.status >= 200 && quotaRes.status < 300) quotaBody = JSON.parse(quotaRes.body);
  } catch {
    // ignore — windows are optional
  }

  return parseGeminiUsage(load, quotaBody, now);
}
