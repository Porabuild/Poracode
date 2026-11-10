import { useState } from "react";
import type { HighlightHistory } from "@/shared/changelogHighlights";
import { useNewsLineStore, type DiscoveryHistory } from "@/renderer/state/newsLineStore";

/** The item on screen, and its index for when that item leaves the rotation. */
export interface NewsCursor {
  id: string | null;
  index: number;
}

/**
 * One visit to the new-thread page: the seed and history snapshots that fix
 * the visit's choices, and how far the line got. Moving the draft to another
 * project or machine remounts the draft view within the same visit, so the
 * line keeps this outside the component and resumes from it instead of
 * re-rolling the rotation and replaying its entrance.
 */
export interface NewsVisit {
  readonly seed: number;
  readonly startedAt: number;
  readonly highlightHistory: HighlightHistory;
  readonly discoveryHistory: DiscoveryHistory;
  /** The item last on screen. */
  onScreen: NewsCursor;
  paused: boolean;
  /** Items whose showing already counted this visit. */
  readonly counted: Set<string>;
}

// Only the full-page draft shows the line and `draftVisit` only grows, so one
// remembered visit is enough. It outlives the line on purpose: the remounted
// draft view may show its line only after agents load or the host connects.
let remembered: { key: number; visit: NewsVisit } | null = null;

function startVisit(): NewsVisit {
  const { highlightHistory, discoveryHistory } = useNewsLineStore.getState();
  return {
    seed: Math.floor(Math.random() * 2 ** 32),
    startedAt: Date.now(),
    highlightHistory,
    discoveryHistory,
    onScreen: { id: null, index: 0 },
    paused: false,
    counted: new Set(),
  };
}

function visitFor(key: number | undefined): NewsVisit {
  if (key === undefined) return startVisit();
  if (remembered?.key !== key) remembered = { key, visit: startVisit() };
  return remembered.visit;
}

/**
 * The visit a line belongs to, fixed for the life of the mount. Mounts with
 * the same key share it; a new key starts a new visit, and no key gives the
 * mount its own.
 */
export function useNewsVisit(key: number | undefined): NewsVisit {
  const [visit] = useState(() => visitFor(key));
  return visit;
}

/**
 * Records the item on screen; false when it already was, as after a remount,
 * so it needs no entrance.
 */
export function recordOnScreen(visit: NewsVisit, id: string, index: number): boolean {
  const entering = visit.onScreen.id !== id;
  visit.onScreen = { id, index };
  return entering;
}

/** True only the first time the visit shows an item, so each showing counts once. */
export function countShowing(visit: NewsVisit, id: string): boolean {
  if (visit.counted.has(id)) return false;
  visit.counted.add(id);
  return true;
}

export function rememberPaused(visit: NewsVisit, paused: boolean): void {
  visit.paused = paused;
}

/** Test seam: forget the remembered visit. */
export function resetNewsVisit(): void {
  remembered = null;
}
