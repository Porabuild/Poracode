/**
 * Codex token/context usage → canonical usage-event builders.
 */

import type { RuntimeEvent } from "@/shared/contracts";
import {
  createContextUsageEvent,
  readNonNegativeInteger,
  usageFromTokenCounts,
} from "../../contextUsage";
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

export function createCodexTokenUsageEvent(
  threadId: string,
  params: Record<string, unknown> | undefined,
): RuntimeEvent | undefined {
  const tokenUsage = readRecord(params?.tokenUsage) ?? readRecord(params?.token_usage);
  if (tokenUsage) {
    const usage =
      readRecord(tokenUsage.last) ??
      readRecord(tokenUsage.lastTokenUsage) ??
      readRecord(tokenUsage.last_token_usage) ??
      readRecord(tokenUsage.total) ??
      readRecord(tokenUsage.totalTokenUsage) ??
      readRecord(tokenUsage.total_token_usage);
    if (!usage) return undefined;
    return createCodexUsageEvent(threadId, usage, {
      maxTokens:
        readNonNegativeInteger(tokenUsage.modelContextWindow) ??
        readNonNegativeInteger(tokenUsage.model_context_window),
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
