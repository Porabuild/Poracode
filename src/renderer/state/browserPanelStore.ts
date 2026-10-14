import { browserDeviceEmulationEqual } from "@/shared/browserDeviceEmulation";
import { create } from "zustand";
import {
  browserPresentationBase,
  projectBrowserPresentation,
  resetBrowserPresentationIntents,
} from "./browserPresentationIntents";
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
  /** Native webview custody follows host membership, independently of the visible strip. */
  residentTabs: BrowserTabInfo[];
  groups: BrowserTabGroupInfo[];
  activeTabId: string | null;
  initialized: boolean;
  hostActiveTabId: string | null;
  selectionRevision: number;
  ownerRevision: number;
  activationIntent: {
    tabId: string;
    previous: string | null;
    token: symbol;
    dispatched: boolean;
  } | null;
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
  resetOwner: () => void;
  upsertTab: (tab: BrowserTabInfo) => void;
  setActive: (tabId: string | null) => void;
  beginActivation: (tabId: string) => symbol;
  markActivationDispatched: (token: symbol) => boolean;
  settleActivation: (token: symbol, accepted: boolean) => void;
  setPickerActive: (active: boolean) => void;
  setAttention: (tabId: string | null) => void;
  setAutomationActive: (active: boolean) => void;
  setPendingPickerAttachment: (attachment: PendingPickerAttachment | null) => void;
  setUsageLoginConfirmation: (request: UsageLoginConfirmationRequest | null) => void;
  clearUsageLoginConfirmation: (requestId: string) => void;
  setUsageLoginDeviceCode: (deviceCode: UsageLoginDeviceCode | null) => void;
  clearUsageLoginDeviceCode: (providerId: string) => void;
}

export const useBrowserPanelStore = create<BrowserPanelState>((set, get) => ({
  tabs: [],
  residentTabs: [],
  groups: [],
  activeTabId: null,
  initialized: false,
  hostActiveTabId: null,
  selectionRevision: 0,
  ownerRevision: 0,
  activationIntent: null,
  extracted: false,
  bookmarks: [],
  bookmarkBarVisible: false,
  pickerActive: false,
  attentionTabId: null,
  automationActive: false,
  pendingPickerAttachment: null,
  usageLoginConfirmation: null,
  usageLoginDeviceCode: null,

  resetOwner: () => {
    resetBrowserPresentationIntents();
    set((state) => ({
      ownerRevision: state.ownerRevision + 1,
      tabs: [],
      residentTabs: [],
      groups: [],
      bookmarks: [],
      bookmarkBarVisible: false,
      activeTabId: null,
      hostActiveTabId: null,
      initialized: false,
      activationIntent: null,
    }));
  },

  setState: (state) =>
    set((s) => {
      const residentTabs = state.tabs;
      const hostActiveTabId = state.activeTabId;
      state = projectBrowserPresentation(state, true);
      const intent = s.activationIntent;
      const activationIntent =
        intent &&
        state.tabs.some((tab) => tab.tabId === intent.tabId) &&
        !(intent.dispatched && hostActiveTabId === intent.tabId)
          ? intent
          : null;
      const activeTabId = activationIntent?.tabId ?? state.activeTabId;
      const extracted = state.extracted === true;
      const bookmarks = state.bookmarks ?? [];
      const bookmarkBarVisible = state.bookmarkBarVisible === true;
      const groups = state.groups ?? [];
      if (
        s.initialized &&
        s.hostActiveTabId === hostActiveTabId &&
        s.activationIntent === activationIntent &&
        s.activeTabId === activeTabId &&
        s.extracted === extracted &&
        s.bookmarkBarVisible === bookmarkBarVisible &&
        bookmarksEqual(s.bookmarks, bookmarks) &&
        groupsEqual(s.groups, groups) &&
        tabsEqual(s.tabs, state.tabs) &&
        tabsEqual(s.residentTabs, residentTabs)
      ) {
        return {};
      }
      return {
        tabs: state.tabs,
        residentTabs,
        groups,
        initialized: true,
        hostActiveTabId,
        activationIntent,
        activeTabId,
        extracted,
        bookmarks,
        bookmarkBarVisible,
      };
    }),
  upsertTab: (tab) => {
    const s = get();
    const base = browserPresentationBase({ ...s, tabs: s.residentTabs });
    const idx = base.tabs.findIndex((t) => t.tabId === tab.tabId);
    const tabs = base.tabs.slice();
    if (idx < 0) tabs.push(tab);
    else tabs[idx] = tab;
    s.setState({ ...base, tabs });
  },
  setActive: (tabId) => set((state) => (state.activeTabId === tabId ? {} : { activeTabId: tabId })),
  beginActivation: (tabId) => {
    const token = Symbol(tabId);
    set((state) => ({
      activeTabId: tabId,
      selectionRevision: state.selectionRevision + 1,
      activationIntent: {
        tabId,
        token,
        previous: state.activationIntent?.previous ?? state.activeTabId,
        dispatched: false,
      },
    }));
    return token;
  },
  markActivationDispatched: (token) => {
    let dispatched = false;
    set((state) => {
      if (state.activationIntent?.token !== token) return {};
      dispatched = true;
      return { activationIntent: { ...state.activationIntent, dispatched: true } };
    });
    return dispatched;
  },
  settleActivation: (token, accepted) =>
    set((state) => {
      const intent = state.activationIntent;
      if (intent?.token !== token) return {};
      if (!accepted) {
        const projected = projectBrowserPresentation(
          browserPresentationBase({
            ...state,
            tabs: state.residentTabs,
            activeTabId: state.hostActiveTabId ?? intent.previous,
          }),
        );
        return { activationIntent: null, activeTabId: projected.activeTabId };
      }
      return state.hostActiveTabId === intent.tabId ? { activationIntent: null } : {};
    }),
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

/** Commands and their visible feedback cannot wait for a retired owner's jobs. */
export function browserActionKey(key: string, ownerRevision: number): string {
  return `${key}:owner:${ownerRevision}`;
}

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
    a.internalPage === b.internalPage &&
    a.zoomFactor === b.zoomFactor &&
    browserDeviceEmulationEqual(a.deviceEmulation, b.deviceEmulation) &&
    a.groupId === b.groupId
  );
}
