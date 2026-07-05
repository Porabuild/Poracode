import { randomUUID } from "node:crypto";
import type { RuntimeEvent, ThreadContextUsage } from "@/shared/contracts";

interface TokenCounts {
  usedTokens?: number | undefined;
  maxTokens?: number | undefined;
  inputTokens?: number | undefined;
  outputTokens?: number | undefined;
  thoughtTokens?: number | undefined;
  cachedReadTokens?: number | undefined;
  cachedWriteTokens?: number | undefined;
}

export function readNonNegativeInteger(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return undefined;
  return Math.trunc(value);
}

/** Mint a canonical runtime-event item id of the form `<prefix>-<uuid>`. */
export function newItemId(prefix: string): string {
  return `${prefix}-${randomUUID()}`;
}

export function createContextUsageEvent(
  threadId: string,
  usage: ThreadContextUsage | undefined,
): RuntimeEvent | undefined {
  if (!usage) return undefined;
  if (
    usage.usedTokens === undefined &&
    usage.maxTokens === undefined &&
    (usage.breakdown?.length ?? 0) === 0
  ) {
    return undefined;
  }
  return { type: "context.updated", threadId, usage };
}

export function usageFromTokenCounts(counts: TokenCounts): ThreadContextUsage | undefined {
  const breakdown = [
    tokenEntry("input", "Input", counts.inputTokens),
    tokenEntry("output", "Output", counts.outputTokens),
    tokenEntry("reasoning", "Reasoning", counts.thoughtTokens),
    tokenEntry("cache-read", "Cache read", counts.cachedReadTokens),
    tokenEntry("cache-write", "Cache write", counts.cachedWriteTokens),
  ].filter((entry): entry is NonNullable<typeof entry> => entry !== undefined);

  const summedTokens =
    breakdown.length > 0 ? breakdown.reduce((total, entry) => total + entry.tokens, 0) : undefined;
  const usedTokens = counts.usedTokens ?? summedTokens;

  if (usedTokens === undefined && counts.maxTokens === undefined && breakdown.length === 0) {
    return undefined;
  }

  return {
    ...(usedTokens !== undefined ? { usedTokens } : {}),
    ...(counts.maxTokens !== undefined ? { maxTokens: counts.maxTokens } : {}),
    ...(breakdown.length > 0 ? { breakdown } : {}),
  };
}

function tokenEntry(id: string, label: string, tokens: number | undefined) {
  if (tokens === undefined || tokens <= 0) return undefined;
  return { id, label, tokens };
}
