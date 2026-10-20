import { toEpochMs, usedPercentFromRemaining } from "../formatters";
import type { UsageWindow } from "../types";

/**
 * Antigravity quota parsing, shared by the supervisor's local language-server
 * scanner (`antigravityUsageScanner.ts`) and Cloud Code collector
 * (`antigravityCloudUsage.ts`).
 *
 * Antigravity exposes a `RetrieveUserQuotaSummary` RPC (and `agy -p "/usage"`
 * CLI output) that reports model quota groups — such as "Gemini Models",
 * "Claude and GPT models", and "Gemini 4 Argon" — each with one or more quota
 * buckets (e.g. a 5-hour limit and/or a weekly limit).
 * {@link antigravityQuotaSummaryWindows} dynamically turns every reported group
 * and bucket into {@link UsageWindow} items whose ids are built by
 * {@link antigravityWindowId} (e.g. `antigravity:gemini:session-5h`,
 * `antigravity:gemini-4-argon:weekly`).
 *
 * The legacy path ({@link antigravityPoolWindows}) folds per-model
 * `quotaInfo.remainingFraction` into Gemini Pro / Gemini Flash / Gemini Argon /
 * Claude pools, and stays as a fallback for Antigravity builds that predate the
 * quota-summary RPC.
 *
 * Pure (no host dependency) so it stays unit-testable.
 */

/**
 * A model group key in the quota summary; drives window ids + ring grouping.
 * Canonical keys `"gemini"` and `"claude"` are used for the two primary groups;
 * additional or future groups (e.g. `"gemini-4-argon"`) derive a slug key
 * dynamically from the group's display name.
 */
export type AntigravityGroupKey = "gemini" | "claude" | (string & {});

/**
 * A quota window cadence in the quota summary. We reuse the package's canonical
 * `session-5h` token (shared with codex/factory) so `windowDurationMs` paces
 * these windows without a special case, while supporting additional cadences
 * dynamically.
 */
export type AntigravityCadence = "session-5h" | "daily" | "weekly" | "monthly" | (string & {});

export interface AntigravityRingGroup {
  key: string;
  label: string;
  outer: readonly string[];
  inner: readonly string[];
}

/**
 * The window id for an Antigravity quota group + cadence. The single source of
 * truth for the id format, shared by the collector and the renderer's ring
 * descriptor so the two can't drift.
 */
export function antigravityWindowId(
  group: AntigravityGroupKey,
  cadence: AntigravityCadence,
): `antigravity:${string}:${string}` {
  return `antigravity:${group}:${cadence}`;
}

function slugifyToken(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

interface AntigravityGroupInfo {
  key: AntigravityGroupKey;
  label: string;
  priority: number;
}

/**
 * Normalize a quota-summary group's display name into a stable key and short
 * UI label. "Gemini Models" and "Claude and GPT models" keep their canonical
 * `"gemini"` / `"claude"` keys and short labels; separate model groups such as
 * "Gemini 4 Argon" (and any future groups Antigravity adds) get their own slug
 * key and cleaned display label so they never collide with or overwrite the
 * primary Gemini/Claude bars.
 */
function antigravityGroupInfo(rawDisplayName: string, groupIndex: number): AntigravityGroupInfo {
  const trimmed = rawDisplayName.trim();
  const withoutModelsSuffix = trimmed.replace(/\s+models?$/i, "").trim();
  const lower = withoutModelsSuffix.toLowerCase();

  if (lower === "gemini") {
    return { key: "gemini", label: "Gemini", priority: 0 };
  }
  if (!trimmed || /^claude\b/i.test(withoutModelsSuffix)) {
    return { key: "claude", label: "Claude", priority: 1 };
  }

  const label = withoutModelsSuffix || trimmed;
  const slug = slugifyToken(label) || `group-${groupIndex + 1}`;
  return { key: slug, label, priority: 2 + groupIndex };
}

interface AntigravityCadenceInfo {
  key: AntigravityCadence;
  label: string;
  order: number;
}

function durationOrderHours(rawWindow: string): number | undefined {
  const match = /^(\d+)([smhdw])$/i.exec(rawWindow.trim());
  if (!match) return undefined;
  const count = Number(match[1]);
  if (!Number.isFinite(count) || count <= 0) return undefined;
  switch (match[2]!.toLowerCase()) {
    case "s":
      return count / 3600;
    case "m":
      return count / 60;
    case "h":
      return count;
    case "d":
      return count * 24;
    case "w":
      return count * 168;
    default:
      return undefined;
  }
}

function formatDynamicCadenceLabel(rawWindow: string): string {
  const trimmed = rawWindow.trim();
  if (/^\d+[smhdw]$/i.test(trimmed)) return trimmed.toLowerCase();
  return trimmed
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

/**
 * Resolve a bucket's cadence from its `window` discriminator (`"5h"`,
 * `"weekly"`, `"daily"`, `"monthly"`, or any future token), falling back to its
 * display name when `window` is omitted.
 */
function antigravityCadenceInfo(
  bucket: Record<string, unknown>,
  bucketIndex: number,
): AntigravityCadenceInfo | undefined {
  const rawWindow = typeof bucket.window === "string" ? bucket.window.trim() : "";
  const windowLower = rawWindow.toLowerCase();
  if (windowLower === "5h") {
    return { key: "session-5h", label: "5h", order: 5 };
  }
  if (windowLower === "daily" || windowLower === "24h" || windowLower === "1d") {
    return { key: "daily", label: "Daily", order: 24 };
  }
  if (windowLower === "weekly" || windowLower === "7d") {
    return { key: "weekly", label: "Weekly", order: 168 };
  }
  if (windowLower === "monthly" || windowLower === "30d") {
    return { key: "monthly", label: "Monthly", order: 720 };
  }
  if (rawWindow) {
    const key = slugifyToken(rawWindow);
    if (key) {
      return {
        key,
        label: formatDynamicCadenceLabel(rawWindow),
        order: durationOrderHours(rawWindow) ?? 1000 + bucketIndex,
      };
    }
  }

  const rawDisplay =
    typeof bucket.displayName === "string"
      ? bucket.displayName
      : typeof bucket.name === "string"
        ? bucket.name
        : "";
  const display = rawDisplay.toLowerCase();
  if (display.includes("hour")) return { key: "session-5h", label: "5h", order: 5 };
  if (display.includes("daily") || display.includes("day")) {
    return { key: "daily", label: "Daily", order: 24 };
  }
  if (display.includes("week")) return { key: "weekly", label: "Weekly", order: 168 };
  if (display.includes("month")) return { key: "monthly", label: "Monthly", order: 720 };
  return undefined;
}

/**
 * Pull the `groups` array out of a `RetrieveUserQuotaSummary` or
 * `agy -p "/usage" --output-format json` body, tolerant of nesting.
 */
function quotaSummaryGroups(body: unknown): Record<string, unknown>[] {
  if (!body || typeof body !== "object") return [];
  const root = body as Record<string, unknown>;
  const command =
    root.command && typeof root.command === "object"
      ? (root.command as Record<string, unknown>)
      : undefined;
  const container =
    root.response && typeof root.response === "object"
      ? (root.response as Record<string, unknown>)
      : command?.data && typeof command.data === "object"
        ? (command.data as Record<string, unknown>)
        : root.data && typeof root.data === "object"
          ? (root.data as Record<string, unknown>)
          : root;
  const groups = container.groups;
  if (!Array.isArray(groups)) return [];
  return groups.filter((g): g is Record<string, unknown> => !!g && typeof g === "object");
}

/**
 * Build usage windows from a `RetrieveUserQuotaSummary` response — one per
 * reported (group × bucket cadence). `remainingFraction` (`remaining_fraction`
 * in CLI output) is 0-1 remaining, so `usedPercent` is its complement. Window
 * ids come from {@link antigravityWindowId}; the trailing cadence segment lets
 * the shared pacer infer the window length. Returns [] for a body without
 * recognizable groups so the scanner can fall back to the legacy per-model
 * pooling.
 */
export function antigravityQuotaSummaryWindows(body: unknown): UsageWindow[] {
  const entries: { groupPriority: number; cadenceOrder: number; window: UsageWindow }[] = [];
  const seen = new Set<string>();
  const groups = quotaSummaryGroups(body);
  for (let groupIndex = 0; groupIndex < groups.length; groupIndex += 1) {
    const group = groups[groupIndex]!;
    const rawGroupName =
      typeof group.displayName === "string"
        ? group.displayName
        : typeof group.name === "string"
          ? group.name
          : "";
    const groupInfo = antigravityGroupInfo(rawGroupName, groupIndex);
    const buckets = Array.isArray(group.buckets) ? group.buckets : [];
    for (let bucketIndex = 0; bucketIndex < buckets.length; bucketIndex += 1) {
      const raw = buckets[bucketIndex];
      if (!raw || typeof raw !== "object") continue;
      const bucket = raw as Record<string, unknown>;
      const fraction =
        typeof bucket.remainingFraction === "number"
          ? bucket.remainingFraction
          : bucket.remaining_fraction;
      if (typeof fraction !== "number" || !Number.isFinite(fraction)) continue;
      const cadence = antigravityCadenceInfo(bucket, bucketIndex);
      if (!cadence) continue;
      const id = antigravityWindowId(groupInfo.key, cadence.key);
      if (seen.has(id)) continue;
      seen.add(id);
      const rawReset =
        typeof bucket.resetTime === "string"
          ? bucket.resetTime
          : typeof bucket.reset_time === "string"
            ? bucket.reset_time
            : undefined;
      const reset = toEpochMs(rawReset);
      entries.push({
        groupPriority: groupInfo.priority,
        cadenceOrder: cadence.order,
        window: {
          id,
          label: `${groupInfo.label} · ${cadence.label}`,
          usedPercent: usedPercentFromRemaining(fraction),
          ...(reset !== undefined ? { resetsAt: reset } : {}),
        },
      });
    }
  }
  return entries
    .sort((a, b) => a.groupPriority - b.groupPriority || a.cadenceOrder - b.cadenceOrder)
    .map((entry) => entry.window);
}

const DEFAULT_ANTIGRAVITY_RING_GROUPS: readonly AntigravityRingGroup[] = [
  {
    key: "gemini",
    label: "Gemini",
    outer: [antigravityWindowId("gemini", "session-5h")],
    inner: [antigravityWindowId("gemini", "weekly")],
  },
  {
    key: "claude",
    label: "Claude & GPT",
    outer: [antigravityWindowId("claude", "session-5h")],
    inner: [antigravityWindowId("claude", "weekly")],
  },
];

function isFastAntigravityCadence(cadence: string): boolean {
  return cadence === "session-5h" || cadence === "daily" || /^\d+[smh]$/.test(cadence);
}

/**
 * Derive selectable ring groups dynamically from the current Antigravity
 * windows, keeping the baseline Gemini and Claude & GPT groups while appending
 * any additional quota groups (such as "Gemini 4 Argon" or future groups)
 * reported by Antigravity.
 */
export function antigravityRingGroups(
  windows?: readonly UsageWindow[],
): readonly AntigravityRingGroup[] {
  if (!windows || windows.length === 0) return DEFAULT_ANTIGRAVITY_RING_GROUPS;

  const grouped = new Map<string, { label: string; outer: string[]; inner: string[] }>(
    DEFAULT_ANTIGRAVITY_RING_GROUPS.map((group) => [
      group.key,
      { label: group.label, outer: [...group.outer], inner: [...group.inner] },
    ]),
  );

  for (const window of windows) {
    const match = /^antigravity:([^:]+):([^:]+)$/.exec(window.id);
    if (!match) continue;
    const groupKey = match[1]!;
    const cadence = match[2]!;
    let entry = grouped.get(groupKey);
    if (!entry) {
      const prefix = window.label.split(" · ")[0]?.trim();
      entry = { label: prefix || groupKey, outer: [], inner: [] };
      grouped.set(groupKey, entry);
    }
    const bucket = isFastAntigravityCadence(cadence) ? entry.outer : entry.inner;
    if (!bucket.includes(window.id)) {
      bucket.push(window.id);
    }
  }

  const legacyGeminiPools = windows
    .filter((w) => w.id === "antigravity:gemini-pro" || w.id === "antigravity:gemini-flash")
    .sort((a, b) => b.usedPercent - a.usedPercent);
  for (const pool of legacyGeminiPools) {
    const gemini = grouped.get("gemini")!;
    if (!gemini.outer.includes(pool.id)) gemini.outer.push(pool.id);
  }
  if (windows.some((w) => w.id === "antigravity:claude")) {
    const claude = grouped.get("claude")!;
    if (!claude.outer.includes("antigravity:claude")) claude.outer.push("antigravity:claude");
  }
  const argonPool = windows.find((w) => w.id === "antigravity:gemini-argon");
  if (argonPool) {
    let entry = grouped.get("gemini-4-argon");
    if (!entry) {
      entry = { label: argonPool.label, outer: [], inner: [] };
      grouped.set("gemini-4-argon", entry);
    }
    if (!entry.outer.includes(argonPool.id)) entry.outer.push(argonPool.id);
  }

  return Array.from(grouped, ([key, entry]) => {
    if (key !== "gemini" && key !== "claude") {
      if (entry.inner.length === 0 && entry.outer.length > 1) {
        return {
          key,
          label: entry.label,
          outer: entry.outer.slice(0, 1),
          inner: entry.outer.slice(1),
        };
      }
      if (entry.outer.length === 0 && entry.inner.length > 1) {
        return {
          key,
          label: entry.label,
          outer: entry.inner.slice(0, 1),
          inner: entry.inner.slice(1),
        };
      }
    }
    return {
      key,
      label: entry.label,
      outer: entry.outer,
      inner: entry.inner,
    };
  });
}

interface AntigravityPool {
  id: "gemini-pro" | "gemini-flash" | "gemini-argon" | "claude";
  label: string;
  order: number;
}

/**
 * Map a model label or id to its quota pool. Gemini Pro / Gemini Flash / Gemini
 * Argon split on the family keyword; everything else (Claude, GPT-OSS, ...)
 * shares the "Claude" pool, mirroring the Antigravity client.
 */
export function antigravityPool(modelLabelOrId: string): AntigravityPool {
  const lower = modelLabelOrId.toLowerCase();
  if (lower.includes("gemini") && lower.includes("pro")) {
    return { id: "gemini-pro", label: "Gemini Pro", order: 0 };
  }
  if (lower.includes("gemini") && lower.includes("flash")) {
    return { id: "gemini-flash", label: "Gemini Flash", order: 1 };
  }
  if (lower.includes("argon")) {
    return { id: "gemini-argon", label: "Gemini 4 Argon", order: 2 };
  }
  return { id: "claude", label: "Claude", order: 3 };
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
