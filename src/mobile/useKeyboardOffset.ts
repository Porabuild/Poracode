import { useEffect, useState } from "react";

/**
 * Height (px) the on-screen keyboard currently covers, derived from
 * `visualViewport`. iOS shrinks only the visual viewport when the keyboard
 * opens (the layout viewport stays full-height) and then scrolls the layout
 * viewport to reveal the focused field — which reads as the whole screen being
 * pushed up. Reserving this offset at the bottom of a fixed, overflow-locked
 * column keeps the focused composer inside the visual viewport, so WebKit has
 * nothing left to scroll. Returns 0 where `visualViewport` is unavailable.
 */
export function useKeyboardOffset(): number {
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;

    const update = () => {
      setOffset(Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop));
    };
    update();
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    return () => {
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
    };
  }, []);

  return offset;
}
