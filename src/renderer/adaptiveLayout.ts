import { useSyncExternalStore } from "react";
import { markMobilePlatformOnRoot } from "./components/mobileComposer/mobilePlatform";
import { markTouchCapabilityOnRoot } from "./components/mobileComposer/pointerModality";
import { isNativeApp, isStandaloneDisplay } from "./pwa/install";

const COMPACT_LAYOUT_QUERY = "(max-width: 767px)";
const COARSE_POINTER_QUERY = "(hover: none), (pointer: coarse)";

let initialized = false;

function mediaQuery(query: string): MediaQueryList | null {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia(query)
    : null;
}

function supportsCompactLayout(): boolean {
  return typeof window !== "undefined" && window.poracodeHost === undefined;
}

export function isCompactLayoutViewport(): boolean {
  return supportsCompactLayout() && (mediaQuery(COMPACT_LAYOUT_QUERY)?.matches ?? false);
}

function subscribeCompactLayout(listener: () => void): () => void {
  if (!supportsCompactLayout()) return () => {};
  const query = mediaQuery(COMPACT_LAYOUT_QUERY);
  if (!query) return () => {};
  query.addEventListener("change", listener);
  return () => query.removeEventListener("change", listener);
}

export function useCompactLayout(): boolean {
  return useSyncExternalStore(subscribeCompactLayout, isCompactLayoutViewport, () => false);
}

export function initializeAdaptiveLayout(): void {
  if (initialized || typeof document === "undefined") return;
  initialized = true;
  markMobilePlatformOnRoot();
  markTouchCapabilityOnRoot();
  document.documentElement.toggleAttribute(
    "data-mobile-standalone",
    isNativeApp() || isStandaloneDisplay(),
  );
  const compact = mediaQuery(COMPACT_LAYOUT_QUERY);
  const coarse = mediaQuery(COARSE_POINTER_QUERY);
  const sync = () => {
    document.documentElement.toggleAttribute(
      "data-compact-layout",
      supportsCompactLayout() && (compact?.matches ?? false),
    );
    document.documentElement.toggleAttribute("data-coarse-input", coarse?.matches ?? false);
  };
  compact?.addEventListener("change", sync);
  coarse?.addEventListener("change", sync);
  sync();
}
