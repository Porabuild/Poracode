import { msg } from "@lingui/core/macro";
import type { TranslateFn } from "@/renderer/i18n/i18n";
import type { ToolCallPayload } from "@/shared/contracts";
import type { RuntimeChatItem } from "@/renderer/state/slices/runtimeEventSlice";
import { formatTokenCount } from "@/renderer/components/thread/formatTokenCount";

/**
 * Kept out of the ContextCompaction component so classification code and the
 * TUI transcript, which renders through these modules, never load its UI
 * dependencies.
 */

interface CompactMetadata {
  trigger?: "manual" | "auto" | string;
  pre_tokens?: number;
  post_tokens?: number;
  duration_ms?: number;
}

export function formatCompactionSummary(payload: unknown, t: TranslateFn): string | null {
  const meta = readCompactMetadata(payload);
  if (!meta) return null;
  const before = formatTokenLabel(meta.pre_tokens);
  const after = formatTokenLabel(meta.post_tokens);
  const isManual = meta.trigger === "manual";
  if (before && after) {
    return isManual
      ? t(msg`Context manually compacted: ${before} → ${after} tokens`)
      : t(msg`Context compacted: ${before} → ${after} tokens`);
  }
  if (before) {
    return isManual
      ? t(msg`Context manually compacted from ${before} tokens`)
      : t(msg`Context compacted from ${before} tokens`);
  }
  return null;
}

function readCompactMetadata(payload: unknown): CompactMetadata | null {
  if (!payload || typeof payload !== "object") return null;
  const args = (payload as { args?: unknown }).args;
  if (!args || typeof args !== "object") return null;
  return args as CompactMetadata;
}

function formatTokenLabel(value: number | undefined): string | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null;
  return formatTokenCount(value);
}

/**
 * Names known to denote a context-compaction tool call. Compared
 * case-insensitively after stripping `_`, `-`, and whitespace, so codex's
 * `contextCompaction` and a hypothetical `context_compaction` /
 * `Context Compaction` from another agent all match.
 *
 * Add new providers here as their emission shape is discovered. Keep names
 * unambiguous — a bare `compaction` would risk false positives with unrelated
 * tools.
 */
const COMPACTION_NAME_KEYS: readonly string[] = [
  "contextcompaction",
  "compactcontext",
  "conversationcompaction",
  "compactconversation",
];

export function isContextCompactionToolCall(item: RuntimeChatItem): boolean {
  if (item.type !== "tool_call") return false;
  const name = (item.payload as ToolCallPayload | undefined)?.name;
  if (!name) return false;
  const normalized = name.toLowerCase().replace(/[\s_-]/g, "");
  return COMPACTION_NAME_KEYS.includes(normalized);
}
