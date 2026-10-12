import { Accessibility, type DragStartEvent } from "@dnd-kit/dom";
import { isSortable } from "@dnd-kit/react/sortable";
import { useLingui } from "@lingui/react/macro";
import { useLayoutEffect, useRef } from "react";
import { splitModelLabel } from "./splitModelLabel";

/** Replace the DnD library's English instructions and internal-ID announcements. */
export function useFavoriteModelDragAccessibility(items: readonly { id: string; label: string }[]) {
  const { t } = useLingui();
  // The accessibility plugin registers its initial callbacks once. Keep their
  // inventory current as search and favorite toggles change the visible subset.
  const itemsRef = useRef(items);
  useLayoutEffect(() => {
    itemsRef.current = items;
  }, [items]);
  function announceReordering({ operation: { source } }: Pick<DragStartEvent, "operation">) {
    const item = itemsRef.current.find((candidate) => candidate.id === source?.id);
    if (!item || !source || !isSortable(source)) return;
    const name = splitModelLabel(item.label).name;
    const position = source.index + 1;
    const count = itemsRef.current.length;
    return t`Reordering ${name}. Position ${position} of ${count}.`;
  }
  const options: NonNullable<ConstructorParameters<typeof Accessibility>[1]> = {
    screenReaderInstructions: {
      draggable: t`Press Space to start reordering. Use the arrow keys to move, Space to drop, or Escape to cancel.`,
    },
    announcements: {
      dragstart: announceReordering,
      dragover: announceReordering,
      dragend({ operation: { source }, canceled }) {
        if (canceled) return t`Reordering canceled.`;
        const item = itemsRef.current.find((candidate) => candidate.id === source?.id);
        if (!item || !source || !isSortable(source)) return;
        const name = splitModelLabel(item.label).name;
        const position = source.index + 1;
        const count = itemsRef.current.length;
        return t`Reordered ${name}. Position ${position} of ${count}.`;
      },
    },
  };
  return { plugin: Accessibility, options };
}
