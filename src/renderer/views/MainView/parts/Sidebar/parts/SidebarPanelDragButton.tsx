import { type ReactNode, useId, useRef } from "react";
import { useDraggable } from "@dnd-kit/react";
import type { DragSourceData } from "@/renderer/dnd";
import { useClearDndEntityElementsOnUnmount } from "@/renderer/dndEntityCleanup";

export function SidebarPanelDragButton(props: {
  panel: "files" | "git" | "terminal";
  projectId: string;
  worktreePath?: string;
  ariaLabel: string;
  className: string;
  onPress: () => void;
  children: ReactNode;
}) {
  const elementRef = useRef<HTMLDivElement>(null);
  const dragId = useId();
  const draggableResult = useDraggable({
    id: `sidebar-panel:${props.panel}:${dragId}`,
    type: "sidebar-panel",
    data: {
      type: "sidebar-panel",
      panel: props.panel,
      projectId: props.projectId,
      ...(props.worktreePath ? { worktreePath: props.worktreePath } : {}),
    } satisfies DragSourceData,
    element: elementRef,
  });
  useClearDndEntityElementsOnUnmount(draggableResult);

  return (
    <div
      ref={elementRef}
      role="button"
      tabIndex={0}
      aria-label={props.ariaLabel}
      className={props.className}
      onClick={(event) => {
        event.stopPropagation();
        props.onPress();
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          event.stopPropagation();
          props.onPress();
        }
      }}
    >
      {props.children}
    </div>
  );
}
