import { ItemMarkdown, SmoothItemMarkdown } from "./ItemMarkdown";
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
  const { scrollRef, contentRef } = useStickToBottom();

  return (
    <div
      ref={scrollRef}
      className={`max-h-64 overflow-y-auto [scrollbar-gutter:stable] ${className ?? ""}`}
    >
      <div ref={contentRef}>
        <SmoothItemMarkdown text={text} isStreaming />
      </div>
    </div>
  );
}

/**
 * Completed reasoning expanded under a "Thought" toggle: capped-height
 * viewport with the dotted left rule and italic body. Shared by the
 * standalone `Reasoning` block and the grouped `ReasoningInline` row so the
 * two treatments cannot drift.
 */
export function ReasoningExpandedBody({ text, className }: ReasoningStreamViewportProps) {
  return (
    <div
      className={`max-h-64 overflow-y-auto border-l border-dashed border-[color:var(--border)] pl-3 italic [scrollbar-gutter:stable] ${className ?? ""}`}
    >
      <ItemMarkdown text={text} />
    </div>
  );
}
