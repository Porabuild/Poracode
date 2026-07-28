import { useEffect, useRef } from "react";
import { useFileEditorStore } from "@/renderer/state/fileEditorStore";
import { usePanelStore } from "@/renderer/state/panelStore";
import {
  captureProductEvent,
  configureProductAnalytics,
  flushProductAnalytics,
} from "./productAnalytics";
import {
  createProductViewTracker,
  type ProductViewTracker,
  type TrackedProductView,
} from "./productViewTracker";

export type ProductSurface = "app" | "overlay" | "panel" | "project_settings" | "settings";

export function productSurfaceView(
  surface: string,
  lane: "overlay" | "panel" | "window",
): TrackedProductView {
  return {
    key: `${lane}:${surface}`,
    seenEvent: "app.surface_seen",
    durationEvent: "app.surface_duration",
    properties: {
      surface,
      surface_lane: lane,
    },
  };
}

function isBlockedByOverlay(): boolean {
  const panels = usePanelStore.getState();
  return (
    panels.gitOverlayOpen ||
    panels.prReviewContext !== null ||
    (panels.browserOverlayOpen && panels.browserOverlayMaximized) ||
    useFileEditorStore.getState().overlayMode === "fullscreen"
  );
}

export function isProductSurfaceVisible(surface: ProductSurface): boolean {
  if (document.visibilityState === "hidden") return false;
  if (surface === "overlay") return true;
  if (isBlockedByOverlay()) return false;
  const panels = usePanelStore.getState();
  if (surface === "settings") {
    return panels.settingsOpen && panels.projectSettingsId === null;
  }
  if (surface === "project_settings") {
    return !panels.settingsOpen && panels.projectSettingsId !== null;
  }
  return !panels.settingsOpen && panels.projectSettingsId === null;
}

export function subscribeProductSurfaceVisibility(
  surface: ProductSurface,
  onChange: (visible: boolean) => void,
): () => void {
  const sync = () => onChange(isProductSurfaceVisible(surface));
  const disposePanels = usePanelStore.subscribe((state, previous) => {
    if (
      state.settingsOpen !== previous.settingsOpen ||
      state.projectSettingsId !== previous.projectSettingsId ||
      state.gitOverlayOpen !== previous.gitOverlayOpen ||
      state.prReviewContext !== previous.prReviewContext ||
      state.browserOverlayOpen !== previous.browserOverlayOpen ||
      state.browserOverlayMaximized !== previous.browserOverlayMaximized
    ) {
      sync();
    }
  });
  const disposeEditor = useFileEditorStore.subscribe((state, previous) => {
    if (state.overlayMode !== previous.overlayMode) sync();
  });
  document.addEventListener("visibilitychange", sync);
  sync();
  return () => {
    disposePanels();
    disposeEditor();
    document.removeEventListener("visibilitychange", sync);
  };
}

export function useProductViewTracking(
  view: TrackedProductView,
  surface: Exclude<ProductSurface, "app">,
  options: { active?: boolean; finishWhenInactive?: boolean } = {},
): void {
  const trackerRef = useRef<ProductViewTracker | null>(null);
  const active = options.active ?? true;
  const activeRef = useRef(active);
  activeRef.current = active;
  if (!trackerRef.current) {
    trackerRef.current = createProductViewTracker({
      capture: captureProductEvent,
      clearTimeout,
      now: Date.now,
      setTimeout,
    });
  }

  useEffect(() => {
    const tracker = trackerRef.current!;
    const unsubscribe = subscribeProductSurfaceVisibility(surface, (visible) => {
      tracker.setVisible(visible && activeRef.current);
    });
    return () => {
      unsubscribe();
      tracker.finish();
    };
  }, [surface]);

  useEffect(() => {
    const tracker = trackerRef.current!;
    if (!active) {
      if (options.finishWhenInactive) tracker.finish();
      else tracker.setVisible(false);
      return;
    }
    tracker.setView(view);
    tracker.setVisible(isProductSurfaceVisible(surface));
  }, [active, options.finishWhenInactive, surface, view]);
}

/**
 * Secondary Electron windows do not mount MainApp, so they need a small,
 * self-contained analytics lifecycle rather than the main store subscriptions.
 */
export function useStandaloneWindowViewTracking(surface: string, active = true): void {
  const trackerRef = useRef<ProductViewTracker | null>(null);
  if (!trackerRef.current) {
    trackerRef.current = createProductViewTracker({
      capture: captureProductEvent,
      clearTimeout,
      now: Date.now,
      setTimeout,
    });
  }

  useEffect(() => {
    if (!configureProductAnalytics()) return;
    const tracker = trackerRef.current!;
    const syncVisibility = () => {
      tracker.setVisible(active && document.visibilityState !== "hidden");
    };
    const finishAndFlush = () => {
      tracker.finish();
      void flushProductAnalytics();
    };

    if (active) tracker.setView(productSurfaceView(surface, "window"));
    syncVisibility();
    document.addEventListener("visibilitychange", syncVisibility);
    window.addEventListener("pagehide", finishAndFlush);
    return () => {
      document.removeEventListener("visibilitychange", syncVisibility);
      window.removeEventListener("pagehide", finishAndFlush);
      finishAndFlush();
    };
  }, [active, surface]);
}
