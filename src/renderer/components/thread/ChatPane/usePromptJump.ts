import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import type { ScrollToIndex } from "@/renderer/components/find/ChatFindBar";
import type { ChatTimelineEntry } from "./chatPaneSelectors";
import { loadRuntimeItemThroughHistory } from "./loadRuntimeItemThroughHistory";

/** Matches the transcript's opacity transition; the jump waits this long once hidden. */
const FADE_MS = 150;

interface PromptJumpState {
  threadId: string;
  /** The prompt being fetched from history; its tick shows progress. */
  pendingId: string | null;
  /**
   * The timeline as it was when the jump began. While set, the transcript keeps
   * rendering it, so every older page that arrives lands in one list update
   * when it is released rather than re-measuring the list per page.
   */
  frozenEntries: readonly ChatTimelineEntry[] | null;
  /** The transcript is faded out for the instant jump. */
  hidden: boolean;
}

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Jumps the transcript to a prompt, including one that paging has not loaded.
 * A loaded prompt scrolls there smoothly. An unloaded one is paged in while the
 * transcript holds still, then the view fades out, swaps to the fully loaded
 * list, lands on the prompt instantly and fades back in - one layout pass
 * instead of a scroll through rows that are still being measured.
 */
export function usePromptJump(input: {
  threadId: string;
  entries: readonly ChatTimelineEntry[];
  scrollToIndexRef: RefObject<ScrollToIndex | null>;
  /** Leaves the live tail so a streaming reply cannot pull the view back down. */
  beforeScroll: () => void;
  onUnavailable: () => void;
}) {
  const { threadId, entries, scrollToIndexRef, beforeScroll, onUnavailable } = input;
  const [state, setState] = useState<PromptJumpState | null>(null);
  const tokenRef = useRef(0);
  const entriesRef = useRef(entries);
  useLayoutEffect(() => {
    entriesRef.current = entries;
  });
  // A jump belongs to its thread: leaving the thread (or unmounting) abandons
  // it and drops its state, so coming back never finds a frozen transcript.
  useEffect(() => {
    const owner = threadId;
    return () => {
      tokenRef.current += 1;
      setState((previous) => (previous?.threadId === owner ? null : previous));
    };
  }, [threadId]);

  const active = state?.threadId === threadId ? state : null;

  const jumpToPrompt = (itemId: string) => {
    const token = ++tokenRef.current;
    const current = () => tokenRef.current === token;
    const indexOf = () => entriesRef.current.findIndex((entry) => entry.id === itemId);
    const finish = (unavailable: boolean) => {
      setState(null);
      if (unavailable) onUnavailable();
    };
    beforeScroll();

    const loadedIndex = indexOf();
    if (loadedIndex >= 0 && active?.frozenEntries == null) {
      setState(null);
      scrollToIndexRef.current?.(loadedIndex, { align: "start", animated: true });
      return;
    }
    if (loadedIndex >= 0) {
      // An earlier jump still holds the transcript on its snapshot, so an index
      // into the live timeline would not match the list. Release it first.
      setState(null);
      void (async () => {
        await nextFrame();
        await nextFrame();
        const index = indexOf();
        if (current() && index >= 0) {
          scrollToIndexRef.current?.(index, { align: "start", animated: true });
        }
      })();
      return;
    }

    // A jump begun while another still holds its snapshot keeps that snapshot, so
    // the list does not swap to the grown one mid-jump.
    setState({
      threadId,
      pendingId: itemId,
      frozenEntries: active?.frozenEntries ?? entriesRef.current,
      hidden: false,
    });
    void (async () => {
      if (!(await loadRuntimeItemThroughHistory(threadId, itemId, current))) {
        if (current()) finish(true);
        return;
      }
      setState((previous) => (previous ? { ...previous, hidden: true } : previous));
      await wait(FADE_MS);
      if (!current()) return;
      setState((previous) => (previous ? { ...previous, frozenEntries: null } : previous));
      // Let the released list commit and measure before landing on the row.
      await nextFrame();
      await nextFrame();
      if (!current()) return;
      const index = indexOf();
      if (index < 0) {
        finish(true);
        return;
      }
      scrollToIndexRef.current?.(index, { align: "start", animated: false });
      await nextFrame();
      if (!current()) return;
      scrollToIndexRef.current?.(index, { align: "start", animated: false });
      await nextFrame();
      if (current()) finish(false);
    })().catch(() => {
      if (current()) finish(true);
    });
  };

  return {
    jumpToPrompt,
    pendingId: active?.pendingId ?? null,
    frozenEntries: active?.frozenEntries ?? null,
    hidden: active?.hidden ?? false,
  };
}
