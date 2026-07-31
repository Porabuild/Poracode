/**
 * OpenCode context-usage event construction.
 */

import type { RuntimeEvent } from "@/shared/contracts";
import {
  createContextUsageEvent,
  readNonNegativeInteger,
  usageFromTokenCounts,
} from "../../contextUsage";

export function createOpenCodeContextUsageEvent(
  threadId: string,
  info: unknown,
): RuntimeEvent | undefined {
  if (!info || typeof info !== "object") return undefined;
  const tokens = (info as { tokens?: unknown }).tokens;
  if (!tokens || typeof tokens !== "object") return undefined;
  const obj = tokens as Record<string, unknown>;
  const cache =
    obj.cache && typeof obj.cache === "object" ? (obj.cache as Record<string, unknown>) : {};
  return createContextUsageEvent(
    threadId,
    usageFromTokenCounts({
      inputTokens: readNonNegativeInteger(obj.input),
      outputTokens: readNonNegativeInteger(obj.output),
      thoughtTokens: readNonNegativeInteger(obj.reasoning),
      cachedReadTokens: readNonNegativeInteger(cache.read),
      cachedWriteTokens: readNonNegativeInteger(cache.write),
    }),
  );
}

function sumTokenBuckets(buckets: ReadonlyArray<number | undefined>): number | undefined {
  let total = 0;
  let seen = false;
  for (const bucket of buckets) {
    if (bucket === undefined) continue;
    total += bucket;
    seen = true;
  }
  return seen ? total : undefined;
}

/**
 * Per-call `usage.spent` from an assistant message's FINAL completed snapshot
 * (message snapshots evolve while `message.updated` repeats — the caller gates
 * on `time.completed` and dedups by message id). The SDK's `tokens.total` is
 * authoritative; the bucket sum is the fallback for older servers. `sampleId`
 * is the provider message id, giving the ledger exact-once dedup across
 * replayed snapshots.
 */
export function createOpenCodeUsageSpentEvent(
  threadId: string,
  info: unknown,
  scope: { scopeId: string; epoch: number; fresh?: boolean },
): RuntimeEvent | undefined {
  if (!info || typeof info !== "object") return undefined;
  const obj = info as Record<string, unknown>;
  if (obj.role !== "assistant") return undefined;
  const id = typeof obj.id === "string" && obj.id.length > 0 ? obj.id : undefined;
  if (!id) return undefined;
  const tokens = obj.tokens;
  if (!tokens || typeof tokens !== "object") return undefined;
  const tok = tokens as Record<string, unknown>;
  const cache =
    tok.cache && typeof tok.cache === "object" ? (tok.cache as Record<string, unknown>) : {};
  const total =
    readNonNegativeInteger(tok.total) ??
    sumTokenBuckets([
      readNonNegativeInteger(tok.input),
      readNonNegativeInteger(tok.output),
      readNonNegativeInteger(tok.reasoning),
      readNonNegativeInteger(cache.read),
      readNonNegativeInteger(cache.write),
    ]);
  if (total === undefined || total <= 0) return undefined;
  const model = typeof obj.modelID === "string" && obj.modelID.length > 0 ? obj.modelID : undefined;
  return {
    type: "usage.spent",
    threadId,
    usage: {
      counterKind: "per-call",
      counter: total,
      scopeId: scope.scopeId,
      epoch: scope.epoch,
      ...(scope.fresh ? { fresh: true } : {}),
      sampleId: id,
      ...(model ? { model } : {}),
    },
  };
}
