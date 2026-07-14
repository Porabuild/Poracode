import { Suspense } from "react";
import { buildWorktreeLocation } from "@/shared/worktree";
import { useAppStore } from "@/renderer/state/appStore";
import { findExperimentByWorktree } from "@/renderer/state/experimentStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { PixelLoader } from "@/renderer/components/common/PixelLoader";
import { resolveWorktreeBranch } from "@/renderer/utils/gitHelpers";
import { closeThreads } from "@/renderer/utils/shellUtils";
import { archiveThread } from "@/renderer/actions/threadActions";
import { deleteWorktreeGroup, performWorktreeRemoval } from "@/renderer/actions/worktreeActions";
import { DeferredGitReviewPanel } from "@/renderer/deferredFeatures";

export function GitReviewPanelContent(props: {
  gitPanelContext: { projectId: string; worktreePath?: string | undefined } | null;
  onClose: () => void;
  onExpandToOverlay: () => void;
}) {
  const { gitPanelContext, onClose, onExpandToOverlay } = props;
  const project = useAppStore((s) =>
    gitPanelContext ? s.projects.find((p) => p.id === gitPanelContext.projectId) : undefined,
  );

  if (
    !gitPanelContext ||
    !project ||
    findExperimentByWorktree(gitPanelContext.projectId, gitPanelContext.worktreePath)
  ) {
    return undefined;
  }

  const gitReviewKey = `${gitPanelContext.projectId}:${gitPanelContext.worktreePath ?? ""}`;

  return (
    <Suspense
      fallback={
        <div className="flex h-full items-center justify-center">
          <PixelLoader size="md" />
        </div>
      }
    >
      <DeferredGitReviewPanel
        key={gitReviewKey}
        project={project}
        {...(gitPanelContext.worktreePath
          ? {
              locationOverride: buildWorktreeLocation(
                project.location,
                gitPanelContext.worktreePath,
              ),
              statusKey: gitPanelContext.worktreePath,
              worktreePath: gitPanelContext.worktreePath,
              worktreeBranch:
                resolveWorktreeBranch(gitPanelContext.projectId, gitPanelContext.worktreePath) ??
                undefined,
              onMergeAndRemove: () => {
                const allThreads = useAppStore.getState().threads;
                const wtPath = gitPanelContext!.worktreePath;
                const wtBranch = wtPath
                  ? resolveWorktreeBranch(gitPanelContext!.projectId, wtPath)
                  : undefined;
                onClose();
                if (project && wtPath) {
                  const siblings = allThreads.filter((t) => t.worktreePath === wtPath);
                  const deleteThreadStoreAction = useAppStore.getState().deleteThread;
                  for (const sib of siblings) {
                    deleteThreadStoreAction(sib.id);
                  }
                  void (async () => {
                    await closeThreads(siblings.map((sib) => sib.id));
                    await performWorktreeRemoval(project, wtPath, wtBranch);
                  })();
                }
              },
              onRemove: () => {
                const action = useSharedSettings.getState().threadRemoveAction;
                const wtPath = gitPanelContext!.worktreePath;
                const projectId = gitPanelContext!.projectId;
                onClose();
                if (!wtPath) return;
                const siblings = useAppStore
                  .getState()
                  .threads.filter((t) => t.worktreePath === wtPath);
                if (action === "archive") {
                  for (const sib of siblings) archiveThread(sib.id);
                } else {
                  deleteWorktreeGroup(
                    projectId,
                    wtPath,
                    siblings.map((s) => s.id),
                  );
                }
              },
            }
          : {})}
        onExpandToOverlay={onExpandToOverlay}
        onClose={onClose}
        hideHeader
      />
    </Suspense>
  );
}
