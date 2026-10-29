import { Button } from "@heroui/react";
import { useLayoutEffect, useRef } from "react";
import { useLingui } from "@lingui/react/macro";
import type { MessageItemPayload } from "@/shared/contracts";
import {
  floatingGlassBubbleClass,
  floatingGlassSurfaceClass,
} from "@/renderer/components/layout/floatingGlass";
import { InlinePromptPieces } from "@/renderer/components/promptChips/PromptChips";
import {
  compactInlinePieces,
  hasChipPiece,
  inlinePiecesFromContent,
} from "@/renderer/components/promptChips/promptInlinePieces";
import { useAppStore } from "@/renderer/state/appStore";
import { useChatFindStore } from "@/renderer/state/chatFindStore";
import { getRuntimeItemPayload } from "@/renderer/state/slices/runtimeEventSlice";
import type { ChatTimelineEntry } from "./chatPaneSelectors";
import { buildUserPromptPreview } from "./parts/items/userPromptText";
import { findStickyPromptIndex } from "./stickyPromptTarget";
import { useVisibleRowRange } from "./useVisibleRowRange";

const PROMPT_HANDOFF_GAP_PX = 8;

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
  const wrapperRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
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
  const previewPieces = payload
    ? compactInlinePieces(inlinePiecesFromContent(payload.content))
    : [];

  useLayoutEffect(() => {
    if (!scrollElement || promptItemId === null || preview === null || !isEnabled || isFindOpen)
      return;
    const wrapper = wrapperRef.current;
    const bar = barRef.current;
    if (!wrapper || !bar) return;
    const promptIndex = entries.findIndex((entry) => entry.id === promptItemId);
    let observedRows = new Set<HTMLElement>();
    const updatePosition = () => {
      const stickyBottom =
        wrapper.getBoundingClientRect().top +
        Number.parseFloat(getComputedStyle(wrapper).paddingTop || "0") +
        bar.offsetHeight;
      let nextPromptTop = Number.POSITIVE_INFINITY;
      const rows = new Set(scrollElement.querySelectorAll<HTMLElement>("[data-chat-virtual-row]"));
      for (const row of observedRows) {
        if (!rows.has(row)) observer.unobserve(row);
      }
      for (const row of rows) {
        if (!observedRows.has(row)) observer.observe(row);
        const index = Number(row.dataset.index);
        if (index <= promptIndex || entries[index]?.id !== row.dataset.itemId) continue;
        const prompt = row.querySelector<HTMLElement>("[data-user-message]");
        if (prompt) nextPromptTop = Math.min(nextPromptTop, prompt.getBoundingClientRect().top);
      }
      observedRows = rows;
      bar.style.transform = `translateY(${Math.min(0, nextPromptTop - stickyBottom - PROMPT_HANDOFF_GAP_PX)}px)`;
    };
    let frame: number | null = null;
    const schedule = () => {
      if (frame !== null) return;
      frame = requestAnimationFrame(() => {
        frame = null;
        updatePosition();
      });
    };
    const observer = new ResizeObserver(schedule);
    observer.observe(scrollElement);
    updatePosition();
    scrollElement.addEventListener("scroll", schedule, { passive: true });
    return () => {
      scrollElement.removeEventListener("scroll", schedule);
      observer.disconnect();
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [scrollElement, entries, promptItemId, preview, isEnabled, isFindOpen]);

  if (!isEnabled || isFindOpen || promptItemId === null || preview === null) return null;

  // The wrapper reserves the same scrollbar gutter as the transcript scroller,
  // so the bar spans exactly the rows' 920px column and covers the text below.
  return (
    <div
      ref={wrapperRef}
      className="pointer-events-none absolute inset-x-0 top-0 z-10 overflow-hidden pb-3 pt-2 [scrollbar-gutter:stable]"
    >
      <div ref={barRef} className="mx-auto flex w-full max-w-[920px]">
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
            {hasChipPiece(previewPieces) ? <InlinePromptPieces pieces={previewPieces} /> : preview}
          </span>
        </Button>
      </div>
    </div>
  );
}
