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

let resizing = false;
const listeners = new Set<(resizing: boolean) => void>();

function setDocumentPanelResizing(next: boolean): void {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.panelResizing = next ? "on" : "off";
}

export function isPanelResizing(): boolean {
  return resizing;
}

export function beginPanelResize(): void {
  if (resizing) return;
  resizing = true;
  setDocumentPanelResizing(true);
  for (const listener of listeners) listener(true);
}

export function endPanelResize(): void {
  if (!resizing) return;
  resizing = false;
  setDocumentPanelResizing(false);
  for (const listener of listeners) listener(false);
}

/** Subscribe to resize start/end transitions. Returns an unsubscribe fn. */
export function subscribePanelResize(listener: (resizing: boolean) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
