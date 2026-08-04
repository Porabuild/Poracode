import { useLayoutEffect, type RefObject } from "react";
import { useBrowserDockStore } from "@/renderer/state/browserDockStore";

// Box the browser lives in while the panel/overlay are closed but tabs are alive.
// It stays in-window at opacity 0 so the webview keeps a painting guest surface
// for headless screenshots, while a negative z-index and disabled pointer events
// keep it behind the app.
export const HEADLESS_Z = "-1";
export const HEADLESS_WIDTH = 1280;
export const HEADLESS_HEIGHT = 800;

export type BrowserHostMode = "hidden" | "background" | "docked" | "drawer" | "fullscreen";

export function useBrowserHostPositioning(input: {
  wrapperRef: RefObject<HTMLDivElement | null>;
  mode: BrowserHostMode;
  drawerWidth: number;
  dockedVisible: boolean;
}) {
  const { wrapperRef, mode, drawerWidth, dockedVisible } = input;

  // Position imperatively for every mode so leftover inline styles never fight
  // the next mode's layout. While docked, track slot resizes and the panel's
  // short open/overlay transitions without forcing layout on every idle frame.
  useLayoutEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    if (mode === "fullscreen") {
      Object.assign(wrapper.style, { top: "0px", left: "0px", right: "0px", bottom: "0px" });
      wrapper.style.width = "";
      wrapper.style.height = "";
      wrapper.style.maxWidth = "";
      // Clear the docked z-index override so the fullscreen class (z-80) wins.
      wrapper.style.zIndex = "";
      return;
    }
    if (mode === "drawer") {
      Object.assign(wrapper.style, {
        top: "2rem",
        right: "2rem",
        bottom: "2rem",
        left: "auto",
        width: `${drawerWidth}px`,
        maxWidth: "calc(100vw - 4rem)",
      });
      wrapper.style.height = "";
      // Clear the docked z-index override so the drawer class (z-60) wins.
      wrapper.style.zIndex = "";
      return;
    }
    if (mode === "background") {
      Object.assign(wrapper.style, {
        top: "0px",
        left: "0px",
        right: "auto",
        bottom: "auto",
        width: `${HEADLESS_WIDTH}px`,
        height: `${HEADLESS_HEIGHT}px`,
        maxWidth: "",
      });
      // Behind the opaque app UI: painting (so screenshots work) but unseen.
      wrapper.style.zIndex = HEADLESS_Z;
      return;
    }
    if (!dockedVisible) return;

    let raf = 0;
    let activeTransitions = 0;
    let observedSlot: HTMLElement | null = null;
    let observedAside: HTMLElement | null = null;
    let last = "";
    let lastOverlay: boolean | null = null;
    const measure = () => {
      const slot = observedSlot;
      if (!slot) return;
      // On narrow viewports the right panel that hosts the slot floats as a
      // fixed, opaque overlay (z-50). The webview is body-portaled at z-30, so
      // it would paint behind that panel. Lift it to z-55 while overlaid.
      const overlay =
        observedAside !== null && getComputedStyle(observedAside).position === "fixed";
      if (overlay !== lastOverlay) {
        lastOverlay = overlay;
        wrapper.style.zIndex = overlay ? "55" : "";
      }
      const rect = slot.getBoundingClientRect();
      const key = `${rect.top}|${rect.left}|${rect.width}|${rect.height}`;
      if (key === last) return;
      last = key;
      Object.assign(wrapper.style, {
        top: `${rect.top}px`,
        left: `${rect.left}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
        right: "auto",
        bottom: "auto",
        maxWidth: "",
      });
    };
    const tick = () => {
      raf = 0;
      measure();
      if (activeTransitions > 0) scheduleMeasure();
    };
    const scheduleMeasure = () => {
      if (raf === 0) raf = requestAnimationFrame(tick);
    };
    const onTransitionRun = (event: TransitionEvent) => {
      if (event.target !== observedAside) return;
      activeTransitions += 1;
      scheduleMeasure();
    };
    const onTransitionDone = (event: TransitionEvent) => {
      if (event.target !== observedAside) return;
      activeTransitions = Math.max(0, activeTransitions - 1);
    };
    const resizeObserver = new ResizeObserver(scheduleMeasure);
    const observeSlot = (nextSlot: HTMLElement | null) => {
      if (nextSlot === observedSlot) return;
      resizeObserver.disconnect();
      observedAside?.removeEventListener("transitionrun", onTransitionRun);
      observedAside?.removeEventListener("transitionend", onTransitionDone);
      observedAside?.removeEventListener("transitioncancel", onTransitionDone);
      if (raf !== 0) cancelAnimationFrame(raf);
      raf = 0;
      activeTransitions = 0;
      observedSlot = nextSlot;
      observedAside = nextSlot?.closest("aside") ?? null;
      if (!nextSlot) return;
      resizeObserver.observe(nextSlot);
      observedAside?.addEventListener("transitionrun", onTransitionRun);
      observedAside?.addEventListener("transitionend", onTransitionDone);
      observedAside?.addEventListener("transitioncancel", onTransitionDone);
      measure();
    };
    const unsubscribe = useBrowserDockStore.subscribe((state, previousState) => {
      if (state.slotEl !== previousState.slotEl) observeSlot(state.slotEl);
    });
    window.addEventListener("resize", scheduleMeasure);
    observeSlot(useBrowserDockStore.getState().slotEl);
    return () => {
      unsubscribe();
      window.removeEventListener("resize", scheduleMeasure);
      resizeObserver.disconnect();
      observedAside?.removeEventListener("transitionrun", onTransitionRun);
      observedAside?.removeEventListener("transitionend", onTransitionDone);
      observedAside?.removeEventListener("transitioncancel", onTransitionDone);
      if (raf !== 0) cancelAnimationFrame(raf);
    };
  }, [dockedVisible, drawerWidth, mode, wrapperRef]);
}
