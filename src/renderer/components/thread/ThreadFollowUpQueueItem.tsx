import { useSortable } from "@dnd-kit/react/sortable";
import { useEffect, useLayoutEffect, useRef } from "react";
import { Pencil, Trash2, GripVertical } from "lucide-react";
import { useLingui } from "@lingui/react/macro";
import type { PendingSteerState } from "@/shared/contracts";
import { Button } from "@/renderer/components/common";
import { readBridge } from "@/renderer/bridge";
import { ThreadDockIconButton } from "./ThreadDockUI";
import { ThreadFollowUpEditor } from "./ThreadFollowUpEditor";

export function ThreadFollowUpQueueItem({
  item,
  index,
  threadId,
  editingItem,
  setEditingItem,
  pending,
  editNotice,
  run,
  reorderDisabled,
  onRestoreFocus,
}: {
  item: PendingSteerState;
  index: number;
  threadId: string;
  editingItem: PendingSteerState | null;
  setEditingItem: (item: PendingSteerState | null) => void;
  editNotice?: string | undefined;
  pending: boolean;
  run: (action: () => Promise<void>) => void;
  reorderDisabled: boolean;
  onRestoreFocus?: (() => void) | undefined;
}) {
  const { t } = useLingui();
  const rowRef = useRef<HTMLLIElement>(null);
  const restoreFocusRef = useRef(onRestoreFocus);
  useLayoutEffect(() => {
    restoreFocusRef.current = onRestoreFocus;
  }, [onRestoreFocus]);
  const focusedRef = useRef(false);
  useLayoutEffect(
    () => () => {
      const row = rowRef.current;
      if (
        !row ||
        !focusedRef.current ||
        (document.activeElement !== document.body && !row.contains(document.activeElement))
      )
        return;
      const neighbor = row.nextElementSibling ?? row.previousElementSibling;
      if (neighbor instanceof HTMLElement) neighbor.focus();
      else restoreFocusRef.current?.();
    },
    [],
  );
  const isEditing = editingItem?.id === item.id;
  const wasEditing = useRef(false);
  useEffect(() => {
    if (wasEditing.current && !isEditing) rowRef.current?.focus();
    wasEditing.current = isEditing;
  }, [isEditing]);
  const { ref, handleRef, isDragging } = useSortable({
    id: item.id,
    index,
    type: "follow-up",
    accept: "follow-up",
    group: threadId,
    disabled: reorderDisabled,
  });
  // `prompt` is the canonical flattened text and already excludes attachment
  // segments. Structured segments remain attached for the eventual dispatch,
  // but their filesystem paths must not leak into the queue preview.
  const preview = item.prompt.trim();
  return (
    <li
      ref={(element) => {
        rowRef.current = element;
        ref(element);
      }}
      tabIndex={-1}
      onFocusCapture={() => {
        focusedRef.current = true;
      }}
      onBlurCapture={(event) => {
        if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget))
          focusedRef.current = false;
      }}
      className={`group rounded-md hover:bg-foreground/5 focus-within:bg-foreground/5 ${isDragging ? "opacity-40" : ""}`}
    >
      {editingItem?.id === item.id ? (
        <ThreadFollowUpEditor
          item={editingItem}
          pending={pending}
          notice={editNotice}
          onCancel={() => setEditingItem(null)}
          onSave={(prompt, segments) =>
            run(async () => {
              await readBridge().editQueuedThreadFollowUp({
                threadId,
                id: item.id,
                expectedStagedAt: editingItem.stagedAt,
                prompt,
                segments,
              });
              setEditingItem(null);
            })
          }
        />
      ) : (
        <div className="flex min-h-8 items-center gap-2 px-2">
          <Button
            ref={handleRef}
            isIconOnly
            size="sm"
            variant="ghost"
            aria-label={t`Reorder queued follow-up`}
            className="size-6 min-w-0 shrink-0 touch-none cursor-grab text-muted/50 hover:text-foreground active:cursor-grabbing"
            isDisabled={reorderDisabled}
          >
            <GripVertical className="size-3.5" />
          </Button>
          <span className="min-w-0 flex-1 truncate text-foreground" title={preview}>
            {preview}
          </span>
          <div className="flex shrink-0 items-center gap-0.5 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100">
            <Button
              size="sm"
              variant="ghost"
              className="h-6 min-w-0 px-2 text-xs"
              aria-label={t`Steer queued follow-up`}
              isDisabled={pending || editingItem !== null}
              onPress={() =>
                run(() => readBridge().steerQueuedThreadFollowUp({ threadId, id: item.id }))
              }
            >{t`Steer`}</Button>
            <ThreadDockIconButton
              label={t`Edit queued follow-up`}
              isDisabled={pending || editingItem !== null}
              onPress={() =>
                run(async () => {
                  await readBridge().pauseThreadFollowUps({ threadId, id: item.id });
                  setEditingItem(item);
                })
              }
            >
              <Pencil className="size-3.5" />
            </ThreadDockIconButton>
            <ThreadDockIconButton
              label={t`Remove queued follow-up`}
              isDisabled={pending || editingItem !== null}
              onPress={() =>
                run(() => readBridge().removeQueuedThreadFollowUp({ threadId, id: item.id }))
              }
            >
              <Trash2 className="size-3.5" />
            </ThreadDockIconButton>
          </div>
        </div>
      )}
    </li>
  );
}
