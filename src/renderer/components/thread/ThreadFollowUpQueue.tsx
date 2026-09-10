import { useState } from "react";
import { ListOrdered, Play } from "lucide-react";
import { toast } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import type { PendingSteerState, ThreadFollowUpQueueState } from "@/shared/contracts";
import { friendlyError } from "@/shared/messages";
import { DragDropProvider, type DragEndEvent } from "@dnd-kit/react";
import { isSortable } from "@dnd-kit/react/sortable";
import { ThreadFollowUpQueueItem } from "./ThreadFollowUpQueueItem";
import { readBridge } from "@/renderer/bridge";
import {
  ThreadDockHeader,
  ThreadDockIconButton,
  ThreadDockList,
  ThreadDockSection,
} from "./ThreadDockUI";

export function ThreadFollowUpQueue({
  threadId,
  queue,
  onRestoreFocus,
}: {
  threadId: string;
  queue: ThreadFollowUpQueueState | null;
  /** Fallback when the edited row was removed remotely and cannot regain focus. */
  onRestoreFocus?: (() => void) | undefined;
}) {
  const { t } = useLingui();
  const [editingItem, setEditingItem] = useState<PendingSteerState | null>(null);
  const items = queue?.items ?? [];
  const currentEdit = items.find((item) => item.id === editingItem?.id);
  // Keep the keyed editor mounted if another client removes or dispatches its
  // message. Dirty text stays available to copy; a stale save never resurrects it.
  const visibleItems = editingItem && !currentEdit ? [...items, editingItem] : items;
  const [pending, setPending] = useState(false);
  function run(action: () => Promise<void>) {
    if (pending) return;
    setPending(true);
    void Promise.resolve()
      .then(action)
      .catch((error: unknown) => {
        toast.danger(friendlyError(error));
      })
      .finally(() => setPending(false));
  }
  function handleDragEnd(event: DragEndEvent) {
    // DnD updates source.index as live rows change, so derive its anchor from
    // the same current ordering rather than a snapshot taken at drag start.
    const ids = items.map((item) => item.id);
    const source = event.operation.source;
    if (event.canceled || !source || !isSortable(source)) return;
    const from = ids.indexOf(String(source.id));
    const to = source.index;
    if (from < 0 || to < 0 || to >= ids.length || from === to) return;
    const [id] = ids.splice(from, 1);
    if (!id) return;
    ids.splice(to, 0, id);
    const beforeId = ids[to + 1] ?? null;
    run(() => readBridge().reorderQueuedThreadFollowUp({ threadId, id, beforeId }));
  }
  if (visibleItems.length === 0) return null;
  return (
    <ThreadDockSection placement="composer" collapsed={false} ariaLabel={t`Queued follow-ups`}>
      <ThreadDockHeader
        icon={ListOrdered}
        title={t`Queued follow-ups`}
        countLabel={queue?.paused ? t`Paused` : String(items.length)}
        actions={
          queue?.paused ? (
            <ThreadDockIconButton
              label={t`Resume queued follow-ups`}
              isDisabled={pending || Boolean(currentEdit)}
              onPress={() => run(() => readBridge().resumeThreadFollowUps({ threadId }))}
            >
              <Play className="size-3.5" />
            </ThreadDockIconButton>
          ) : undefined
        }
      />
      <DragDropProvider onDragEnd={handleDragEnd}>
        <ThreadDockList placement="composer" collapsed={false}>
          {visibleItems.map((item, index) => (
            <ThreadFollowUpQueueItem
              key={item.id}
              item={item}
              index={index}
              threadId={threadId}
              editingItem={editingItem}
              setEditingItem={setEditingItem}
              onRestoreFocus={onRestoreFocus}
              editNotice={
                editingItem?.id === item.id
                  ? !currentEdit
                    ? t`This message is no longer queued. Your edit is still available to copy.`
                    : currentEdit.stagedAt !== editingItem.stagedAt || !queue?.paused
                      ? t`This queued follow-up changed. Reopen it before saving.`
                      : undefined
                  : undefined
              }
              pending={pending}
              run={run}
              reorderDisabled={pending || editingItem !== null || items.length < 2}
            />
          ))}
        </ThreadDockList>
      </DragDropProvider>
    </ThreadDockSection>
  );
}
