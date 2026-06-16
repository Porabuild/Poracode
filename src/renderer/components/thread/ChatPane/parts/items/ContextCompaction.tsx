import { memo } from "react";
import { Surface } from "@heroui/react";
import { Layers } from "lucide-react";
import type { ToolCallPayload } from "@/shared/contracts";
import type { RuntimeChatItem } from "@/renderer/state/slices/runtimeEventSlice";
import { formatTokenCount } from "@/renderer/components/thread/formatTokenCount";
import { useShimmer } from "@/renderer/thinkingAnimator";
import { chatMessageSurfaceClass } from "./chatMessageSurface";

interface ContextCompactionProps {
  item: RuntimeChatItem;
}

export const ContextCompaction = memo(function ContextCompaction({ item }: ContextCompactionProps) {
  const isRunning = item.state !== "completed";
  const summary = isRunning ? null : formatCompactionSummary(item.payload);
  const thinkingTextRef = useShimmer<HTMLSpanElement>(isRunning);

  if (isRunning) {
    return (
      <Surface variant="transparent" className={chatMessageSurfaceClass}>
        <div className="inline-flex min-w-0 items-center gap-1.5 text-[length:var(--lc-chat-font-size-meta)] text-foreground-muted">
          <Layers className="size-3 shrink-0 lightcode-compacting-icon" />
          <span
            ref={thinkingTextRef}
            className="lightcode-thinking-text"
            data-lightcode-shimmer-text="Compacting context"
          >
            Compacting context
          </span>
        </div>
      </Surface>
    );
  }

  return (
    <div className="flex w-full flex-col items-stretch justify-center px-3 py-2 text-[length:var(--lc-chat-font-size-meta)] text-foreground-muted">
      <span className="inline-flex min-w-0 items-center gap-1.5 self-start leading-none italic opacity-80">
        <Layers className="size-3 shrink-0 lightcode-compacted-icon" />
        {summary ?? "Context compacted"}
      </span>
    </div>
  );
});

interface CompactMetadata {
  trigger?: "manual" | "auto" | string;
  pre_tokens?: number;
  post_tokens?: number;
  duration_ms?: number;
}

function formatCompactionSummary(payload: unknown): string | null {
  const meta = readCompactMetadata(payload);
  if (!meta) return null;
  const before = formatTokenLabel(meta.pre_tokens);
  const after = formatTokenLabel(meta.post_tokens);
  const trigger = meta.trigger === "manual" ? "manually compacted" : "compacted";
  if (before && after) return `Context ${trigger}: ${before} → ${after} tokens`;
  if (before) return `Context ${trigger} from ${before} tokens`;
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
