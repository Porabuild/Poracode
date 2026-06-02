import { create } from "zustand";
import type { UsageLoginConfirmationRequest, UsageLoginDeviceCode } from "@/shared/contracts";
import type { BrowserState, BrowserTabInfo } from "@/shared/ipc";

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
  pickerActive: false,
  attentionTabId: null,
  pendingPickerAttachment: null,
  usageLoginConfirmation: null,
  usageLoginDeviceCode: null,

  setState: (state) =>
    set((s) => {
      if (s.activeTabId === state.activeTabId && tabsEqual(s.tabs, state.tabs)) return {};
      return { tabs: state.tabs, activeTabId: state.activeTabId };
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
