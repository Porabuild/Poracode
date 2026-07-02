import { useState } from "react";
import { toast } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { useNavigate } from "@tanstack/react-router";
import { ChevronLeft, FolderTree, GitBranch, RefreshCw } from "lucide-react";
import { friendlyError } from "@/shared/messages";
import { readBridge } from "@/renderer/bridge";
import { BranchSelector, type BranchSelection } from "@/renderer/components/common";
import { useGitStore } from "@/renderer/state/gitStore";
import { buildBranchNamePrKey } from "@/renderer/state/gitSelectors";
import type { ConflictResolverLaunchInput } from "@/renderer/views/GitReviewOverlay/parts/GitReviewSidebar/parts/useConflictResolver";
import { FilesView, type FilesTarget } from "./FilesView";
import { GitView, useGitTargetStatus, type GitTarget } from "./GitView";

export type WorkspaceTab = "changes" | "files";

interface WorkspaceTabState {
  readonly refreshSignal: number;
  readonly refreshing: boolean;
  readonly immersive: boolean;
}

const EMPTY_TAB_STATE: WorkspaceTabState = {
  refreshSignal: 0,
  refreshing: false,
  immersive: false,
};

/**
 * The unified fullscreen "Code" panel for the PWA: one screen that folds the
 * former separate Git and Files panels into a single shell with a
 * `Changes | Files` segmented control. Both tabs stay mounted so switching is
 * instant and preserves each tab's state (an open diff, an edited file); the
 * inactive one is hidden rather than unmounted. A shared header owns the branch
 * line, refresh and back; the active pane drives them through callbacks and
 * goes immersive (header + segmented hidden) while a diff or editor is open.
 */
export function WorkspaceView(props: {
  readonly gitTarget: GitTarget | null;
  readonly filesTarget: FilesTarget;
  readonly initialTab: WorkspaceTab;
  readonly initialFilePath?: string | undefined;
  readonly initialFolderPath?: string | undefined;
  readonly initialLineNumber?: number | undefined;
  readonly onClose: () => void;
  readonly onOpenWorktreeBranch?:
    | ((input: { readonly worktreePath: string; readonly worktreeBranch: string }) => void)
    | undefined;
  readonly onLaunchConflictResolverThread?:
    | ((input: ConflictResolverLaunchInput) => void)
    | undefined;
}) {
  const { t } = useLingui();
  const navigate = useNavigate();
  const { gitTarget, filesTarget } = props;
  const showChanges = gitTarget !== null;

  // Tab is derived (not seeded once into state): the git summary may resolve a
  // beat after mount, flipping a thread from Files-only to having a Changes tab.
  // Deriving lets the deep-linked initialTab take effect when that happens,
  // while an explicit user pick (userTab) still wins thereafter.
  const [userTab, setUserTab] = useState<WorkspaceTab | null>(null);
  const tab: WorkspaceTab = userTab ?? (showChanges ? props.initialTab : "files");
  const [tabState, setTabState] = useState<Record<WorkspaceTab, WorkspaceTabState>>({
    changes: EMPTY_TAB_STATE,
    files: EMPTY_TAB_STATE,
  });
  const [fileOpenRequest, setFileOpenRequest] = useState<{
    readonly path: string;
    readonly nonce: number;
  } | null>(null);

  const onChanges = tab === "changes" && showChanges;
  const activeTabKey: WorkspaceTab = onChanges ? "changes" : "files";
  const immersive = tabState[activeTabKey].immersive;
  const refreshing = tabState[activeTabKey].refreshing;

  function updateTab(key: WorkspaceTab, patch: Partial<WorkspaceTabState>) {
    setTabState((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  }
  const filesInitialPath = fileOpenRequest?.path ?? props.initialFilePath;
  const filesInitialLineNumber = fileOpenRequest ? undefined : props.initialLineNumber;

  const gitStatus = useGitTargetStatus(gitTarget);

  const branch =
    gitStatus?.branch ||
    gitTarget?.worktreeBranch ||
    gitTarget?.project.name ||
    filesTarget.rootLabel;
  const ahead = gitStatus?.ahead ?? 0;
  const behind = gitStatus?.behind ?? 0;

  function refresh() {
    setTabState((prev) => ({
      ...prev,
      [activeTabKey]: {
        ...prev[activeTabKey],
        refreshSignal: prev[activeTabKey].refreshSignal + 1,
      },
    }));
  }

  function openFileFromGit(path: string) {
    setFileOpenRequest((current) => ({ path, nonce: (current?.nonce ?? 0) + 1 }));
    setUserTab("files");
  }

  function openPrReview(args: {
    readonly branch: string;
    readonly prNumber: number;
    readonly worktreePath?: string | undefined;
  }): void {
    if (!gitTarget) return;
    void navigate({
      to: "/pr/$prNumber",
      params: { prNumber: String(args.prNumber) },
      search: {
        project: gitTarget.project.id,
        ...(args.worktreePath
          ? { worktree: args.worktreePath }
          : { prKey: buildBranchNamePrKey(gitTarget.project.id, args.branch) }),
      },
    });
  }

  async function switchBranch(branchName: string, createNew: boolean) {
    if (!gitTarget || gitTarget.statusKey) return;
    const { project } = gitTarget;
    const projectLocation = gitTarget.locationOverride ?? project.location;
    try {
      const bridge = readBridge();
      const result = await bridge.gitSwitchBranch({
        projectLocation,
        branch: branchName,
        createNew,
      });
      const [status, snapshot] = await Promise.all([
        bridge.getGitStatus({ projectLocation }).catch(() => undefined),
        bridge
          .gitProjectSnapshot({
            projectLocation: project.location,
            includeGhCheck: true,
          })
          .catch(() => undefined),
      ]);
      const store = useGitStore.getState();
      if (snapshot) {
        store.setProjectSnapshot(project.id, {
          ...(snapshot.status ? { status: snapshot.status } : {}),
          ...(snapshot.branches ? { branches: snapshot.branches } : {}),
          ...(snapshot.worktrees ? { worktrees: snapshot.worktrees } : {}),
          ...(snapshot.ghAvailable !== null ? { ghAvailable: snapshot.ghAvailable } : {}),
        });
      }
      if (status) {
        store.setStatus(project.id, status);
        return;
      }
      const previous = store.statuses[project.id] ?? gitStatus;
      if (previous) {
        store.setStatus(project.id, {
          ...previous,
          branch: result.branch,
          tracking: result.tracking,
          ahead: result.ahead,
          behind: result.behind,
        });
      }
    } catch (error) {
      console.error("[mobile git] switch branch failed", error);
      toast.danger(friendlyError(error));
    }
  }

  function selectBranch(selection: BranchSelection): void {
    if (!selection.isWorktree || !selection.worktreePath) return;
    props.onOpenWorktreeBranch?.({
      worktreePath: selection.worktreePath,
      worktreeBranch: selection.branch,
    });
  }

  return (
    <section className="m-workspace">
      {immersive ? null : (
        <>
          <header className="m-git-head">
            <button className="m-back" type="button" aria-label={t`Back`} onClick={props.onClose}>
              <ChevronLeft className="size-5" />
            </button>
            <span className="m-git-head__title">
              {onChanges && gitTarget && !gitTarget.statusKey && gitStatus?.branch ? (
                <BranchSelector
                  className="m-git-head__branch-selector"
                  projectId={gitTarget.project.id}
                  currentBranch={gitStatus.branch}
                  value={gitStatus.branch}
                  onSwitchBranch={(branchName, createNew) => {
                    void switchBranch(branchName, createNew);
                  }}
                  onSelect={selectBranch}
                  onOpenPrReview={openPrReview}
                  hideWorktreeToggle
                  popoverPlacement="bottom"
                  trigger={
                    <button
                      type="button"
                      className="m-git-head__branch-trigger"
                      aria-label={t`Switch branch`}
                    >
                      <GitBranch className="size-3.5 shrink-0 text-muted/60" />
                      <span className="m-git-head__branch">{gitStatus.branch}</span>
                    </button>
                  }
                />
              ) : onChanges ? (
                <>
                  <GitBranch className="size-3.5 shrink-0 text-muted/60" />
                  <span className="m-git-head__branch">{branch}</span>
                  {ahead > 0 || behind > 0 ? (
                    <span className="shrink-0 text-xs text-muted/70">
                      {ahead > 0 ? `↑${ahead}` : ""}
                      {behind > 0 ? ` ↓${behind}` : ""}
                    </span>
                  ) : null}
                </>
              ) : (
                <>
                  <FolderTree className="size-3.5 shrink-0 text-muted/60" />
                  <span className="m-git-head__branch">{filesTarget.rootLabel}</span>
                </>
              )}
            </span>
            <span className="m-git-head__actions">
              <button
                type="button"
                className="m-git-head__btn"
                aria-label={t`Refresh`}
                disabled={refreshing}
                onClick={refresh}
              >
                <RefreshCw className={`size-4 ${refreshing ? "m-spin" : ""}`} />
              </button>
            </span>
          </header>

          {showChanges ? (
            <div className="m-seg" role="tablist" aria-label={t`Workspace view`}>
              <button
                type="button"
                role="tab"
                className="m-seg__btn"
                data-active={tab === "changes" || undefined}
                aria-selected={tab === "changes"}
                onClick={() => setUserTab("changes")}
              >
                {t`Changes`}
              </button>
              <button
                type="button"
                role="tab"
                className="m-seg__btn"
                data-active={tab === "files" || undefined}
                aria-selected={tab === "files"}
                onClick={() => setUserTab("files")}
              >
                {t`Files`}
              </button>
            </div>
          ) : null}
        </>
      )}

      <div className="m-workspace__body">
        {gitTarget ? (
          <div className={onChanges ? "m-ws-tab" : "m-ws-tab m-ws-tab--hidden"}>
            <GitView
              target={gitTarget}
              onClose={props.onClose}
              refreshSignal={tabState.changes.refreshSignal}
              onRefreshingChange={(value) => updateTab("changes", { refreshing: value })}
              onImmersiveChange={(value) => updateTab("changes", { immersive: value })}
              onOpenFile={openFileFromGit}
              onLaunchConflictResolverThread={props.onLaunchConflictResolverThread}
            />
          </div>
        ) : null}
        <div className={!onChanges ? "m-ws-tab" : "m-ws-tab m-ws-tab--hidden"}>
          <FilesView
            target={filesTarget}
            refreshSignal={tabState.files.refreshSignal}
            {...(filesInitialPath ? { initialFilePath: filesInitialPath } : {})}
            {...(props.initialFolderPath ? { initialFolderPath: props.initialFolderPath } : {})}
            {...(filesInitialLineNumber ? { initialLineNumber: filesInitialLineNumber } : {})}
            {...(fileOpenRequest ? { initialOpenKey: `git:${fileOpenRequest.nonce}` } : {})}
            onRefreshingChange={(value) => updateTab("files", { refreshing: value })}
            onImmersiveChange={(value) => updateTab("files", { immersive: value })}
          />
        </div>
      </div>
    </section>
  );
}
