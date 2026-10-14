import { create } from "zustand";
import type { BrowserFindResult } from "@/shared/ipc";

interface BrowserFindState {
  tabId: string | null;
  query: string;
  matchCase: boolean;
  matches: number;
  currentIndex: number;
  openToken: number;
  open: (tabId: string) => void;
  close: () => void;
  setQuery: (query: string) => void;
  toggleMatchCase: () => void;
  applyResult: (result: BrowserFindResult) => void;
}

export const useBrowserFindStore = create<BrowserFindState>((set) => ({
  tabId: null,
  query: "",
  matchCase: false,
  matches: 0,
  currentIndex: -1,
  openToken: 0,
  open: (tabId) =>
    set((state) => ({
      tabId,
      query: state.tabId === tabId ? state.query : "",
      matches: state.tabId === tabId ? state.matches : 0,
      currentIndex: state.tabId === tabId ? state.currentIndex : -1,
      openToken: state.openToken + 1,
    })),
  close: () =>
    set((state) =>
      state.tabId === null ? {} : { tabId: null, query: "", matches: 0, currentIndex: -1 },
    ),
  setQuery: (query) =>
    set((state) => (state.query === query ? {} : { query, matches: 0, currentIndex: -1 })),
  toggleMatchCase: () =>
    set((state) => ({
      matchCase: !state.matchCase,
      matches: 0,
      currentIndex: -1,
    })),
  applyResult: (result) =>
    set((state) => {
      if (state.tabId !== result.tabId) return {};
      const currentIndex = result.activeMatchOrdinal > 0 ? result.activeMatchOrdinal - 1 : -1;
      if (state.matches === result.matches && state.currentIndex === currentIndex) return {};
      return { matches: result.matches, currentIndex };
    }),
}));
