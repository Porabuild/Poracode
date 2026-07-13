// Shared 20fps driver for the "thinking" UI animations — the
// `.poracode-thinking-text` shimmer ("Working for"/"Thinking"/"Compacting"/
// "Proposed plan") and the `.poracode-brain-thinking` firing.
//
// Why this exists instead of CSS animations:
// Both effects animate properties that CANNOT run on the compositor —
// `background-position` (the shimmer) and per-path `opacity` on an SVG (the
// brain). A continuously-active CSS animation on such a property forces Blink to
// re-run style recalc + the entire frame pipeline EVERY display refresh (~120fps
// on ProMotion) for as long as the animation is active, even though the value
// only needs to change ~15×/s. Traces showed UpdateLayoutTree ≡
// serviceScriptedAnimations ≡ ~124/s during streaming — a main-thread frame
// every refresh — purely from these two animations. `steps()` throttles the
// paint but NOT that per-frame recalc loop, because the animation is still
// "active" every frame.
//
// Driving the exact same values from a single `setInterval` at 20fps means the
// element is only dirtied ~20×/s; between ticks nothing is invalidated, so the
// renderer's frame pipeline goes idle. The visuals are identical (same gradient
// sweep, same staggered brain firing), and a shared wall-clock phase keeps every
// instance perfectly in sync. The timer pauses while the window is hidden or
// unfocused (delegating that policy to uiAnimationActivity.ts), and honours
// `prefers-reduced-motion` by painting one static frame.

import { useEffect, useRef } from "react";
import type { RefObject } from "react";

const FPS = 20;
const TICK_MS = Math.round(1000 / FPS); // 50ms
const SHIMMER_PERIOD_MS = 2200; // matches the previous 2.2s background-position sweep
const BRAIN_PERIOD_MS = 1800; // matches the previous 1.8s opacity pulse
const BRAIN_GROUP_DELAY_MS = 600; // matches the previous 0s / 0.6s / 1.2s stagger

const shimmerEls = new Set<HTMLElement>();
// Brains map to their path list, cached once at registration so the tick loop
// doesn't re-run querySelectorAll on every frame.
const brainPaths = new Map<SVGSVGElement, SVGPathElement[]>();
let timer: ReturnType<typeof setInterval> | null = null;

function hasRegistered(): boolean {
  return shimmerEls.size > 0 || brainPaths.size > 0;
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

// Single source of truth for "should UI animations run": uiAnimationActivity.ts
// toggles these attributes on visibilitychange/focus/blur, and styles.css uses
// the same attributes to pause the compositor-driven icon animations. Reading
// them here keeps the JS-driven thinking animations gated by the exact same
// policy — change "when to pause" in one place and both follow.
function isAppActive(): boolean {
  if (typeof document === "undefined") return false;
  const root = document.documentElement;
  return !root.hasAttribute("data-app-hidden") && !root.hasAttribute("data-app-unfocused");
}

// Triangle 0→1→0 over the period, mapped to 0.45..1 (matches the old
// @keyframes poracode-brain-firing: 0%/100% = 0.45, 50% = 1).
function brainOpacity(phase01: number): number {
  const tri = 1 - Math.abs(1 - 2 * phase01);
  return 0.45 + 0.55 * tri;
}

function paintFrame(now: number): void {
  if (shimmerEls.size > 0) {
    // background-position-x sweeps 0% → -200% (with 200% size + repeat-x this loops seamlessly).
    const phase = (now % SHIMMER_PERIOD_MS) / SHIMMER_PERIOD_MS;
    const x = `${(-200 * phase).toFixed(1)}%`;
    for (const el of shimmerEls) el.style.backgroundPositionX = x;
  }
  for (const paths of brainPaths.values()) {
    for (let i = 0; i < paths.length; i++) {
      const delay = (i % 3) * BRAIN_GROUP_DELAY_MS;
      const t = (((now - delay) % BRAIN_PERIOD_MS) + BRAIN_PERIOD_MS) % BRAIN_PERIOD_MS;
      paths[i]!.style.opacity = brainOpacity(t / BRAIN_PERIOD_MS).toFixed(3);
    }
  }
}

function tick(): void {
  // Freeze (skip writes) while backgrounded/unfocused — nothing to drive, and
  // the static frozen frame is fine. Next tick resumes within ~50ms on refocus.
  if (!isAppActive()) return;
  paintFrame(Date.now());
}

function ensureRunning(): void {
  if (timer !== null) return;
  if (prefersReducedMotion()) {
    paintFrame(0); // one static frame; no loop
    return;
  }
  if (typeof setInterval !== "function") return;
  paintFrame(Date.now());
  timer = setInterval(tick, TICK_MS);
}

function maybeStop(): void {
  if (timer !== null && !hasRegistered()) {
    clearInterval(timer);
    timer = null;
  }
}

function addShimmer(el: HTMLElement): void {
  shimmerEls.add(el);
}
function removeShimmer(el: HTMLElement): void {
  shimmerEls.delete(el);
}
function addBrain(el: SVGSVGElement): void {
  brainPaths.set(el, Array.from(el.querySelectorAll<SVGPathElement>("path")));
}
function removeBrain(el: SVGSVGElement): void {
  brainPaths.delete(el);
}

// Shared registration effect for every animated element: while `active`, add the
// element to its registry and keep the shared timer running; clean up on unmount
// or when it goes inactive.
function useAnimatedElement<T extends Element>(
  ref: RefObject<T | null>,
  active: boolean,
  add: (el: T) => void,
  remove: (el: T) => void,
): void {
  useEffect(() => {
    const el = ref.current;
    if (!active || !el) return;
    add(el);
    ensureRunning();
    return () => {
      remove(el);
      maybeStop();
    };
  }, [ref, active, add, remove]);
}

/**
 * Register a `.poracode-thinking-text` element to receive the shimmer sweep
 * while `active`. Attach the returned ref to the element. No-op when inactive,
 * so the timer only runs while a label is actually shimmering.
 */
export function useShimmer<T extends HTMLElement = HTMLSpanElement>(
  active: boolean,
): RefObject<T | null> {
  const ref = useRef<T | null>(null);
  useAnimatedElement<T>(ref, active, addShimmer, removeShimmer);
  return ref;
}

/** Same as {@link useShimmer} but drives an element you already hold a ref to. */
export function useShimmerRef<T extends HTMLElement>(
  ref: RefObject<T | null>,
  active: boolean,
): void {
  useAnimatedElement<T>(ref, active, addShimmer, removeShimmer);
}

/**
 * Register a `.poracode-brain-thinking` SVG to receive the staggered per-path
 * opacity firing while `active`. Attach the returned ref to the icon. Gating on
 * `active` (not just mount) matters because a Reasoning block can transition
 * streaming→completed without unmounting — the firing must stop with it.
 */
export function useBrainThinking(active: boolean): RefObject<SVGSVGElement | null> {
  const ref = useRef<SVGSVGElement | null>(null);
  useAnimatedElement<SVGSVGElement>(ref, active, addBrain, removeBrain);
  return ref;
}
