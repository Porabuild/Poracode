import { useEffect } from "react";
import { pushEscapeHandler } from "@/renderer/components/layout/overlayEscapeStack";
import { clearFindHighlights } from "./findText";

/**
 * Shared Find-bar wiring used by every find surface: focus + select the input
 * on mount, register Esc-to-close on the overlay escape stack, and clear any
 * CSS highlights when the bar unmounts (the session ends). Hosts remount the
 * bar per `openToken` (key), so a reopened session refocuses through a fresh
 * mount rather than a re-run trigger.
 */
export function useFindBarChrome(
  inputRef: React.RefObject<HTMLInputElement | null>,
  close: () => void,
): void {
  // Focus + select the input on mount (each session mounts fresh).
  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [inputRef]);

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
