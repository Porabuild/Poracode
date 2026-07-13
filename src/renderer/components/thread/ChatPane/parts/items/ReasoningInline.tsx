import { Disclosure } from "@heroui/react";
import { memo, useState, type ReactNode } from "react";
import { useLingui } from "@lingui/react/macro";
import { Brain } from "lucide-react";
import type { RuntimeChatItem } from "@/renderer/state/slices/runtimeEventSlice";
import { useBrainThinking, useShimmer } from "@/renderer/thinkingAnimator";
import { useChatPaneActions } from "../../chatPaneActionsContext";
import { ChatRowMetaSeparator, chatRowIndicatorClass, inlineRowTriggerClass } from "./chatRow";
import { getReasoningPreview } from "./reasoningPreview";
import { ReasoningExpandedBody, ReasoningStreamViewport } from "./ReasoningStreamViewport";

interface ReasoningInlineProps {
  item: RuntimeChatItem;
}

/**
 * Reasoning rendered as a row inside a tool-call group. While the model is
 * thinking the row auto-expands and streams the live reasoning text; on
 * completion it auto-collapses into a "Thought" row with a one-line preview of
 * the reasoning as trailing meta. Manual toggles override the automatic state.
 */
export const ReasoningInline = memo(function ReasoningInline({ item }: ReasoningInlineProps) {
  const { t } = useLingui();
  const actions = useChatPaneActions();
  const isStreaming = item.state !== "completed";
  // null = follow the automatic state (open while streaming, closed after).
  const [manualExpanded, setManualExpanded] = useState<boolean | null>(null);
  const isExpanded = manualExpanded ?? isStreaming;
  const rawText = item.streams.reasoning_text ?? "";
  const hasText = rawText.trim().length > 0;
  const preview = !isStreaming && !isExpanded ? getReasoningPreview(rawText) : "";
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
        setManualExpanded(next);
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
