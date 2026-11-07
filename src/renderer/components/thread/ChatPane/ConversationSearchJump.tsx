import { useEffect, useEffectEvent, type RefObject } from "react";
import { Button, toast } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import {
  isConversationSearchTargetCurrent,
  useConversationSearchTarget,
} from "@/renderer/commands/conversationSearchNavigation";
import { useAppStore } from "@/renderer/state/appStore";
import { hydrateThreadRuntimeItems } from "@/renderer/state/chatRuntimePersister";
import { selectVisibleThreadTimelineEntries } from "./chatPaneSelectors";
import { loadRuntimeItemThroughHistory } from "./loadRuntimeItemThroughHistory";
import type { ScrollToIndex } from "@/renderer/components/find/ChatFindBar";

/** Reuse canonical, fenced paging; cancellation never changes saved history. */
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
    const current = () => !cancelled && isConversationSearchTargetCurrent(target);
    void (async () => {
      await hydrateThreadRuntimeItems(target.threadId);
      await loadRuntimeItemThroughHistory(target.threadId, target.itemId, current);
      if (!current()) return;
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
      // Let the last prepended page and virtualizer measurements commit first.
      frame = requestAnimationFrame(() => {
        if (!current()) return;
        reveal(index);
        frame = requestAnimationFrame(() => {
          if (!current()) return;
          reveal(index);
          useConversationSearchTarget.setState({ target: null });
        });
      });
    })().catch(() => {
      if (!current()) return;
      unavailable();
      useConversationSearchTarget.setState({ target: null });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [target, props.ready, props.hiddenRuntimeItemId]);
  if (!target) return null;
  return (
    <div
      role="status"
      className="flex items-center justify-between gap-2 border-b border-border px-3 py-1.5 text-xs text-muted"
    >
      <Trans>Loading matched message…</Trans>
      <Button
        size="sm"
        variant="ghost"
        onPress={() => useConversationSearchTarget.setState({ target: null })}
      >
        <Trans>Cancel</Trans>
      </Button>
    </div>
  );
}
