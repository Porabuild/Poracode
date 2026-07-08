import { useEffect, useRef, useState } from "react";
import { keyboardDebug } from "./composerKeyboardDebug";
import { getMobileRuntimePlatform } from "./mobilePlatform";

export interface KeyboardGeometry {
  /**
   * The height by which bottom-anchored app chrome must be translated to stay
   * above an overlaid keyboard. This is 0 when the browser/WebView resizes the
   * layout viewport for the keyboard.
   */
  readonly liftOffset: number;
  /**
   * The keyboard-height signal used for focus choreography and dismiss
   * detection. This still rises when the layout viewport itself resized.
   */
  readonly visibilityOffset: number;
}

const VIEWPORT_NOISE_PX = 2;
const KEYBOARD_VISIBILITY_OFFSET_VAR = "--m-keyboard-visibility-offset";
const VIEWPORT_BASELINE_HEIGHT_VAR = "--m-viewport-baseline-height";

function positive(value: number | undefined): number {
  return Number.isFinite(value) && value !== undefined && value > 0 ? value : 0;
}

function roundedOffset(value: number): number {
  return value > VIEWPORT_NOISE_PX ? Math.round(value) : 0;
}

function readLayoutViewportHeight(viewport: VisualViewport): number {
  if (getMobileRuntimePlatform() === "android") {
    return (
      positive(window.innerHeight) ||
      positive(document.documentElement.clientHeight) ||
      positive(viewport.height)
    );
  }
  const rootHeight = positive(document.documentElement.clientHeight);
  if (rootHeight > 0) return rootHeight;
  return positive(window.innerHeight) || positive(viewport.height);
}

function readViewportExtent(viewport: VisualViewport): number {
  return Math.max(
    positive(window.innerHeight),
    positive(document.documentElement.clientHeight),
    positive(viewport.height + readVisualViewportTop(viewport)),
  );
}

function readVisualViewportTop(viewport: VisualViewport): number {
  const offsetTop = Math.max(0, viewport.offsetTop);
  if (getMobileRuntimePlatform() !== "android") return offsetTop;
  return Math.max(offsetTop, positive(viewport.pageTop));
}

function readGeometry(
  viewport: VisualViewport,
  baselineExtent: number,
): KeyboardGeometry & {
  readonly baselineExtent: number;
  readonly layoutHeight: number;
  readonly layoutResizeOffset: number;
  readonly layoutResizedForKeyboard: boolean;
  readonly visualBottom: number;
  readonly visualTop: number;
} {
  const platform = getMobileRuntimePlatform();
  const visualTop = readVisualViewportTop(viewport);
  const visualBottom = viewport.height + visualTop;
  const layoutHeight = readLayoutViewportHeight(viewport);
  const layoutResizeOffset = roundedOffset(baselineExtent - layoutHeight);
  const layoutResizedForKeyboard = platform === "android" && layoutResizeOffset > 0;

  return {
    baselineExtent,
    liftOffset: platform === "android" ? 0 : roundedOffset(layoutHeight - visualBottom),
    layoutHeight,
    layoutResizeOffset,
    layoutResizedForKeyboard,
    visualBottom,
    visualTop,
    visibilityOffset: layoutResizedForKeyboard
      ? layoutResizeOffset
      : roundedOffset(baselineExtent - visualBottom),
  };
}

/**
 * Mobile keyboard geometry derived from `visualViewport`.
 *
 * iOS shrinks only the visual viewport when the keyboard opens; the layout
 * viewport stays full-height, so bottom chrome needs a manual lift.
 * Android WebView resizes the layout viewport for the keyboard, but it can
 * emit an early visual-viewport-only frame during the keyboard animation. Keep
 * Android lift at 0 and use the offset only as a visibility signal there, so
 * the composer does not chase that transient frame.
 */
export function useKeyboardGeometry(): KeyboardGeometry {
  const [geometry, setGeometry] = useState<KeyboardGeometry>({
    liftOffset: 0,
    visibilityOffset: 0,
  });
  const baselineExtentRef = useRef(0);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;

    const update = () => {
      baselineExtentRef.current = Math.max(baselineExtentRef.current, readViewportExtent(viewport));
      const next = readGeometry(viewport, baselineExtentRef.current);
      if (getMobileRuntimePlatform() === "android") {
        document.documentElement.style.setProperty(
          VIEWPORT_BASELINE_HEIGHT_VAR,
          `${baselineExtentRef.current}px`,
        );
        document.documentElement.style.setProperty(
          KEYBOARD_VISIBILITY_OFFSET_VAR,
          `${next.visibilityOffset}px`,
        );
      }
      keyboardDebug("keyboard-geometry", { ...next });
      setGeometry({ liftOffset: next.liftOffset, visibilityOffset: next.visibilityOffset });
    };
    update();
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    return () => {
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
    };
  }, []);

  return geometry;
}

/**
 * Height (px) bottom-anchored app chrome must be lifted above the keyboard.
 * Returns 0 where `visualViewport` is unavailable or when the layout viewport
 * already resized around the keyboard.
 */
export function useKeyboardOffset(): number {
  return useKeyboardGeometry().liftOffset;
}

/** Height (px) signal that the software keyboard is visible. */
export function useKeyboardVisibilityOffset(): number {
  return useKeyboardGeometry().visibilityOffset;
}
