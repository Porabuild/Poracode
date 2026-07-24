import { RequestError } from "@agentclientprotocol/sdk";
import type { RuntimeEvent } from "@/shared/contracts";
import {
  createContextUsageEvent,
  readNonNegativeInteger,
  usageFromTokenCounts,
} from "../contextUsage";

export function createAcpPromptUsageEvent(
  threadId: string,
  usage: unknown,
): RuntimeEvent | undefined {
  if (!usage || typeof usage !== "object") return undefined;
  const obj = usage as Record<string, unknown>;
  return createContextUsageEvent(
    threadId,
    usageFromTokenCounts({
      usedTokens: readNonNegativeInteger(obj.totalTokens),
      inputTokens: readNonNegativeInteger(obj.inputTokens),
      outputTokens: readNonNegativeInteger(obj.outputTokens),
      thoughtTokens: readNonNegativeInteger(obj.thoughtTokens),
      cachedReadTokens: readNonNegativeInteger(obj.cachedReadTokens),
      cachedWriteTokens: readNonNegativeInteger(obj.cachedWriteTokens),
    }),
  );
}

/**
 * Cumulative `usage.spent` from the same `session/prompt` response usage the
 * context event above parses: per the ACP schema, `usage.totalTokens` is the
 * session-cumulative counter, so the ledger counts increases per
 * (provider, scopeId, epoch). `sampleId` folds the counter value in, which
 * makes replays of the same prompt response exact-once. When the agent
 * returns no prompt-response usage (most bridges today), emit nothing — the
 * profile honesty list covers those providers.
 */
export function createAcpPromptUsageSpentEvent(
  threadId: string,
  usage: unknown,
  scope: { scopeId: string; epoch: number; fresh?: boolean },
): RuntimeEvent | undefined {
  if (!usage || typeof usage !== "object") return undefined;
  const totalTokens = readNonNegativeInteger((usage as Record<string, unknown>).totalTokens);
  if (totalTokens === undefined) return undefined;
  return {
    type: "usage.spent",
    threadId,
    usage: {
      counterKind: "cumulative",
      counter: totalTokens,
      scopeId: scope.scopeId,
      epoch: scope.epoch,
      ...(scope.fresh ? { fresh: true } : {}),
      sampleId: `${scope.scopeId}:${scope.epoch}:${totalTokens}`,
    },
  };
}

/**
 * Replace the raw JSON-RPC error from `session/load` with a message the
 * renderer can show verbatim. Provider-agnostic on purpose: the same code
 * path triggers whenever any ACP agent rejects a `session/load` call (lost,
 * rotated, or never-persisted sessionId).
 */
export function rewriteLoadSessionError(error: unknown, _sessionId: string): Error {
  const detail = extractLoadSessionDetail(error);
  const message = detail.notFound
    ? "This conversation can't be resumed — the agent no longer recognizes this session. Start a new thread to continue."
    : `This conversation can't be resumed: ${detail.message ?? (error instanceof Error ? error.message : String(error))}. Start a new thread to continue.`;
  return Object.assign(new Error(message), { cause: error });
}

function extractLoadSessionDetail(error: unknown): { message?: string; notFound: boolean } {
  let message: string | undefined;
  let notFound = false;
  if (error instanceof RequestError) {
    message = error.message;
    const data = error.data as { message?: unknown } | undefined;
    if (data && typeof data.message === "string") {
      message = data.message;
      if (/not\s+found/i.test(data.message)) notFound = true;
    }
  } else if (error instanceof Error) {
    message = error.message;
    if (/session.*not\s+found/i.test(error.message)) notFound = true;
  }
  return notFound
    ? { ...(message ? { message } : {}), notFound: true }
    : { ...(message ? { message } : {}), notFound: false };
}

export const INTERRUPT_ACK_TEXT_TAIL_LIMIT = 512;
const USER_INTERRUPT_ACK_RE = /\boperation cancelled by user\b/i;

export function appendInterruptAckTextTail(current: string, next: string): string {
  if (next.length === 0) return current;
  const combined = current.length === 0 ? next : current + next;
  return combined.slice(-INTERRUPT_ACK_TEXT_TAIL_LIMIT);
}

/**
 * Factory Droid streams a user-visible `agent_message_chunk` (402/403 detail),
 * then `session/prompt` rejects with JSON-RPC -32603 "Internal error". Prefer
 * the message we already parsed from the chunk.
 */
export function resolveAcpPromptFailureMessage(
  error: unknown,
  agentSurfacedMessage?: string,
): string {
  if (agentSurfacedMessage) return agentSurfacedMessage;
  return resolveAcpPromptRpcErrorMessage(error);
}

/**
 * After Factory Droid streams a specific `agent_message_chunk` error, `prompt()`
 * often rejects with JSON-RPC -32603 / "Internal error". Skip that redundant
 * composer row when we already have the real message.
 */
export function shouldEmitAcpPromptRpcErrorItem(
  error: unknown,
  agentSurfacedMessage?: string,
): boolean {
  if (!agentSurfacedMessage) return true;
  if (isGenericAcpPromptTransportError(error)) return false;
  const rpcMessage = resolveAcpPromptRpcErrorMessage(error);
  return rpcMessage !== agentSurfacedMessage && !isGenericAcpPromptRpcErrorMessage(rpcMessage);
}

function isGenericAcpPromptTransportError(error: unknown): boolean {
  if (error instanceof RequestError && error.code === -32603) return true;
  return isGenericAcpPromptRpcErrorMessage(resolveAcpPromptRpcErrorMessage(error));
}

function isGenericAcpPromptRpcErrorMessage(message: string): boolean {
  const normalized = message.trim().toLowerCase();
  return normalized === "internal error" || normalized.startsWith("internal error:");
}

/** JSON-RPC error from `session/prompt` — may follow a separate agent_message_chunk. */
export function resolveAcpPromptRpcErrorMessage(error: unknown): string {
  if (error instanceof RequestError) {
    const data = error.data as { details?: unknown; detail?: unknown } | undefined;
    const detail =
      typeof data?.details === "string" && data.details.trim().length > 0
        ? data.details.trim()
        : typeof data?.detail === "string" && data.detail.trim().length > 0
          ? data.detail.trim()
          : undefined;
    const message = error.message.trim();
    if (detail && isGenericAcpPromptRpcErrorMessage(message)) return detail;
    if (message.length > 0) return message;
    if (detail) return detail;
  }
  return error instanceof Error ? error.message : String(error);
}

/**
 * Some ACP agents acknowledge `session/cancel` by rejecting the in-flight
 * `session/prompt` request instead of returning a cancelled stop reason.
 * Treat that transport shape as cancellation only when Poracode actually
 * requested the interrupt; the same error without a user stop is still a
 * real prompt failure.
 */
export function isAcpPromptCancellationError(error: unknown, interruptRequested: boolean): boolean {
  if (!interruptRequested) return false;
  const message = resolveAcpPromptRpcErrorMessage(error).trim();
  return /^(?:(?:the )?(?:request|operation) was )?abort(?:ed)?\.?$/i.test(message);
}

export function normalizeAcpStopReason(
  stopReason: string,
  input: { interruptRequested: boolean; recentAgentText?: string },
): string {
  if (
    stopReason === "end_turn" &&
    input.interruptRequested &&
    input.recentAgentText &&
    USER_INTERRUPT_ACK_RE.test(input.recentAgentText)
  ) {
    return "cancelled";
  }
  return stopReason;
}
