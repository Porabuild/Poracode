import { Button } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import type { MessageItemPayload } from "@/shared/contracts";
import {
  floatingGlassBubbleClass,
  floatingGlassSurfaceClass,
} from "@/renderer/components/layout/floatingGlass";
import { useAppStore } from "@/renderer/state/appStore";
import { useChatFindStore } from "@/renderer/state/chatFindStore";
import { getRuntimeItemPayload } from "@/renderer/state/slices/runtimeEventSlice";
import type { ChatTimelineEntry } from "./chatPaneSelectors";
import { buildUserPromptPreview } from "./parts/items/userPromptText";
import { findStickyPromptIndex } from "./stickyPromptTarget";
import { useVisibleRowRange } from "./useVisibleRowRange";

interface StickyPromptProps {
  threadId: string;
  entries: readonly ChatTimelineEntry[];
  scrollElement: HTMLDivElement | null;
  /** False while the transcript is still hidden for its initial scroll. */
  isEnabled: boolean;
  onScrollToEntry: (index: number) => void;
}

/**
 * One-line bar pinned over the top of the transcript that names the prompt the
 * visible content answers, once that prompt has scrolled out of view. Pressing
 * it scrolls back to the prompt. Hidden while Find in chat is open, since both
 * sit at the top of the pane.
 */
export function StickyPrompt({
  threadId,
  entries,
  scrollElement,
  isEnabled,
  onScrollToEntry,
}: StickyPromptProps) {
  const { t } = useLingui();
  const isFindOpen = useChatFindStore((state) => state.activeThreadId === threadId);
  const firstVisibleIndex = useVisibleRowRange(scrollElement, entries)?.first ?? null;
  const promptItemId = useAppStore((state) => {
    if (firstVisibleIndex === null) return null;
    const itemsById = state.runtimeItemsByIdByThread[threadId];
    const promptIndex = findStickyPromptIndex(firstVisibleIndex, (index) => {
      const entry = entries[index];
      return entry?.kind === "item" && itemsById?.[entry.id]?.type === "user_message";
    });
    return promptIndex === null ? null : (entries[promptIndex]?.id ?? null);
  });
  const promptItem = useAppStore((state) =>
    promptItemId === null ? undefined : state.runtimeItemsByIdByThread[threadId]?.[promptItemId],
  );

  const payload = promptItem
    ? getRuntimeItemPayload<MessageItemPayload>(promptItem, "user_message")
    : undefined;
  const preview = payload ? buildUserPromptPreview(payload.content) : null;
  if (!isEnabled || isFindOpen || promptItemId === null || preview === null) return null;

  // The wrapper reserves the same scrollbar gutter as the transcript scroller,
  // so the bar spans exactly the rows' 920px column and covers the text below.
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-10 overflow-hidden pb-3 pt-2 [scrollbar-gutter:stable]">
      <div className="mx-auto flex w-full max-w-[920px]">
        <Button
          variant="tertiary"
          size="sm"
          aria-label={t`Scroll to prompt: ${preview}`}
          onPress={() => {
            const index = entries.findIndex((entry) => entry.id === promptItemId);
            if (index >= 0) onScrollToEntry(index);
          }}
          className={`${floatingGlassSurfaceClass} ${floatingGlassBubbleClass} pointer-events-auto h-7 w-full min-w-0 justify-start rounded-full px-3 text-muted transition-colors hover:text-foreground`}
        >
          <span className="min-w-0 truncate text-[length:var(--lc-chat-font-size-meta)]">
            {preview}
          </span>
        </Button>
      </div>
    </div>
  );
}
