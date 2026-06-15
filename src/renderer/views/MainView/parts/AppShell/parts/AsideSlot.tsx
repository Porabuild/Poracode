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
  // Show: Faster fade in (300ms), fast width/height (150ms)
  // Hide: Fast width/height (150ms), fast-ish fade out (200ms)
  // During an active drag, useResizablePanels writes transitionDuration: 0ms directly
  // to the panel element so per-frame width/height updates aren't smoothed.
  const dockedFadeDuration = isOpen ? "300ms" : "200ms";
  const dockedSizeDuration = "150ms";

  let asideClassName: string;
  let asideStyle: CSSProperties;
  if (overlay) {
    asideClassName = `fixed bottom-0 right-0 z-50 flex flex-col overflow-hidden border-l border-[color:var(--border)] bg-[var(--content-background)] shadow-2xl transition-transform duration-300 will-change-transform ${
      overlayReady ? "translate-x-0" : "translate-x-full"
    }`;
    asideStyle = {
      top: overlayTop,
      width: targetWidth,
      minWidth: targetWidth,
    };
  } else {
    // A docked panel collapses its width/height to 0 when closed, but a
    // `border-t`/`border-l` on a border-box element still reserves a 1px edge even
    // at size 0. That leaves a 1px strip between `main` and the window edge; with
    // the translucent shell (native material) the shell behind it is transparent,
    // so the strip reveals the backdrop as a stray hairline along the content's
    // bottom/right. Only apply the divider border while the panel is open so a
    // closed panel occupies no space and `main` reaches the edge.
    const borderClass = isOpen
      ? isHorizontal
        ? "border-t border-[color:var(--border)]"
        : "border-l border-[color:var(--border)]"
      : "";
    asideClassName = `relative overflow-hidden bg-[var(--content-background)] ${
      isHorizontal ? "min-w-0" : "min-h-0"
    } ${borderClass}`;
    asideStyle = {
      ...(isHorizontal
        ? { height: dockedDisplayHeight, minHeight: dockedDisplayHeight }
        : { width: dockedDisplayWidth, minWidth: dockedDisplayWidth }),
      opacity: isOpen ? 1 : 0,
      transitionProperty: "width, min-width, height, min-height, opacity, border-color",
      transitionDuration: `${dockedSizeDuration}, ${dockedSizeDuration}, ${dockedSizeDuration}, ${dockedSizeDuration}, ${dockedFadeDuration}, 200ms`,
      transitionTimingFunction: isOpen ? "ease-out" : "ease-in",
      willChange: "width, min-width, height, min-height, opacity",
    };
  }
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
        <div
          ref={panelInnerRef}
          className="h-full w-full"
          style={isHorizontal ? { height: targetHeight } : { width: targetWidth }}
        >
          {children}
        </div>
      </aside>
    </>
  );
}
