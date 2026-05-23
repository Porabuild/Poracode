import type React from "react";
import type { RefObject } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { readStoredNumber } from "@/renderer/utils/localStorage";

// Wide enough to fit a Home-row suffix button (terminal icon) plus a few
// characters of an active thread title without truncating to ellipses.
export const SIDEBAR_MIN_WIDTH = 240;
const SIDEBAR_MAX_WIDTH = 500;
const SIDEBAR_DEFAULT_WIDTH = 350;
const PANEL_MIN_WIDTH = 320;
const PANEL_MAX_WIDTH = 1100;
const PANEL_DEFAULT_WIDTH = 480;
const PANEL_BOTTOM_MIN_HEIGHT = 200;
const PANEL_BOTTOM_MAX_HEIGHT = 500;
const PANEL_BOTTOM_DEFAULT_HEIGHT = 300;
const GIT_PANEL_MIN_WIDTH = 280;
const GIT_PANEL_MAX_WIDTH = 900;
const GIT_PANEL_DEFAULT_WIDTH = 350;

export const CONTENT_MIN_WIDTH = 540;

export type ResizeTarget = "sidebar" | "panel" | "panel-bottom" | "git-panel";

export function useResizablePanels(refs: {
  sidebarRef: RefObject<HTMLDivElement | null>;
  panelRef: RefObject<HTMLDivElement | null>;
  panelInnerRef: RefObject<HTMLDivElement | null>;
  gitPanelRef: RefObject<HTMLDivElement | null>;
  gitPanelInnerRef: RefObject<HTMLDivElement | null>;
  mainRef: RefObject<HTMLElement | null>;
  overlayRef: RefObject<HTMLDivElement | null>;
}) {
  const [sidebarWidth, setSidebarWidth] = useState(() =>
    readStoredNumber("lightcode-sidebar-width", SIDEBAR_DEFAULT_WIDTH),
  );
  const [panelWidth, setPanelWidth] = useState(() =>
    readStoredNumber("lightcode-panel-width", PANEL_DEFAULT_WIDTH),
  );
  const [panelHeight, setPanelHeight] = useState(() =>
    readStoredNumber("lightcode-panel-height", PANEL_BOTTOM_DEFAULT_HEIGHT),
  );
  const [gitPanelWidth, setGitPanelWidth] = useState(() =>
    readStoredNumber("lightcode-git-panel-width", GIT_PANEL_DEFAULT_WIDTH),
  );
  const sizeRef = useRef({
    sidebarWidth,
    panelWidth,
    panelHeight,
    gitPanelWidth,
  });

  useEffect(() => {
    sizeRef.current = {
      sidebarWidth,
      panelWidth,
      panelHeight,
      gitPanelWidth,
    };
  }, [gitPanelWidth, panelHeight, panelWidth, sidebarWidth]);

  const applySidebarWidth = useCallback(
    (next: number) => {
      const sidebar = refs.sidebarRef.current;
      if (!sidebar) return;
      sidebar.style.width = `${next}px`;
      sidebar.style.minWidth = `${next}px`;
    },
    [refs.sidebarRef],
  );

  const applyPanelWidth = useCallback(
    (next: number) => {
      const panel = refs.panelRef.current;
      if (panel) {
        panel.style.width = `${next}px`;
        panel.style.minWidth = `${next}px`;
      }
      const inner = refs.panelInnerRef.current;
      if (inner) {
        inner.style.width = `${next}px`;
      }
    },
    [refs.panelInnerRef, refs.panelRef],
  );

  const applyPanelHeight = useCallback(
    (next: number) => {
      const panel = refs.panelRef.current;
      if (panel) {
        panel.style.height = `${next}px`;
        panel.style.minHeight = `${next}px`;
      }
      const inner = refs.panelInnerRef.current;
      if (inner) {
        inner.style.height = `${next}px`;
      }
    },
    [refs.panelInnerRef, refs.panelRef],
  );

  const applyGitPanelWidth = useCallback(
    (next: number) => {
      const panel = refs.gitPanelRef.current;
      if (panel) {
        panel.style.width = `${next}px`;
        panel.style.minWidth = `${next}px`;
      }
      const inner = refs.gitPanelInnerRef.current;
      if (inner) {
        inner.style.width = `${next}px`;
      }
    },
    [refs.gitPanelInnerRef, refs.gitPanelRef],
  );

  useEffect(() => {
    localStorage.setItem("lightcode-sidebar-width", String(sidebarWidth));
  }, [sidebarWidth]);

  useEffect(() => {
    localStorage.setItem("lightcode-panel-width", String(panelWidth));
  }, [panelWidth]);

  useEffect(() => {
    localStorage.setItem("lightcode-panel-height", String(panelHeight));
  }, [panelHeight]);

  useEffect(() => {
    localStorage.setItem("lightcode-git-panel-width", String(gitPanelWidth));
  }, [gitPanelWidth]);

  // Ends an in-flight resize (teardown + persist final size). Called on unmount
  // and when external code (e.g. auto-hide on narrow content) needs to abort
  // the drag so the user stops modifying a panel that's about to be hidden.
  const endResizeRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    return () => {
      endResizeRef.current?.();
    };
  }, []);

  const cancelActiveResize = useCallback(() => {
    endResizeRef.current?.();
  }, []);

  // Set the right panel's width (DOM + state) clamped to its allowed range.
  // Used by auto-hide to shrink the panel below the threshold that triggered
  // the hide, so reopening it does not immediately re-trigger auto-hide.
  const updatePanelWidth = useCallback(
    (next: number) => {
      const clamped = Math.min(PANEL_MAX_WIDTH, Math.max(PANEL_MIN_WIDTH, Math.floor(next)));
      sizeRef.current.panelWidth = clamped;
      applyPanelWidth(clamped);
      setPanelWidth(clamped);
    },
    [applyPanelWidth],
  );

  const updateGitPanelWidth = useCallback(
    (next: number) => {
      const clamped = Math.min(
        GIT_PANEL_MAX_WIDTH,
        Math.max(GIT_PANEL_MIN_WIDTH, Math.floor(next)),
      );
      sizeRef.current.gitPanelWidth = clamped;
      applyGitPanelWidth(clamped);
      setGitPanelWidth(clamped);
    },
    [applyGitPanelWidth],
  );

  const startResize = useCallback(
    (target: ResizeTarget, event: React.MouseEvent) => {
      event.preventDefault();
      endResizeRef.current?.();

      const startX = event.clientX;
      const startY = event.clientY;
      const startWidth =
        target === "sidebar"
          ? sizeRef.current.sidebarWidth
          : target === "panel"
            ? sizeRef.current.panelWidth
            : target === "git-panel"
              ? sizeRef.current.gitPanelWidth
              : 0;
      const startHeight = target === "panel-bottom" ? sizeRef.current.panelHeight : 0;

      // Cap right-side panel drags so main content never falls below
      // CONTENT_MIN_WIDTH — otherwise the auto-hide ResizeObserver kicks in
      // mid-drag and the panel disappears under the cursor.
      const mainW = refs.mainRef.current?.getBoundingClientRect().width ?? 0;
      const dynamicMaxPanel =
        target === "panel" && mainW > 0
          ? Math.min(
              PANEL_MAX_WIDTH,
              Math.max(PANEL_MIN_WIDTH, mainW + startWidth - CONTENT_MIN_WIDTH),
            )
          : PANEL_MAX_WIDTH;
      const dynamicMaxGitPanel =
        target === "git-panel" && mainW > 0
          ? Math.min(
              GIT_PANEL_MAX_WIDTH,
              Math.max(GIT_PANEL_MIN_WIDTH, mainW + startWidth - CONTENT_MIN_WIDTH),
            )
          : GIT_PANEL_MAX_WIDTH;

      // The element whose CSS transition must be paused for the duration of the drag,
      // otherwise its width/height will lag behind the per-frame ref writes below.
      const affected =
        target === "sidebar"
          ? refs.sidebarRef.current
          : target === "git-panel"
            ? refs.gitPanelRef.current
            : refs.panelRef.current;
      const prevTransitionDuration = affected ? affected.style.transitionDuration : "";
      if (affected) affected.style.transitionDuration = "0ms";

      const overlay = refs.overlayRef.current;
      if (overlay) {
        overlay.style.display = "block";
        overlay.style.cursor = target === "panel-bottom" ? "row-resize" : "col-resize";
      }

      let rafId: number | null = null;
      let pendingX = startX;
      let pendingY = startY;
      let hasPending = false;

      function flush() {
        rafId = null;
        if (!hasPending) return;
        hasPending = false;
        const x = pendingX;
        const y = pendingY;

        if (target === "sidebar") {
          const delta = x - startX;
          const next = Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, startWidth + delta));
          if (next === sizeRef.current.sidebarWidth) return;
          sizeRef.current.sidebarWidth = next;
          applySidebarWidth(next);
        } else if (target === "panel") {
          const delta = startX - x;
          const next = Math.min(dynamicMaxPanel, Math.max(PANEL_MIN_WIDTH, startWidth + delta));
          if (next === sizeRef.current.panelWidth) return;
          sizeRef.current.panelWidth = next;
          applyPanelWidth(next);
        } else if (target === "panel-bottom") {
          const delta = startY - y;
          const next = Math.min(
            PANEL_BOTTOM_MAX_HEIGHT,
            Math.max(PANEL_BOTTOM_MIN_HEIGHT, startHeight + delta),
          );
          if (next === sizeRef.current.panelHeight) return;
          sizeRef.current.panelHeight = next;
          applyPanelHeight(next);
        } else if (target === "git-panel") {
          const delta = startX - x;
          const next = Math.min(
            dynamicMaxGitPanel,
            Math.max(GIT_PANEL_MIN_WIDTH, startWidth + delta),
          );
          if (next === sizeRef.current.gitPanelWidth) return;
          sizeRef.current.gitPanelWidth = next;
          applyGitPanelWidth(next);
        }
      }

      function onMouseMove(e: MouseEvent) {
        pendingX = e.clientX;
        pendingY = e.clientY;
        hasPending = true;
        if (rafId === null) rafId = requestAnimationFrame(flush);
      }

      function teardown() {
        if (rafId !== null) {
          cancelAnimationFrame(rafId);
          rafId = null;
        }
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", endResize);
        if (affected) affected.style.transitionDuration = prevTransitionDuration;
        if (overlay) {
          overlay.style.display = "none";
          overlay.style.cursor = "";
        }
        endResizeRef.current = null;
      }

      function endResize() {
        if (hasPending) flush();
        teardown();
        // Single batched re-render at the end persists the final size to localStorage.
        setSidebarWidth(sizeRef.current.sidebarWidth);
        setPanelWidth(sizeRef.current.panelWidth);
        setPanelHeight(sizeRef.current.panelHeight);
        setGitPanelWidth(sizeRef.current.gitPanelWidth);
      }

      endResizeRef.current = endResize;
      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", endResize);
    },
    [
      applyGitPanelWidth,
      applyPanelHeight,
      applyPanelWidth,
      applySidebarWidth,
      refs.gitPanelRef,
      refs.mainRef,
      refs.overlayRef,
      refs.panelRef,
      refs.sidebarRef,
    ],
  );

  function handleSidebarResizeStart(e: React.MouseEvent) {
    startResize("sidebar", e);
  }

  function handlePanelResizeStart(e: React.MouseEvent) {
    startResize("panel", e);
  }

  function handlePanelBottomResizeStart(e: React.MouseEvent) {
    startResize("panel-bottom", e);
  }

  function handleGitPanelResizeStart(e: React.MouseEvent) {
    startResize("git-panel", e);
  }

  return {
    sidebarWidth,
    panelWidth,
    panelHeight,
    gitPanelWidth,
    handleSidebarResizeStart,
    handlePanelResizeStart,
    handlePanelBottomResizeStart,
    handleGitPanelResizeStart,
    cancelActiveResize,
    updatePanelWidth,
    updateGitPanelWidth,
  };
}
