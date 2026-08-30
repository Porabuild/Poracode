import { createContext, useContext, useLayoutEffect } from "react";

/**
 * Lets rows inside a tool-call group report that they are expanded. An expanded
 * row breaks the uniform row pitch the sliding-window animation is baked
 * against, so the group snaps its window instead of animating while any row is
 * open. Deliberately a callback into a ref counter rather than shared state: the
 * only consumer is imperative animation code, and re-rendering the group on
 * expand would cost more than the animation saves.
 */
export const ToolCallRowOpenContext = createContext<((open: boolean) => void) | null>(null);

/**
 * Reports `isExpanded` to the owning group for as long as the row stays open.
 * The effect cleanup covers unmount too, so a row dropped from the window while
 * expanded cannot leak a permanent "open" count.
 */
export function useToolCallRowOpenSignal(isExpanded: boolean): void {
  const notify = useContext(ToolCallRowOpenContext);
  useLayoutEffect(() => {
    if (!isExpanded || !notify) return;
    notify(true);
    // Keep the row marked open through the owning group's layout effect. If an
    // append drops this expanded row, that effect must still suppress the shift.
    return () => queueMicrotask(() => notify(false));
  }, [isExpanded, notify]);
}
