import { create } from "zustand";
import type { UsageLoginConfirmationRequest, UsageLoginDeviceCode } from "@/shared/contracts";
import type { BrowserBookmarkInfo, BrowserState, BrowserTabInfo } from "@/shared/ipc";

export interface PendingPickerAttachment {
  attachmentPath: string;
  attachmentName: string;
  mimeType: string;
  selector: string;
  sourceUrl: string;
  anchorX?: number;
  anchorY?: number;
}

interface BrowserPanelState {
  tabs: BrowserTabInfo[];
  activeTabId: string | null;
  extracted: boolean;
  bookmarks: BrowserBookmarkInfo[];
  bookmarkBarVisible: boolean;
  pickerActive: boolean;
  attentionTabId: string | null;
  pendingPickerAttachment: PendingPickerAttachment | null;
  usageLoginConfirmation: UsageLoginConfirmationRequest | null;
  usageLoginDeviceCode: UsageLoginDeviceCode | null;
  setState: (state: BrowserState) => void;
  upsertTab: (tab: BrowserTabInfo) => void;
  setActive: (tabId: string | null) => void;
  setPickerActive: (active: boolean) => void;
  setAttention: (tabId: string | null) => void;
  setPendingPickerAttachment: (attachment: PendingPickerAttachment | null) => void;
  setUsageLoginConfirmation: (request: UsageLoginConfirmationRequest | null) => void;
  clearUsageLoginConfirmation: (requestId: string) => void;
  setUsageLoginDeviceCode: (deviceCode: UsageLoginDeviceCode | null) => void;
  clearUsageLoginDeviceCode: (providerId: string) => void;
}

export const useBrowserPanelStore = create<BrowserPanelState>((set) => ({
  tabs: [],
  activeTabId: null,
  extracted: false,
  bookmarks: [],
  bookmarkBarVisible: false,
  pickerActive: false,
  attentionTabId: null,
  pendingPickerAttachment: null,
  usageLoginConfirmation: null,
  usageLoginDeviceCode: null,

  setState: (state) =>
    set((s) => {
      const extracted = state.extracted === true;
      const bookmarks = state.bookmarks ?? [];
      const bookmarkBarVisible = state.bookmarkBarVisible === true;
      if (
        s.activeTabId === state.activeTabId &&
        s.extracted === extracted &&
        s.bookmarkBarVisible === bookmarkBarVisible &&
        bookmarksEqual(s.bookmarks, bookmarks) &&
        tabsEqual(s.tabs, state.tabs)
      ) {
        return {};
      }
      return {
        tabs: state.tabs,
        activeTabId: state.activeTabId,
        extracted,
        bookmarks,
        bookmarkBarVisible,
      };
    }),
  upsertTab: (tab) =>
    set((s) => {
      const idx = s.tabs.findIndex((t) => t.tabId === tab.tabId);
      if (idx < 0) {
        return { tabs: [...s.tabs, tab] };
      }
      if (tabInfoEqual(s.tabs[idx]!, tab)) return {};
      const next = s.tabs.slice();
      next[idx] = { ...next[idx], ...tab };
      return { tabs: next };
    }),
  setActive: (tabId) => set((state) => (state.activeTabId === tabId ? {} : { activeTabId: tabId })),
  setPickerActive: (active) =>
    set((state) => (state.pickerActive === active ? {} : { pickerActive: active })),
  setAttention: (tabId) =>
    set((state) => (state.attentionTabId === tabId ? {} : { attentionTabId: tabId })),
  setPendingPickerAttachment: (attachment) =>
    set((state) =>
      state.pendingPickerAttachment === attachment ? {} : { pendingPickerAttachment: attachment },
    ),
  setUsageLoginConfirmation: (request) => set({ usageLoginConfirmation: request }),
  clearUsageLoginConfirmation: (requestId) =>
    set((state) =>
      state.usageLoginConfirmation?.requestId === requestId ? { usageLoginConfirmation: null } : {},
    ),
  setUsageLoginDeviceCode: (deviceCode) => set({ usageLoginDeviceCode: deviceCode }),
  clearUsageLoginDeviceCode: (providerId) =>
    set((state) =>
      state.usageLoginDeviceCode?.providerId === providerId ? { usageLoginDeviceCode: null } : {},
    ),
}));

function tabsEqual(a: BrowserTabInfo[], b: BrowserTabInfo[]): boolean {
  return a.length === b.length && a.every((tab, i) => tabInfoEqual(tab, b[i]!));
}

function bookmarksEqual(a: BrowserBookmarkInfo[], b: BrowserBookmarkInfo[]): boolean {
  return (
    a.length === b.length &&
    a.every(
      (bm, i) =>
        bm.url === b[i]!.url && bm.title === b[i]!.title && bm.faviconUrl === b[i]!.faviconUrl,
    )
  );
}

function tabInfoEqual(a: BrowserTabInfo, b: BrowserTabInfo): boolean {
  return (
    a.tabId === b.tabId &&
    a.url === b.url &&
    a.title === b.title &&
    a.faviconUrl === b.faviconUrl &&
    a.loading === b.loading &&
    a.canGoBack === b.canGoBack &&
    a.canGoForward === b.canGoForward &&
    a.devToolsOpen === b.devToolsOpen
  );
}
