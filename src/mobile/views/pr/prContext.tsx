import { createContext, useContext } from "react";
import type { Project, ProjectLocation } from "@/shared/contracts";

/** PR sub-page = the four deep pages reachable from the PR overview. */
export type PrPageKey = "changes" | "commits" | "checks" | "conversation";

/**
 * Shared state for the routed PR review. The parent PR layout route loads the
 * PR once (files/diff/details into the git store under `cacheKey`) and exposes
 * it here so every deep page reads the same cache and shares navigation.
 */
export interface PrContextValue {
  readonly project: Project;
  readonly projectLocation: ProjectLocation;
  readonly worktreePath?: string;
  readonly prNumber: number;
  /** Key for the prData selectors (worktree path, else `__branch:<projectId>`). */
  readonly prKey: string;
  /** Key for the prFiles/prDiffs/prDetails cache (`<projectId>#<prNumber>`). */
  readonly cacheKey: string;
  readonly loading: boolean;
  readonly reload: () => void;
  /** Back to the PR overview (from a deep page). */
  readonly toOverview: () => void;
  /** Open one of the deep pages. */
  readonly toPage: (page: PrPageKey) => void;
  /** Leave PR review entirely (back to wherever it was opened from). */
  readonly close: () => void;
}

const PrContext = createContext<PrContextValue | null>(null);

export const PrContextProvider = PrContext.Provider;

export function usePr(): PrContextValue {
  const value = useContext(PrContext);
  if (!value) {
    throw new Error("usePr must be used within the PR layout route.");
  }
  return value;
}
