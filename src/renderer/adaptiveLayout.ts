import { useSyncExternalStore } from "react";
import { markMobilePlatformOnRoot } from "./components/mobileComposer/mobilePlatform";
import { markTouchCapabilityOnRoot } from "./components/mobileComposer/pointerModality";
import { isStandaloneDisplay } from "./pwa/install";

const COMPACT_LAYOUT_QUERY = "(max-width: 767px)";
const COARSE_POINTER_QUERY = "(hover: none), (pointer: coarse)";
const ADAPTIVE_LAYOUT_STORE_KEY = "__poracodeAdaptiveLayoutStore";

type AdaptiveLayoutStore = {
  initialized: boolean;
  compact: boolean;
  coarse: boolean;
  matchMediaSource: typeof window.matchMedia | null;
  compactQuery: MediaQueryList | null;
  coarseQuery: MediaQueryList | null;
  subscribers: Set<() => void>;
  refresh: () => void;
  handleEnvironmentChange: () => void;
  cleanupObservers: (() => void) | null;
};

function mediaQuery(query: string): MediaQueryList | null {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia(query)
    : null;
}

function supportsCompactLayout(): boolean {
  return typeof window !== "undefined" && window.poracodeHost === undefined;
}

function readCompactLayoutFromEnvironment(): boolean {
  return supportsCompactLayout() && (mediaQuery(COMPACT_LAYOUT_QUERY)?.matches ?? false);
}

function readCoarseInputFromEnvironment(): boolean {
  return mediaQuery(COARSE_POINTER_QUERY)?.matches ?? false;
}

function createAdaptiveLayoutStore(): AdaptiveLayoutStore {
  const store: AdaptiveLayoutStore = {
    initialized: false,
    compact: readCompactLayoutFromEnvironment(),
    coarse: readCoarseInputFromEnvironment(),
    matchMediaSource: null,
    compactQuery: null,
    coarseQuery: null,
    subscribers: new Set(),
    refresh: refreshAdaptiveLayout,
    handleEnvironmentChange: () => {
      const current = Reflect.get(globalThis, ADAPTIVE_LAYOUT_STORE_KEY) as
        | AdaptiveLayoutStore
        | undefined;
      current?.refresh();
    },
    cleanupObservers: null,
  };
  return store;
}

function getAdaptiveLayoutStore(): AdaptiveLayoutStore {
  const existing = Reflect.get(globalThis, ADAPTIVE_LAYOUT_STORE_KEY) as
    | AdaptiveLayoutStore
    | undefined;
  if (existing) {
    // Vite keeps this global store alive across hot updates. Point its event
    // dispatcher at the newest module implementation before it fires again.
    existing.refresh = refreshAdaptiveLayout;
    return existing;
  }
  const store = createAdaptiveLayoutStore();
  Reflect.set(globalThis, ADAPTIVE_LAYOUT_STORE_KEY, store);
  return store;
}

function ensureAdaptiveLayoutObservers(): void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
  const store = getAdaptiveLayoutStore();
  if (store.matchMediaSource === window.matchMedia && store.cleanupObservers) return;

  store.cleanupObservers?.();
  const compact = window.matchMedia(COMPACT_LAYOUT_QUERY);
  const coarse = window.matchMedia(COARSE_POINTER_QUERY);
  const refresh = store.handleEnvironmentChange;
  const refreshWhenVisible = () => {
    if (document.visibilityState === "visible") refresh();
  };
  const visualViewport = window.visualViewport;
  compact.addEventListener("change", refresh);
  coarse.addEventListener("change", refresh);
  window.addEventListener("resize", refresh);
  window.addEventListener("orientationchange", refresh);
  window.addEventListener("pageshow", refresh);
  document.addEventListener("visibilitychange", refreshWhenVisible);
  visualViewport?.addEventListener("resize", refresh);

  store.matchMediaSource = window.matchMedia;
  store.compactQuery = compact;
  store.coarseQuery = coarse;
  store.cleanupObservers = () => {
    compact.removeEventListener("change", refresh);
    coarse.removeEventListener("change", refresh);
    window.removeEventListener("resize", refresh);
    window.removeEventListener("orientationchange", refresh);
    window.removeEventListener("pageshow", refresh);
    document.removeEventListener("visibilitychange", refreshWhenVisible);
    visualViewport?.removeEventListener("resize", refresh);
  };
}

function refreshAdaptiveLayout(): void {
  ensureAdaptiveLayoutObservers();
  const store = getAdaptiveLayoutStore();
  const compact = supportsCompactLayout() && (store.compactQuery?.matches ?? false);
  const coarse = store.coarseQuery?.matches ?? false;
  const compactChanged = compact !== store.compact;
  store.compact = compact;
  store.coarse = coarse;

  if (typeof document !== "undefined") {
    document.documentElement.toggleAttribute("data-compact-layout", compact);
    document.documentElement.toggleAttribute("data-coarse-input", coarse);
  }
  if (compactChanged) {
    for (const subscriber of store.subscribers) subscriber();
  }
}

export function isCompactLayoutViewport(): boolean {
  return getAdaptiveLayoutStore().compact;
}

function subscribeCompactLayout(listener: () => void): () => void {
  if (!supportsCompactLayout()) return () => {};
  const store = getAdaptiveLayoutStore();
  store.subscribers.add(listener);
  ensureAdaptiveLayoutObservers();
  refreshAdaptiveLayout();
  return () => store.subscribers.delete(listener);
}

export function useCompactLayout(): boolean {
  return useSyncExternalStore(subscribeCompactLayout, isCompactLayoutViewport, () => false);
}

export function initializeAdaptiveLayout(): void {
  if (typeof document === "undefined") return;
  const store = getAdaptiveLayoutStore();
  if (store.initialized) {
    refreshAdaptiveLayout();
    return;
  }
  store.initialized = true;
  markMobilePlatformOnRoot();
  markTouchCapabilityOnRoot();
  document.documentElement.toggleAttribute("data-mobile-standalone", isStandaloneDisplay());
  ensureAdaptiveLayoutObservers();
  refreshAdaptiveLayout();
}

export function resetAdaptiveLayoutForTest(): void {
  const store = Reflect.get(globalThis, ADAPTIVE_LAYOUT_STORE_KEY) as
    | AdaptiveLayoutStore
    | undefined;
  store?.cleanupObservers?.();
  store?.subscribers.clear();
  Reflect.deleteProperty(globalThis, ADAPTIVE_LAYOUT_STORE_KEY);
}
