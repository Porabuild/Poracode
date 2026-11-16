import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";

const OVERLAY_SURFACE_SELECTOR = "[data-overlay-surface]";
const OVERLAY_VISIBLE_ATTRIBUTE = "data-overlay-visible";
const ROOT_FLAG_ATTRIBUTE = "data-glass-overlay-visible";

let visibleOverlaySidebars = 0;

function holdRootFlag(): () => void {
  visibleOverlaySidebars += 1;
  document.documentElement.setAttribute(ROOT_FLAG_ATTRIBUTE, "");
  return () => {
    visibleOverlaySidebars -= 1;
    if (visibleOverlaySidebars === 0) {
      document.documentElement.removeAttribute(ROOT_FLAG_ATTRIBUTE);
    }
  };
}

interface SidebarTracker {
  sidebar: HTMLElement;
  stop: () => void;
}

function trackSidebar(sidebar: HTMLElement): SidebarTracker {
  const surfaces: Element[] = [];
  for (
    let surface = sidebar.closest(OVERLAY_SURFACE_SELECTOR);
    surface;
    surface = surface.parentElement?.closest(OVERLAY_SURFACE_SELECTOR) ?? null
  ) {
    surfaces.push(surface);
  }
  if (surfaces.length === 0) return { sidebar, stop: () => {} };

  let release: (() => void) | null = null;
  const sync = () => {
    const visible = surfaces.some((surface) => surface.hasAttribute(OVERLAY_VISIBLE_ATTRIBUTE));
    if (visible && !release) {
      release = holdRootFlag();
    } else if (!visible && release) {
      release();
      release = null;
    }
  };
  sync();
  // Mutation observers run before the next paint, so the flag flips in the
  // same frame as the surface attribute.
  const observer = new MutationObserver(sync);
  for (const surface of surfaces) {
    observer.observe(surface, { attributes: true, attributeFilter: [OVERLAY_VISIBLE_ATTRIBUTE] });
  }
  return {
    sidebar,
    stop: () => {
      observer.disconnect();
      release?.();
      release = null;
    },
  };
}

/**
 * Sets `data-glass-overlay-visible` on the document root while this sidebar
 * sits inside an overlay surface that carries `data-overlay-visible`. The
 * glass-sidebar CSS uses the flag to hide the base app behind such an overlay.
 *
 * This replaces a `#root:has(…)` selector. With a relational selector on the
 * app root, element insertions and removals anywhere in the window made the
 * engine re-evaluate it and restyle the window, which dominated the main
 * thread while replies streamed.
 */
export function useGlassOverlaySidebar(sidebarRef: RefObject<HTMLElement | null>): void {
  const trackerRef = useRef<SidebarTracker | null>(null);

  useLayoutEffect(() => {
    const sidebar = sidebarRef.current;
    if (!sidebar) return;
    if (trackerRef.current?.sidebar !== sidebar) {
      trackerRef.current?.stop();
      trackerRef.current = trackSidebar(sidebar);
    }
    return () => {
      // React also runs this cleanup when Suspense hides the overlay content
      // but keeps the sidebar in the DOM, where the old selector kept
      // matching. Only let go once the sidebar has really left the document;
      // the check runs after the commit and before the next paint.
      queueMicrotask(() => {
        const tracker = trackerRef.current;
        if (sidebar.isConnected || tracker?.sidebar !== sidebar) return;
        tracker.stop();
        trackerRef.current = null;
      });
    };
  }, [sidebarRef]);

  // Passive effects stay connected while Suspense hides the tree, so this
  // cleanup only runs on a real unmount.
  useEffect(
    () => () => {
      trackerRef.current?.stop();
      trackerRef.current = null;
    },
    [],
  );
}
