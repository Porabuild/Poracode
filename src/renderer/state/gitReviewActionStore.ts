import { create } from "zustand";

/**
 * Per-(project, worktree) working state for the git review panel: in-progress
 * drafts (commit message, PR title/body/target) and the in-flight flags for
 * every async action the panel can run (generate, commit, sync, merge, pull,
 * create PR).
 *
 * Lives in a module-level store — NOT component `useState` — so it survives
 * the panel unmounting and remounting when the user switches projects. The
 * panel is keyed by `${projectId}:${worktreePath}` (see AppOverlays /
 * GitReviewPanelContent), so switching away and back fully remounts the
 * subtree; local state there would reset to empty. Because every action
 * (commit, push, merge, and especially the long-running generate/PR-summary
 * supervisor calls) keeps running across that remount, its pending flag and
 * any result must live somewhere that outlives the component. Routing all of
 * it through this store — keyed by the same `storeKey` the panel uses
 * (`statusKey ?? project.id`) — means spinners reappear on return and async
 * results land against the right panel even if it unmounted mid-flight,
 * instead of resolving into a dead component instance.
 *
 * Intentionally in-memory only (no localStorage): an in-flight flag must not
 * survive an app restart, or an action killed with the process would leave its
 * spinner stuck on forever.
 */
/**
 * Provenance of an AI-generated draft, kept alongside the draft text so a
 * later commit/PR that uses it is attributed to the right provider/model even
 * when the user pressed "Generate" explicitly (which fills the draft, so the
 * commit/PR code path sees a non-empty field and skips its inline-generate
 * branch). `text` is the exact generated string, matched against the final
 * value to confirm the AI draft actually survived to the action.
 */
export interface GeneratedDraftMeta {
  text: string;
  provider: string;
  model: string;
}

export interface GitReviewActionState {
  /** Draft commit message — typed by the user or filled in by generation. */
  commitMessage: string;
  /** Last Git merge-message template observed for this panel. */
  mergeMessageTemplate: string | null;
  /** Provenance of the last AI-generated commit message (null once consumed/replaced). */
  commitGen: GeneratedDraftMeta | null;
  /** Draft PR title. */
  prTitle: string;
  /** Draft PR body. */
  prBody: string;
  /** Provenance of the last AI-generated PR summary (matched on title). */
  prGen: GeneratedDraftMeta | null;
  /** Draft PR target branch (null = use the resolved source branch). */
  prTargetBranch: string | null;
  /** A commit-message generation is in flight (supervisor one-shot LLM call). */
  isGenerating: boolean;
  /** A PR-summary generation is in flight. */
  isGeneratingPr: boolean;
  /** A commit (and optional push) is in flight. */
  isCommitting: boolean;
  /** A push/sync/pull is in flight. */
  isSyncing: boolean;
  /** A worktree merge is in flight. */
  isMerging: boolean;
  /** A pull-from-source is in flight. */
  isPullingFromSource: boolean;
  /** A merge abort is in flight. */
  isAbortingMerge: boolean;
  /** A merge finish (commit) is in flight. */
  isFinishingMerge: boolean;
  /** A PR creation is in flight. */
  isCreatingPr: boolean;
}

/** Stable default returned for panels with no state yet — never mutate. */
const EMPTY_STATE: GitReviewActionState = Object.freeze({
  commitMessage: "",
  mergeMessageTemplate: null,
  commitGen: null,
  prTitle: "",
  prBody: "",
  prGen: null,
  prTargetBranch: null,
  isGenerating: false,
  isGeneratingPr: false,
  isCommitting: false,
  isSyncing: false,
  isMerging: false,
  isPullingFromSource: false,
  isAbortingMerge: false,
  isFinishingMerge: false,
  isCreatingPr: false,
});

interface GitReviewActionStore {
  panels: Record<string, GitReviewActionState>;
  /** Merge `patch` into the state for `key`; no-op writes are skipped. */
  patch: (key: string, patch: Partial<GitReviewActionState>) => void;
}

export const useGitReviewActionStore = create<GitReviewActionStore>((set, get) => ({
  panels: {},
  patch: (key, patch) => {
    const current = get().panels[key] ?? EMPTY_STATE;
    const keys = Object.keys(patch) as (keyof GitReviewActionState)[];
    if (keys.every((k) => current[k] === patch[k])) return;
    set((state) => ({
      panels: { ...state.panels, [key]: { ...current, ...patch } },
    }));
  },
}));

/**
 * Reactive read of a single panel's state. Returns a stable empty default when
 * the panel has no state yet, so an absent key never triggers re-render churn.
 */
export function useGitReviewActionState(key: string): GitReviewActionState {
  return useGitReviewActionStore((s) => s.panels[key] ?? EMPTY_STATE);
}
