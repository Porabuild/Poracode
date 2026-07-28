import {
  bucketDurationMs,
  type ProductAnalyticsEventName,
  type ProductAnalyticsProperties,
} from "@/shared/analytics/posthogPrivacy";

export const PRODUCT_VIEW_MIN_VISIBLE_MS = 1_000;

export interface TrackedProductView {
  key: string;
  seenEvent: ProductAnalyticsEventName;
  durationEvent: ProductAnalyticsEventName;
  properties: ProductAnalyticsProperties;
}

interface ProductViewTrackerDependencies {
  capture: (event: ProductAnalyticsEventName, properties: ProductAnalyticsProperties) => void;
  clearTimeout: (timer: ReturnType<typeof setTimeout>) => void;
  now: () => number;
  setTimeout: (callback: () => void, delayMs: number) => ReturnType<typeof setTimeout>;
}

export interface ProductViewTracker {
  finish: () => void;
  setView: (view: TrackedProductView) => void;
  setVisible: (visible: boolean) => void;
}

interface ActiveProductView {
  definition: TrackedProductView;
  seen: boolean;
  visibleDurationMs: number;
  visibleStartedAt: number | null;
}

/**
 * Tracks continuous viewability rather than navigation clicks. A view becomes
 * "seen" only after one uninterrupted visible second. Duration excludes time
 * while the Electron document is hidden or while an overlay obscures the view.
 */
export function createProductViewTracker(
  dependencies: ProductViewTrackerDependencies,
): ProductViewTracker {
  let active: ActiveProductView | null = null;
  let visible = false;
  let seenTimer: ReturnType<typeof setTimeout> | null = null;

  const clearSeenTimer = () => {
    if (seenTimer === null) return;
    dependencies.clearTimeout(seenTimer);
    seenTimer = null;
  };

  const addVisibleDuration = (now: number) => {
    if (!active || active.visibleStartedAt === null) return;
    active.visibleDurationMs += Math.max(0, now - active.visibleStartedAt);
    active.visibleStartedAt = null;
  };

  const armSeenTimer = () => {
    clearSeenTimer();
    if (!active || !visible || active.seen) return;
    const expectedKey = active.definition.key;
    seenTimer = dependencies.setTimeout(() => {
      seenTimer = null;
      if (!active || !visible || active.seen || active.definition.key !== expectedKey) return;
      active.seen = true;
      dependencies.capture(active.definition.seenEvent, active.definition.properties);
    }, PRODUCT_VIEW_MIN_VISIBLE_MS);
  };

  const finish = () => {
    clearSeenTimer();
    if (!active) return;
    addVisibleDuration(dependencies.now());
    if (active.seen) {
      dependencies.capture(active.definition.durationEvent, {
        ...active.definition.properties,
        duration_bucket: bucketDurationMs(active.visibleDurationMs),
        duration_ms: active.visibleDurationMs,
      });
    }
    active = null;
  };

  const setView = (view: TrackedProductView) => {
    if (active?.definition.key === view.key) return;
    finish();
    active = {
      definition: view,
      seen: false,
      visibleDurationMs: 0,
      visibleStartedAt: visible ? dependencies.now() : null,
    };
    armSeenTimer();
  };

  const setVisible = (nextVisible: boolean) => {
    if (nextVisible === visible) return;
    visible = nextVisible;
    if (!active) return;
    if (!visible) {
      clearSeenTimer();
      addVisibleDuration(dependencies.now());
      if (!active.seen) {
        // Require one continuous visible second before recording an impression.
        active.visibleDurationMs = 0;
      }
      return;
    }
    active.visibleStartedAt = dependencies.now();
    armSeenTimer();
  };

  return { finish, setView, setVisible };
}
