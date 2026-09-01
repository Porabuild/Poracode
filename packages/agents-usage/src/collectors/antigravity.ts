import { toEpochMs, usedPercentFromRemaining } from "../formatters";
import type { UsageWindow } from "../types";

/**
 * Antigravity quota parsing, shared by the supervisor's local language-server
 * scanner (`antigravityUsageScanner.ts`).
 *
 * Antigravity now exposes a `RetrieveUserQuotaSummary` RPC that reports two model
 * groups — "Gemini Models" and "Claude and GPT models" — each with a shared
 * 5-hour limit and a weekly limit (this mirrors its in-app "Model Quota" view).
 * {@link antigravityQuotaSummaryWindows} turns that into four windows whose ids
 * are built by {@link antigravityWindowId} (e.g. `antigravity:gemini:session-5h`).
 *
 * The legacy path ({@link antigravityPoolWindows}) folds per-model
 * `quotaInfo.remainingFraction` (which only ever carries the 5-hour limit) into
 * three Gemini Pro / Gemini Flash / Claude pools, and stays as a fallback for
 * Antigravity builds that predate the quota-summary RPC.
 *
 * Pure (no host dependency) so it stays unit-testable. Antigravity usage is
 * collected supervisor-side from the local language server or the matching
 * Cloud Code quota-summary endpoint using official ACP credentials.
 */

/** A model group key in the quota summary; drives window ids + ring grouping. */
export type AntigravityGroupKey = "gemini" | "claude";
/**
 * A quota window cadence in the quota summary. We reuse the package's canonical
 * `session-5h` token (shared with codex/factory) so `windowDurationMs` paces
 * these windows without a special case.
 */
export type AntigravityCadence = "session-5h" | "weekly";

/**
 * The window id for an Antigravity quota group + cadence. The single source of
 * truth for the id format, shared by the collector and the renderer's ring
 * descriptor so the two can't drift.
 */
export function antigravityWindowId(
  group: AntigravityGroupKey,
  cadence: AntigravityCadence,
): `antigravity:${AntigravityGroupKey}:${AntigravityCadence}` {
  return `antigravity:${group}:${cadence}`;
}

/**
 * Classify a quota-summary group by its display name. The Gemini group is named
 * "Gemini Models"; everything else (currently "Claude and GPT models") folds
 * into the `claude` group, matching the in-app split.
 */
function antigravityGroupKey(displayName: string): AntigravityGroupKey {
  return /gemini/i.test(displayName) ? "gemini" : "claude";
}

const ANTIGRAVITY_GROUP_LABEL: Record<AntigravityGroupKey, string> = {
  gemini: "Gemini",
  claude: "Claude",
};

/**
 * Resolve a bucket's cadence from its `window` discriminator (`"5h"` / `"weekly"`),
 * falling back to its display name ("Five Hour Limit" / "Weekly Limit") in case
 * the discriminator field is ever renamed. Returns undefined for an unrecognized
 * cadence so the bucket is skipped rather than mislabeled.
 */
function antigravityCadence(bucket: Record<string, unknown>): AntigravityCadence | undefined {
  const window = typeof bucket.window === "string" ? bucket.window.toLowerCase() : "";
  if (window === "5h") return "session-5h";
  if (window === "weekly") return "weekly";
  const display = typeof bucket.displayName === "string" ? bucket.displayName.toLowerCase() : "";
  if (display.includes("hour")) return "session-5h";
  if (display.includes("week")) return "weekly";
  return undefined;
}

const ANTIGRAVITY_CADENCE_LABEL: Record<AntigravityCadence, string> = {
  "session-5h": "5h",
  weekly: "Weekly",
};

/** Sort weight so windows render grouped (Gemini before Claude) and 5h before weekly. */
function antigravityWindowOrder(group: AntigravityGroupKey, cadence: AntigravityCadence): number {
  return (group === "gemini" ? 0 : 1) * 2 + (cadence === "session-5h" ? 0 : 1);
}

/** Pull the `groups` array out of a RetrieveUserQuotaSummary body, tolerant of nesting. */
function quotaSummaryGroups(body: unknown): Record<string, unknown>[] {
  if (!body || typeof body !== "object") return [];
  const root = body as Record<string, unknown>;
  const response =
    root.response && typeof root.response === "object"
      ? (root.response as Record<string, unknown>)
      : root;
  const groups = response.groups;
  if (!Array.isArray(groups)) return [];
  return groups.filter((g): g is Record<string, unknown> => !!g && typeof g === "object");
}

/**
 * Build the four usage windows from a `RetrieveUserQuotaSummary` response — one
 * per (group × cadence). `remainingFraction` is 0-1 remaining, so usedPercent is
 * its complement. Window ids come from {@link antigravityWindowId}; the trailing
 * cadence segment lets the shared pacer infer the window length. Returns [] for a
 * body without recognizable groups so the scanner can fall back to the legacy
 * per-model pooling.
 */
export function antigravityQuotaSummaryWindows(body: unknown): UsageWindow[] {
  const entries: { order: number; window: UsageWindow }[] = [];
  const seen = new Set<string>();
  for (const group of quotaSummaryGroups(body)) {
    const displayName = typeof group.displayName === "string" ? group.displayName : "";
    const groupKey = antigravityGroupKey(displayName);
    const buckets = Array.isArray(group.buckets) ? group.buckets : [];
    for (const raw of buckets) {
      if (!raw || typeof raw !== "object") continue;
      const bucket = raw as Record<string, unknown>;
      const fraction = bucket.remainingFraction;
      if (typeof fraction !== "number" || !Number.isFinite(fraction)) continue;
      const cadence = antigravityCadence(bucket);
      if (!cadence) continue;
      const id = antigravityWindowId(groupKey, cadence);
      if (seen.has(id)) continue;
      seen.add(id);
      const reset = toEpochMs(typeof bucket.resetTime === "string" ? bucket.resetTime : undefined);
      entries.push({
        order: antigravityWindowOrder(groupKey, cadence),
        window: {
          id,
          label: `${ANTIGRAVITY_GROUP_LABEL[groupKey]} · ${ANTIGRAVITY_CADENCE_LABEL[cadence]}`,
          usedPercent: usedPercentFromRemaining(fraction),
          ...(reset !== undefined ? { resetsAt: reset } : {}),
        },
      });
    }
  }
  return entries.sort((a, b) => a.order - b.order).map((entry) => entry.window);
}

interface AntigravityPool {
  id: "gemini-pro" | "gemini-flash" | "claude";
  label: string;
  order: number;
}

/**
 * Map a model label or id to its quota pool. Gemini Pro / Gemini Flash split on
 * the family keyword; everything else (Claude, GPT-OSS, ...) shares the "Claude"
 * pool, mirroring the Antigravity client. Examples: "Gemini 3.1 Pro (High)",
 * "gemini-2.5-flash-lite", "Claude Opus 4.6 (Thinking)", "GPT-OSS 120B".
 */
export function antigravityPool(modelLabelOrId: string): AntigravityPool {
  const lower = modelLabelOrId.toLowerCase();
  if (lower.includes("gemini") && lower.includes("pro")) {
    return { id: "gemini-pro", label: "Gemini Pro", order: 0 };
  }
  if (lower.includes("gemini") && lower.includes("flash")) {
    return { id: "gemini-flash", label: "Gemini Flash", order: 1 };
  }
  return { id: "claude", label: "Claude", order: 2 };
}

export interface AntigravityModelQuota {
  /** A model label ("Gemini 3.1 Pro (High)") or id ("gemini-2.5-flash"). */
  label: string;
  /** 0-1; lower = more used. */
  remainingFraction: number;
  resetsAt: number | undefined;
}

/**
 * Collapse per-model quota into the three pool windows. The most-constrained
 * model (lowest remainingFraction) drives each pool's bar; a pool inherits a
 * sibling's reset time when the winning model omits its own. Pools with no
 * models are dropped. Window ids are `antigravity:<pool>`.
 */
export function antigravityPoolWindows(models: AntigravityModelQuota[]): UsageWindow[] {
  const pools = new Map<
    string,
    { pool: AntigravityPool; remainingFraction: number; resetsAt: number | undefined }
  >();
  for (const model of models) {
    const label = model.label?.trim();
    if (!label) continue;
    const frac = Math.min(1, Math.max(0, model.remainingFraction));
    const pool = antigravityPool(label);
    const prev = pools.get(pool.id);
    if (!prev || frac < prev.remainingFraction) {
      pools.set(pool.id, {
        pool,
        remainingFraction: frac,
        resetsAt: model.resetsAt ?? prev?.resetsAt,
      });
    } else if (prev.resetsAt === undefined && model.resetsAt !== undefined) {
      prev.resetsAt = model.resetsAt;
    }
  }
  return [...pools.values()]
    .sort((a, b) => a.pool.order - b.pool.order)
    .map((entry) => ({
      id: `antigravity:${entry.pool.id}` as const,
      label: entry.pool.label,
      usedPercent: usedPercentFromRemaining(entry.remainingFraction),
      unit: "requests" as const,
      ...(entry.resetsAt !== undefined ? { resetsAt: entry.resetsAt } : {}),
    }));
}
