import { useEffect, useRef, useState, useSyncExternalStore } from "react";

const DRAIN_WINDOW_SECONDS = 0.16;
const MAX_CHARS_PER_SECOND = 2_000;
const VELOCITY_LERP = 0.15;
const MAX_FRAME_SECONDS = 0.05;
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
let reducedMotionMedia: MediaQueryList | null = null;
let reducedMotionSubscribers = 0;

function getReducedMotionMedia(): MediaQueryList | null {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return null;
  reducedMotionMedia ??= window.matchMedia(REDUCED_MOTION_QUERY);
  return reducedMotionMedia;
}

function subscribeToReducedMotion(onChange: () => void): () => void {
  const media = getReducedMotionMedia();
  if (!media) return () => {};
  reducedMotionSubscribers += 1;
  media.addEventListener("change", onChange);
  return () => {
    media.removeEventListener("change", onChange);
    reducedMotionSubscribers -= 1;
    if (reducedMotionSubscribers === 0) reducedMotionMedia = null;
  };
}

function getReducedMotionSnapshot(): boolean {
  return getReducedMotionMedia()?.matches ?? false;
}

const subscribeToNothing = () => () => {};
const getFalseSnapshot = () => false;

export function useSmoothStreamedText(text: string, isStreaming: boolean): string {
  const reduceMotion = useSyncExternalStore(
    isStreaming ? subscribeToReducedMotion : subscribeToNothing,
    isStreaming ? getReducedMotionSnapshot : getFalseSnapshot,
    getFalseSnapshot,
  );
  const animate = isStreaming && !reduceMotion;
  const [revealed, setRevealed] = useState(text);
  const targetRef = useRef(text);
  const shownRef = useRef(text.length);
  const emittedRef = useRef(text.length);
  const velocityRef = useRef(0);
  const frameRef = useRef<number | null>(null);
  const lastFrameRef = useRef(0);
  const tickRef = useRef<(now: number) => void>(() => undefined);

  tickRef.current = (now: number) => {
    frameRef.current = null;
    const previous = lastFrameRef.current;
    const elapsed = previous ? Math.min((now - previous) / 1_000, MAX_FRAME_SECONDS) : 0;
    lastFrameRef.current = now;

    const target = targetRef.current;
    if (shownRef.current > target.length) shownRef.current = target.length;
    const backlog = target.length - shownRef.current;
    const targetVelocity = Math.min(MAX_CHARS_PER_SECOND, backlog / DRAIN_WINDOW_SECONDS);
    velocityRef.current += (targetVelocity - velocityRef.current) * VELOCITY_LERP;
    shownRef.current = Math.min(target.length, shownRef.current + velocityRef.current * elapsed);
    if (target.length - shownRef.current < 1) shownRef.current = target.length;

    const nextCount = Math.floor(shownRef.current);
    if (nextCount !== emittedRef.current) {
      emittedRef.current = nextCount;
      setRevealed(nextCount >= target.length ? target : target.slice(0, nextCount));
    }

    if (target.length > shownRef.current) {
      frameRef.current = requestAnimationFrame((nextNow) => tickRef.current(nextNow));
    } else {
      velocityRef.current = 0;
      lastFrameRef.current = 0;
    }
  };

  useEffect(() => {
    const previousTarget = targetRef.current;
    const isAppendOnly = text.startsWith(previousTarget);
    targetRef.current = text;

    if (!animate || !isAppendOnly) {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
      shownRef.current = text.length;
      emittedRef.current = text.length;
      velocityRef.current = 0;
      lastFrameRef.current = 0;
      setRevealed(text);
      return;
    }

    if (text.length > shownRef.current && frameRef.current === null) {
      frameRef.current = requestAnimationFrame((now) => tickRef.current(now));
    }
  }, [animate, text]);

  useEffect(
    () => () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    },
    [],
  );

  return animate ? revealed : text;
}
