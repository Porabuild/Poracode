import { useEffect, useEffectEvent } from "react";
import { useLingui } from "@lingui/react/macro";
import type { PrFile, Project, ProjectLocation } from "@/shared/contracts";
import { splitUnifiedDiff, viewedFingerprint } from "@/shared/reviewDiff";
import { usePrWriteActions } from "@/renderer/hooks/usePrWriteActions";
import { resolvePrKey } from "@/renderer/state/gitSelectors";
import { useGitStore } from "@/renderer/state/gitStore";
import { usePanelStore } from "@/renderer/state/panelStore";
import { scopedReviewSource, reviewViewedScope } from "@/renderer/utils/forgeReviews";
import { useSyncedPrViewedFiles } from "../viewed/useSyncedPrViewedFiles";
import type { PrDetailScope } from "./prDetailScope";
import { usePrReviewData } from "./usePrReviewData";
import { isWorktreeMissing } from "./worktreePresence";

/** Location used while no review is selected; nothing is ever requested with it. */
const INERT_LOCATION: ProjectLocation = { kind: "posix", path: "/" };

export interface PrSelection {
  project: Project;
  prNumber: number;
  /** `gitStore.prData` key the row data is stored under. */
  prKey: string;
  /** Local checkout of the head branch, when one exists. */
  worktreePath?: string | undefined;
  skipLocalSync?: boolean | undefined;
}

/**
 * Everything the detail pane shares: the loaded review, its write actions and
 * its synced viewed marks. Called unconditionally by the overlay shell (the
 * list beside it must stay mounted while the selection changes), so a missing
 * selection yields `null` and loads nothing.
 */
export function usePrDetailModel(
  selection: PrSelection | null,
  onClose: () => void,
): PrDetailScope | null {
  const { t } = useLingui();
  const project = selection?.project;
  const projectId = project?.id ?? "";
  const prNumber = selection?.prNumber ?? 0;
  const prKey = selection?.prKey ?? "";
  // A worktree removed outside the app leaves its path in the selection; it is dropped
  // once the project's worktree list no longer has it.
  const worktreeMissing = useGitStore((s) =>
    isWorktreeMissing(selection?.worktreePath, s.worktrees[projectId]),
  );
  const worktreePath = worktreeMissing ? undefined : selection?.worktreePath;
  // Every request about the review is addressed to the project, never to the checkout:
  // forge reads and writes are repository-wide, and the host only accepts registered
  // project locations and the worktrees of their threads. A worktree made by "Check out
  // in a new worktree" has no thread, so reading through it is refused (HTTP 403), and
  // one removed outside the app fails the read outright.
  const location: ProjectLocation = project?.location ?? INERT_LOCATION;
  const forgetMissingWorktree = useEffectEvent(() => {
    const panel = usePanelStore.getState();
    const context = panel.prReviewContext;
    if (!context?.worktreePath || context.projectId !== projectId || context.prNumber !== prNumber)
      return;
    // The row key was derived from the path; keep it so the review's data stays found.
    panel.setPrReviewContext({
      projectId: context.projectId,
      prNumber: context.prNumber,
      prKey: context.prKey ?? resolvePrKey(context.projectId, context.worktreePath),
      ...(context.skipLocalSync ? { skipLocalSync: true } : {}),
    });
  });
  useEffect(() => {
    if (worktreeMissing) forgetMissingWorktree();
  }, [worktreeMissing]);
  const data = usePrReviewData({
    projectId,
    prKey,
    prNumber,
    location,
    enabled: selection !== null,
  });
  const { source, cacheKey, cacheMatchesSource, reload } = data;

  const viewed = useSyncedPrViewedFiles(
    reviewViewedScope(source, projectId, prNumber),
    selection && source?.capabilities.viewedFiles && source.account
      ? {
          projectLocation: location,
          prNumber,
          forgeAccount: source.account,
          forgeRepository: source.repository,
        }
      : undefined,
  );
  // A fresh load also refetches the forge's viewed marks.
  const reloadWithViewed = () => {
    void viewed.refresh();
    reload();
  };

  const actions = usePrWriteActions({
    projectLocation: location,
    projectId,
    prKey: selection ? prKey : undefined,
    ...(selection?.skipLocalSync ? { skipLocalSync: true } : {}),
    onRefresh: reloadWithViewed,
  });

  const files = useGitStore((s) => s.prFiles[cacheKey]);
  const rawDiff = useGitStore((s) => s.prDiffs[cacheKey]);
  const refreshViewed = useEffectEvent(() => {
    void viewed.refresh();
  });
  const absorbViewed = useEffectEvent((marks: { path: string; fingerprint: string }[]) => {
    viewed.absorb?.(marks);
  });
  useEffect(() => {
    if (!selection || !cacheMatchesSource || !files) return;
    const loaded = splitUnifiedDiff(rawDiff ?? "");
    absorbViewed(
      files.map((file: PrFile) => ({
        path: file.path,
        fingerprint: viewedFingerprint(loaded.get(file.path), file),
      })),
    );
  }, [selection, cacheMatchesSource, files, rawDiff]);

  // Marks are read whenever a review opens or its head moves, like its content.
  const refreshKey = selection ? `${cacheKey}@${data.headSha ?? ""}@${data.browserOnline}` : null;
  useEffect(() => {
    if (refreshKey) refreshViewed();
  }, [refreshKey]);

  if (!selection || !project) return null;
  const scoped = scopedReviewSource(source);
  const viewedLabel =
    viewed.storage === "forge"
      ? t`Viewed on source host`
      : viewed.storage === "host"
        ? t`Viewed in Poracode`
        : t`Viewed here`;
  return {
    projectId,
    prKey,
    cacheKey,
    prNumber,
    location,
    worktreePath,
    source,
    scoped,
    headSha: data.headSha,
    loading: data.loading,
    contentReady: data.contentReady,
    loadError: data.loadError,
    draftKey: data.draftKey,
    readOnly: !data.reviewReady,
    cached: data.cached,
    reload: reloadWithViewed,
    onClose,
    actions,
    viewed,
    viewedLabel,
  };
}
