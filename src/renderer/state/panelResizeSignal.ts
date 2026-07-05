// Process-wide signal for "a panel/divider drag is currently in progress".
//
// Panel resizing (AppShell sidebar/right/git/bottom panels and the
// SplitPaneContainer dividers) drives a width/height change on every animation
// frame. Subscribers that normally do synchronous layout reconciliation in
// response to size changes (the chat scroll-sync in `ChatPane`) use this to
// switch to a cheaper, coalesced path for the duration of the drag — so the
// content still reflows and stays bottom-pinned live, but we avoid stacking
// several forced reflows (`scrollHeight` reads) per frame.
//
// Only one pointer drag can be active at a time, so a single boolean suffices.
// Backed by a one-field Zustand store so the subscribe/getSnapshot contract is
// the same store machinery used everywhere else in the renderer; consumers that
// read the flag imperatively (ChatPane's drag-coalesced layout path keeps an
// effect-event read + a transition subscription for drag-end reconcile) keep
// working unchanged via the thin wrappers below.

import { create } from "zustand";

interface PanelResizeState {
  resizing: boolean;
}

export const usePanelResizeStore = create<PanelResizeState>(() => ({ resizing: false }));

function setDocumentPanelResizing(next: boolean): void {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.panelResizing = next ? "on" : "off";
}

export function isPanelResizing(): boolean {
  return usePanelResizeStore.getState().resizing;
}

export function beginPanelResize(): void {
  if (usePanelResizeStore.getState().resizing) return;
  setDocumentPanelResizing(true);
  usePanelResizeStore.setState({ resizing: true });
}

export function endPanelResize(): void {
  if (!usePanelResizeStore.getState().resizing) return;
  setDocumentPanelResizing(false);
  usePanelResizeStore.setState({ resizing: false });
}

/** Subscribe to resize start/end transitions. Returns an unsubscribe fn. */
export function subscribePanelResize(listener: (resizing: boolean) => void): () => void {
  return usePanelResizeStore.subscribe((state) => listener(state.resizing));
}
