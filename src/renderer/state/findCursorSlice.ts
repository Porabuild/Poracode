import type { StoreApi } from "zustand";

/**
 * Match-cursor state shared by every in-content Find bar (chat, git diff, …).
 * Each store layers its own open-target field (e.g. `activeThreadId`/`isOpen`)
 * and `open`/`close` on top of this slice via {@link createFindCursorSlice}, so
 * the query/case/match-navigation behavior lives in exactly one place.
 */
export interface FindCursorState {
  query: string;
  caseSensitive: boolean;
  matchCount: number;
  /** Zero-based active match, or -1 when there are no matches. */
  currentIndex: number;
  /** Bumped on every open() so the bar can refocus/select even if already open. */
  openToken: number;
  setQuery: (query: string) => void;
  toggleCaseSensitive: () => void;
  next: () => void;
  prev: () => void;
  setMatchCount: (count: number) => void;
}

/**
 * Build the shared find-cursor fields + actions for a zustand store whose state
 * extends {@link FindCursorState}. Spread the result into the store initializer.
 */
export function createFindCursorSlice<T extends FindCursorState>(
  set: StoreApi<T>["setState"],
): FindCursorState {
  return {
    query: "",
    caseSensitive: false,
    matchCount: 0,
    currentIndex: -1,
    openToken: 0,
    setQuery: (query) => set({ query, currentIndex: 0 } as Partial<T>),
    toggleCaseSensitive: () =>
      set((state) => ({ caseSensitive: !state.caseSensitive, currentIndex: 0 }) as Partial<T>),
    next: () =>
      set(
        (state) =>
          (state.matchCount === 0
            ? {}
            : { currentIndex: (state.currentIndex + 1) % state.matchCount }) as Partial<T>,
      ),
    prev: () =>
      set(
        (state) =>
          (state.matchCount === 0
            ? {}
            : {
                currentIndex: (state.currentIndex - 1 + state.matchCount) % state.matchCount,
              }) as Partial<T>,
      ),
    setMatchCount: (count) =>
      set((state) => {
        const currentIndex =
          count === 0 ? -1 : state.currentIndex < 0 ? 0 : Math.min(state.currentIndex, count - 1);
        if (state.matchCount === count && state.currentIndex === currentIndex) {
          return {} as Partial<T>;
        }
        return { matchCount: count, currentIndex } as Partial<T>;
      }),
  };
}
