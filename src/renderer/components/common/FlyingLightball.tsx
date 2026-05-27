import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";

interface Position {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Shared "flying lightball" indicator used by tab pills (PresentationModeTabs,
 * PrTabsPill, etc.). Tracks an `activeSelector` element inside a container and
 * animates a radial-gradient glow over it as the active item changes. The glow
 * is fully transparent at rest — the consumer's active-tab text color does the
 * heavy lifting; the lightball only flares during the transition.
 */
export function FlyingLightball(props: {
  containerRef: RefObject<HTMLElement | null>;
  /** A string that changes when the active item changes — drives the position update. */
  activeKey: string;
  /** CSS selector matching the active item within the container. */
  activeSelector: string;
}) {
  const { containerRef, activeKey, activeSelector } = props;
  const [position, setPosition] = useState<Position | null>(null);
  const [animating, setAnimating] = useState(false);
  const isInitialMount = useRef(true);

  function measure(): Position | null {
    const container = containerRef.current;
    if (!container) return null;
    const target = container.querySelector(activeSelector) as HTMLElement | null;
    if (!target) return null;
    return {
      left: target.offsetLeft,
      top: target.offsetTop,
      width: target.offsetWidth,
      height: target.offsetHeight,
    };
  }

  useLayoutEffect(() => {
    // Consume the initial-mount skip as soon as the effect first runs, even if
    // the target isn't measurable yet (e.g. tabs mounted inside a modal/panel
    // that hasn't laid out). Otherwise a null measurement on mount leaves the
    // flag set, and the user's first selection gets swallowed instead — the
    // glow would only flare from the second selection onward.
    const wasInitialMount = isInitialMount.current;
    isInitialMount.current = false;
    const next = measure();
    if (!next) return;
    setPosition(next);
    if (wasInitialMount) return;
    setAnimating(true);
    const t = setTimeout(() => setAnimating(false), 80);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- measure reads from refs/props
  }, [activeKey]);

  // Track container resize so the ball reflows on font load / container width changes.
  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      const next = measure();
      if (!next) return;
      setPosition((prev) =>
        prev &&
        prev.left === next.left &&
        prev.top === next.top &&
        prev.width === next.width &&
        prev.height === next.height
          ? prev
          : next,
      );
    });
    ro.observe(container);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- measure reads from refs/props
  }, []);

  if (!position) return null;
  return (
    <div
      className="pointer-events-none absolute flex items-center justify-center transition-[left,top,width,height] duration-[250ms] ease-[cubic-bezier(0.34,1.56,0.64,1)]"
      style={{
        left: position.left,
        top: position.top,
        width: position.width,
        height: position.height,
      }}
    >
      <div
        className={`h-[90%] w-[70%] rounded-full transition-all duration-80 ${
          animating ? "scale-100 opacity-80 blur-[3px]" : "scale-50 opacity-0 blur-[6px]"
        }`}
        style={{
          background:
            "radial-gradient(circle at center, var(--foreground) 0%, color-mix(in oklab, var(--foreground) 40%, transparent) 30%, transparent 65%)",
        }}
      />
    </div>
  );
}
