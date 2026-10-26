import { useEffect, useEffectEvent, useRef, useState } from "react";
import type { PrReviewSide } from "../detail/prDetailNav";
import type { PrViewedState } from "../viewed/prViewedFiles";
import type { ChangeEntry } from "./changesModel";

interface NavigationState {
  resetKey: string;
  /** Explicit collapse choices; a file without one follows its default. */
  overrides: ReadonlyMap<string, boolean>;
  /** Large files whose diff the reviewer asked for. */
  loaded: ReadonlySet<string>;
  activePath: string | null;
  /** The `focusedFile` request already applied to the state above. */
  appliedFocus: FocusedFile | null;
  /** Set when a focus request needs the list to scroll; read by the effect below. */
  scrollRequest: FocusedFile | null;
}

type FocusedFile = { path: string; line?: number; side?: PrReviewSide };

const initialState = (resetKey: string, appliedFocus: FocusedFile | null): NavigationState => ({
  resetKey,
  overrides: new Map(),
  loaded: new Set(),
  activePath: null,
  appliedFocus,
  scrollRequest: null,
});

interface PendingScroll {
  path: string;
  line?: number;
  side?: PrReviewSide;
  at: number;
}

/** A scroll request that waits for a diff to render is dropped after this long. */
const PENDING_SCROLL_MS = 5000;

/** Prefer the requested side's line-number cell when a thread has an explicit side. */
function findLineElement(card: HTMLElement, line: number, side?: PrReviewSide): Element | null {
  const sideName = side === "LEFT" ? "old" : "new";
  const sideLine =
    card.querySelector(`.diff-line-${sideName}-num [data-line-num="${line}"]`) ??
    card.querySelector(`[data-line-${sideName}-num="${line}"]`);
  if (sideLine || side === "LEFT") return sideLine;
  return card.querySelector(`[data-line-num="${line}"]`);
}

/**
 * Which diff cards are collapsed or loaded, which file the tree highlights, and
 * how the list scrolls to a file or line. State starts over when `resetKey` changes.
 */
export function useDiffNavigation(input: {
  resetKey: string;
  entries: readonly ChangeEntry[];
  /** `null` when viewed marks do not apply. */
  viewStates: ReadonlyMap<string, PrViewedState> | null;
  focusedFile: FocusedFile | null;
}) {
  const { resetKey, entries, viewStates, focusedFile } = input;
  const [state, setState] = useState(() => initialState(resetKey, null));
  // Another review or commit starts over, and does not replay an old focus request.
  if (state.resetKey !== resetKey) setState(initialState(resetKey, focusedFile));
  const elements = useRef(new Map<string, HTMLElement>());
  const pending = useRef<PendingScroll | null>(null);

  const isCollapsed = (entry: ChangeEntry) =>
    state.overrides.get(entry.file.path) ?? viewStates?.get(entry.file.path) === "viewed";

  function scrollToCard(path: string) {
    elements.current.get(path)?.scrollIntoView({ block: "start" });
  }

  /** Completes the waiting request for `path`; returns false when the line is not in the DOM yet. */
  function finishPending(path: string, requireLine: boolean): boolean {
    const request = pending.current;
    if (!request || request.path !== path) return true;
    if (Date.now() - request.at > PENDING_SCROLL_MS) {
      pending.current = null;
      return true;
    }
    const card = elements.current.get(path);
    if (!card) return false;
    if (request.line !== undefined) {
      const target = findLineElement(card, request.line, request.side);
      if (!target && requireLine) return false;
      pending.current = null;
      if (target) {
        (target.closest("tr") ?? target).scrollIntoView({ block: "center" });
        return true;
      }
    }
    pending.current = null;
    card.scrollIntoView({ block: "start" });
    return true;
  }

  function setOverride(path: string, collapsed: boolean | null) {
    setState((current) => {
      const overrides = new Map(current.overrides);
      if (collapsed === null) overrides.delete(path);
      else overrides.set(path, collapsed);
      return { ...current, overrides };
    });
  }

  // A new `focusedFile` object is a new request, even for the same path. It waits
  // until the file is in the list (the diff may still be loading).
  const hasTarget = focusedFile
    ? entries.some((entry) => entry.file.path === focusedFile.path)
    : false;
  if (focusedFile && hasTarget && state.appliedFocus !== focusedFile) {
    setState((current) => {
      const overrides = new Map(current.overrides);
      overrides.set(focusedFile.path, false);
      return {
        ...current,
        overrides,
        loaded: new Set(current.loaded).add(focusedFile.path),
        activePath: focusedFile.path,
        appliedFocus: focusedFile,
        scrollRequest: focusedFile,
      };
    });
  }
  const applyScroll = useEffectEvent((request: FocusedFile) => {
    pending.current = {
      path: request.path,
      at: Date.now(),
      ...(request.line !== undefined ? { line: request.line } : {}),
      ...(request.side !== undefined ? { side: request.side } : {}),
    };
    scrollToCard(request.path);
    // An open, built card has its lines already; a closed one finishes in `onBuilt`.
    if (request.line !== undefined) finishPending(request.path, true);
  });
  useEffect(() => {
    if (state.scrollRequest) applyScroll(state.scrollRequest);
  }, [state.scrollRequest]);

  return {
    activePath: state.activePath,
    loaded: state.loaded,
    isCollapsed,
    allCollapsed: entries.length > 0 && entries.every(isCollapsed),
    registerElement: (path: string, element: HTMLElement | null) => {
      if (element) elements.current.set(path, element);
      else elements.current.delete(path);
    },
    /** Called by a card once its diff is in the DOM, to finish a scroll that needs it. */
    onBuilt: (path: string) => {
      finishPending(path, false);
    },
    select: (path: string) => {
      setState((current) => ({ ...current, activePath: path }));
      setOverride(path, false);
      scrollToCard(path);
    },
    toggleCollapsed: (path: string) => {
      const entry = entries.find((candidate) => candidate.file.path === path);
      if (entry) setOverride(path, !isCollapsed(entry));
    },
    /** Returns a file to its default (collapsed when viewed, open otherwise). */
    followDefault: (path: string) => setOverride(path, null),
    load: (path: string) =>
      setState((current) => ({ ...current, loaded: new Set(current.loaded).add(path) })),
    collapseAll: () =>
      setState((current) => ({
        ...current,
        overrides: new Map(entries.map((entry) => [entry.file.path, true])),
      })),
    expandAll: () =>
      setState((current) => ({
        ...current,
        overrides: new Map(entries.map((entry) => [entry.file.path, false])),
      })),
  };
}
