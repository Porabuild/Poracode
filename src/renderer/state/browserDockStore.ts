import { create } from "zustand";

/**
 * Bridges the right-panel browser "dock slot" (a placeholder rendered inside
 * {@link ProjectAuxiliaryPanel}) to the top-level {@link BrowserHost}.
 *
 * The browser webview is mounted once in a `document.body` portal so it never
 * unmounts (and thus never reloads the page) as it moves between docked,
 * floating, and fullscreen presentations. While docked it must visually sit
 * over the panel's browser tab area, so the slot publishes its DOM element here
 * and the host tracks its rect imperatively.
 */
interface BrowserDockState {
  slotEl: HTMLElement | null;
  setSlotEl: (el: HTMLElement | null) => void;
}

export const useBrowserDockStore = create<BrowserDockState>((set) => ({
  slotEl: null,
  setSlotEl: (el) => set((s) => (s.slotEl === el ? {} : { slotEl: el })),
}));
