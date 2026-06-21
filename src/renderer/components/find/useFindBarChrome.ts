import { useEffect } from "react";
import { pushEscapeHandler } from "@/renderer/components/layout/overlayEscapeStack";
import { clearFindHighlights } from "./findText";

/**
 * Shared Find-bar wiring used by every find surface: focus + select the input
 * each time the session (re)opens, register Esc-to-close on the overlay escape
 * stack, and clear any CSS highlights when the bar unmounts (the session ends).
 */
export function useFindBarChrome(
  inputRef: React.RefObject<HTMLInputElement | null>,
  openToken: number,
  close: () => void,
): void {
  // Focus + select the input whenever the session (re)opens.
  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [inputRef, openToken]);

  // Esc closes find from anywhere in the surface; clear highlights when the
  // session ends (the host component unmounts on close / surface switch).
  useEffect(() => {
    const remove = pushEscapeHandler(() => close());
    return () => {
      remove();
      clearFindHighlights();
    };
  }, [close]);
}
