import { useEffect, useRef, useState } from "react";
import { ChevronLeft, GitBranch, RefreshCw } from "lucide-react";
import type { GitStatusResult, Project, ProjectLocation } from "@/shared/contracts";
import { readBridge } from "@/renderer/bridge";
import { useGitStore } from "@/renderer/state/gitStore";
import { SidebarContext } from "@/renderer/views/MainView/parts/AppShell/AppShell";
import { GitReviewSidebar } from "@/renderer/views/GitReviewOverlay/parts/GitReviewSidebar/GitReviewSidebar";
import {
  GitTouchProvider,
  type GitTouchActions,
  type GitTouchFileTarget,
  type GitTouchGroupTarget,
} from "@/renderer/views/GitReviewOverlay/parts/GitReviewSidebar/gitTouchContext";
import { SingleFileDiff } from "@/renderer/views/GitReviewOverlay/parts/GitDiffContent/parts/SingleFileDiff";
import { GitActionSheet, type GitSheetTarget } from "./GitActionSheet";
import { DIFF_MODE, DiffModeToggle, useSheet } from "../components";

const ALWAYS_EXPANDED = {
  isCollapsed: false,
  isOverlay: false,
  closingOverlay: false,
  collapse: () => {},
  expand: () => {},
};

export interface GitTarget {
  readonly project: Project;
  /** Worktree status key (the worktree path) or undefined for the main repo. */
  readonly statusKey?: string | undefined;
  readonly locationOverride?: ProjectLocation | undefined;
  readonly worktreeBranch?: string | undefined;
  readonly worktreePath?: string | undefined;
}

/**
 * Fullscreen git panel for the PWA. Reuses the desktop GitReviewSidebar (file
 * list, commit/sync, PR actions, create-PR) and SingleFileDiff, composed into a
 * single-column mobile layout: the file list fills the screen and tapping a
 * file drills into its diff. File/group actions move from desktop hover into a
 * long-press bottom sheet via the git touch context.
 */
export function GitView(props: { target: GitTarget; onClose: () => void }) {
  const { target, onClose } = props;
  const { project, statusKey, locationOverride, worktreeBranch, worktreePath } = target;
  const effectiveLocation = locationOverride ?? project.location;
  const effectiveProject = locationOverride ? { ...project, location: effectiveLocation } : project;
  const storeKey = statusKey ?? project.id;
  const isWorktree = Boolean(statusKey);

  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [selectedStaged, setSelectedStaged] = useState(false);
  const [diffMode, setDiffMode] = useState<number>(DIFF_MODE.Unified);
  const [refreshKey, setRefreshKey] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const singleFileScrollRef = useRef<HTMLDivElement>(null);
  const sheet = useSheet<GitSheetTarget>();

  const gitStatus = useGitStore((s) =>
    statusKey ? s.worktreeStatuses[statusKey] : s.statuses[project.id],
  ) as GitStatusResult | undefined;

  async function refetchStatus() {
    const status = await readBridge()
      .getGitStatus({ projectLocation: effectiveLocation })
      .catch(() => undefined);
    if (!status) return;
    if (statusKey) useGitStore.getState().setWorktreeStatus(statusKey, status);
    else useGitStore.getState().setStatus(project.id, status);
  }

  // Hydrate the store the desktop components read from: full status for the
  // file list/diffs, plus a project snapshot for gh availability + branches so
  // the PR section and create-PR flow light up.
  async function hydrate() {
    setRefreshing(true);
    try {
      await Promise.all([
        refetchStatus(),
        readBridge()
          .gitProjectSnapshot({
            projectLocation: project.location,
            includeGhCheck: true,
          })
          .then((snapshot) =>
            useGitStore.getState().setProjectSnapshot(project.id, {
              ...(snapshot.status ? { status: snapshot.status } : {}),
              ...(snapshot.branches ? { branches: snapshot.branches } : {}),
              ...(snapshot.worktrees ? { worktrees: snapshot.worktrees } : {}),
              ...(snapshot.ghAvailable !== null ? { ghAvailable: snapshot.ghAvailable } : {}),
            }),
          )
          .catch(() => undefined),
      ]);
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    void hydrate();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot per target
  }, [storeKey]);

  async function handleRefresh() {
    setRefreshing(true);
    try {
      await readBridge()
        .gitFetch({
          projectLocation: effectiveLocation,
          remote: "origin",
          prune: false,
        })
        .catch(() => undefined);
      await hydrate();
    } finally {
      setRefreshing(false);
      setRefreshKey((k) => k + 1);
    }
  }

  function openDiff(path: string, staged: boolean) {
    setSelectedStaged(staged);
    setSelectedFile(path);
  }

  const touchActions: GitTouchActions = {
    openFileMenu: (file: GitTouchFileTarget) => sheet.open({ kind: "file", file }),
    openGroupMenu: (group: GitTouchGroupTarget) => sheet.open({ kind: "group", group }),
  };

  const headBranch = gitStatus?.branch ?? worktreeBranch ?? "";

  return (
    <SidebarContext.Provider value={ALWAYS_EXPANDED}>
      <GitTouchProvider value={touchActions}>
        <section className="m-git-overlay">
          <header className="m-git-head">
            <button className="m-back" type="button" aria-label="Back" onClick={onClose}>
              <ChevronLeft className="size-5" />
            </button>
            <span className="m-git-head__title">
              <GitBranch className="size-3.5 shrink-0 text-muted/60" />
              <span className="m-git-head__branch">{headBranch || project.name}</span>
              {gitStatus && (gitStatus.ahead > 0 || gitStatus.behind > 0) ? (
                <span className="shrink-0 text-xs text-muted/70">
                  {gitStatus.ahead > 0 ? `↑${gitStatus.ahead}` : ""}
                  {gitStatus.behind > 0 ? ` ↓${gitStatus.behind}` : ""}
                </span>
              ) : null}
            </span>
            <span className="m-git-head__actions">
              <button
                type="button"
                className="m-git-head__btn"
                aria-label="Refresh"
                onClick={() => void handleRefresh()}
              >
                <RefreshCw className={`size-4 ${refreshing ? "m-spin" : ""}`} />
              </button>
            </span>
          </header>

          <div className="m-git-overlay__body">
            <GitReviewSidebar
              project={effectiveProject}
              gitStatus={gitStatus}
              selectedFile={selectedFile}
              selectedStaged={selectedStaged}
              worktreeBranch={worktreeBranch}
              worktreePath={worktreePath}
              onSelectFile={(path, staged) => {
                if (path) openDiff(path, staged);
              }}
              onClose={onClose}
              refreshKey={refreshKey}
              onRefresh={() => void handleRefresh()}
              statusKey={statusKey}
              mode="overlay"
              hideFooterNav
            />

            {selectedFile ? (
              <div className="m-git-diff">
                <header className="m-git-head">
                  <button
                    className="m-back"
                    type="button"
                    aria-label="Back to files"
                    onClick={() => setSelectedFile(null)}
                  >
                    <ChevronLeft className="size-5" />
                  </button>
                  <span className="m-git-diff__path" title={selectedFile}>
                    {selectedFile}
                  </span>
                  <span className="m-git-head__actions">
                    <DiffModeToggle mode={diffMode} onChange={setDiffMode} />
                  </span>
                </header>
                <div className="m-git-diff__body">
                  <SingleFileDiff
                    project={effectiveProject}
                    filePath={selectedFile}
                    staged={selectedStaged}
                    diffMode={diffMode}
                    refreshKey={refreshKey}
                    containerRef={singleFileScrollRef}
                  />
                </div>
              </div>
            ) : null}
          </div>

          {sheet.target ? (
            <GitActionSheet
              target={sheet.target}
              closing={sheet.closing}
              effectiveLocation={effectiveLocation}
              storeKey={storeKey}
              isWorktree={isWorktree}
              onViewDiff={openDiff}
              onRefetch={refetchStatus}
              onClose={sheet.close}
            />
          ) : null}
        </section>
      </GitTouchProvider>
    </SidebarContext.Provider>
  );
}
