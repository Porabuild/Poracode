import { createContext, useContext } from "react";
import type { ForgeAccountRef, ForgeRepository, ProjectLocation } from "@/shared/contracts";
import type { UsePrWriteActionsResult } from "@/renderer/hooks/usePrWriteActions";
import type { useSyncedPrViewedFiles } from "../viewed/useSyncedPrViewedFiles";

/**
 * Identity and readiness of the review shown in the detail pane. Components read
 * review data from the git store by `prKey` / `cacheKey` with narrow selectors;
 * this scope only says which review that is and whether it may be changed.
 */
export interface PrDetailScope {
  projectId: string;
  /** `gitStore.prData` key (row-level state: title, state, head, source). */
  prKey: string;
  /** `gitStore.prDetails` / `prFiles` / `prDiffs` key. */
  cacheKey: string;
  prNumber: number;
  location: ProjectLocation;
  /** Local checkout of the head branch, when one exists. */
  worktreePath: string | undefined;
  source: ForgeRepository | undefined;
  /** The source when it has a pinned account, which every scoped operation needs. */
  scoped: (ForgeRepository & { account: ForgeAccountRef }) | undefined;
  headSha: string | undefined;
  loading: boolean;
  /** Content for the current head is on screen (possibly from the offline snapshot). */
  contentReady: boolean;
  /** The last load failed with a non-transport error; tabs can offer a retry. */
  loadError: string | null;
  /** Review-draft key: `cacheKey` qualified by the source identity. */
  draftKey: string;
  /** Offline, cached, or still loading: show the review but refuse every write. */
  readOnly: boolean;
  /** Content came from the browser's offline snapshot. */
  cached: boolean;
  reload: () => void;
  /** Leaves the overlay (compact back, "Return to app"). */
  onClose: () => void;
  /** Write actions bound to this review: merge, close, reopen, draft, update, edit. */
  actions: UsePrWriteActionsResult;
  /** Synced "viewed" marks for this review's files. */
  viewed: ReturnType<typeof useSyncedPrViewedFiles>;
  /** Label for where viewed marks live ("Viewed on source host", ...). */
  viewedLabel: string;
}

const PrDetailScopeContext = createContext<PrDetailScope | null>(null);
/** The value is `null` while the overlay shows only its list. */
export const PrDetailScopeProvider = PrDetailScopeContext.Provider;

export function usePrDetailScope(): PrDetailScope {
  const scope = useContext(PrDetailScopeContext);
  if (!scope) throw new Error("usePrDetailScope must be used inside the pull-request detail");
  return scope;
}
