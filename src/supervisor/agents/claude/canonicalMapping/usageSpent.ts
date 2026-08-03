/**
 * Per-call token spend (`usage.spent`) for Claude SDK sessions.
 *
 * Every SDK `assistant` message carries the API call's `message.usage`; the
 * main-process usage ledger sums these per-call counters with exact-once
 * dedup on `sampleId`. Sub-agent (parent_tool_use_id) messages are included —
 * they are the only complete record of sidechain spend, so `task_progress`
 * (cumulative per task) and `result.usage` must NOT also be counted.
 */

import type { SDKAssistantMessage } from "@anthropic-ai/claude-agent-sdk";
import type { RuntimeEvent } from "@/shared/contracts";
import { readClaudeApiUsageSpendTokens } from "./result";
import { readClaudeAssistantMessageId } from "./helpers";

/**
 * Usage scope (SDK session id + epoch) for one Claude session. The SDK can
 * adopt a different session id mid-thread (see `shouldAdoptSessionId` in
 * sdkSession.ts); the session layer calls {@link adoptScope} so the ledger
 * keys that span as a new `(scopeId, epoch)`. `fresh: true` marks a session
 * started new (not `--resume`).
 */
export class ClaudeUsageScopeTracker {
  private epoch = 0;
  private freshPending: boolean;

  constructor(
    private scopeId: string,
    fresh: boolean,
  ) {
    this.freshPending = fresh;
  }

  /** The SDK assigned/adopted a new session id: same conversation, new scope epoch. */
  adoptScope(scopeId: string): void {
    this.scopeId = scopeId;
    this.epoch += 1;
  }

  sample(): { scopeId: string; epoch: number; fresh?: boolean } {
    const fresh = this.freshPending;
    this.freshPending = false;
    return {
      scopeId: this.scopeId,
      epoch: this.epoch,
      ...(fresh ? { fresh: true } : {}),
    };
  }
}

/** One assistant API call's total spend: input + output + cache creation + cache read. */
export function readClaudeAssistantSpendTokens(message: SDKAssistantMessage): number | undefined {
  return readClaudeApiUsageSpendTokens(message.message?.usage);
}

export function readClaudeAssistantUsageSampleId(message: SDKAssistantMessage): string {
  const apiMessageId = readClaudeAssistantMessageId(message.message);
  const requestId =
    typeof message.request_id === "string" && message.request_id.length > 0
      ? message.request_id
      : undefined;
  return apiMessageId
    ? requestId
      ? `${apiMessageId}:${requestId}`
      : apiMessageId
    : `uuid:${message.uuid}`;
}

export function createClaudeUsageSpentEvent(
  threadId: string,
  message: SDKAssistantMessage,
  meta: { scopeId: string; epoch: number; fresh?: boolean },
): RuntimeEvent | undefined {
  const counter = readClaudeAssistantSpendTokens(message);
  if (counter === undefined) return undefined;
  // Stable per API message (`msg_…:req_…`) so replays dedup exactly once in
  // the ledger; fall back to the envelope uuid when the payload has no id.
  const sampleId = readClaudeAssistantUsageSampleId(message);
  const model = typeof message.message?.model === "string" ? message.message.model : undefined;
  return {
    type: "usage.spent",
    threadId,
    usage: {
      counterKind: "per-call",
      counter,
      scopeId: meta.scopeId,
      epoch: meta.epoch,
      ...(meta.fresh ? { fresh: true } : {}),
      sampleId,
      occurredAt: Date.now(),
      ...(model ? { model } : {}),
    },
  };
}
