import { useRef } from "react";
import type { Project, Thread } from "@/shared/contracts";
import { ThreadProviderIcon } from "@/renderer/components/providers/ThreadProviderIcon";
import { useDraggable } from "@dnd-kit/react";
import type { DragSourceData } from "@/renderer/dnd";
import { handleKeyActivate } from "@/renderer/utils/a11y";

export function ThreadSearchResultRow(props: {
  thread: Thread;
  project: Project | undefined;
  isSelected: boolean;
  onActivate: () => void;
  onHover: () => void;
}) {
  const { thread, project, isSelected, onActivate, onHover } = props;
  const rowRef = useRef<HTMLDivElement>(null);

  useDraggable({
    id: `thread-search:${thread.id}`,
    type: "thread",
    data: {
      type: "thread",
      threadId: thread.id,
      projectId: thread.projectId,
      ...(thread.worktreePath != null ? { worktreePath: thread.worktreePath } : {}),
    } satisfies DragSourceData,
    element: rowRef,
  });

  const stateClass = isSelected
    ? "bg-[var(--row-active)] text-foreground"
    : "text-foreground/85 hover:bg-[var(--row-hover)] hover:text-foreground";

  return (
    <div
      ref={rowRef}
      role="option"
      aria-selected={isSelected}
      tabIndex={-1}
      className={`group flex w-full cursor-default items-center gap-2 rounded-xl px-3 py-1 text-[13px] outline-none transition-colors ${stateClass}`}
      onClick={onActivate}
      onMouseMove={onHover}
      onKeyDown={(e) => handleKeyActivate(e, onActivate)}
    >
      <ThreadProviderIcon thread={thread} className="size-3.5 shrink-0" />
      <span className={`min-w-0 flex-1 truncate ${thread.done ? "opacity-50 line-through" : ""}`}>
        {thread.title}
      </span>
      {project ? (
        <span className="shrink-0 truncate text-xs text-muted/80">{project.name}</span>
      ) : null}
    </div>
  );
}
