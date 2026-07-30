import { useRef, type ReactNode } from "react";
import { Button } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { useDraggable } from "@dnd-kit/react";
import { GripVertical } from "lucide-react";
import type { Project, Thread } from "@/shared/contracts";
import type { DragSourceData } from "@/renderer/dnd";
import { ThreadProviderIcon } from "@/renderer/components/providers/ThreadProviderIcon";

interface ResultRowProps {
  icon: ReactNode;
  title: string;
  subtitle?: string | undefined;
  shortcut?: string | undefined;
  index: number;
  isSelected: boolean;
  onActivate: () => void;
  onHover: () => void;
}

export function EverythingSearchResultRow(props: ResultRowProps) {
  const stateClass = props.isSelected
    ? "bg-[var(--row-active)] text-foreground"
    : "text-foreground/85 hover:bg-[var(--row-hover)] hover:text-foreground";

  return (
    <Button
      render={(buttonProps) => (
        <button
          {...buttonProps}
          type="button"
          tabIndex={-1}
          id={`everything-search-result-${props.index}`}
          role="option"
          aria-selected={props.isSelected}
          data-search-index={props.index}
        />
      )}
      variant="ghost"
      fullWidth
      className={`h-10 min-w-0 justify-start gap-2 rounded-xl px-3 font-normal ${stateClass}`}
      onPress={props.onActivate}
      onPointerMove={props.onHover}
    >
      <span className="flex size-4 shrink-0 items-center justify-center text-muted [&_svg]:size-3.5">
        {props.icon}
      </span>
      <span className="min-w-0 flex-1 text-left">
        <span className="block truncate text-[13px] leading-4">{props.title}</span>
        {props.subtitle ? (
          <span className="block truncate text-[11px] leading-4 text-muted">{props.subtitle}</span>
        ) : null}
      </span>
      {props.shortcut ? (
        <span className="shrink-0 rounded-md border border-[var(--hairline-strong)] bg-foreground/5 px-1.5 py-0.5 text-[10px] leading-4 text-muted">
          {props.shortcut}
        </span>
      ) : null}
    </Button>
  );
}

export function EverythingSearchThreadRow(props: {
  thread: Thread;
  project: Project | undefined;
  index: number;
  isSelected: boolean;
  onActivate: () => void;
  onHover: () => void;
}) {
  const { t } = useLingui();
  const rowRef = useRef<HTMLDivElement>(null);

  const { handleRef } = useDraggable({
    id: `everything-search:${props.thread.id}`,
    type: "thread",
    data: {
      type: "thread",
      threadId: props.thread.id,
      projectId: props.thread.projectId,
      ...(props.thread.worktreePath != null ? { worktreePath: props.thread.worktreePath } : {}),
    } satisfies DragSourceData,
    element: rowRef,
  });

  const stateClass = props.isSelected
    ? "bg-[var(--row-active)] text-foreground"
    : "text-foreground/85 hover:bg-[var(--row-hover)] hover:text-foreground";

  const context = [
    props.project?.name,
    props.thread.worktreeBranch ?? props.thread.worktreePath,
  ].filter((value): value is string => Boolean(value));

  return (
    <div ref={rowRef} className={`flex items-center rounded-xl ${stateClass}`}>
      <Button
        render={(buttonProps) => (
          <button
            {...buttonProps}
            type="button"
            tabIndex={-1}
            id={`everything-search-result-${props.index}`}
            role="option"
            aria-selected={props.isSelected}
            data-search-index={props.index}
          />
        )}
        variant="ghost"
        fullWidth
        className="h-10 min-w-0 flex-1 justify-start gap-2 rounded-xl bg-transparent px-3 font-normal hover:bg-transparent"
        onPress={props.onActivate}
        onPointerMove={props.onHover}
      >
        <ThreadProviderIcon thread={props.thread} className="size-3.5 shrink-0" />
        <span className="min-w-0 flex-1 text-left">
          <span
            className={`block truncate text-[13px] leading-4 ${
              props.thread.done ? "opacity-50 line-through" : ""
            }`}
          >
            {props.thread.title}
          </span>
          {context.length > 0 ? (
            <span className="block truncate text-[11px] leading-4 text-muted">
              {context.join(" · ")}
            </span>
          ) : null}
        </span>
      </Button>
      <button
        ref={handleRef}
        type="button"
        aria-label={t`Move thread ${props.thread.title}`}
        className="mr-1.5 flex size-7 shrink-0 cursor-grab items-center justify-center rounded-lg text-muted/60 hover:bg-foreground/5 hover:text-muted active:cursor-grabbing"
      >
        <GripVertical aria-hidden="true" className="size-3.5" />
      </button>
    </div>
  );
}
