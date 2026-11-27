import { useEffect, useEffectEvent, useState, type RefObject } from "react";
import { Button, toast } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import {
  isConversationSearchTargetCurrent,
  useConversationSearchTarget,
} from "@/renderer/commands/conversationSearchNavigation";
import { useAppStore } from "@/renderer/state/appStore";
import { hydrateThreadRuntimeItems } from "@/renderer/state/chatRuntimePersister";
import { selectVisibleThreadTimelineEntries } from "./chatPaneSelectors";
import {
  loadRuntimeItemThroughHistory,
  locateConversationSearchMatch,
  type ConversationSearchFocus,
} from "./loadRuntimeItemThroughHistory";
import { ConversationSearchFocusView } from "./ConversationSearchFocusView";
import type { ScrollToIndex } from "@/renderer/components/find/ChatFindBar";

/**
 * Opens a conversation-search match in the current thread. A match already in
 * the loaded transcript keeps the in-list centered jump. A deep, unloaded match
 * is located by id (one authorized read) and shown with one bounded,
 * item-centered window in a read-only focused context; canonical fenced paging
 * remains the fallback for hosts without positioned reads. Cancellation and the
 * search-target authority fence every async step.
 */
export function ConversationSearchJump(props: {
  threadId: string;
  ready: boolean;
  hiddenRuntimeItemId?: string;
  scrollToIndexRef: RefObject<ScrollToIndex | null>;
  beforeScroll: () => void;
}) {
  const { t } = useLingui();
  const target = useConversationSearchTarget((state) =>
    state.target?.threadId === props.threadId ? state.target : null,
  );
  const [focus, setFocus] = useState<ConversationSearchFocus | null>(null);
  const reveal = useEffectEvent((index: number) => {
    props.beforeScroll();
    props.scrollToIndexRef.current?.(index, { align: "center" });
  });
  const unavailable = useEffectEvent(() =>
    toast.warning(t`The matched message is no longer available.`),
  );
  useEffect(() => {
    if (!target || !props.ready) return;
    let cancelled = false;
    let frame = 0;
    const controller = new AbortController();
    const current = () => !cancelled && isConversationSearchTargetCurrent(target);
    // In-list jump for a match already loaded (or after legacy paging loaded
    // it). The double frame lets the last prepended page and virtualizer
    // measurements commit before centering.
    const inListJump = () => {
      const entries = selectVisibleThreadTimelineEntries(
        useAppStore.getState(),
        target.threadId,
        props.hiddenRuntimeItemId,
      );
      const index = entries.findIndex((entry) => entry.id === target.itemId);
      if (index < 0) {
        unavailable();
        useConversationSearchTarget.setState({ target: null });
        return;
      }
      frame = requestAnimationFrame(() => {
        if (!current()) return;
        reveal(index);
        frame = requestAnimationFrame(() => {
          if (!current()) return;
          reveal(index);
          useConversationSearchTarget.setState({ target: null });
        });
      });
    };
    void (async () => {
      await hydrateThreadRuntimeItems(target.threadId);
      if (!current()) return;
      if (useAppStore.getState().runtimeItemsByIdByThread[target.threadId]?.[target.itemId]) {
        inListJump();
        return;
      }
      // Deep, unloaded match: one exact item + one bounded window, never many
      // sequential pages. `current()` and the controller fence every read.
      const located = await locateConversationSearchMatch(
        target.threadId,
        target.itemId,
        current,
        controller.signal,
      );
      if (!current()) return;
      if (located.kind === "focused") {
        setFocus(located);
        return;
      }
      if (located.kind === "legacy") {
        await loadRuntimeItemThroughHistory(target.threadId, target.itemId, current);
        if (!current()) return;
        inListJump();
        return;
      }
      unavailable();
      useConversationSearchTarget.setState({ target: null });
    })().catch(() => {
      if (!current()) return;
      unavailable();
      useConversationSearchTarget.setState({ target: null });
    });
    return () => {
      cancelled = true;
      controller.abort();
      cancelAnimationFrame(frame);
      setFocus(null);
    };
  }, [target, props.ready, props.hiddenRuntimeItemId]);

  const returnToConversation = () => {
    setFocus(null);
    useConversationSearchTarget.setState({ target: null });
  };
  if (!target) return null;
  if (focus)
    return (
      <ConversationSearchFocusView
        focus={focus}
        onReturn={returnToConversation}
        {...(target.query ? { query: target.query } : {})}
      />
    );
  return (
    <div
      role="status"
      className="flex items-center justify-between gap-2 border-b border-border px-3 py-1.5 text-xs text-muted"
    >
      <Trans>Loading matched message…</Trans>
      <Button size="sm" variant="ghost" onPress={returnToConversation}>
        <Trans>Cancel</Trans>
      </Button>
    </div>
  );
}
