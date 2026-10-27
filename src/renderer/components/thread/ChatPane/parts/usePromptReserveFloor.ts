import { useLayoutEffect, type RefObject } from "react";
import type { LegendListRef } from "@legendapp/list/react";

export const PROMPT_FLOOR_CSS_VAR = "--chat-prompt-floor";

/**
 * Keeps the transcript tall enough for the anchored prompt to sit flush at the
 * top (content min-height = prompt offset + 100% of the viewport). LegendList
 * reserves exactly that space below the reply, but it recomputes the reserve one
 * ResizeObserver delivery after the viewport grows or the footer shrinks, and
 * the browser clamps scrollTop in between, leaving the prompt below the top.
 * The floor holds the scroll range in the same layout pass; once the reserve
 * catches up the floor equals the natural height and has no effect.
 */
export function usePromptReserveFloor({
  anchorKey,
  listRef,
  contentElementRef,
}: {
  anchorKey: string | null;
  listRef: RefObject<LegendListRef | null>;
  contentElementRef: RefObject<HTMLElement | null>;
}) {
  useLayoutEffect(() => {
    const state = listRef.current?.getState();
    const content = contentElementRef.current;
    if (!anchorKey || !state || !content) return;
    let floor: number | null = null;
    const apply = (position: number | undefined) => {
      if (position === undefined || !Number.isFinite(position)) return;
      // Round down: a floor above the natural height would add blank space.
      const next = Math.max(0, Math.floor(position));
      if (next === floor) return;
      floor = next;
      content.style.setProperty(PROMPT_FLOOR_CSS_VAR, `${next}px`);
    };
    apply(state.positionByKey(anchorKey));
    // Rows above the prompt resizing or history prepends move it; MVCP keeps it in view.
    const stopListening = state.listenToPosition(anchorKey, apply);
    return () => {
      stopListening();
      content.style.removeProperty(PROMPT_FLOOR_CSS_VAR);
    };
  }, [anchorKey, listRef, contentElementRef]);
}
