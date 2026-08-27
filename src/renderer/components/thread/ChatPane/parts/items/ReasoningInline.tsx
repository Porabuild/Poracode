import { Disclosure } from "@heroui/react";
import { memo, useState, type ReactNode } from "react";
import { useLingui } from "@lingui/react/macro";
import { Brain } from "lucide-react";
import { useSmoothStreamedText } from "@/renderer/hooks/useSmoothStreamedText";
import type { RuntimeChatItem } from "@/renderer/state/slices/runtimeEventSlice";
import { useBrainThinking, useShimmer } from "@/renderer/thinkingAnimator";
import { useChatPaneActions } from "../../chatPaneActionsContext";
import { ChatRowMetaSeparator, chatRowIndicatorClass, inlineRowTriggerClass } from "./chatRow";
import { getReasoningInlinePreview, getReasoningLastLine } from "./reasoningPreview";
import { useToolCallRowOpenSignal } from "./toolCallRowOpenContext";
import { ReasoningExpandedBody, ReasoningStreamViewport } from "./ReasoningStreamViewport";

interface ReasoningInlineProps {
  item: RuntimeChatItem;
}

/**
 * Reasoning rendered as a row inside a tool-call group. The row stays collapsed
 * by default: while the model is thinking the trailing meta tracks its current
 * line (streamed in line by line); on completion it settles into a "Thought"
 * row with a one-line preview of the whole block. Expanding reveals the live
 * pinned viewport while streaming, or the static body after.
 */
export const ReasoningInline = memo(function ReasoningInline({ item }: ReasoningInlineProps) {
  const { t } = useLingui();
  const actions = useChatPaneActions();
  const isStreaming = item.state !== "completed";
  const [isExpanded, setIsExpanded] = useState(false);
  useToolCallRowOpenSignal(isExpanded);
  const rawText = item.streams.reasoning_text ?? "";
  const smoothedText = useSmoothStreamedText(rawText, isStreaming && !isExpanded);
  const hasText = rawText.trim().length > 0;
  const preview = isExpanded
    ? ""
    : isStreaming
      ? getReasoningLastLine(smoothedText)
      : getReasoningInlinePreview(rawText);
  const brainRef = useBrainThinking(isStreaming);
  const shimmerRef = useShimmer<HTMLElement>(isStreaming);
  const title = isStreaming ? t`Thinking` : t`Thought`;
  const shimmerData = isStreaming ? { "data-poracode-shimmer-text": title } : {};

  // Render the body only while expanded so collapsed rows don't keep hidden
  // markdown mounted (mirrors getInlineRow's isExpanded gating).
  let body: ReactNode = null;
  if (isExpanded && hasText) {
    body = isStreaming ? (
      <ReasoningStreamViewport text={rawText} className="italic" />
    ) : (
      <ReasoningExpandedBody text={rawText} />
    );
  }

  return (
    <Disclosure
      className="text-[length:var(--lc-chat-font-size-command)] leading-tight"
      isExpanded={isExpanded}
      onExpandedChange={(next) => {
        setIsExpanded(next);
        actions?.onContentHeightChange();
      }}
    >
      <Disclosure.Heading>
        <Disclosure.Trigger className={inlineRowTriggerClass}>
          <Brain
            ref={brainRef}
            className={`size-3 shrink-0 text-[color:var(--muted)] ${
              isStreaming ? "poracode-brain-thinking" : ""
            }`}
          />
          <code
            ref={shimmerRef}
            className={`shrink-0 font-mono !text-[color:var(--muted)] ${
              isStreaming ? "poracode-thinking-text" : ""
            }`}
            {...shimmerData}
          >
            {title}
          </code>
          {preview ? (
            <>
              <ChatRowMetaSeparator />
              {/* Italic-overhang padding comes from the global
                  `.italic.truncate` rule in styles.css. */}
              <span className="min-w-0 flex-1 truncate italic text-[color:var(--muted)]">
                {preview}
              </span>
            </>
          ) : null}
          <Disclosure.Indicator className={chatRowIndicatorClass} />
        </Disclosure.Trigger>
      </Disclosure.Heading>
      <Disclosure.Content>
        <Disclosure.Body className="pb-1 pl-4 pt-1">{body}</Disclosure.Body>
      </Disclosure.Content>
    </Disclosure>
  );
});
