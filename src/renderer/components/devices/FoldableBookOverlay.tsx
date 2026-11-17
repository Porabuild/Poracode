import { useEffect, useRef, useState, type RefObject } from "react";

type ScreenOrientation =
  | "portrait"
  | "landscape_left"
  | "portrait_upside_down"
  | "landscape_right"
  | undefined;

/**
 * Smoothly tweens hinge angle changes for button clicks and agent folds while
 * letting direct slider drags track at 60fps without lag.
 */
export function useAnimatedHingeAngle(
  targetAngle: number | undefined,
  dragging: boolean,
): number | undefined {
  const [visualAngle, setVisualAngle] = useState<number | undefined>(targetAngle);
  const [prevTarget, setPrevTarget] = useState<number | undefined>(targetAngle);
  const [tweenFrom, setTweenFrom] = useState<number | undefined>(undefined);

  if (prevTarget !== targetAngle) {
    setPrevTarget(targetAngle);
    const reducedMotion =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (dragging || targetAngle === undefined || visualAngle === undefined || reducedMotion) {
      setVisualAngle(targetAngle);
      setTweenFrom(undefined);
    } else {
      setTweenFrom(visualAngle);
    }
  }

  useEffect(() => {
    if (
      dragging ||
      targetAngle === undefined ||
      tweenFrom === undefined ||
      tweenFrom === targetAngle
    )
      return;

    const from = tweenFrom;
    const to = targetAngle;
    const start = performance.now();
    const duration = 420;
    let frame = 0;

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      // Cubic ease-out for natural physical hinge settle.
      const eased = 1 - (1 - t) ** 3;
      setVisualAngle(from + (to - from) * eased);
      if (t < 1) frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [targetAngle, dragging, tweenFrom]);

  return dragging ? targetAngle : visualAngle;
}

function drawOrientedHalf(
  target: HTMLCanvasElement,
  source: HTMLCanvasElement | HTMLImageElement,
  srcW: number,
  srcH: number,
  orientation: ScreenOrientation,
  side: "left" | "right",
) {
  const rawIsLandscape = srcW > srcH;
  const deg =
    orientation === "portrait_upside_down"
      ? 180
      : !rawIsLandscape && orientation === "landscape_left"
        ? 90
        : !rawIsLandscape && orientation === "landscape_right"
          ? -90
          : 0;
  const swapped = Math.abs(deg) === 90;
  const visW = swapped ? srcH : srcW;
  const visH = swapped ? srcW : srcH;
  const leftW = Math.floor(visW / 2);
  const halfW = side === "left" ? leftW : visW - leftW;
  if (halfW <= 0 || visH <= 0) return;
  if (target.width !== halfW || target.height !== visH) {
    target.width = halfW;
    target.height = visH;
  }
  const ctx = target.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, halfW, visH);
  ctx.save();
  if (side === "right") ctx.translate(-leftW, 0);
  if (deg === 90) {
    ctx.translate(visW, 0);
    ctx.rotate(Math.PI / 2);
  } else if (deg === 180) {
    ctx.translate(visW, visH);
    ctx.rotate(Math.PI);
  } else if (deg === -90) {
    ctx.translate(0, visH);
    ctx.rotate(-Math.PI / 2);
  }
  ctx.drawImage(source, 0, 0, srcW, srcH);
  ctx.restore();
}

/**
 * Renders the live stream bent into two 3D-hinged display halves when the
 * foldable is partially open (1°..179°) or animating between Closed and Open.
 */
export function FoldableBookOverlay({
  sourceContainerRef,
  angle,
  orientation,
}: {
  sourceContainerRef: RefObject<HTMLDivElement | null>;
  angle: number;
  orientation?: ScreenOrientation;
}) {
  const leftRef = useRef<HTMLCanvasElement>(null);
  const rightRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let frame = 0;
    const sync = () => {
      const source = sourceContainerRef.current?.querySelector<
        HTMLCanvasElement | HTMLImageElement
      >("canvas, img");
      if (source) {
        const srcW = source instanceof HTMLCanvasElement ? source.width : source.naturalWidth;
        const srcH = source instanceof HTMLCanvasElement ? source.height : source.naturalHeight;
        if (srcW > 0 && srcH > 0) {
          if (leftRef.current)
            drawOrientedHalf(leftRef.current, source, srcW, srcH, orientation, "left");
          if (rightRef.current)
            drawOrientedHalf(rightRef.current, source, srcW, srcH, orientation, "right");
        }
      }
      frame = requestAnimationFrame(sync);
    };
    frame = requestAnimationFrame(sync);
    return () => cancelAnimationFrame(frame);
  }, [sourceContainerRef, orientation]);

  // 180° = flat (0deg); 90° = ~26deg open; 10° = ~50deg sharply folded book.
  const clamped = Math.max(0, Math.min(180, angle));
  const leafDeg = ((180 - clamped) / 180) * 52;
  const creaseStrength = Math.sin((clamped / 180) * Math.PI);

  return (
    <div
      aria-hidden="true"
      data-testid="device-fold-book"
      data-fold-angle={Math.round(clamped)}
      className="pointer-events-none absolute inset-0 flex items-stretch justify-center overflow-visible"
      style={{ perspective: "950px", transformStyle: "preserve-3d" }}
    >
      <div
        className="relative h-full w-1/2 overflow-hidden rounded-l-[16px] border-y-2 border-l-2 border-white/20 bg-black shadow-md"
        style={{
          transformOrigin: "right center",
          transform: `rotateY(${leafDeg.toFixed(2)}deg)`,
        }}
      >
        <canvas ref={leftRef} className="h-full w-full object-fill" />
        <div
          className="absolute inset-y-0 right-0 w-7"
          style={{
            background: `linear-gradient(90deg, transparent, rgba(0, 0, 0, ${(0.34 * creaseStrength).toFixed(3)}))`,
          }}
        />
      </div>
      <div
        className="relative h-full w-1/2 overflow-hidden rounded-r-[16px] border-y-2 border-r-2 border-white/20 bg-black shadow-md"
        style={{
          transformOrigin: "left center",
          transform: `rotateY(${(-leafDeg).toFixed(2)}deg)`,
        }}
      >
        <canvas ref={rightRef} className="h-full w-full object-fill" />
        <div
          className="absolute inset-y-0 left-0 w-7"
          style={{
            background: `linear-gradient(270deg, transparent, rgba(0, 0, 0, ${(0.4 * creaseStrength).toFixed(3)}))`,
          }}
        />
      </div>
    </div>
  );
}
