import { useEffect, useState } from "react";
import {
  Archive,
  GitBranch,
  Maximize2,
  PanelRightClose,
  RefreshCw,
  Trash2,
  WrapText,
} from "lucide-react";
import { toast, Tooltip } from "@heroui/react";
import type { Project, ProjectLocation, GitStatusResult } from "@/shared/contracts";
import { friendlyError } from "@/shared/messages";
import { readBridge } from "@/renderer/bridge";
import { useGitStore } from "@/renderer/state/gitStore";
import {
  mightBeGitHubRemote,
  refreshGitProject,
  refreshSinglePr,
} from "@/renderer/state/gitRefresh";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { BranchSelector } from "@/renderer/components/common";
import { overlaySidebarSurfaceClass } from "@/renderer/components/layout/sidebarChrome";
import { SidebarContext } from "@/renderer/views/MainView/parts/AppShell/AppShell";
import { GitReviewSidebar } from "./GitReviewSidebar/GitReviewSidebar";
import { addGitRemote, initGitRepository } from "./initGitRepository";

const alwaysExpanded = {
  isCollapsed: false,
  isOverlay: false,
  closingOverlay: false,
  collapse: () => {},
  expand: () => {},
};

export function GitReviewPanel(props: {
  project: Project;
  locationOverride?: ProjectLocation;
  statusKey?: string;
  worktreeBranch?: string | undefined;
  worktreePath?: string | undefined;
  onMergeAndRemove?: (() => void) | undefined;
  onRemove?: (() => void) | undefined;
  onExpandToOverlay: () => void;
  onClose: () => void;
  hideHeader?: boolean;
}) {
  const {
    project,
    locationOverride,
    statusKey,
    worktreeBranch,
    worktreePath,
    onMergeAndRemove,
    onRemove,
    onExpandToOverlay,
    onClose,
    hideHeader,
  } = props;
  const threadRemoveAction = useSharedSettings((s) => s.threadRemoveAction);
  const effectiveLocation = locationOverride ?? project.location;
  const effectiveProject = locationOverride ? { ...project, location: effectiveLocation } : project;
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [selectedStaged, setSelectedStaged] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [wrapLines, setWrapLines] = useState(false);
  const gitStatus = useGitStore((s) =>
    statusKey ? s.worktreeStatuses[statusKey] : s.statuses[project.id],
  ) as GitStatusResult | undefined;

  async function fetchStatus() {
    setRefreshing(true);
    try {
      const status = await readBridge().getGitStatus({
        projectLocation: effectiveLocation,
      });
      if (statusKey) {
        useGitStore.getState().setWorktreeStatus(statusKey, status);
      } else {
        useGitStore.getState().setStatus(project.id, status);
      }
    } catch {
      // ignore
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    if (gitStatus && gitStatus.detail !== "summary") return;
    void fetchStatus();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- one-shot on mount

  function handleSelectFile(path: string | null, staged: boolean) {
    setSelectedFile(path);
    setSelectedStaged(staged);
  }

  // Refetch the worktree's PR (data + details) into `prData[worktreePath]` so the
  // PR block's merge state / checks update on manual refresh — otherwise the only
  // worktree PR refetch is the background poll, which fires only while checks are
  // still pending. Gated on gh availability + a GitHub-ish remote so non-GitHub
  // repos skip the `gh pr list` spawn. Hits the main project location, so it's
  // independent of the worktree status fetch and can overlap it.
  async function refreshWorktreePrData() {
    if (!worktreePath || !worktreeBranch) return;
    const gitState = useGitStore.getState();
    if (!gitState.ghAvailable[project.id]) return;
    if (!mightBeGitHubRemote(gitState.statuses[project.id]?.remoteInfo?.platform)) return;
    const prNumber = gitState.prData[worktreePath]?.number;
    await refreshSinglePr({
      projectLocation: project.location,
      prKey: worktreePath,
      branch: worktreeBranch,
      ...(prNumber ? { prNumber, detailsCacheKey: `${project.id}#${prNumber}` } : {}),
    });
  }

  async function handleRefresh() {
    setRefreshing(true);
    try {
      if (statusKey && effectiveLocation !== project.location) {
        const prRefresh = refreshWorktreePrData();
        await readBridge()
          .gitFetch({ projectLocation: effectiveLocation, remote: "origin", prune: false })
          .catch(() => undefined);
        const status = await readBridge()
          .getGitStatus({ projectLocation: effectiveLocation })
          .catch(() => undefined);
        if (status) useGitStore.getState().setWorktreeStatus(statusKey, status);
        await prRefresh;
        return;
      }
      // Manual refresh runs a full sync: git fetch + snapshot (status,
      // branches, worktrees, gh check) + per-worktree status + source-branch
      // info + PR data. Matches the periodic fetchRemotes path in
      // useGitRefresh so the button surface and the background loop converge
      // on the same state.
      await refreshGitProject({ id: project.id, location: project.location }, "manual", "full", {
        fetchRemote: true,
      });
    } finally {
      setRefreshing(false);
      setRefreshKey((k) => k + 1);
    }
  }

  function handleSwitchBranch(branch: string, createNew: boolean) {
    readBridge()
      .gitSwitchBranch({
        projectLocation: effectiveLocation,
        branch,
        createNew,
      })
      .then((result) => {
        const store = useGitStore.getState();
        const status = store.statuses[project.id];
        if (status) {
          store.setStatus(project.id, {
            ...status,
            branch: result.branch,
            tracking: result.tracking,
            ahead: result.ahead,
            behind: result.behind,
          });
        }
      })
      .catch((err: unknown) => {
        console.error("[git] switch branch failed", err);
        toast.danger(friendlyError(err));
      });
  }

  return (
    <SidebarContext.Provider value={alwaysExpanded}>
      <div
        className={`flex h-full min-h-0 flex-col ${hideHeader ? overlaySidebarSurfaceClass : ""}`}
      >
        {/* Header — full when standalone, slim git-actions-only bar when parent provides its own header */}
        {hideHeader ? (
          <div className="flex h-7 shrink-0 items-center gap-1.5 border-b border-[color:var(--border)] pl-1.5 pr-3 text-xs leading-tight">
            {gitStatus?.branch ? (
              <>
                {statusKey ? (
                  <div className="flex min-w-0 flex-1 items-center gap-1.5">
                    <GitBranch className="size-3 shrink-0 text-muted/50" />
                    <Tooltip delay={300}>
                      <Tooltip.Trigger className="min-w-0 flex-1" tabIndex={-1} role="none">
                        <span className="block truncate text-muted">{gitStatus.branch}</span>
                      </Tooltip.Trigger>
                      <Tooltip.Content placement="bottom">{gitStatus.branch}</Tooltip.Content>
                    </Tooltip>
                  </div>
                ) : (
                  <BranchSelector
                    className="min-w-0 flex-1"
                    projectId={project.id}
                    currentBranch={gitStatus.branch}
                    value={gitStatus.branch}
                    onSwitchBranch={handleSwitchBranch}
                    hideWorktreeToggle
                    showMoveBranchAction
                    {...(project.scripts?.worktreeCopyPatterns
                      ? { moveBranchCopyIgnoredPatterns: project.scripts.worktreeCopyPatterns }
                      : {})}
                    popoverPlacement="bottom"
                    trigger={
                      <button
                        type="button"
                        className="flex min-w-0 flex-1 cursor-pointer items-center gap-1 rounded px-1.5 py-1 hover:bg-foreground/5"
                        aria-label="Switch branch"
                      >
                        <GitBranch className="size-3 shrink-0 text-muted/50" />
                        <span className="block flex-1 truncate text-left text-muted">
                          {gitStatus.branch}
                        </span>
                      </button>
                    }
                  />
                )}
                {((gitStatus.behind ?? 0) > 0 || (gitStatus.ahead ?? 0) > 0) && (
                  <span className="shrink-0 text-muted/50">
                    ↓{gitStatus.behind ?? 0} ↑{gitStatus.ahead ?? 0}
                  </span>
                )}
              </>
            ) : (
              <div className="flex-1" />
            )}
            {onRemove && (
              <button
                type="button"
                className={`rounded p-1 text-muted transition-colors ${threadRemoveAction === "archive" ? "hover:bg-warning/10 hover:text-warning" : "hover:bg-danger/10 hover:text-danger"}`}
                title={threadRemoveAction === "archive" ? "Archive" : "Delete"}
                onClick={onRemove}
              >
                {threadRemoveAction === "archive" ? (
                  <Archive className="size-3" />
                ) : (
                  <Trash2 className="size-3" />
                )}
              </button>
            )}
            <button
              type="button"
              className={`rounded p-1 transition-colors hover:bg-[var(--row-hover)] hover:text-foreground ${wrapLines ? "text-foreground" : "text-muted"}`}
              title={wrapLines ? "No wrap" : "Wrap lines"}
              onClick={() => setWrapLines((v) => !v)}
            >
              <WrapText className="size-3" />
            </button>
            <button
              type="button"
              className="rounded p-1 text-muted transition-colors hover:bg-[var(--row-hover)] hover:text-foreground"
              title="Refresh"
              onClick={() => void handleRefresh()}
            >
              <RefreshCw className={`size-3 ${refreshing ? "animate-spin" : ""}`} />
            </button>
          </div>
        ) : (
          <div className="flex h-7 shrink-0 items-center gap-1.5 border-b border-[color:var(--border)] px-3 text-xs leading-tight">
            <div className="min-w-0">
              <Tooltip delay={300}>
                <Tooltip.Trigger tabIndex={-1} role="none">
                  <div className="max-w-[100px] truncate font-medium text-foreground">
                    {project.name}
                  </div>
                </Tooltip.Trigger>
                <Tooltip.Content placement="bottom">{project.name}</Tooltip.Content>
              </Tooltip>
            </div>
            {gitStatus?.branch && (
              <>
                {statusKey ? (
                  <>
                    <GitBranch className="ml-1 size-3 shrink-0 text-muted/50" />
                    <div className="min-w-0">
                      <Tooltip delay={300}>
                        <Tooltip.Trigger tabIndex={-1} role="none">
                          <div className="max-w-[100px] truncate text-muted">
                            {gitStatus.branch}
                          </div>
                        </Tooltip.Trigger>
                        <Tooltip.Content placement="bottom">{gitStatus.branch}</Tooltip.Content>
                      </Tooltip>
                    </div>
                  </>
                ) : (
                  <BranchSelector
                    className="min-w-0 flex-1"
                    projectId={project.id}
                    currentBranch={gitStatus.branch}
                    value={gitStatus.branch}
                    onSwitchBranch={handleSwitchBranch}
                    hideWorktreeToggle
                    showMoveBranchAction
                    {...(project.scripts?.worktreeCopyPatterns
                      ? { moveBranchCopyIgnoredPatterns: project.scripts.worktreeCopyPatterns }
                      : {})}
                    popoverPlacement="bottom"
                    trigger={
                      <button
                        type="button"
                        className="ml-1 flex min-w-0 cursor-pointer items-center gap-1 rounded px-1.5 hover:bg-foreground/5"
                        aria-label="Switch branch"
                      >
                        <GitBranch className="size-3 shrink-0 text-muted/50" />
                        <span className="max-w-[200px] truncate text-muted">
                          {gitStatus.branch}
                        </span>
                      </button>
                    }
                  />
                )}
                {((gitStatus.behind ?? 0) > 0 || (gitStatus.ahead ?? 0) > 0) && (
                  <span className="shrink-0 text-muted/50">
                    ↓{gitStatus.behind ?? 0} ↑{gitStatus.ahead ?? 0}
                  </span>
                )}
              </>
            )}
            <div className="flex-1" />
            {onRemove && (
              <button
                type="button"
                className={`rounded p-0.5 text-muted transition-colors ${threadRemoveAction === "archive" ? "hover:bg-warning/10 hover:text-warning" : "hover:bg-danger/10 hover:text-danger"}`}
                title={threadRemoveAction === "archive" ? "Archive" : "Delete"}
                onClick={onRemove}
              >
                {threadRemoveAction === "archive" ? (
                  <Archive className="size-3" />
                ) : (
                  <Trash2 className="size-3" />
                )}
              </button>
            )}
            <button
              type="button"
              className={`rounded p-0.5 transition-colors hover:bg-[var(--row-hover)] hover:text-foreground ${wrapLines ? "text-foreground" : "text-muted"}`}
              title={wrapLines ? "No wrap" : "Wrap lines"}
              onClick={() => setWrapLines((v) => !v)}
            >
              <WrapText className="size-3" />
            </button>
            <button
              type="button"
              className="rounded p-0.5 text-muted transition-colors hover:bg-[var(--row-hover)] hover:text-foreground"
              title="Refresh"
              onClick={() => void handleRefresh()}
            >
              <RefreshCw className={`size-3 ${refreshing ? "animate-spin" : ""}`} />
            </button>
            <button
              type="button"
              className="rounded p-0.5 text-muted transition-colors hover:bg-[var(--row-hover)] hover:text-foreground"
              title="Open as page"
              onClick={onExpandToOverlay}
            >
              <Maximize2 className="size-3" />
            </button>
            <button
              type="button"
              className="rounded p-0.5 text-muted transition-colors hover:bg-[var(--row-hover)] hover:text-foreground"
              title="Hide"
              onClick={onClose}
            >
              <PanelRightClose className="size-3" />
            </button>
          </div>
        )}

        {/* Sidebar content */}
        <div className="min-h-0 flex-1 overflow-hidden">
          <GitReviewSidebar
            project={effectiveProject}
            gitStatus={gitStatus}
            selectedFile={selectedFile}
            selectedStaged={selectedStaged}
            worktreeBranch={worktreeBranch}
            worktreePath={worktreePath}
            onMergeAndRemove={onMergeAndRemove}
            onSelectFile={handleSelectFile}
            onClose={onClose}
            refreshKey={refreshKey}
            onRefresh={() => void handleRefresh()}
            onInitRepository={() =>
              void initGitRepository({
                project,
                effectiveLocation,
                statusKey,
                setRefreshing,
                bumpRefreshKey: () => setRefreshKey((k) => k + 1),
              })
            }
            onAddRemote={(remote, url) =>
              addGitRemote({
                project,
                effectiveLocation,
                statusKey,
                remote,
                url,
                setRefreshing,
                bumpRefreshKey: () => setRefreshKey((k) => k + 1),
              })
            }
            statusKey={statusKey}
            mode="panel"
            wrapLines={wrapLines}
          />
        </div>
      </div>
    </SidebarContext.Provider>
  );
}
