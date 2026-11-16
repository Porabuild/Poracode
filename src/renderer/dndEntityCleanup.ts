import { useEffect, useLayoutEffect, useRef } from "react";

interface DndElementRefCallbacks {
  ref?: ((element: Element | null) => void) | undefined;
  handleRef?: ((element: Element | null) => void) | undefined;
}

function clearDndEntityRefs(callbacks: DndElementRefCallbacks | undefined): void {
  if (!callbacks) {
    return;
  }
  callbacks.handleRef?.(null);
  callbacks.ref?.(null);
}

/**
 * Clears DOM references held by `@dnd-kit` `Draggable` / `Droppable` instances on unmount.
 *
 * When `element` or `handle` is passed as a React `RefObject`, `@dnd-kit/react`'s
 * `useOnElementChange` syncs the DOM node into the entity without clearing it on unmount,
 * allowing `DragOperation` history or late microtasks to retain detached DOM subtrees.
 * Invoking the hook's `ref(null)` / `handleRef(null)` callbacks mutates the underlying
 * entity directly instead of going through `useDeepSignal`'s read-tracking `Proxy`
 * (which cannot write WeakMap-backed private fields on `Draggable` / `Droppable`).
 */
export function useClearDndEntityElementsOnUnmount(
  callbacks: DndElementRefCallbacks | undefined,
): void {
  const latestCallbacksRef = useRef(callbacks);
  useLayoutEffect(() => {
    latestCallbacksRef.current = callbacks;
  }, [callbacks]);

  useLayoutEffect(
    () => () => {
      clearDndEntityRefs(latestCallbacksRef.current);
    },
    [],
  );

  useEffect(
    () => () => {
      clearDndEntityRefs(latestCallbacksRef.current);
    },
    [],
  );
}
