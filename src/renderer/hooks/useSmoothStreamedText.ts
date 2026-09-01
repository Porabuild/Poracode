import { useEffect, useRef, useState, useSyncExternalStore } from "react";

const INITIAL_CHARS_PER_SECOND = 60;
const MIN_CHARS_PER_SECOND = 25;
const MAX_CHARS_PER_SECOND = 2_500;
const DRAIN_WINDOW_SECONDS = 0.24;
const VELOCITY_LERP = 0.15;
const MAX_FRAME_SECONDS = 0.05;
const ARRIVAL_RATE_ALPHA = 0.35;
const IDLE_GRACE_MS = 200;

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
  const arrivalRateRef = useRef(INITIAL_CHARS_PER_SECOND);
  const lastChunkTimeRef = useRef(0);
  const idleSinceRef = useRef<number | null>(null);
  const frameRef = useRef<number | null>(null);
  const lastFrameRef = useRef(0);
  const tickRef = useRef<(now: number) => void>(() => undefined);

  tickRef.current = (now: number) => {
    frameRef.current = null;
    const previous = lastFrameRef.current;
    const elapsed = previous ? Math.min((now - previous) / 1_000, MAX_FRAME_SECONDS) : 0.016;
    lastFrameRef.current = now;

    const target = targetRef.current;
    if (shownRef.current > target.length) shownRef.current = target.length;
    const backlog = target.length - shownRef.current;

    if (backlog > 0) {
      idleSinceRef.current = null;
      // Combine estimated arrival cadence with proportional catch-up
      const catchUpVelocity = backlog / DRAIN_WINDOW_SECONDS;
      const targetVelocity = Math.min(
        MAX_CHARS_PER_SECOND,
        Math.max(arrivalRateRef.current, catchUpVelocity),
      );
      velocityRef.current += (targetVelocity - velocityRef.current) * VELOCITY_LERP;
      shownRef.current = Math.min(target.length, shownRef.current + velocityRef.current * elapsed);
      if (target.length - shownRef.current < 0.25) {
        shownRef.current = target.length;
      }
    } else {
      // Backlog is drained but stream may still be active: gently ease velocity
      if (idleSinceRef.current === null) {
        idleSinceRef.current = now;
      }
      velocityRef.current += (0 - velocityRef.current) * VELOCITY_LERP;
    }

    const nextCount = Math.floor(shownRef.current);
    if (nextCount !== emittedRef.current) {
      emittedRef.current = nextCount;
      setRevealed(nextCount >= target.length ? target : target.slice(0, nextCount));
    }

    if (target.length > shownRef.current) {
      frameRef.current = requestAnimationFrame((nextNow) => tickRef.current(nextNow));
    } else if (idleSinceRef.current !== null && now - idleSinceRef.current < IDLE_GRACE_MS) {
      // Keep tick loop warm for a short window so next chunk arrival doesn't stutter
      frameRef.current = requestAnimationFrame((nextNow) => tickRef.current(nextNow));
    } else {
      lastFrameRef.current = 0;
      idleSinceRef.current = null;
    }
  };

  useEffect(() => {
    const previousTarget = targetRef.current;
    const isAppendOnly = text.startsWith(previousTarget);
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();

    if (isAppendOnly && text.length > previousTarget.length) {
      const deltaChars = text.length - previousTarget.length;
      const lastChunkTime = lastChunkTimeRef.current;
      if (lastChunkTime > 0) {
        const deltaSeconds = (now - lastChunkTime) / 1_000;
        if (deltaSeconds > 0.005 && deltaSeconds < 2.0) {
          const instantRate = deltaChars / deltaSeconds;
          arrivalRateRef.current = Math.min(
            MAX_CHARS_PER_SECOND,
            Math.max(
              MIN_CHARS_PER_SECOND,
              arrivalRateRef.current * (1 - ARRIVAL_RATE_ALPHA) + instantRate * ARRIVAL_RATE_ALPHA,
            ),
          );
        }
      }
      lastChunkTimeRef.current = now;
    }

    targetRef.current = text;

    if (!animate || !isAppendOnly) {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
      shownRef.current = text.length;
      emittedRef.current = text.length;
      velocityRef.current = 0;
      arrivalRateRef.current = INITIAL_CHARS_PER_SECOND;
      lastChunkTimeRef.current = 0;
      idleSinceRef.current = null;
      lastFrameRef.current = 0;
      setRevealed(text);
      return;
    }

    if (text.length > shownRef.current && frameRef.current === null) {
      frameRef.current = requestAnimationFrame((frameNow) => tickRef.current(frameNow));
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
