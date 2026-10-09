import { useEffect, useEffectEvent, useState } from "react";
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
import {
  findFirstVisibleRowIndex,
  findStickyPromptIndex,
  type RenderedRowBounds,
} from "./stickyPromptTarget";

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
  const [promptItemId, setPromptItemId] = useState<string | null>(null);
  const isFindOpen = useChatFindStore((state) => state.activeThreadId === threadId);
  const promptItem = useAppStore((state) =>
    promptItemId === null ? undefined : state.runtimeItemsByIdByThread[threadId]?.[promptItemId],
  );

  const syncPrompt = useEffectEvent((currentEntries: readonly ChatTimelineEntry[]) => {
    if (!scrollElement) return;
    const viewport = scrollElement.getBoundingClientRect();
    const rows: RenderedRowBounds[] = [];
    for (const row of scrollElement.querySelectorAll<HTMLElement>("[data-chat-virtual-row]")) {
      const rect = row.getBoundingClientRect();
      rows.push({ index: Number(row.dataset.index), top: rect.top, bottom: rect.bottom });
    }
    const firstVisibleIndex = findFirstVisibleRowIndex(rows, viewport.top, viewport.bottom);
    const itemsById = useAppStore.getState().runtimeItemsByIdByThread[threadId];
    const promptIndex =
      firstVisibleIndex === null
        ? null
        : findStickyPromptIndex(firstVisibleIndex, (index) => {
            const entry = currentEntries[index];
            return entry?.kind === "item" && itemsById?.[entry.id]?.type === "user_message";
          });
    setPromptItemId(promptIndex === null ? null : (currentEntries[promptIndex]?.id ?? null));
  });

  // Rows mount, move and resize as the user scrolls, older pages load, or the
  // tail streams. Each of those either fires a scroll event or changes
  // `entries`, so re-resolve the prompt on both, at most once per frame.
  useEffect(() => {
    if (!scrollElement) return;
    let frame: number | null = null;
    const schedule = () => {
      if (frame !== null) return;
      frame = requestAnimationFrame(() => {
        frame = null;
        syncPrompt(entries);
      });
    };
    schedule();
    scrollElement.addEventListener("scroll", schedule, { passive: true });
    return () => {
      scrollElement.removeEventListener("scroll", schedule);
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [scrollElement, entries]);

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
