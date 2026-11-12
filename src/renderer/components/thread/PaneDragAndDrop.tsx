import { useCallback, useLayoutEffect, useRef } from "react";
import { GripVertical } from "lucide-react";
import { useLingui } from "@lingui/react/macro";
import { Draggable, Droppable } from "@dnd-kit/dom";
import { useDragDropManager } from "@dnd-kit/react";
import type { DragSourceData } from "@/renderer/dnd";
import { scheduleDetachedTransitionCleanup } from "@/renderer/utils/detachedTransitionCleanup";

/**
 * Registers a thread or draft pane as a dnd-kit pane drag source and drop
 * zone.
 *
 * GUI panes intentionally stay mounted across thread switches in the same
 * split slot (`pane-slot:<slotId>`), mutating `paneId` in place. Registering
 * dedicated `Draggable` / `Droppable` instances per `(manager, paneId)` avoids
 * `@dnd-kit`'s dynamic-id bug where mutating `entity.id` leaks reactive sensor
 * effects on each switch and causes unmount cleanup (which captures the
 * initial id) to leave the entity and its pane DOM subtree pinned in
 * `manager.registry`.
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
 * draggable leaves both `element` and `handle` unset: it has no activator at
 * all and no DOM is touched. The pane still stays registered as a drop target
 * in every state, so sidebar threads can be dropped onto a lone pane.
 */
export function usePaneDragAndDrop(input: { paneId: string; handleRendered: boolean }) {
  const manager = useDragDropManager();
  const paneElementRef = useRef<HTMLDivElement>(null);
  const handleElementRef = useRef<Element | null>(null);
  const draggableRef = useRef<Draggable | null>(null);
  const droppableRef = useRef<Droppable | null>(null);
  const handleRenderedRef = useRef(input.handleRendered);

  useLayoutEffect(() => {
    if (!manager) {
      return;
    }

    const paneId = input.paneId;
    const handleRendered = handleRenderedRef.current;
    const paneElement = paneElementRef.current ?? undefined;
    const handleElement = handleElementRef.current ?? undefined;

    const draggable = new Draggable(
      {
        id: `pane:${paneId}`,
        type: "pane",
        data: { type: "pane", paneId } satisfies DragSourceData,
        disabled: !handleRendered,
        register: false,
      },
      manager,
    );
    draggable.element = handleRendered ? paneElement : undefined;
    draggable.handle = handleRendered ? handleElement : undefined;

    const droppable = new Droppable(
      {
        id: `pane-drop:${paneId}`,
        accept: ["pane", "thread", "new-thread"],
        data: { type: "pane-drop-zone", paneId },
        register: false,
      },
      manager,
    );
    droppable.element = paneElement;

    draggableRef.current = draggable;
    droppableRef.current = droppable;

    const unregisterDraggable = draggable.register();
    const unregisterDroppable = droppable.register();

    return () => {
      if (draggableRef.current === draggable) {
        draggableRef.current = null;
      }
      if (droppableRef.current === droppable) {
        droppableRef.current = null;
      }
      unregisterDraggable?.();
      unregisterDroppable?.();
      manager.registry.unregister(draggable);
      manager.registry.unregister(droppable);
      draggable.handle = undefined;
      draggable.element = undefined;
      droppable.element = undefined;
      droppable.proxy = undefined;
      scheduleDetachedTransitionCleanup();
    };
  }, [manager, input.paneId]);

  useLayoutEffect(() => {
    handleRenderedRef.current = input.handleRendered;
    const paneElement = paneElementRef.current ?? undefined;
    const handleElement = handleElementRef.current ?? undefined;

    const droppable = droppableRef.current;
    if (droppable) {
      droppable.element = paneElement;
    }

    const draggable = draggableRef.current;
    if (draggable) {
      draggable.disabled = !input.handleRendered;
      draggable.element = input.handleRendered ? paneElement : undefined;
      draggable.handle = input.handleRendered ? handleElement : undefined;
    }
  });

  // Escape hatch: keep callback ref identity stable so React 19 does not
  // detach and re-brand the drag handle DOM node on unrelated re-renders.
  const dragHandleRef = useCallback((element: Element | null) => {
    handleElementRef.current = element;
    const draggable = draggableRef.current;
    if (draggable) {
      draggable.handle = handleRenderedRef.current ? (element ?? undefined) : undefined;
    }
  }, []);

  return { paneElementRef, dragHandleRef };
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
