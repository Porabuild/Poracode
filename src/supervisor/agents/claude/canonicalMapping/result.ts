import type { SDKControlGetContextUsageResponse, SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import type { RuntimeEvent, TurnState } from "@/shared/contracts";
import { createContextUsageEvent, readNonNegativeInteger } from "../../contextUsage";

/**
 * `[ede_diagnostic] ...` lines are emitted by claude.exe when a turn is cut
 * short before the assistant produced content (the typical interrupt path
 * during steering). The SDK itself filters them out as informational — see
 * the `errors.filter(e => !e.startsWith("[ede_diagnostic]"))` step in the
 * agent-sdk binary. We mirror that here so an interrupted steer doesn't
 * surface as a user-visible error.
 */
function isDiagnosticOnlyError(error: string): boolean {
  return error.startsWith("[ede_diagnostic]");
}

export function nonDiagnosticErrors(message: SDKMessage): string[] {
  if (!("errors" in message) || !Array.isArray(message.errors)) return [];
  return message.errors.filter(
    (error): error is string => typeof error === "string" && !isDiagnosticOnlyError(error),
  );
}

/**
 * claude.exe can emit subtype "success" while still surfacing an upstream API
 * failure (e.g. 401/429) via `is_error: true` and `api_error_status`. Treat
 * those as failures so the turn doesn't quietly resolve to idle.
 *
 * `is_error: true` alone is NOT sufficient — an interrupted/aborted turn is
 * reported as `error_during_execution` with `is_error: true` and only a
 * `[ede_diagnostic]` line, and must not be misread as an API failure (that
 * surfaced a spurious "Claude turn failed." on every stop/steer). So the
 * `is_error` signal is scoped to the documented subtype-"success" quirk; an
 * explicit `api_error_status >= 400` remains unambiguous on its own.
 */
export function isApiErrorResult(message: SDKMessage): boolean {
  if (message.type !== "result") return false;
  const m = message as { is_error?: unknown; api_error_status?: unknown; subtype?: unknown };
  if (typeof m.api_error_status === "number" && m.api_error_status >= 400) return true;
  return m.is_error === true && m.subtype === "success";
}

export function extractResultErrorMessage(message: SDKMessage): string | undefined {
  if (message.type !== "result") return undefined;
  const fromErrors = nonDiagnosticErrors(message)[0];
  if (fromErrors) return fromErrors;
  const result = (message as { result?: unknown }).result;
  if (typeof result === "string") {
    const trimmed = result.trim();
    if (trimmed.length > 0) return trimmed;
  }
  return undefined;
}

export function readClaudeResultUsage(
  message: Extract<SDKMessage, { type: "result" }>,
): number | undefined {
  const usage = (message as { usage?: unknown }).usage;
  return readClaudeUsageSpendTokens(usage, { fallbackToTotalTokens: true });
}

export function readClaudeApiUsageSpendTokens(usage: unknown): number | undefined {
  return readClaudeUsageSpendTokens(usage, { fallbackToTotalTokens: false });
}

function readClaudeUsageSpendTokens(
  usage: unknown,
  options: { fallbackToTotalTokens: boolean },
): number | undefined {
  if (!usage || typeof usage !== "object") return undefined;
  const record = usage as Record<string, unknown>;
  const input = readNonNegativeInteger(record.input_tokens) ?? 0;
  const output = readNonNegativeInteger(record.output_tokens) ?? 0;
  const cacheCreation = readNonNegativeInteger(record.cache_creation_input_tokens) ?? 0;
  const cacheRead = readNonNegativeInteger(record.cache_read_input_tokens) ?? 0;
  const sum = input + output + cacheCreation + cacheRead;
  if (sum > 0) return sum;
  return options.fallbackToTotalTokens ? readNonNegativeInteger(record.total_tokens) : undefined;
}

export function mapResultState(message: Extract<SDKMessage, { type: "result" }>): TurnState {
  if (isApiErrorResult(message)) return "failed";
  if (message.subtype === "success") return "completed";
  const filtered = nonDiagnosticErrors(message);
  // All errors were diagnostics — claude.exe was interrupted before producing
  // assistant content. Treat it as a user-initiated interrupt rather than a
  // failure (the diagnostic itself is informational).
  if (filtered.length === 0) return "interrupted";
  const joined = filtered.join(" ").toLowerCase();
  if (joined.includes("abort") || joined.includes("interrupt")) return "interrupted";
  if (joined.includes("cancel")) return "cancelled";
  return "failed";
}

export function contextUsageFromCompactionMetadata(
  threadId: string,
  metadata: unknown,
): RuntimeEvent | undefined {
  if (!metadata || typeof metadata !== "object") return undefined;
  const obj = metadata as Record<string, unknown>;
  const usedTokens =
    readNonNegativeInteger(obj.post_tokens) ?? readNonNegativeInteger(obj.postTokens);
  if (usedTokens === undefined) return undefined;
  return createContextUsageEvent(threadId, {
    usedTokens,
    breakdown:
      usedTokens > 0
        ? [{ id: "current-context", label: "Current context", tokens: usedTokens }]
        : [],
  });
}

export function mapClaudeContextUsageResponse(
  threadId: string,
  response: SDKControlGetContextUsageResponse,
): RuntimeEvent | undefined {
  const maxTokens =
    readPositiveInteger(response.maxTokens) ?? readPositiveInteger(response.rawMaxTokens);
  const breakdown = response.categories
    .map((category, index) => {
      const tokens = readNonNegativeInteger(category.tokens);
      if (tokens === undefined || tokens <= 0) return undefined;
      const slug = category.name
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
      return {
        id: slug ? `${slug}-${index}` : `category-${index}`,
        label: category.name,
        tokens,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== undefined);
  const rawUsedTokens = readNonNegativeInteger(response.totalTokens);
  const usedTokens =
    rawUsedTokens !== undefined && (rawUsedTokens > 0 || breakdown.length > 0)
      ? rawUsedTokens
      : undefined;

  return createContextUsageEvent(threadId, {
    ...(usedTokens !== undefined ? { usedTokens } : {}),
    ...(maxTokens !== undefined ? { maxTokens } : {}),
    ...(breakdown.length > 0 ? { breakdown } : {}),
  });
}

function readPositiveInteger(value: unknown): number | undefined {
  const parsed = readNonNegativeInteger(value);
  return parsed !== undefined && parsed > 0 ? parsed : undefined;
}
