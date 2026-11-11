import { useLayoutEffect, useRef } from "react";

interface DndElementHolder {
  element: Element | undefined;
  handle?: Element | undefined;
  proxy?: Element | undefined;
}

/**
 * Clears DOM references held by `@dnd-kit` `Draggable` / `Droppable` instances on unmount.
 *
 * When `element` or `handle` is passed as a React `RefObject`, `@dnd-kit/react`'s
 * `useOnElementChange` syncs the DOM node into the entity without clearing it on unmount,
 * allowing `DragOperation` history or late microtasks to retain detached DOM subtrees.
 */
export function useClearDndEntityElementsOnUnmount(entity: DndElementHolder | undefined): void {
  const latestEntityRef = useRef(entity);
  useLayoutEffect(() => {
    latestEntityRef.current = entity;
  }, [entity]);

  useLayoutEffect(
    () => () => {
      const current = latestEntityRef.current;
      if (!current) {
        return;
      }
      current.element = undefined;
      if ("handle" in current) {
        current.handle = undefined;
      }
      if ("proxy" in current) {
        current.proxy = undefined;
      }
    },
    [],
  );
}
