import type { UsageWindow } from "../types";

/**
 * Antigravity quota pooling, shared by the supervisor's local language-server
 * scanner (`antigravityUsageScanner.ts`).
 *
 * Antigravity's "Model usage" view (and steipete/codexbar + robinebers/openusage)
 * folds every model into three broad quota pools — Gemini Pro, Gemini Flash, and
 * Claude (all non-Gemini models, including GPT-OSS) — rather than one bar per
 * model. Pool window ids are `antigravity:<pool>`.
 *
 * Pure (no host dependency) so it stays unit-testable. Antigravity usage is
 * collected supervisor-side from the local language server only; there is no
 * always-on HTTP collector here (its Cloud Code surface reports a different
 * backend's quota and was intentionally dropped to avoid inconsistent numbers).
 */

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
      usedPercent: Math.round((1 - entry.remainingFraction) * 1000) / 10,
      unit: "requests" as const,
      ...(entry.resetsAt !== undefined ? { resetsAt: entry.resetsAt } : {}),
    }));
}
