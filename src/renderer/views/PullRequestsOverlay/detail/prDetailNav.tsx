import { createContext, useContext, useState, type ReactNode } from "react";
import type { PrReviewThread } from "@/shared/contracts";

export type PrTab = "summary" | "timeline" | "changes" | "guide";
export type PrReviewSide = NonNullable<PrReviewThread["side"]>;

/** Where the detail pane is looking, and how a tab sends the reviewer to another. */
export interface PrDetailNav {
  tab: PrTab;
  setTab: (tab: PrTab) => void;
  /** File the Changes tab should scroll to and expand, set by `openFile`. */
  focusedFile: { path: string; line?: number; side?: PrReviewSide } | null;
  /** Switches to Changes, focused on a file and optional diff side and line. */
  openFile: (path: string, line?: number, side?: PrReviewSide) => void;
  /** Narrows the Changes tab to one commit's diff (`null` is the whole review). */
  commitScope: string | null;
  setCommitScope: (commit: string | null) => void;
  /** The title is being edited (the compact menu starts it; the title block shows the field). */
  titleEditing: boolean;
  setTitleEditing: (editing: boolean) => void;
}

const PrDetailNavContext = createContext<PrDetailNav | null>(null);

interface NavState {
  resetKey: string;
  tab: PrTab;
  focusedFile: PrDetailNav["focusedFile"];
  commitScope: string | null;
  titleEditing: boolean;
}

const initialNav = (resetKey: string): NavState => ({
  resetKey,
  tab: "summary",
  focusedFile: null,
  commitScope: null,
  titleEditing: false,
});

/**
 * Holds the detail pane's navigation above the layout so the header can switch
 * tabs too. Selecting another review (`resetKey`) starts it over.
 */
export function PrDetailNavProvider(props: { resetKey: string; children: ReactNode }) {
  const [state, setState] = useState(() => initialNav(props.resetKey));
  if (state.resetKey !== props.resetKey) setState(initialNav(props.resetKey));
  const value: PrDetailNav = {
    tab: state.tab,
    // Leaving a tab drops its one-shot file focus so a later visit starts where the reviewer left.
    setTab: (tab) => setState((current) => ({ ...current, tab, focusedFile: null })),
    focusedFile: state.focusedFile,
    openFile: (path, line, side) =>
      setState((current) => ({
        ...current,
        tab: "changes",
        // A file link means the whole review, not the commit being viewed.
        commitScope: null,
        focusedFile: {
          path,
          ...(line !== undefined ? { line } : {}),
          ...(side !== undefined ? { side } : {}),
        },
      })),
    commitScope: state.commitScope,
    setCommitScope: (commitScope) => setState((current) => ({ ...current, commitScope })),
    titleEditing: state.titleEditing,
    setTitleEditing: (titleEditing) => setState((current) => ({ ...current, titleEditing })),
  };
  return <PrDetailNavContext.Provider value={value}>{props.children}</PrDetailNavContext.Provider>;
}

export function usePrDetailNav(): PrDetailNav {
  const nav = useContext(PrDetailNavContext);
  if (!nav) throw new Error("usePrDetailNav must be used inside the pull-request overlay");
  return nav;
}
