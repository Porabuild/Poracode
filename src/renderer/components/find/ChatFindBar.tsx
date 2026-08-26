import { useEffect, useEffectEvent, useMemo, useRef } from "react";
import { useLingui } from "@lingui/react/macro";
import { useShallow } from "zustand/react/shallow";
import { useAppStore } from "@/renderer/state/appStore";
import { useChatFindStore } from "@/renderer/state/chatFindStore";
import { selectVisibleThreadTimelineEntries } from "@/renderer/components/thread/ChatPane/chatPaneSelectors";
import { FindBar } from "./FindBar";
import { collectChatMatches } from "./chatFindMatches";
import { useFindBarChrome } from "./useFindBarChrome";
import {
  buildMatchRanges,
  clearFindHighlights,
  scrollRangeIntoView,
  setFindHighlights,
} from "./findText";

export type ScrollToIndex = (
  index: number,
  options?: { align?: "start" | "center" | "end" },
) => void;

interface ChatFindBarProps {
  threadId: string;
  scrollToIndexRef: React.RefObject<ScrollToIndex | null>;
  scrollElement: HTMLDivElement | null;
}

/**
 * Mounted in every ChatPane; renders (and runs the find controller) only for the
 * thread whose find session is active. Kept as a thin gate so all the find hooks
 * live in {@link ActiveChatFind}, which mounts/unmounts with the session and
 * therefore cleans up its highlights automatically.
 */
export function ChatFindBar(props: ChatFindBarProps) {
  const active = useChatFindStore((state) => state.activeThreadId === props.threadId);
  if (!active) return null;
  return <ActiveChatFind {...props} />;
}

function ActiveChatFind({ threadId, scrollToIndexRef, scrollElement }: ChatFindBarProps) {
  const { t } = useLingui();
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRafRef = useRef<number | null>(null);

  const query = useChatFindStore((state) => state.query);
  const caseSensitive = useChatFindStore((state) => state.caseSensitive);
  const currentIndex = useChatFindStore((state) => state.currentIndex);
  const matchCount = useChatFindStore((state) => state.matchCount);
  const openToken = useChatFindStore((state) => state.openToken);
  const setQuery = useChatFindStore((state) => state.setQuery);
  const toggleCaseSensitive = useChatFindStore((state) => state.toggleCaseSensitive);
  const next = useChatFindStore((state) => state.next);
  const prev = useChatFindStore((state) => state.prev);
  const close = useChatFindStore((state) => state.close);
  const setMatchCount = useChatFindStore((state) => state.setMatchCount);

  const entries = useAppStore((state) => selectVisibleThreadTimelineEntries(state, threadId));
  const itemSnapshot = useAppStore(
    useShallow(
      (state) =>
        [
          state.runtimeItemsByIdByThread[threadId],
          state.runtimeStructuralVersionByThread[threadId] ?? 0,
        ] as const,
    ),
  );
  const [itemsById, structuralVersion] = itemSnapshot;

  // `entries`/`itemsById` are reference-stable across navigation, so memoizing
  // keeps `matches` stable when only `currentIndex` changes — avoiding a full
  // transcript re-scan (and a spurious re-fire of the scroll/highlight effect)
  // on every next/prev press.
  const matches = useMemo(() => {
    void structuralVersion;
    return collectChatMatches(itemsById, entries, query, caseSensitive);
  }, [itemsById, structuralVersion, entries, query, caseSensitive]);

  // Re-resolve highlight ranges from the live (virtualized) DOM. Reads the latest
  // render's values so the scroll listener and nav effect can share it.
  const refresh = useEffectEvent(() => {
    if (!scrollElement) return;
    if (!query) {
      clearFindHighlights();
      return;
    }
    const all = buildMatchRanges(scrollElement, query, caseSensitive);
    let current: Range | null = null;
    const match = matches[currentIndex];
    if (match) {
      const row = scrollElement.querySelector(`[data-item-id="${CSS.escape(match.itemId)}"]`);
      if (row) {
        const rowRanges = buildMatchRanges(row, query, caseSensitive);
        current = rowRanges[match.occurrence] ?? null;
      }
    }
    setFindHighlights(all, current);
    if (current) scrollRangeIntoView(scrollElement, current);
  });

  useEffect(() => {
    setMatchCount(matches.length);
  }, [matches.length, setMatchCount]);

  useFindBarChrome(inputRef, openToken, close);

  // Scroll the active match's row into the virtualized window, then re-highlight
  // across the (now newly mounted) rows. Two frames: one for the scroll to land,
  // one for the virtualizer to mount/measure the target row.
  useEffect(() => {
    if (!scrollElement) return;
    const match = matches[currentIndex];
    if (match) scrollToIndexRef.current?.(match.itemIndex, { align: "center" });
    const ids: number[] = [];
    ids.push(
      requestAnimationFrame(() => {
        refresh();
        ids.push(requestAnimationFrame(() => refresh()));
      }),
    );
    return () => {
      for (const id of ids) cancelAnimationFrame(id);
    };
  }, [matches, currentIndex, scrollElement, scrollToIndexRef]);

  // Keep highlights resolved against rows the virtualizer mounts as the user
  // scrolls (ranges over unmounted rows simply don't exist until they appear).
  useEffect(() => {
    const element = scrollElement;
    if (!element) return;
    const onScroll = () => {
      if (scrollRafRef.current !== null) return;
      scrollRafRef.current = requestAnimationFrame(() => {
        scrollRafRef.current = null;
        refresh();
      });
    };
    element.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      element.removeEventListener("scroll", onScroll);
      if (scrollRafRef.current !== null) cancelAnimationFrame(scrollRafRef.current);
    };
  }, [scrollElement]);

  return (
    <div className="pointer-events-auto absolute right-4 top-2 z-20">
      <FindBar
        ref={inputRef}
        query={query}
        onQueryChange={setQuery}
        caseSensitive={caseSensitive}
        onToggleCaseSensitive={toggleCaseSensitive}
        matchCount={matchCount}
        currentIndex={currentIndex}
        onNext={next}
        onPrev={prev}
        onClose={close}
        placeholder={t`Find in chat`}
      />
    </div>
  );
}
