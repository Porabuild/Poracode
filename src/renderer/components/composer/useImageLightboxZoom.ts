import {
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";

export const MIN_SCALE = 1;
export const MAX_SCALE = 4;
export const SCALE_STEP = 0.5;

const DOUBLE_CLICK_SCALE = 2;
const WHEEL_LINE_HEIGHT_PX = 16;
const WHEEL_ZOOM_RATE = 0.002;
const CLICK_SUPPRESS_DISTANCE = 4;

type Point = { x: number; y: number };

interface ZoomState {
  scale: number;
  pan: Point;
  animate: boolean;
}

interface PointerEntry {
  pointerId: number;
  x: number;
  y: number;
  startX: number;
  startY: number;
  imageKey: string;
  resetRevision: number;
  captureTarget: HTMLElement;
}

interface NativeGestureEvent extends Event {
  readonly scale?: number;
  readonly clientX?: number;
  readonly clientY?: number;
}

interface NativeGestureState {
  /** Cumulative WebKit gesture scale; each change applies the ratio from this. */
  scale: number;
}

function clampScale(value: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, value));
}

function clampPan(
  point: Point,
  scale: number,
  stage: HTMLDivElement | null,
  image: HTMLImageElement | null,
): Point {
  if (!stage || !image || scale <= MIN_SCALE) return { x: 0, y: 0 };
  const maxX = Math.max(0, (image.clientWidth * scale - stage.clientWidth) / 2);
  const maxY = Math.max(0, (image.clientHeight * scale - stage.clientHeight) / 2);
  return {
    x: Math.min(maxX, Math.max(-maxX, point.x)),
    y: Math.min(maxY, Math.max(-maxY, point.y)),
  };
}

/** Pointer position relative to the stage's center. */
function stageAnchor(stage: HTMLDivElement | null, clientX: number, clientY: number): Point {
  if (!stage) return { x: 0, y: 0 };
  const rect = stage.getBoundingClientRect();
  return {
    x: clientX - (rect.left + rect.width / 2),
    y: clientY - (rect.top + rect.height / 2),
  };
}

function zoomedState(
  previous: ZoomState,
  requestedScale: number,
  oldAnchor: Point,
  newAnchor: Point,
  animate: boolean,
  stage: HTMLDivElement | null,
  image: HTMLImageElement | null,
): ZoomState {
  const scale = clampScale(requestedScale);
  const ratio = scale / previous.scale;
  const pan = {
    x: newAnchor.x - (oldAnchor.x - previous.pan.x) * ratio,
    y: newAnchor.y - (oldAnchor.y - previous.pan.y) * ratio,
  };
  return { scale, pan: clampPan(pan, scale, stage, image), animate };
}

function midpoint(first: PointerEntry, second: PointerEntry): Point {
  return { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
}

function distance(first: PointerEntry, second: PointerEntry): number {
  return Math.hypot(second.x - first.x, second.y - first.y);
}

function readGestureScale(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

/**
 * Zoom, pan, and continuous gesture state for the shared image lightbox.
 *
 * Continuous wheel, touch, and WebKit gesture input share one functional zoom
 * updater so React batching cannot drop increments. Toolbar and double-click
 * zoom use the same clamped math but keep the CSS transition.
 */
export function useImageLightboxZoom(currentImageKey: string | undefined) {
  const [zoom, setZoom] = useState<ZoomState>({
    scale: MIN_SCALE,
    pan: { x: 0, y: 0 },
    animate: true,
  });
  const [resetRevision, setResetRevision] = useState(0);
  const stageRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const pointersRef = useRef(new Map<number, PointerEntry>());
  const nativeGestureRef = useRef<NativeGestureState | null>(null);
  const suppressClickRef = useRef(false);

  useEffect(() => {
    function handleResize() {
      setZoom((previous) => ({
        ...previous,
        pan: clampPan(previous.pan, previous.scale, stageRef.current, imageRef.current),
      }));
    }
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    if (currentImageKey === undefined) return;
    const stage = stageRef.current;
    if (!stage) return;

    function zoomAtFactor(factor: number, anchor: Point) {
      if (!Number.isFinite(factor) || factor <= 0 || factor === 1) return;
      setZoom((previous) =>
        zoomedState(
          previous,
          previous.scale * factor,
          anchor,
          anchor,
          false,
          stageRef.current,
          imageRef.current,
        ),
      );
    }

    function onWheel(event: WheelEvent) {
      if (!event.ctrlKey) return;
      event.preventDefault();
      event.stopPropagation();
      // A WebKit gesture already owns this pinch; the synthesized ctrl-wheel
      // must not apply the same scale a second time.
      if (nativeGestureRef.current) return;
      const stageHeight = stageRef.current?.clientHeight ?? 0;
      const deltaPixels =
        event.deltaMode === WheelEvent.DOM_DELTA_LINE
          ? event.deltaY * WHEEL_LINE_HEIGHT_PX
          : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
            ? event.deltaY * stageHeight
            : event.deltaY;
      if (!Number.isFinite(deltaPixels) || deltaPixels === 0) return;
      zoomAtFactor(
        Math.exp(-deltaPixels * WHEEL_ZOOM_RATE),
        stageAnchor(stage, event.clientX, event.clientY),
      );
    }

    function onGestureStart(rawEvent: Event) {
      const event = rawEvent as NativeGestureEvent;
      event.preventDefault();
      event.stopPropagation();
      suppressClickRef.current = true;
      nativeGestureRef.current = {
        scale: readGestureScale(event.scale) ?? 1,
      };
    }

    function onGestureChange(rawEvent: Event) {
      const event = rawEvent as NativeGestureEvent;
      event.preventDefault();
      event.stopPropagation();
      const nextScale = readGestureScale(event.scale);
      if (nextScale === null) return;
      const gesture = nativeGestureRef.current;
      if (!gesture) return;
      const previousScale = gesture.scale;
      gesture.scale = nextScale;
      // Touch pointers already own this pinch.
      if (pointersRef.current.size >= 2) return;
      const clientX = event.clientX;
      const clientY = event.clientY;
      const anchor =
        typeof clientX === "number" &&
        Number.isFinite(clientX) &&
        typeof clientY === "number" &&
        Number.isFinite(clientY)
          ? stageAnchor(stage, clientX, clientY)
          : { x: 0, y: 0 };
      zoomAtFactor(nextScale / previousScale, anchor);
    }

    function onGestureEnd(rawEvent: Event) {
      rawEvent.preventDefault();
      rawEvent.stopPropagation();
      nativeGestureRef.current = null;
    }

    stage.addEventListener("wheel", onWheel, { passive: false });
    stage.addEventListener("gesturestart", onGestureStart, { passive: false });
    stage.addEventListener("gesturechange", onGestureChange, { passive: false });
    stage.addEventListener("gestureend", onGestureEnd, { passive: false });
    return () => {
      stage.removeEventListener("wheel", onWheel);
      stage.removeEventListener("gesturestart", onGestureStart);
      stage.removeEventListener("gesturechange", onGestureChange);
      stage.removeEventListener("gestureend", onGestureEnd);
    };
  }, [currentImageKey]);

  // A key+revision generation owns only the pointers started in that generation.
  useEffect(() => {
    if (currentImageKey === undefined) return;
    const pointers = pointersRef.current;
    const imageKeyForEffect = currentImageKey;
    const revisionForEffect = resetRevision;
    nativeGestureRef.current = null;
    suppressClickRef.current = false;
    return () => {
      const owned = [...pointers.values()].filter(
        (entry) =>
          entry.imageKey === imageKeyForEffect && entry.resetRevision === revisionForEffect,
      );
      for (const entry of owned) pointers.delete(entry.pointerId);
      for (const entry of owned) {
        if (entry.captureTarget.hasPointerCapture(entry.pointerId)) {
          entry.captureTarget.releasePointerCapture(entry.pointerId);
        }
      }
    };
  }, [currentImageKey, resetRevision]);

  function zoomBy(delta: number) {
    setZoom((previous) => {
      const scale = clampScale(previous.scale + delta);
      return {
        scale,
        pan: clampPan(previous.pan, scale, stageRef.current, imageRef.current),
        animate: true,
      };
    });
  }

  function resetZoom() {
    setResetRevision((revision) => revision + 1);
    setZoom({ scale: MIN_SCALE, pan: { x: 0, y: 0 }, animate: true });
  }

  function onDoubleClick(event: ReactMouseEvent<HTMLImageElement>) {
    event.preventDefault();
    event.stopPropagation();
    const anchor = stageAnchor(stageRef.current, event.clientX, event.clientY);
    setZoom((previous) => {
      if (previous.scale > MIN_SCALE) {
        return { scale: MIN_SCALE, pan: { x: 0, y: 0 }, animate: true };
      }
      return zoomedState(
        previous,
        DOUBLE_CLICK_SCALE,
        anchor,
        anchor,
        true,
        stageRef.current,
        imageRef.current,
      );
    });
  }

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (pointersRef.current.size === 0) suppressClickRef.current = false;
    const image = imageRef.current;
    if (!image) return;
    const isTouch = event.pointerType === "touch";
    if (!isTouch && (event.button !== 0 || zoom.scale <= MIN_SCALE)) return;
    const captureTarget = event.target === image ? image : event.currentTarget;
    captureTarget.setPointerCapture(event.pointerId);
    pointersRef.current.set(event.pointerId, {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      startX: event.clientX,
      startY: event.clientY,
      imageKey: currentImageKey ?? "",
      resetRevision,
      captureTarget,
    });
    if (pointersRef.current.size >= 2) suppressClickRef.current = true;
    setZoom((previous) => (previous.animate ? { ...previous, animate: false } : previous));
    if (!isTouch) event.preventDefault();
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const entry = pointersRef.current.get(event.pointerId);
    if (
      !entry ||
      entry.imageKey !== (currentImageKey ?? "") ||
      entry.resetRevision !== resetRevision
    ) {
      return;
    }
    const before = [...pointersRef.current.values()].slice(0, 2);
    const previousX = entry.x;
    const previousY = entry.y;
    const updated = { ...entry, x: event.clientX, y: event.clientY };
    pointersRef.current.set(event.pointerId, updated);
    const after = [...pointersRef.current.values()].slice(0, 2);
    const moved = event.clientX !== previousX || event.clientY !== previousY;
    if (
      moved &&
      (pointersRef.current.size >= 2 ||
        Math.hypot(event.clientX - entry.startX, event.clientY - entry.startY) >=
          CLICK_SUPPRESS_DISTANCE)
    ) {
      suppressClickRef.current = true;
    }
    if (after.length >= 2) {
      if (!moved) return;
      const beforeFirst = before[0];
      const beforeSecond = before[1];
      const afterFirst = after[0];
      const afterSecond = after[1];
      if (!beforeFirst || !beforeSecond || !afterFirst || !afterSecond) return;
      const oldDistance = distance(beforeFirst, beforeSecond);
      const newDistance = distance(afterFirst, afterSecond);
      if (oldDistance <= 0 || newDistance <= 0) return;
      const oldMidpoint = midpoint(beforeFirst, beforeSecond);
      const newMidpoint = midpoint(afterFirst, afterSecond);
      const oldAnchor = stageAnchor(stageRef.current, oldMidpoint.x, oldMidpoint.y);
      const newAnchor = stageAnchor(stageRef.current, newMidpoint.x, newMidpoint.y);
      setZoom((previous) =>
        zoomedState(
          previous,
          previous.scale * (newDistance / oldDistance),
          oldAnchor,
          newAnchor,
          false,
          stageRef.current,
          imageRef.current,
        ),
      );
      return;
    }
    if (!moved) return;
    const deltaX = event.clientX - previousX;
    const deltaY = event.clientY - previousY;
    setZoom((previous) => ({
      ...previous,
      pan: clampPan(
        { x: previous.pan.x + deltaX, y: previous.pan.y + deltaY },
        previous.scale,
        stageRef.current,
        imageRef.current,
      ),
      animate: false,
    }));
  }

  function endPointer(event: ReactPointerEvent<HTMLDivElement>) {
    const entry = pointersRef.current.get(event.pointerId);
    if (!entry) return;
    pointersRef.current.delete(event.pointerId);
    if (entry.captureTarget.hasPointerCapture(event.pointerId)) {
      entry.captureTarget.releasePointerCapture(event.pointerId);
    }
  }

  function onClickCapture(event: ReactMouseEvent<HTMLDivElement>) {
    if (!suppressClickRef.current) return;
    event.preventDefault();
    event.stopPropagation();
  }

  return {
    scale: zoom.scale,
    pan: zoom.pan,
    animate: zoom.animate,
    stageRef,
    imageRef,
    zoomBy,
    resetZoom,
    onDoubleClick,
    onPointerDown,
    onPointerMove,
    onPointerUp: endPointer,
    onPointerCancel: endPointer,
    onLostPointerCapture: endPointer,
    onClickCapture,
  };
}
