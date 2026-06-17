import type { CSSProperties, MouseEvent, ReactNode, RefObject } from "react";

export type AsideOrientation = "vertical" | "horizontal";

export function AsideSlot(props: {
  children: ReactNode;
  orientation: AsideOrientation;
  isOpen: boolean;
  targetWidth?: number;
  targetHeight?: number;
  onResizeStart: (event: MouseEvent<HTMLDivElement>) => void;
  panelRef: RefObject<HTMLDivElement | null>;
  panelInnerRef: RefObject<HTMLDivElement | null>;
  ariaLabel: string;
  /** When true, render as a fixed-position overlay from the right edge. */
  overlay?: boolean;
  /** Overlay slide-in state: false = off-screen right, true = on-screen. */
  overlayReady?: boolean;
  overlayTop?: string;
}) {
  const {
    children,
    orientation,
    isOpen,
    targetWidth,
    targetHeight,
    onResizeStart,
    panelRef,
    panelInnerRef,
    ariaLabel,
    overlay = false,
    overlayReady = false,
    overlayTop = "0px",
  } = props;

  const isHorizontal = orientation === "horizontal";
  const showHandle = isOpen && !overlay;

  // Docked path: width/height animates open <-> closed.
  const dockedDisplayWidth = !isHorizontal ? (isOpen ? targetWidth : 0) : undefined;
  const dockedDisplayHeight = isHorizontal ? (isOpen ? targetHeight : 0) : undefined;
  // Show: content fades in (300ms) over the opaque background, fast size (150ms).
  // Hide: fast size (150ms), fast-ish content fade out (200ms).
  // During an active drag, useResizablePanels writes transitionDuration: 0ms directly
  // to the panel element so per-frame width/height updates aren't smoothed.
  const dockedFadeDuration = isOpen ? "300ms" : "200ms";
  const dockedSizeDuration = "150ms";

  let asideClassName: string;
  let asideStyle: CSSProperties;
  if (overlay) {
    asideClassName = `fixed inset-y-0 right-0 z-50 flex flex-col overflow-hidden border-l border-[color:var(--border)] bg-[var(--content-background)] shadow-2xl transition-transform duration-300 will-change-transform ${
      overlayReady ? "translate-x-0" : "translate-x-full"
    }`;
    asideStyle = {
      // Span the full window height so the opaque panel background reaches the
      // very top — otherwise the strip above it shows the content-header row
      // dimmed by the dialog backdrop, reading as a darker seam. The panel's own
      // content is pushed below the OS titlebar/window-controls row via padding
      // so its header buttons don't collide with the min/max/close controls.
      paddingTop: overlayTop,
      width: targetWidth,
      minWidth: targetWidth,
    };
  } else {
    // The background layer (this <aside>) stays fully opaque while the panel
    // animates open, so the OS blur material (Windows acrylic / macOS vibrancy)
    // never shows through. Only the size animates here; the panel *content*
    // cross-fades on the inner layer below. Collapse the border to transparent
    // while closed so the 0-size panel leaves no 1px hairline at the edge.
    const borderColorClass = isOpen ? "border-[color:var(--border)]" : "border-transparent";
    asideClassName = `relative overflow-hidden bg-[var(--content-background)] ${
      isHorizontal ? `min-w-0 border-t ${borderColorClass}` : `min-h-0 border-l ${borderColorClass}`
    }`;
    asideStyle = {
      ...(isHorizontal
        ? { height: dockedDisplayHeight, minHeight: dockedDisplayHeight }
        : { width: dockedDisplayWidth, minWidth: dockedDisplayWidth }),
      transitionProperty: "width, min-width, height, min-height, border-color",
      transitionDuration: `${dockedSizeDuration}, ${dockedSizeDuration}, ${dockedSizeDuration}, ${dockedSizeDuration}, 200ms`,
      transitionTimingFunction: isOpen ? "ease-out" : "ease-in",
      willChange: "width, min-width, height, min-height",
    };
  }

  // Content (header + body) cross-fades on the inner layer so the opaque <aside>
  // background never reveals the OS blur material during the animation. The
  // signal differs by mode: docked tracks isOpen (size animation); overlay
  // tracks overlayReady so the content fades in step with the slide-in/out.
  //
  // Docked uses a keyframe because the layer is clipped to zero by the
  // collapsing panel and a transition's start value is unreliable when revealed
  // from a zero-clipped state (content would pop in at full opacity). The
  // overlay is never clipped (it is a full-size panel that only translates), so
  // a plain opacity transition is reliable there — and unlike the keyframe it
  // fades cleanly on close from its current value instead of snapping to 0.
  const contentVisible = overlay ? overlayReady : isOpen;
  const contentFadeDuration = overlay ? "300ms" : dockedFadeDuration;
  const contentFadeEase = contentVisible ? "ease-out" : "ease-in";
  const innerStyle: CSSProperties = {
    ...(isHorizontal ? { height: targetHeight } : { width: targetWidth }),
    opacity: contentVisible ? 1 : 0,
    ...(overlay
      ? { transition: `opacity ${contentFadeDuration} ${contentFadeEase}` }
      : {
          animation: `${
            contentVisible ? "lightcode-panel-content-in" : "lightcode-panel-content-out"
          } ${contentFadeDuration} ${contentFadeEase}`,
        }),
    willChange: "opacity",
  };
  const asideKey = overlay ? "overlay-aside" : "docked-aside";

  return (
    <>
      {showHandle && (
        <div
          key="handle"
          className={
            isHorizontal ? "lightcode-resize-handle-horizontal" : "lightcode-resize-handle"
          }
          onMouseDown={onResizeStart}
          role="separator"
          aria-orientation={orientation}
          aria-label={ariaLabel}
        />
      )}
      <aside key={asideKey} ref={panelRef} className={asideClassName} style={asideStyle}>
        <div ref={panelInnerRef} className="h-full w-full" style={innerStyle}>
          {children}
        </div>
      </aside>
    </>
  );
}
