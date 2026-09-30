import { useRef } from "react";
import { GripVertical } from "lucide-react";
import { useLingui } from "@lingui/react/macro";
import { useDraggable, useDroppable } from "@dnd-kit/react";
import type { DragSourceData } from "@/renderer/dnd";

/**
 * Registers a thread or draft pane as a dnd-kit pane drag source and drop
 * zone.
 *
 * `handleRendered` must be true exactly when the pane header attaches the
 * returned `dragHandleRef` to a rendered element. dnd-kit brands a draggable's
 * activator (`handle ?? element`) with `role="button"`, `tabindex`,
 * `aria-roledescription` and `aria-disabled`, and never removes those
 * attributes again — not when the element detaches, not when the draggable
 * unregisters. With no handle attached the activator falls back to the whole
 * pane element, which would expose the entire thread — composer included — as
 * one disabled button in the accessibility tree. So whenever no handle will be
 * rendered (single-pane layouts, the unavailable-worktree placeholder), the
 * draggable registers with a never-attached element ref: it has no activator
 * at all and no DOM is touched. The pane still stays registered as a drop
 * target in every state, so sidebar threads can be dropped onto a lone pane.
 */
export function usePaneDragAndDrop(input: { paneId: string; handleRendered: boolean }) {
  const paneElementRef = useRef<HTMLDivElement>(null);
  const { handleRef } = useDraggable({
    id: `pane:${input.paneId}`,
    type: "pane",
    data: { type: "pane", paneId: input.paneId } satisfies DragSourceData,
    disabled: !input.handleRendered,
    // Registered only while a handle is mounted; with no element and no
    // handle the draggable has no activator at all.
    ...(input.handleRendered ? { element: paneElementRef } : {}),
  });
  useDroppable({
    id: `pane-drop:${input.paneId}`,
    accept: ["pane", "thread", "new-thread"],
    data: { type: "pane-drop-zone", paneId: input.paneId },
    element: paneElementRef,
  });
  return { paneElementRef, dragHandleRef: handleRef };
}

/**
 * The pane's real drag affordance. dnd-kit injects its activator attributes
 * onto whatever element `handleRef` attaches to and leaves them there, so this
 * is a dedicated element that mounts and unmounts with the drag registration —
 * never the persistent title strip, whose header actions and focus state would
 * otherwise inherit the injected semantics on a pane-count transition.
 */
export function PaneDragHandle(props: { handleRef: (element: Element | null) => void }) {
  const { t } = useLingui();
  const { handleRef } = props;
  return (
    <div
      ref={handleRef}
      data-poracode-thread-drag-handle=""
      aria-label={t`Move pane`}
      className="flex shrink-0 cursor-grab items-center rounded p-1 text-muted/40 transition-colors hover:bg-[var(--row-hover)] hover:text-foreground active:cursor-grabbing"
    >
      <GripVertical aria-hidden="true" className="size-3.5" />
    </div>
  );
}
