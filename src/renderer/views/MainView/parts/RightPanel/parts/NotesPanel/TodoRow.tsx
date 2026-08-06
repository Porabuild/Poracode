import { useEffect, useRef, useState } from "react";
import { useSortable } from "@dnd-kit/react/sortable";
import { Check, MessageSquarePlus, Pencil, Trash2 } from "lucide-react";
import { useLingui } from "@lingui/react/macro";
import type { NotesTodoItem } from "@/shared/contracts";
import { isRemoteSession } from "@/renderer/bridge";
import { ContextMenu } from "@/renderer/components/common/ContextMenu";
import { useLongPress } from "@/renderer/hooks/useLongPress";
import { openTodoActions } from "./todoActions";

const todoActionButtonClass =
  "flex size-[18px] shrink-0 items-center justify-center rounded text-muted/55 transition group-hover/todo:opacity-100 focus-visible:opacity-100";

export function TodoRow(props: {
  todo: NotesTodoItem;
  index: number;
  projectId: string;
  onToggle: () => void;
  onChangeText: (text: string) => void;
  onRemove: () => void;
  onNewThread: () => void;
}) {
  const { todo, index, projectId, onToggle, onChangeText, onRemove, onNewThread } = props;
  const { t } = useLingui();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(todo.text);
  const inputRef = useRef<HTMLInputElement>(null);
  const beginEdit = () => {
    setDraft(todo.text);
    setEditing(true);
  };

  // Reordered through the local list DragDropProvider. Dragging is disabled
  // while editing so the inline input stays interactive.
  const { ref, handleRef, isDragging } = useSortable({
    id: `todo:${todo.id}`,
    index,
    type: "todo",
    accept: "todo",
    group: `todos:${projectId}`,
    disabled: editing,
    data: { type: "todo", todoId: todo.id, projectId, text: todo.text },
  });

  const longPressHandlers = useLongPress(
    isRemoteSession()
      ? () => {
          // A drag can activate after only 5px, before the long-press hook's
          // 12px movement tolerance cancels its timer. Check the sortable's
          // current state when the timer fires so that overlap stays a drag.
          if (isDragging) return;
          openTodoActions({
            text: todo.text,
            requestRename: beginEdit,
            requestNewThread: onNewThread,
            requestRemove: onRemove,
          });
        }
      : null,
  );

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const commitEdit = () => {
    setEditing(false);
    const next = draft.trim();
    if (next && next !== todo.text) {
      onChangeText(next);
    } else {
      setDraft(todo.text);
    }
  };

  const actionVisibilityClass = isDragging ? "opacity-100" : "opacity-0";

  return (
    <ContextMenu
      items={[
        {
          id: "rename",
          label: t`Rename`,
          icon: <Pencil className="size-3.5" />,
        },
        {
          id: "new-thread",
          label: t`New thread from this to-do`,
          icon: <MessageSquarePlus className="size-3.5" />,
        },
        {
          id: "delete",
          label: t`Delete`,
          icon: <Trash2 className="size-3.5" />,
          variant: "danger",
        },
      ]}
      onAction={(key) => {
        if (key === "rename") beginEdit();
        else if (key === "new-thread") onNewThread();
        else if (key === "delete") onRemove();
      }}
    >
      <div
        ref={ref}
        className={`lc-notes-todo-row group/todo relative flex items-center gap-1.5 rounded pl-1 pr-2 py-1 ${
          isDragging ? "bg-[var(--row-hover)] opacity-40" : "hover:bg-[var(--row-hover)]"
        }`}
      >
        <button
          type="button"
          className="lc-notes-todo-toggle flex size-3.5 shrink-0 items-center justify-center"
          title={todo.done ? t`Mark as not done` : t`Mark as done`}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={onToggle}
        >
          <span
            className={`lc-notes-todo-check flex size-3.5 items-center justify-center rounded border ${
              todo.done
                ? "border-foreground bg-foreground text-background"
                : "border-[color:var(--border)] text-transparent hover:border-foreground"
            }`}
          >
            <Check className="size-2.5" />
          </span>
        </button>
        {editing ? (
          <input
            ref={inputRef}
            className="lc-notes-todo-input m-0 h-5 min-w-0 flex-1 border-0 bg-transparent p-0 text-xs leading-5 text-foreground outline-none"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitEdit();
              } else if (e.key === "Escape") {
                e.preventDefault();
                setDraft(todo.text);
                setEditing(false);
              }
            }}
          />
        ) : (
          <button
            ref={handleRef}
            type="button"
            className={`lc-notes-todo-text m-0 min-w-0 flex-1 cursor-grab truncate p-0 text-left text-xs leading-5 ${
              todo.done ? "text-muted line-through" : "text-foreground"
            }`}
            title={t`Drag to reorder; double-click to edit`}
            {...longPressHandlers}
            // Edit on double-click so a single click + drag is free to reorder
            // (single-click edit would flip on `editing`, disabling the sortable).
            onDoubleClick={beginEdit}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === "F2") {
                e.preventDefault();
                beginEdit();
              }
            }}
          >
            {todo.text}
          </button>
        )}
        <div className="lc-notes-todo-actions flex shrink-0 items-center gap-[3px]">
          <button
            type="button"
            className={`${todoActionButtonClass} ${actionVisibilityClass} hover:text-foreground`}
            title={t`Start a new thread from this to-do`}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={onNewThread}
          >
            <MessageSquarePlus className="size-3.5" />
          </button>
          <button
            type="button"
            className={`${todoActionButtonClass} ${actionVisibilityClass} hover:text-danger`}
            title={t`Delete to-do`}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={onRemove}
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
      </div>
    </ContextMenu>
  );
}
