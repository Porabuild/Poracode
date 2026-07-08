import { create } from "zustand";
import type { UsageLoginConfirmationRequest, UsageLoginDeviceCode } from "@/shared/contracts";
import type {
  BrowserBookmarkInfo,
  BrowserState,
  BrowserTabGroupInfo,
  BrowserTabInfo,
} from "@/shared/ipc";

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
  groups: BrowserTabGroupInfo[];
  activeTabId: string | null;
  extracted: boolean;
  bookmarks: BrowserBookmarkInfo[];
  bookmarkBarVisible: boolean;
  pickerActive: boolean;
  attentionTabId: string | null;
  /** True while an agent is actively driving the browser; keeps the headless
   *  webviews mounted with the panel closed. Flipped off (unmount) when idle. */
  automationActive: boolean;
  pendingPickerAttachment: PendingPickerAttachment | null;
  usageLoginConfirmation: UsageLoginConfirmationRequest | null;
  usageLoginDeviceCode: UsageLoginDeviceCode | null;
  setState: (state: BrowserState) => void;
  upsertTab: (tab: BrowserTabInfo) => void;
  setActive: (tabId: string | null) => void;
  setPickerActive: (active: boolean) => void;
  setAttention: (tabId: string | null) => void;
  setAutomationActive: (active: boolean) => void;
  setPendingPickerAttachment: (attachment: PendingPickerAttachment | null) => void;
  setUsageLoginConfirmation: (request: UsageLoginConfirmationRequest | null) => void;
  clearUsageLoginConfirmation: (requestId: string) => void;
  setUsageLoginDeviceCode: (deviceCode: UsageLoginDeviceCode | null) => void;
  clearUsageLoginDeviceCode: (providerId: string) => void;
}

export const useBrowserPanelStore = create<BrowserPanelState>((set) => ({
  tabs: [],
  groups: [],
  activeTabId: null,
  extracted: false,
  bookmarks: [],
  bookmarkBarVisible: false,
  pickerActive: false,
  attentionTabId: null,
  automationActive: false,
  pendingPickerAttachment: null,
  usageLoginConfirmation: null,
  usageLoginDeviceCode: null,

  setState: (state) =>
    set((s) => {
      const extracted = state.extracted === true;
      const bookmarks = state.bookmarks ?? [];
      const bookmarkBarVisible = state.bookmarkBarVisible === true;
      const groups = state.groups ?? [];
      if (
        s.activeTabId === state.activeTabId &&
        s.extracted === extracted &&
        s.bookmarkBarVisible === bookmarkBarVisible &&
        bookmarksEqual(s.bookmarks, bookmarks) &&
        groupsEqual(s.groups, groups) &&
        tabsEqual(s.tabs, state.tabs)
      ) {
        return {};
      }
      return {
        tabs: state.tabs,
        groups,
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
      const nextTab = { ...s.tabs[idx]!, ...tab };
      if (tabInfoEqual(s.tabs[idx]!, nextTab)) return {};
      const next = s.tabs.slice();
      next[idx] = nextTab;
      return { tabs: next };
    }),
  setActive: (tabId) => set((state) => (state.activeTabId === tabId ? {} : { activeTabId: tabId })),
  setPickerActive: (active) =>
    set((state) => (state.pickerActive === active ? {} : { pickerActive: active })),
  setAttention: (tabId) =>
    set((state) => (state.attentionTabId === tabId ? {} : { attentionTabId: tabId })),
  setAutomationActive: (active) =>
    set((state) => (state.automationActive === active ? {} : { automationActive: active })),
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

function groupsEqual(a: BrowserTabGroupInfo[], b: BrowserTabGroupInfo[]): boolean {
  return (
    a.length === b.length &&
    a.every(
      (g, i) =>
        g.id === b[i]!.id &&
        g.title === b[i]!.title &&
        g.color === b[i]!.color &&
        g.collapsed === b[i]!.collapsed &&
        g.threadId === b[i]!.threadId,
    )
  );
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
    a.devToolsOpen === b.devToolsOpen &&
    a.groupId === b.groupId
  );
}
