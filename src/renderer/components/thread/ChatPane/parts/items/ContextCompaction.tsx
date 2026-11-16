import { memo } from "react";
import { Surface } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { Layers } from "lucide-react";
import type { RuntimeChatItem } from "@/renderer/state/slices/runtimeEventSlice";
import { useShimmer } from "@/renderer/thinkingAnimator";
import { chatMessageSurfaceClass } from "./chatMessageSurface";
import { formatCompactionSummary } from "./contextCompactionToolCall";

export { isContextCompactionToolCall } from "./contextCompactionToolCall";

interface ContextCompactionProps {
  item: RuntimeChatItem;
}

export const ContextCompaction = memo(function ContextCompaction({ item }: ContextCompactionProps) {
  const { t } = useLingui();
  const isRunning = item.state !== "completed";
  const summary = isRunning ? null : formatCompactionSummary(item.payload, t);
  const thinkingTextRef = useShimmer<HTMLSpanElement>(isRunning);

  if (isRunning) {
    const compactingLabel = t`Compacting context`;
    return (
      <Surface variant="transparent" className={chatMessageSurfaceClass}>
        <div className="inline-flex min-w-0 items-center gap-1.5 text-[length:var(--lc-chat-font-size-meta)] text-foreground-muted">
          <Layers className="size-3 shrink-0 poracode-compacting-icon" />
          <span
            ref={thinkingTextRef}
            className="poracode-thinking-text"
            data-poracode-shimmer-text={compactingLabel}
          >
            {compactingLabel}
          </span>
        </div>
      </Surface>
    );
  }

  return (
    <Surface variant="transparent" className={chatMessageSurfaceClass}>
      <div className="flex min-w-0 flex-col items-stretch justify-center text-[length:var(--lc-chat-font-size-meta)] text-foreground-muted">
        <span className="inline-flex min-w-0 items-center gap-1.5 self-start leading-none italic opacity-80">
          <Layers className="size-3 shrink-0 poracode-compacted-icon" />
          {summary ?? t`Context compacted`}
        </span>
      </div>
    </Surface>
  );
});
