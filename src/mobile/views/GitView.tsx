import { useEffect, useRef, useState } from "react";
import { toast } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { ChevronLeft } from "lucide-react";
import type { GitStatusResult, Project, ProjectLocation } from "@/shared/contracts";
import { friendlyError } from "@/shared/messages";
import { readBridge } from "@/renderer/bridge";
import { resolvePrKey } from "@/renderer/state/gitSelectors";
import { mightBeGitHubRemote } from "@/renderer/state/gitRefresh";
import { useGitStore } from "@/renderer/state/gitStore";
import { SidebarContext } from "@/renderer/views/MainView/parts/AppShell/AppShell";
import { GitReviewSidebar } from "@/renderer/views/GitReviewOverlay/parts/GitReviewSidebar/GitReviewSidebar";
import {
  GitTouchProvider,
  type GitTouchActions,
  type GitTouchFileTarget,
  type GitTouchGroupTarget,
} from "@/renderer/views/GitReviewOverlay/parts/GitReviewSidebar/gitTouchContext";
import type { ConflictResolverLaunchInput } from "@/renderer/views/GitReviewOverlay/parts/GitReviewSidebar/parts/useConflictResolver";
import { SingleFileDiff } from "@/renderer/views/GitReviewOverlay/parts/GitDiffContent/parts/SingleFileDiff";
import { GitActionSheet, type GitSheetTarget } from "./GitActionSheet";
import { DIFF_MODE, DiffModeToggle, useSheet } from "../components";
import { refreshMobilePrData } from "../useGitSummaryHydration";

const ALWAYS_EXPANDED = {
  isCollapsed: false,
  isOverlay: false,
  closingOverlay: false,
  collapse: () => {},
  expand: () => {},
};

const DIFF_DRILL_TRANSITION_MS = 260;

type DiffDrillState = "closed" | "entering" | "open" | "closing";

function getDiffDrillTransitionMs() {
  if (
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  ) {
    return 0;
  }
  return DIFF_DRILL_TRANSITION_MS;
}

export interface GitTarget {
  readonly project: Project;
  readonly threadId?: string | undefined;
  /** Worktree status key (the worktree path) or undefined for the main repo. */
  readonly statusKey?: string | undefined;
  readonly locationOverride?: ProjectLocation | undefined;
  readonly worktreeBranch?: string | undefined;
  readonly worktreePath?: string | undefined;
}

/** Read the cached git status for a target straight from the shared store. */
export function useGitTargetStatus(target: GitTarget | null): GitStatusResult | undefined {
  return useGitStore((s) =>
    target
      ? target.statusKey
        ? s.worktreeStatuses[target.statusKey]
        : s.statuses[target.project.id]
      : undefined,
  ) as GitStatusResult | undefined;
}

/**
 * The "Changes" tab of the unified workspace panel. Reuses the desktop
 * GitReviewSidebar (file list, commit/sync, PR actions, create-PR) and
 * SingleFileDiff, composed into a single-column mobile layout: the file list
 * fills the pane and tapping a file drills into its diff. File/group actions
 * move from desktop hover into a long-press bottom sheet via the git touch
 * context.
 *
 * The pane owns no top chrome of its own — its branch line, refresh control and
 * back button live in the {@link WorkspaceView} shell. It reports its busy and
 * immersive (a diff is open) state up so the shell can drive the shared header.
 */
export function GitView(props: {
  readonly target: GitTarget;
  readonly onClose: () => void;
  /** Bumped by the shell's refresh button to trigger a fetch + rehydrate. */
  readonly refreshSignal: number;
  readonly onRefreshingChange?: (refreshing: boolean) => void;
  /** True while a single-file diff is open (the shell hides its chrome then). */
  readonly onImmersiveChange?: (immersive: boolean) => void;
  /** Open a changed file in the PWA Files editor. */
  readonly onOpenFile?: (path: string) => void;
  /** Start an agent-backed conflict resolver through the paired desktop. */
  readonly onLaunchConflictResolverThread?:
    | ((input: ConflictResolverLaunchInput) => void)
    | undefined;
}) {
  const { target, onClose } = props;
  const { t } = useLingui();
  const { project, statusKey, locationOverride, worktreeBranch, worktreePath } = target;
  const effectiveLocation = locationOverride ?? project.location;
  const effectiveProject = locationOverride ? { ...project, location: effectiveLocation } : project;
  const storeKey = statusKey ?? project.id;
  const isWorktree = Boolean(statusKey);

  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [selectedStaged, setSelectedStaged] = useState(false);
  const [diffDrillState, setDiffDrillState] = useState<DiffDrillState>("closed");
  const [diffMode, setDiffMode] = useState<number>(DIFF_MODE.Unified);
  const [refreshKey, setRefreshKey] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const singleFileScrollRef = useRef<HTMLDivElement>(null);
  const diffDrillTimerRef = useRef<number | null>(null);
  const onImmersiveChangeRef = useRef(props.onImmersiveChange);
  const sheet = useSheet<GitSheetTarget>();

  const gitStatus = useGitTargetStatus(target);

  async function refetchStatus() {
    const status = await readBridge()
      .getGitStatus({ projectLocation: effectiveLocation })
      .catch(() => undefined);
    if (!status) return;
    if (statusKey) useGitStore.getState().setWorktreeStatus(statusKey, status);
    else useGitStore.getState().setStatus(project.id, status);
  }

  async function refetchPr() {
    const gitState = useGitStore.getState();
    if (!gitState.ghAvailable[project.id]) return;
    const status = statusKey ? gitState.worktreeStatuses[statusKey] : gitState.statuses[project.id];
    if (!mightBeGitHubRemote(status?.remoteInfo?.platform)) return;
    const branch = worktreeBranch ?? status?.branch;
    if (!branch) return;
    await refreshMobilePrData({
      projectLocation: project.location,
      branch,
      prKey: resolvePrKey(project.id, worktreePath),
      ...(target.threadId ? { threadId: target.threadId } : {}),
    });
  }

  // Hydrate the store the desktop components read from: full status for the
  // file list/diffs, plus a project snapshot for gh availability + branches so
  // the PR section and create-PR flow light up. Once those prerequisites land,
  // fetch the branch's authoritative PR into the same store.
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
      await refetchPr();
    } finally {
      setRefreshing(false);
    }
  }

  async function handleRefresh() {
    setRefreshing(true);
    try {
      await readBridge()
        .gitFetch({
          projectLocation: effectiveLocation,
          remote: "origin",
          prune: false,
        })
        .catch((error: unknown) => {
          toast.danger(friendlyError(error));
        });
      await hydrate();
    } finally {
      setRefreshing(false);
      setRefreshKey((k) => k + 1);
    }
  }

  useEffect(() => {
    void hydrate();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot per target
  }, [storeKey]);

  // The shell's shared refresh button bumps refreshSignal; skip the initial 0.
  useEffect(() => {
    if (props.refreshSignal > 0) void handleRefresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- driven only by the signal
  }, [props.refreshSignal]);

  useEffect(() => {
    props.onRefreshingChange?.(refreshing);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mirror local busy state up
  }, [refreshing]);

  useEffect(() => {
    onImmersiveChangeRef.current = props.onImmersiveChange;
  }, [props.onImmersiveChange]);

  useEffect(
    () => () => {
      if (diffDrillTimerRef.current !== null) {
        window.clearTimeout(diffDrillTimerRef.current);
        diffDrillTimerRef.current = null;
      }
      onImmersiveChangeRef.current?.(false);
    },
    [],
  );

  function clearDiffDrillTimer() {
    if (diffDrillTimerRef.current === null) return;
    window.clearTimeout(diffDrillTimerRef.current);
    diffDrillTimerRef.current = null;
  }

  function afterDiffDrillTransition(callback: () => void) {
    const duration = getDiffDrillTransitionMs();
    if (duration === 0) {
      callback();
      return;
    }
    diffDrillTimerRef.current = window.setTimeout(() => {
      diffDrillTimerRef.current = null;
      callback();
    }, duration);
  }

  function openDiff(path: string, staged: boolean) {
    clearDiffDrillTimer();
    onImmersiveChangeRef.current?.(false);
    setSelectedStaged(staged);
    setSelectedFile(path);
    setDiffDrillState("entering");
    afterDiffDrillTransition(() => {
      setDiffDrillState("open");
      onImmersiveChangeRef.current?.(true);
    });
  }

  function closeDiff() {
    clearDiffDrillTimer();
    onImmersiveChangeRef.current?.(false);
    setDiffDrillState("closing");
    afterDiffDrillTransition(() => {
      setSelectedFile(null);
      setDiffDrillState("closed");
    });
  }

  const touchActions: GitTouchActions = {
    openFileMenu: (file: GitTouchFileTarget) => sheet.open({ kind: "file", file }),
    openGroupMenu: (group: GitTouchGroupTarget) => sheet.open({ kind: "group", group }),
  };

  return (
    <SidebarContext.Provider value={ALWAYS_EXPANDED}>
      <GitTouchProvider value={touchActions}>
        <div className="m-ws-pane">
          <GitReviewSidebar
            project={effectiveProject}
            mergeSyncLocation={project.location}
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
            onLaunchConflictResolverThread={props.onLaunchConflictResolverThread}
          />

          {selectedFile ? (
            <div className="m-git-diff" data-state={diffDrillState}>
              <header className="m-git-head">
                <button
                  className="m-back"
                  type="button"
                  aria-label={t`Back to changes`}
                  onClick={closeDiff}
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

          {sheet.target ? (
            <GitActionSheet
              target={sheet.target}
              closing={sheet.closing}
              effectiveLocation={effectiveLocation}
              storeKey={storeKey}
              isWorktree={isWorktree}
              onViewDiff={openDiff}
              {...(props.onOpenFile ? { onOpenFile: props.onOpenFile } : {})}
              onRefetch={refetchStatus}
              onClose={sheet.close}
            />
          ) : null}
        </div>
      </GitTouchProvider>
    </SidebarContext.Provider>
  );
}
