import type { ChatTimelineEntry } from "./chatPaneSelectors";
import { ChatPromptRail } from "./ChatPromptRail";
import { StickyPrompt } from "./StickyPrompt";
import { useVisibleRowRange } from "./useVisibleRowRange";

interface ChatPromptOverlaysProps {
  threadId: string;
  entries: readonly ChatTimelineEntry[];
  scrollElement: HTMLDivElement | null;
  /** False while the transcript is still hidden for its initial scroll. */
  isEnabled: boolean;
  /** The prompt being paged in for a jump; its tick shows progress. */
  pendingPromptId: string | null;
  onScrollToEntry: (index: number) => void;
  onJumpToPrompt: (itemId: string) => void;
}

/**
 * The two prompt chrome surfaces pinned over the transcript. They share one
 * visible-row measurement per frame instead of each scanning the rendered rows,
 * and only this subtree re-renders when the visible range moves.
 */
export function ChatPromptOverlays({
  threadId,
  entries,
  scrollElement,
  isEnabled,
  pendingPromptId,
  onScrollToEntry,
  onJumpToPrompt,
}: ChatPromptOverlaysProps) {
  const visibleRange = useVisibleRowRange(scrollElement, entries);
  return (
    <>
      <StickyPrompt
        threadId={threadId}
        entries={entries}
        scrollElement={scrollElement}
        isEnabled={isEnabled}
        visibleRange={visibleRange}
        onScrollToEntry={onScrollToEntry}
      />
      <ChatPromptRail
        threadId={threadId}
        entries={entries}
        scrollElement={scrollElement}
        isEnabled={isEnabled}
        visibleRange={visibleRange}
        pendingPromptId={pendingPromptId}
        onJumpToPrompt={onJumpToPrompt}
      />
    </>
  );
}
