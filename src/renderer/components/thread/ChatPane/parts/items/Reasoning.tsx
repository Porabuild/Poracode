import { memo, useState } from "react";
import { Surface } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { Brain, ChevronDown } from "lucide-react";
import type { RuntimeChatItem } from "@/renderer/state/slices/runtimeEventSlice";
import { useChatPaneActions } from "../../chatPaneActionsContext";
import { useBrainThinking, useShimmer } from "@/renderer/thinkingAnimator";
import { chatMessageSurfaceClass } from "./chatMessageSurface";
import { getReasoningPreview } from "./reasoningPreview";
import { ReasoningExpandedBody, ReasoningStreamViewport } from "./ReasoningStreamViewport";

interface ReasoningProps {
  item: RuntimeChatItem;
}

export const Reasoning = memo(function Reasoning({ item }: ReasoningProps) {
  const { t } = useLingui();
  const rawText = item.streams.reasoning_text ?? "";
  const hasText = rawText.trim().length > 0;
  const isStreaming = item.state !== "completed";
  const [isOpen, setIsOpen] = useState(false);
  const actions = useChatPaneActions();

  const thinkingTextRef = useShimmer<HTMLSpanElement>(isStreaming);
  const brainRef = useBrainThinking(isStreaming);

  if (!isStreaming) {
    const preview = isOpen ? "" : getReasoningPreview(rawText);
    // Compact toggle — visually distinct from tool-call accordions: no border
    // tile, dotted left rule when expanded, italic body. Equal vertical
    // padding so it doesn't visually bias toward the message above or below.
    return (
      <div className="flex w-full flex-col items-stretch justify-center py-2 pl-6 pr-3 text-[length:var(--lc-chat-font-size-meta)] text-foreground-muted">
        <button
          type="button"
          onClick={() => {
            setIsOpen((v) => !v);
            actions?.onContentHeightChange();
          }}
          aria-expanded={isOpen}
          className="group inline-flex min-w-0 max-w-full items-center gap-1.5 self-start leading-none italic opacity-80 hover:text-foreground hover:opacity-100"
        >
          <Brain className="size-3 shrink-0" />
          <span className="shrink-0">
            <Trans>Thought</Trans>
          </span>
          {preview ? <span className="min-w-0 truncate opacity-70">{preview}</span> : null}
          <ChevronDown
            className={`size-3 shrink-0 opacity-100 transition-[transform,opacity] [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:group-focus-visible:opacity-100 ${isOpen ? "rotate-180" : ""}`}
          />
        </button>
        {isOpen ? <ReasoningExpandedBody text={rawText} className="mt-2" /> : null}
      </div>
    );
  }

  return (
    <Surface variant="transparent" className={`${chatMessageSurfaceClass} pl-6`}>
      <div className="flex min-w-0 flex-col gap-1.5 text-[length:var(--lc-chat-font-size-meta)] text-foreground-muted">
        <div className="inline-flex items-center gap-1.5">
          <Brain
            ref={brainRef}
            className="poracode-brain-thinking size-3 shrink-0"
            aria-label={t`Thinking`}
          />
          <span
            ref={thinkingTextRef}
            className="poracode-thinking-text"
            data-poracode-shimmer-text={t`Thinking`}
          >
            <Trans>Thinking</Trans>
          </span>
        </div>
        {hasText ? <ReasoningStreamViewport text={rawText} className="pl-4" /> : null}
      </div>
    </Surface>
  );
});
