import { useDeferredValue } from "react";
import { ItemMarkdown } from "./ItemMarkdown";
import { useStickToBottom } from "./useStickToBottom";

interface ReasoningStreamViewportProps {
  text: string;
  className?: string;
}

/**
 * Live reasoning text in a capped-height viewport that stays pinned to the
 * bottom while new content streams in, and releases the pin once the user
 * scrolls up. Mount it only while the reasoning item is streaming — both the
 * standalone `Reasoning` block and the grouped `ReasoningInline` row swap to a
 * static body after completion.
 */
export function ReasoningStreamViewport({ text, className }: ReasoningStreamViewportProps) {
  const deferredText = useDeferredValue(text);
  const { scrollRef, contentRef } = useStickToBottom();

  return (
    <div
      ref={scrollRef}
      className={`max-h-64 overflow-y-auto [scrollbar-gutter:stable] ${className ?? ""}`}
    >
      <div ref={contentRef}>
        <ItemMarkdown text={deferredText} />
      </div>
    </div>
  );
}
