/**
 * Codex token/context usage → canonical usage-event builders.
 */

import type { RuntimeEvent } from "@/shared/contracts";
import {
  createContextUsageEvent,
  readNonNegativeInteger,
  usageFromTokenCounts,
} from "../../contextUsage";
import type { ThreadTokenUsage } from "../protocol";
import { readRecord } from "./readers";

export function createCodexContextUsageEvent(
  threadId: string,
  params: Record<string, unknown> | undefined,
): RuntimeEvent | undefined {
  const turn = params?.turn;
  const fromTurn =
    turn && typeof turn === "object" ? (turn as Record<string, unknown>).usage : undefined;
  const usage = params?.usage ?? fromTurn;
  if (!usage || typeof usage !== "object") return undefined;
  return createCodexUsageEvent(threadId, usage as Record<string, unknown>);
}

/**
 * Session-cumulative spend sample from `thread/tokenUsage/updated`: the
 * absolute `total.totalTokens` counter (NEVER `last` — that is per-call and
 * gets rewritten by upstream compaction). The session layer supplies the
 * scope meta (scopeId/epoch/fresh) via `CodexUsageScopeTracker.sample`.
 */
export function createCodexUsageSpentEvent(
  threadId: string,
  params: Record<string, unknown> | undefined,
  meta: { scopeId: string; epoch: number; fresh?: boolean },
): RuntimeEvent | undefined {
  const counter = readCodexCumulativeTotalTokens(params);
  if (counter === undefined) return undefined;
  return {
    type: "usage.spent",
    threadId,
    usage: {
      counterKind: "cumulative",
      counter,
      scopeId: meta.scopeId,
      epoch: meta.epoch,
      ...(meta.fresh ? { fresh: true } : {}),
      // Idempotent replays of the same counter value dedup naturally.
      sampleId: `${meta.scopeId}:${meta.epoch}:${counter}`,
      occurredAt: Date.now(),
    },
  };
}

/** Read the session-cumulative total across the current and legacy payload shapes. */
export function readCodexCumulativeTotalTokens(
  params: Record<string, unknown> | undefined,
): number | undefined {
  const currentTokenUsage = readRecord(params?.tokenUsage);
  const fromCurrent = readTotalTokens(readRecord(currentTokenUsage?.total));
  if (fromCurrent !== undefined) return fromCurrent;

  const legacy = readRecord(params?.token_usage) ?? currentTokenUsage;
  const fromLegacy = readTotalTokens(
    readRecord(legacy?.total) ??
      readRecord(legacy?.totalTokenUsage) ??
      readRecord(legacy?.total_token_usage),
  );
  if (fromLegacy !== undefined) return fromLegacy;

  const info = readRecord(params?.info);
  return readTotalTokens(readRecord(info?.total_token_usage) ?? readRecord(info?.totalTokenUsage));
}

function readTotalTokens(total: Record<string, unknown> | undefined): number | undefined {
  return readNonNegativeInteger(total?.totalTokens) ?? readNonNegativeInteger(total?.total_tokens);
}

export function createCodexTokenUsageEvent(
  threadId: string,
  params: Record<string, unknown> | undefined,
): RuntimeEvent | undefined {
  const currentTokenUsageRecord = readRecord(params?.tokenUsage);
  const currentLastUsage = readRecord(currentTokenUsageRecord?.last);
  if (currentTokenUsageRecord && currentLastUsage) {
    const currentTokenUsage = currentTokenUsageRecord as ThreadTokenUsage;
    return createCodexUsageEvent(threadId, currentLastUsage, {
      maxTokens: readNonNegativeInteger(currentTokenUsage.modelContextWindow),
    });
  }

  const legacyTokenUsage = readRecord(params?.token_usage) ?? currentTokenUsageRecord;
  if (legacyTokenUsage) {
    const usage =
      readRecord(legacyTokenUsage.last) ??
      readRecord(legacyTokenUsage.lastTokenUsage) ??
      readRecord(legacyTokenUsage.last_token_usage) ??
      readRecord(legacyTokenUsage.total) ??
      readRecord(legacyTokenUsage.totalTokenUsage) ??
      readRecord(legacyTokenUsage.total_token_usage);
    if (!usage) return undefined;
    return createCodexUsageEvent(threadId, usage, {
      maxTokens:
        readNonNegativeInteger(legacyTokenUsage.modelContextWindow) ??
        readNonNegativeInteger(legacyTokenUsage.model_context_window),
    });
  }

  const info = params?.info;
  if (!info || typeof info !== "object") return undefined;
  const obj = info as Record<string, unknown>;
  const usage =
    readRecord(obj.last_token_usage) ??
    readRecord(obj.lastTokenUsage) ??
    readRecord(obj.total_token_usage) ??
    readRecord(obj.totalTokenUsage);
  if (!usage) return undefined;

  return createCodexUsageEvent(threadId, usage, {
    maxTokens:
      readNonNegativeInteger(obj.model_context_window) ??
      readNonNegativeInteger(obj.modelContextWindow),
  });
}

function createCodexUsageEvent(
  threadId: string,
  obj: Record<string, unknown>,
  options: { maxTokens?: number | undefined } = {},
): RuntimeEvent | undefined {
  return createContextUsageEvent(
    threadId,
    usageFromTokenCounts({
      usedTokens:
        readNonNegativeInteger(obj.totalTokens) ??
        readNonNegativeInteger(obj.total_tokens) ??
        readNonNegativeInteger(obj.used),
      maxTokens:
        options.maxTokens ??
        readNonNegativeInteger(obj.modelContextWindow) ??
        readNonNegativeInteger(obj.model_context_window) ??
        readNonNegativeInteger(obj.maxTokens) ??
        readNonNegativeInteger(obj.max_tokens) ??
        readNonNegativeInteger(obj.size),
      inputTokens:
        readNonNegativeInteger(obj.inputTokens) ?? readNonNegativeInteger(obj.input_tokens),
      outputTokens:
        readNonNegativeInteger(obj.outputTokens) ?? readNonNegativeInteger(obj.output_tokens),
      thoughtTokens:
        readNonNegativeInteger(obj.thoughtTokens) ??
        readNonNegativeInteger(obj.reasoningTokens) ??
        readNonNegativeInteger(obj.reasoningOutputTokens) ??
        readNonNegativeInteger(obj.reasoning_output_tokens) ??
        readNonNegativeInteger(obj.reasoning_tokens),
      cachedReadTokens:
        readNonNegativeInteger(obj.cachedInputTokens) ??
        readNonNegativeInteger(obj.cachedReadTokens) ??
        readNonNegativeInteger(obj.cacheReadTokens) ??
        readNonNegativeInteger(obj.cached_input_tokens) ??
        readNonNegativeInteger(obj.cache_read_tokens),
      cachedWriteTokens:
        readNonNegativeInteger(obj.cachedWriteTokens) ??
        readNonNegativeInteger(obj.cacheWriteTokens) ??
        readNonNegativeInteger(obj.cache_write_tokens),
    }),
  );
}
