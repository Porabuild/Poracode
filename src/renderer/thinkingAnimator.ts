// One clock batches text shimmer, brain firing and provider-icon shine. CSS
// steps() limits visible changes but still wakes Chromium at display refresh
// rate; direct writes to cached targets avoid that continuous animation work.
// Visible effects share 20fps (5fps when unfocused). Hidden pages and targets
// stop updating and resume at the current phase without replaying the sweep.

import { useContext, useEffect, useRef } from "react";
import type { RefObject } from "react";
import { PaneVisibility } from "./paneVisibility";

const FPS = 20;
const TICK_MS = Math.round(1000 / FPS); // 50ms
const BACKGROUND_FPS = 5;
const BACKGROUND_TICK_MS = Math.round(1000 / BACKGROUND_FPS); // 200ms
const SHIMMER_PERIOD_MS = 2200; // matches the previous 2.2s background-position sweep
const BRAIN_PERIOD_MS = 1800; // matches the previous 1.8s opacity pulse
const BRAIN_GROUP_DELAY_MS = 600; // matches the previous 0s / 0.6s / 1.2s stagger
const ICON_PERIOD_MS = 1600;

const shimmerEls = new Set<HTMLElement>();
const iconBands = new Set<HTMLElement>();
// Brains map to their path list, cached once at registration so the tick loop
// doesn't re-run querySelectorAll on every frame.
const brainPaths = new Map<SVGSVGElement, SVGPathElement[]>();
let timer: ReturnType<typeof setInterval> | null = null;
let timerInterval = 0;
let motionQuery: MediaQueryList | null = null;
let observer: IntersectionObserver | null = null;
const targets = new Map<Element, (visible: boolean) => void>();

function hasRegistered(): boolean {
  return shimmerEls.size > 0 || brainPaths.size > 0 || iconBands.size > 0;
}

function prefersReducedMotion(): boolean {
  return motionQuery?.matches ?? false;
}

// uiAnimationActivity.ts updates these attributes before our activity listeners.
function isAppBackgrounded(): boolean {
  if (typeof document === "undefined") return true;
  const root = document.documentElement;
  return root.hasAttribute("data-app-hidden") || root.hasAttribute("data-app-unfocused");
}

// Triangle 0→1→0 over the period, mapped to 0.45..1 (matches the old
// @keyframes poracode-brain-firing: 0%/100% = 0.45, 50% = 1).
function brainOpacity(phase01: number): number {
  const tri = 1 - Math.abs(1 - 2 * phase01);
  return 0.45 + 0.55 * tri;
}

function paintFrame(now: number): void {
  if (iconBands.size > 0) {
    const steps = isAppBackgrounded()
      ? ICON_PERIOD_MS / BACKGROUND_TICK_MS
      : ICON_PERIOD_MS / TICK_MS;
    const phase = Math.floor(((now % ICON_PERIOD_MS) / ICON_PERIOD_MS) * steps) / steps;
    const transform = `translate3d(${(-33.333 + 66.666 * phase).toFixed(4)}%, 0, 0)`;
    for (const el of iconBands) {
      if (el.style.transform !== transform) el.style.transform = transform;
    }
  }
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
  paintFrame(Date.now());
}

function ensureRunning(): void {
  const hidden = document.documentElement.hasAttribute("data-app-hidden");
  const nextInterval =
    hasRegistered() && !hidden && !prefersReducedMotion()
      ? isAppBackgrounded()
        ? BACKGROUND_TICK_MS
        : TICK_MS
      : 0;
  if (timer !== null && timerInterval === nextInterval) return;
  if (timer !== null) {
    clearInterval(timer);
    timer = null;
  }
  timerInterval = nextInterval;
  if (!hasRegistered() || hidden) return;
  paintFrame(prefersReducedMotion() ? 0 : Date.now());
  if (nextInterval > 0) timer = setInterval(tick, nextInterval);
}

function maybeStop(): void {
  if (timer !== null && !hasRegistered()) {
    clearInterval(timer);
    timer = null;
    timerInterval = 0;
  }
}

function listenForActivity(): void {
  document.addEventListener("visibilitychange", ensureRunning);
  window.addEventListener("focus", ensureRunning);
  window.addEventListener("blur", ensureRunning);
  motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  motionQuery.addEventListener("change", ensureRunning);
}

function stopListeningForActivity(): void {
  document.removeEventListener("visibilitychange", ensureRunning);
  window.removeEventListener("focus", ensureRunning);
  window.removeEventListener("blur", ensureRunning);
  motionQuery?.removeEventListener("change", ensureRunning);
  motionQuery = null;
  observer?.disconnect();
  observer = null;
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

function addIconBand(el: HTMLElement): void {
  iconBands.add(el);
}
function removeIconBand(el: HTMLElement): void {
  iconBands.delete(el);
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
  const visible = useContext(PaneVisibility);
  useEffect(() => {
    const el = ref.current;
    if (!active || !visible || !el) return;
    if (targets.size === 0) listenForActivity();
    let inViewport = true;
    targets.set(el, (nextVisible) => {
      if (inViewport === nextVisible) return;
      inViewport = nextVisible;
      if (nextVisible) {
        add(el);
        ensureRunning();
      } else {
        remove(el);
        maybeStop();
      }
    });
    if (typeof IntersectionObserver === "function") {
      observer ??= new IntersectionObserver((entries) => {
        for (const entry of entries) targets.get(entry.target)?.(entry.isIntersecting);
      });
      observer.observe(el);
    }
    add(el);
    ensureRunning();
    return () => {
      observer?.unobserve(el);
      targets.delete(el);
      remove(el);
      maybeStop();
      if (targets.size === 0) stopListeningForActivity();
    };
  }, [ref, active, visible, add, remove]);
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

export function useIconShine(active: boolean): RefObject<HTMLSpanElement | null> {
  const ref = useRef<HTMLSpanElement | null>(null);
  useAnimatedElement(ref, active, addIconBand, removeIconBand);
  return ref;
}
