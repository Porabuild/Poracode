import { useEffect, useState } from "react";
import { ArrowLeft, ChevronDown, Columns2, GitBranch, RefreshCw, Rows2 } from "lucide-react";
import { Button, Dropdown, Label, toast, Tooltip } from "@heroui/react";
import type { Selection } from "@heroui/react";
import type { Project, ProjectLocation, GitStatusResult } from "@/shared/contracts";
import { friendlyError } from "@/shared/messages";
import { readBridge } from "@/renderer/bridge";
import { useGitStore } from "@/renderer/state/gitStore";
import { refreshGitProject } from "@/renderer/state/gitRefresh";
import { BranchSelector } from "@/renderer/components/common";
import { PageLayout } from "@/renderer/components/layout/PageLayout";
import { GitReviewSidebar } from "./parts/GitReviewSidebar/GitReviewSidebar";
import { GitDiffContent, type DiffFilter } from "./parts/GitDiffContent/GitDiffContent";
import { addGitRemote, initGitRepository } from "./parts/initGitRepository";

/** Matches DiffModeEnum values from @git-diff-view/react — kept local to avoid importing the heavy library. */
const DIFF_MODE = { Split: 1, Unified: 4 } as const;

export function GitReviewOverlay(props: {
  project: Project;
  locationOverride?: ProjectLocation;
  statusKey?: string;
  worktreeBranch?: string | undefined;
  worktreePath?: string | undefined;
  onMergeAndRemove?: (() => void) | undefined;
  onClose: () => void;
}) {
  const {
    project,
    locationOverride,
    statusKey,
    worktreeBranch,
    worktreePath,
    onMergeAndRemove,
    onClose,
  } = props;
  const effectiveLocation = locationOverride ?? project.location;
  // Create a project view with the effective location so child components
  // (GitReviewSidebar, GitDiffContent) use the right path for IPC calls.
  const effectiveProject = locationOverride ? { ...project, location: effectiveLocation } : project;
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [selectedStaged, setSelectedStaged] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [diffMode, setDiffMode] = useState<number>(DIFF_MODE.Split);
  const [diffFilter, setDiffFilter] = useState<DiffFilter>("changes");
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

  // Eagerly fetch status on mount when it's not yet in the store
  // (e.g. worktree was just created and the poll cycle hasn't run yet)
  useEffect(() => {
    if (gitStatus && gitStatus.detail !== "summary") return;
    void fetchStatus();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- one-shot on mount

  // Auto-switch when the current view becomes empty but the other has files
  useEffect(() => {
    if (!gitStatus) return;
    if (
      diffFilter === "changes" &&
      gitStatus.unstaged.length === 0 &&
      gitStatus.staged.length > 0
    ) {
      setDiffFilter("staged");
    }
    if (diffFilter === "staged" && gitStatus.staged.length === 0 && gitStatus.unstaged.length > 0) {
      setDiffFilter("changes");
    }
  }, [gitStatus, diffFilter]);

  function handleSelectFile(path: string | null, staged: boolean) {
    setSelectedFile(path);
    setSelectedStaged(staged);
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

  async function handleRefresh() {
    setRefreshing(true);
    try {
      if (statusKey && effectiveLocation !== project.location) {
        await readBridge()
          .gitFetch({ projectLocation: effectiveLocation, remote: "origin", prune: false })
          .catch(() => undefined);
        const status = await readBridge()
          .getGitStatus({ projectLocation: effectiveLocation })
          .catch(() => undefined);
        if (status) useGitStore.getState().setWorktreeStatus(statusKey, status);
        return;
      }
      // Manual refresh runs a full sync: git fetch + project snapshot
      // (status, branches, worktrees, gh check) + per-worktree status +
      // source-branch info + PR data. Matches the periodic fetchRemotes path
      // in useGitRefresh so the button surface and background loop converge.
      await refreshGitProject({ id: project.id, location: project.location }, "manual", "full", {
        fetchRemote: true,
      });
    } finally {
      setRefreshing(false);
      setRefreshKey((k) => k + 1);
    }
  }

  return (
    <PageLayout
      title="Git Review"
      contentHeaderChildren={
        <>
          <div className="lightcode-overlay-header__controls flex min-w-0 shrink items-center gap-2 pl-1.5">
            <span className="min-w-0 max-w-[min(200px,30vw)] truncate font-mono text-[13px] font-medium tracking-tight text-muted">
              {project.name}
            </span>
            {gitStatus?.branch ? (
              <>
                {statusKey ? (
                  <Tooltip delay={300}>
                    <Tooltip.Trigger
                      tabIndex={-1}
                      className="min-w-0 max-w-[min(140px,20vw)] shrink"
                    >
                      <span className="inline-flex h-5 w-full min-w-0 items-center gap-1 rounded-md px-1.5 text-xs text-muted">
                        <GitBranch className="size-3 shrink-0 text-muted/50" />
                        <span className="min-w-0 truncate">{gitStatus.branch}</span>
                      </span>
                    </Tooltip.Trigger>
                    <Tooltip.Content placement="bottom">{gitStatus.branch}</Tooltip.Content>
                  </Tooltip>
                ) : (
                  <BranchSelector
                    projectId={project.id}
                    currentBranch={gitStatus.branch}
                    value={gitStatus.branch}
                    onSwitchBranch={handleSwitchBranch}
                    hideWorktreeToggle
                    popoverPlacement="bottom"
                    trigger={
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-5 min-w-0 max-w-[min(140px,24vw)] shrink px-1.5 text-xs text-muted"
                        aria-label="Switch branch"
                      >
                        <GitBranch className="size-3 shrink-0 text-muted/50" />
                        <span className="min-w-0 truncate">{gitStatus.branch}</span>
                        <ChevronDown className="size-3 shrink-0" />
                      </Button>
                    }
                  />
                )}
                {((gitStatus.behind ?? 0) > 0 || (gitStatus.ahead ?? 0) > 0) && (
                  <span className="shrink-0 text-xs text-muted/60">
                    ↓{gitStatus.behind ?? 0} ↑{gitStatus.ahead ?? 0}
                  </span>
                )}
              </>
            ) : null}
          </div>
          {selectedFile && (
            <div className="lightcode-overlay-header__controls flex items-center gap-3">
              <button
                type="button"
                className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-muted hover:text-foreground"
                onClick={() => handleSelectFile(null, false)}
              >
                <ArrowLeft className="size-3" />
                All files
              </button>
              <span className="min-w-0 truncate text-xs font-medium text-foreground">
                {selectedFile}
              </span>
            </div>
          )}

          <div className="flex-1" />

          {!selectedFile && (
            <div className="lightcode-overlay-header__controls flex items-center">
              <Dropdown>
                <Button variant="ghost" size="sm" className="h-5 px-1.5 text-xs text-muted">
                  {diffFilter === "changes"
                    ? `Changes${gitStatus ? ` (${gitStatus.unstaged.length})` : ""}`
                    : `Staged${gitStatus ? ` (${gitStatus.staged.length})` : ""}`}
                  <ChevronDown className="size-3" />
                </Button>
                <Dropdown.Popover placement="bottom" className="min-w-0">
                  <Dropdown.Menu
                    className="text-xs"
                    selectedKeys={new Set([diffFilter])}
                    selectionMode="single"
                    onSelectionChange={(keys: Selection) => {
                      const key = [...keys][0] as DiffFilter | undefined;
                      if (key) setDiffFilter(key);
                    }}
                  >
                    {gitStatus && gitStatus.staged.length > 0 ? (
                      <Dropdown.Item id="staged" textValue="Staged">
                        <Dropdown.ItemIndicator />
                        <Label>Staged ({gitStatus.staged.length})</Label>
                      </Dropdown.Item>
                    ) : null}
                    {gitStatus && gitStatus.unstaged.length > 0 ? (
                      <Dropdown.Item id="changes" textValue="Changes">
                        <Dropdown.ItemIndicator />
                        <Label>Changes ({gitStatus.unstaged.length})</Label>
                      </Dropdown.Item>
                    ) : null}
                  </Dropdown.Menu>
                </Dropdown.Popover>
              </Dropdown>
            </div>
          )}

          <div className="lightcode-overlay-header__controls flex items-center gap-1">
            <button
              type="button"
              className="rounded p-1 text-muted hover:text-foreground"
              title="Split view"
              onClick={() => setDiffMode(DIFF_MODE.Split)}
            >
              <Columns2
                className={`size-4 ${diffMode === DIFF_MODE.Split ? "text-foreground" : ""}`}
              />
            </button>
            <button
              type="button"
              className="rounded p-1 text-muted hover:text-foreground"
              title="Unified view"
              onClick={() => setDiffMode(DIFF_MODE.Unified)}
            >
              <Rows2
                className={`size-4 ${diffMode === DIFF_MODE.Unified ? "text-foreground" : ""}`}
              />
            </button>
            <button
              type="button"
              className="rounded p-1 text-muted hover:text-foreground"
              title="Refresh"
              onClick={() => void handleRefresh()}
            >
              <RefreshCw className={`size-4 ${refreshing ? "animate-spin" : ""}`} />
            </button>
          </div>
        </>
      }
      sidebar={
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
        />
      }
      content={
        <GitDiffContent
          project={effectiveProject}
          gitStatus={gitStatus}
          selectedFile={selectedFile}
          selectedStaged={selectedStaged}
          diffMode={diffMode}
          diffFilter={diffFilter}
          refreshKey={refreshKey}
        />
      }
    />
  );
}
