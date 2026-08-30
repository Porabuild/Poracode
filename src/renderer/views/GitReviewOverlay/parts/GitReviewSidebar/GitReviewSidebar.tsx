import { useRef, useState } from "react";
import {
  ArrowLeft,
  ChevronDown,
  FileDiff,
  GitBranchPlus,
  GitMerge,
  GitPullRequest,
  Link2,
  PanelLeft,
  PanelLeftClose,
} from "lucide-react";
import { Button, ButtonGroup, Dropdown, Label, Modal, Separator } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import type { GitBranchInfo, GitStatusResult, PrCreateMode, Project } from "@/shared/contracts";
import { branchNameFromRemoteRef } from "@/shared/gitUtils";
import { getProjectAgentStatuses } from "@/shared/agentStatus";
import { useAgentStatusesStore } from "@/renderer/state/agentStatusesStore";
import { findExperimentByWorktree } from "@/renderer/state/experimentStore";
import { gitReviewActionStoreKey } from "@/renderer/state/gitReviewActionStore";
import { useGitStore } from "@/renderer/state/gitStore";
import {
  buildBranchPrKey,
  useCommitsAhead,
  useHasPr,
  usePrBaseBranch,
  usePrHeadSha,
  usePrNumber,
  usePrState,
  useSourceAhead,
  useSourceBranch,
} from "@/renderer/state/gitSelectors";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { PixelLoader, SidebarButton } from "@/renderer/components/common";
import { useScrollFade } from "@/renderer/hooks/useScrollFade";
import { isPrActive } from "@/renderer/utils/prStatus";
import { useSidebar } from "@/renderer/views/MainView/parts/AppShell/AppShell";
import { getCommitGenCandidates } from "@/renderer/components/providers/commitGen";
import {
  gitReviewColumnClass,
  gitReviewSidebarListScrollClass,
  sidebarFooterNavClass,
  sidebarIconRailFooterClass,
} from "@/renderer/components/layout/sidebarChrome";
import { useDiffTheme } from "../diffBuildClient";

import { ConflictGroup } from "./parts/ConflictGroup";
import { FileGroup } from "./parts/FileGroup";
import { useGitReviewActions } from "./parts/useGitReviewActions";
import { useSourceBranchData } from "./parts/useSourceBranchData";
import { useConflictResolver, type ConflictResolverLaunchInput } from "./parts/useConflictResolver";
import { ConflictResolutionActions } from "./parts/ConflictResolutionActions";
import { CommitSyncPanel } from "./parts/CommitSyncPanel";
import { PrSection } from "./parts/PrSection";
import { CreatePrModal } from "./parts/CreatePrModal";
import { ActionPhaseLabel } from "./parts/ActionPhaseLabel";
import { GitReviewSection } from "./parts/GitReviewSection";
import { GitReviewPadXProvider } from "./gitReviewPadXContext";

const EMPTY_BRANCHES: readonly GitBranchInfo[] = [];

export function GitReviewSidebar(props: {
  project: Project;
  gitStatus: GitStatusResult | undefined;
  selectedFile: string | null;
  selectedStaged: boolean;
  worktreeBranch?: string | undefined;
  worktreePath?: string | undefined;
  onMergeAndRemove?: (() => void) | undefined;
  refreshKey: number;
  onSelectFile: (path: string | null, staged: boolean) => void;
  onClose: () => void;
  onRefresh: () => void;
  onInitRepository?: (() => void | Promise<void>) | undefined;
  onAddRemote?: ((remote: string, url: string) => boolean | Promise<boolean>) | undefined;
  /** Store key for optimistic updates — worktree statusKey or project.id */
  statusKey?: string | undefined;
  mode?: "overlay" | "panel";
  wrapLines?: boolean;
  /** Hide the desktop "Return to app / Hide sidebar" footer (mobile shells
   * provide their own navigation chrome). */
  hideFooterNav?: boolean;
  /** Override conflict-agent launch for remote/mobile shells that cannot queue
   * local renderer threads directly. */
  onLaunchConflictResolverThread?: ((input: ConflictResolverLaunchInput) => void) | undefined;
}) {
  const {
    project,
    gitStatus,
    selectedFile,
    selectedStaged,
    worktreeBranch,
    worktreePath,
    onMergeAndRemove,
    refreshKey,
    onSelectFile,
    onClose,
    onRefresh,
    onInitRepository,
    onAddRemote,
    statusKey,
    mode = "overlay",
    wrapLines = false,
    hideFooterNav = false,
    onLaunchConflictResolverThread,
  } = props;
  const { t } = useLingui();
  const storeKey = gitReviewActionStoreKey(project.id, statusKey);
  const isWorktreeStatus = Boolean(statusKey);
  const { isCollapsed, collapse, expand } = useSidebar();
  const diffTheme = useDiffTheme();
  const scrollContentRef = useRef<HTMLDivElement>(null);
  const { setScrollContainer, scrollEl, scrollFadeStyle } = useScrollFade<HTMLDivElement>({
    contentRef: scrollContentRef,
    maxFadePx: 10,
  });
  const agentStatuses = useAgentStatusesStore((s) => s.agentStatuses);
  const wslAgentStatuses = useAgentStatusesStore((s) => s.wslAgentStatuses);
  const isWsl = project.location.kind === "wsl";
  const commitGenProvider = useSharedSettings((s) =>
    isWsl ? s.wslCommitGenProvider : s.commitGenProvider,
  );
  const prCreateMode = useSharedSettings((s) => s.prCreateMode);
  const setPrCreateMode = useSharedSettings((s) => s.setPrCreateMode);
  const commitDefaultAction = useSharedSettings((s) => s.commitDefaultAction);
  const setCommitDefaultAction = useSharedSettings((s) => s.setCommitDefaultAction);

  // Treat "unknown" as "might be GitHub" — covers SSH host aliases where the
  // remote URL hostname doesn't contain "github" but resolves to github.com.
  const remotePlatform = gitStatus?.remoteInfo?.platform;
  const isGitHub = remotePlatform === "github" || remotePlatform === "unknown";
  const ghAvailable = useGitStore((s) => s.ghAvailable[project.id] ?? false);
  const effectiveBranch = worktreeBranch ?? gitStatus?.branch;
  const effectivePrKey =
    worktreePath ?? (gitStatus?.branch ? buildBranchPrKey(project.id) : undefined);
  const hasPr = useHasPr(effectivePrKey);
  const prNumber = usePrNumber(effectivePrKey);
  const prState = usePrState(effectivePrKey);
  const prHeadSha = usePrHeadSha(effectivePrKey);
  const prBaseBranch = usePrBaseBranch(effectivePrKey);
  const sourceBranch = useSourceBranch(effectivePrKey) ?? null;
  const commitsAhead = useCommitsAhead(effectivePrKey);
  const sourceAhead = useSourceAhead(effectivePrKey);
  const showPrSection = Boolean(isGitHub && effectiveBranch);

  const mergeConflicting = gitStatus?.mergeInProgress ?? false;
  const mergeConflictFiles = gitStatus?.conflictFiles ?? [];

  const { sourceBranches } = useSourceBranchData({
    project,
    effectiveBranch,
    effectivePrKey,
    isGitHub,
    ghAvailable,
    preferredSourceBranch: prBaseBranch,
    refreshKey,
  });
  const prBranchList = sourceBranches ?? EMPTY_BRANCHES;
  const defaultPrTargetBranch =
    sourceBranch && sourceBranches ? branchNameFromRemoteRef(sourceBranch, sourceBranches) : null;

  const {
    commitMessage,
    setCommitMessage,
    isCommitting,
    isGenerating,
    isSyncing,
    isMerging,
    isPullingFromSource,
    isAbortingMerge,
    pullStashCommit,
    prTitle,
    setPrTitle,
    prBody,
    setPrBody,
    prTargetBranch,
    setPrTargetBranch,
    createdPrWatch,
    clearCreatedPrWatch,
    prLoading,
    prPendingAction,
    isGeneratingPr,
    actionPhase,
    handleCommit,
    handleGenerateMessage,
    handleSyncOrPush,
    handleSyncAction,
    handlePushAndCreatePr,
    handleMergeOnly,
    handleMergeAndRemove,
    handlePullFromSource,
    handleAbortMerge,
    handleCreatePr,
    handleCommitAndCreatePr,
    handleMergePr,
    handleClosePr,
    handleMarkPrReady,
    handleUpdatePrBranch,
    handleRefreshPr,
    isRefreshingPr,
    handleGeneratePrSummary,
  } = useGitReviewActions({
    project,
    gitStatus,
    worktreeBranch,
    worktreePath,
    storeKey,
    isWorktreeStatus,
    onRefresh,
    onMergeAndRemove,
    effectiveBranch,
    effectivePrKey,
    sourceBranch,
    defaultPrTargetBranch,
  });

  const { canResolveWithAgent, handleResolveWithAgent } = useConflictResolver({
    project,
    mergeConflictFiles,
    worktreePath,
    worktreeBranch,
    onLaunchResolverThread: onLaunchConflictResolverThread,
  });

  const projectAgentStatuses = getProjectAgentStatuses(
    project.location,
    agentStatuses,
    wslAgentStatuses,
  );
  const canGenerateMessage =
    getCommitGenCandidates(projectAgentStatuses, commitGenProvider).length > 0;
  const hasStagedChanges = (gitStatus?.staged.length ?? 0) > 0;
  const hasAnyChanges = hasStagedChanges || (gitStatus?.unstaged.length ?? 0) > 0;
  const canCommitStaged = hasAnyChanges && !isCommitting && !isGenerating;
  const hasRemote = gitStatus?.hasRemote ?? false;
  const hasTracking = Boolean(gitStatus?.tracking);
  const ahead = gitStatus?.ahead ?? 0;
  const behind = gitStatus?.behind ?? 0;
  const needsPush = hasTracking ? ahead > 0 && behind === 0 : hasRemote;

  // Experiment candidate worktrees merge/pull through the experiment crown
  // flow only — the review surface is view/commit-only for them.
  const isExperimentWorktree = Boolean(
    worktreePath && findExperimentByWorktree(project.id, worktreePath),
  );
  const showMergeActions = Boolean(
    worktreeBranch &&
    worktreePath &&
    !hasAnyChanges &&
    sourceBranch &&
    commitsAhead > 0 &&
    !isExperimentWorktree,
  );
  const showPullFromSource = Boolean(
    effectiveBranch && sourceBranch && sourceAhead > 0 && !isExperimentWorktree,
  );
  const isPushed = hasTracking && ahead === 0;
  // A merged PR only becomes eligible for a follow-up PR after the branch moves
  // past the commit that was last included in that PR. Comparing commit IDs is
  // important here: ahead/behind counts are misleading after squash merges.
  const hasCommitsAfterMergedPr = Boolean(
    prState !== "merged" || (gitStatus?.headSha && prHeadSha && gitStatus.headSha !== prHeadSha),
  );
  const prEligible = Boolean(
    showPrSection &&
    ghAvailable &&
    sourceBranch &&
    defaultPrTargetBranch &&
    !isPrActive(prState) &&
    hasCommitsAfterMergedPr,
  );
  const showCreatePrButton = prEligible && isPushed;
  // Whether the one-click "Commit & Create PR" action is offered. Unlike
  // showCreatePrButton this does NOT require an already-pushed branch (it only
  // needs a remote) — the combined action pushes as part of its flow.
  const canCreatePr = prEligible && hasRemote;
  const [createPrModalOpen, setCreatePrModalOpen] = useState(false);
  // In "auto" mode the Create PR button skips the dialog: it auto-generates the
  // title/body and creates the PR in one click (handleCreatePr handles the
  // empty-title generation), showing a spinner meanwhile. Otherwise it opens
  // the dialog as before. The button renders in two layout contexts below
  // (merge-actions group vs standalone), so its label/pending/content are
  // derived once here and shared.
  const isAutoPrMode = prCreateMode === "auto";
  // The button reports the live step of any create-PR flow, not just the
  // one-click mode: the dialog can be dismissed while its summary generation
  // or creation is still running, and this button is then the only control
  // left to show it.
  const createPrPhase =
    actionPhase === "generating-pr-summary" || actionPhase === "creating-pr" ? actionPhase : null;
  const createPrPending = (isAutoPrMode && prLoading) || createPrPhase !== null;
  const runPrMode = (prMode: PrCreateMode) => {
    if (actionPhase) return;
    if (prMode === "auto") void handleCreatePr(false);
    else setCreatePrModalOpen(true);
  };
  const onCreatePrPress = () => runPrMode(prCreateMode);
  // Picking the other mode from the split-button menu both runs it and makes
  // it the sticky default (the same field the Git settings select drives).
  const selectPrMode = (prMode: PrCreateMode) => {
    if (actionPhase) return;
    setPrCreateMode(prMode);
    runPrMode(prMode);
  };
  const altPrMode: PrCreateMode = isAutoPrMode ? "dialog" : "auto";
  const altPrModeLabel = isAutoPrMode ? t`Create PR…` : t`Create PR (Auto)`;
  const createPrButtonContent = (
    <>
      {createPrPending ? <PixelLoader size="xs" /> : <GitPullRequest className="size-3.5" />}
      {createPrPhase ? (
        <ActionPhaseLabel phase={createPrPhase} />
      ) : isAutoPrMode ? (
        <Trans>Create PR (Auto)</Trans>
      ) : (
        <Trans>Create PR</Trans>
      )}
    </>
  );
  const initialPrWatch = createdPrWatch?.prNumber === prNumber ? createdPrWatch : undefined;
  const [isInitializingRepo, setIsInitializingRepo] = useState(false);
  const [addRemoteOpen, setAddRemoteOpen] = useState(false);
  const [remoteName, setRemoteName] = useState("origin");
  const [remoteUrl, setRemoteUrl] = useState("");
  const [isAddingRemote, setIsAddingRemote] = useState(false);

  async function handleInitRepository() {
    if (!onInitRepository || isInitializingRepo) return;
    setIsInitializingRepo(true);
    try {
      await onInitRepository();
    } finally {
      setIsInitializingRepo(false);
    }
  }

  async function handleAddRemote() {
    if (!onAddRemote || isAddingRemote) return;
    const remote = remoteName.trim();
    const url = remoteUrl.trim();
    if (!remote || !url) return;

    setIsAddingRemote(true);
    try {
      const ok = await onAddRemote(remote, url);
      if (ok) {
        setAddRemoteOpen(false);
        setRemoteName("origin");
        setRemoteUrl("");
      }
    } finally {
      setIsAddingRemote(false);
    }
  }

  return (
    <GitReviewPadXProvider rowPadX="px-2" sectionPadX={mode === "panel" ? "px-2" : "px-0"}>
      <div className="relative h-full">
        {/* Collapsed icon rail */}
        {isCollapsed && (
          <div className="absolute inset-0 z-10 flex h-full min-h-0 flex-col items-start gap-3 pl-2 pb-1 pt-0">
            <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto">
              <SidebarButton
                iconOnly
                icon={<FileDiff className="size-4" />}
                label={t`Changes`}
                isActive
              />
            </div>
            <div className={sidebarIconRailFooterClass}>
              {mode !== "panel" && (
                <>
                  <SidebarButton
                    iconOnly
                    icon={<ArrowLeft className="size-4" />}
                    label={t`Return to app`}
                    onPress={onClose}
                  />
                  <SidebarButton
                    iconOnly
                    icon={<PanelLeft className="size-4" />}
                    label={t`Show sidebar`}
                    onPress={expand}
                  />
                </>
              )}
            </div>
          </div>
        )}

        {/* Expanded: shared git-review column + list scroll (see sidebarChrome) */}
        <div
          className={`${gitReviewColumnClass(mode)} transition-opacity duration-150 ${isCollapsed ? "invisible opacity-0" : "opacity-100 delay-100"}`}
        >
          <div
            ref={setScrollContainer}
            className={gitReviewSidebarListScrollClass()}
            style={scrollFadeStyle}
          >
            <div ref={scrollContentRef} className="relative min-h-full space-y-2">
              {mergeConflicting && mergeConflictFiles.length > 0 && (
                <ConflictGroup
                  files={mergeConflictFiles}
                  project={project}
                  selectedFile={selectedFile}
                  worktreePath={worktreePath}
                  worktreeBranch={worktreeBranch}
                  onSelectFile={onSelectFile}
                  onRefresh={onRefresh}
                  storeKey={storeKey}
                  isWorktree={isWorktreeStatus}
                  mode={mode}
                  diffTheme={diffTheme}
                  wrapLines={wrapLines}
                  scrollElement={scrollEl}
                  scrollContentElement={scrollContentRef.current}
                />
              )}
              {gitStatus && gitStatus.staged.length > 0 && (
                <FileGroup
                  title={t`Staged`}
                  count={gitStatus.staged.length}
                  staged
                  files={gitStatus.staged}
                  project={project}
                  selectedFile={selectedStaged ? selectedFile : null}
                  onSelectFile={onSelectFile}
                  onRefresh={onRefresh}
                  storeKey={storeKey}
                  isWorktree={isWorktreeStatus}
                  worktreePath={worktreePath}
                  worktreeBranch={worktreeBranch}
                  mode={mode}
                  diffTheme={diffTheme}
                  wrapLines={wrapLines}
                  scrollElement={scrollEl}
                  scrollContentElement={scrollContentRef.current}
                />
              )}
              {gitStatus && gitStatus.unstaged.length > 0 && (
                <FileGroup
                  title={t`Changes`}
                  count={gitStatus.unstaged.length}
                  staged={false}
                  files={gitStatus.unstaged}
                  project={project}
                  selectedFile={!selectedStaged ? selectedFile : null}
                  onSelectFile={onSelectFile}
                  onRefresh={onRefresh}
                  storeKey={storeKey}
                  isWorktree={isWorktreeStatus}
                  worktreePath={worktreePath}
                  worktreeBranch={worktreeBranch}
                  mode={mode}
                  diffTheme={diffTheme}
                  wrapLines={wrapLines}
                  scrollElement={scrollEl}
                  scrollContentElement={scrollContentRef.current}
                />
              )}
              {gitStatus && !gitStatus.isRepo && (
                <div
                  className={`absolute inset-0 flex flex-col items-center justify-center gap-3 text-center text-xs text-muted/60 ${mode === "panel" ? "px-4" : "px-2"}`}
                >
                  <span>
                    <Trans>Not a git repository</Trans>
                  </span>
                  {onInitRepository && (
                    <Button
                      size="sm"
                      variant="tertiary"
                      className="justify-center text-white [&_svg]:text-white"
                      isDisabled={isInitializingRepo}
                      isPending={isInitializingRepo}
                      onPress={() => void handleInitRepository()}
                    >
                      {({ isPending }) =>
                        isPending ? (
                          <PixelLoader size="xs" />
                        ) : (
                          <>
                            <GitBranchPlus className="size-3.5" />
                            <Trans>Initialize Repository</Trans>
                          </>
                        )
                      }
                    </Button>
                  )}
                </div>
              )}
              {gitStatus &&
                gitStatus.isRepo &&
                gitStatus.staged.length === 0 &&
                gitStatus.unstaged.length === 0 &&
                !mergeConflicting && (
                  <div
                    className={`absolute inset-0 flex flex-col items-center justify-center gap-1 text-center text-xs text-muted/60 ${mode === "panel" ? "px-4" : "px-2"}`}
                  >
                    <span className="text-foreground/80">
                      <Trans>Working tree clean</Trans>
                    </span>
                    <span>
                      {hasRemote ? (
                        <Trans>File changes will appear here.</Trans>
                      ) : (
                        <Trans>No remote configured. Add a remote to enable push and pull.</Trans>
                      )}
                    </span>
                    {!hasRemote && onAddRemote && (
                      <Button
                        size="sm"
                        variant="tertiary"
                        className="mt-2 justify-center text-white [&_svg]:text-white"
                        onPress={() => setAddRemoteOpen(true)}
                      >
                        <Link2 className="size-3.5" />
                        <Trans>Add Remote</Trans>
                      </Button>
                    )}
                  </div>
                )}
            </div>
          </div>

          {mergeConflicting && mergeConflictFiles.length > 0 && (
            <ConflictResolutionActions
              canResolveWithAgent={canResolveWithAgent}
              isAbortingMerge={isAbortingMerge}
              onResolveWithAgent={handleResolveWithAgent}
              onAbortMerge={handleAbortMerge}
            />
          )}

          {(hasAnyChanges || hasRemote) && (
            <CommitSyncPanel
              hasAnyChanges={hasAnyChanges}
              hasPendingPullStash={Boolean(pullStashCommit)}
              hasStagedChanges={hasStagedChanges}
              hasRemote={hasRemote}
              needsPush={needsPush}
              ahead={ahead}
              behind={behind}
              commitMessage={commitMessage}
              setCommitMessage={setCommitMessage}
              canCommitStaged={canCommitStaged}
              canGenerateMessage={canGenerateMessage}
              canCreatePr={canCreatePr}
              commitDefaultAction={commitDefaultAction}
              setCommitDefaultAction={setCommitDefaultAction}
              isCommitting={isCommitting}
              isGenerating={isGenerating}
              isSyncing={isSyncing}
              prLoading={prLoading}
              actionPhase={actionPhase}
              isPullingFromSource={isPullingFromSource}
              showPullFromSource={showPullFromSource}
              sourceBranch={sourceBranch}
              sourceAhead={sourceAhead}
              handleCommit={handleCommit}
              handleCommitAndCreatePr={handleCommitAndCreatePr}
              handleGenerateMessage={handleGenerateMessage}
              handleSyncOrPush={handleSyncOrPush}
              handleSyncAction={handleSyncAction}
              handlePushAndCreatePr={handlePushAndCreatePr}
              hasTracking={hasTracking}
              handlePullFromSource={handlePullFromSource}
            />
          )}

          {showPrSection && ghAvailable && hasPr && effectivePrKey && (
            <PrSection
              prKey={effectivePrKey}
              projectId={project.id}
              worktreePath={worktreePath}
              prLoading={prLoading}
              pendingAction={prPendingAction}
              handleMergePr={handleMergePr}
              handleClosePr={handleClosePr}
              handleMarkPrReady={handleMarkPrReady}
              handleUpdatePrBranch={handleUpdatePrBranch}
              onRefreshPr={handleRefreshPr}
              isRefreshingPr={isRefreshingPr}
              {...(initialPrWatch
                ? {
                    initialWatch: initialPrWatch.watch,
                    onInitialWatchUsed: clearCreatedPrWatch,
                  }
                : {})}
            />
          )}

          {showCreatePrButton && (
            <GitReviewSection>
              <ButtonGroup className="w-full">
                <Button
                  variant="tertiary"
                  className="flex-1"
                  isDisabled={createPrPending || Boolean(actionPhase)}
                  isPending={createPrPending}
                  onPress={onCreatePrPress}
                >
                  {createPrButtonContent}
                </Button>
                <Dropdown>
                  <Button
                    isIconOnly
                    variant="tertiary"
                    aria-label={t`More pull request options`}
                    isDisabled={createPrPending || isMerging || Boolean(actionPhase)}
                  >
                    <ButtonGroup.Separator />
                    <ChevronDown className="size-3.5" />
                  </Button>
                  <Dropdown.Popover placement="top end">
                    <Dropdown.Menu
                      aria-label={t`Pull request options`}
                      onAction={(key) => {
                        // `pr-mode` must be a stable id — React Aria collections
                        // throw "Cannot change the id of an item" if a keyless
                        // item's id mutates between renders, so the alt mode is
                        // resolved here rather than baked into the id.
                        if (key === "pr-mode") selectPrMode(altPrMode);
                        else if (key === "merge-only") void handleMergeOnly();
                        else if (key === "merge-and-remove") void handleMergeAndRemove();
                      }}
                    >
                      <Dropdown.Item id="pr-mode" textValue={altPrModeLabel}>
                        <GitPullRequest className="size-3.5" />
                        <Label>{altPrModeLabel}</Label>
                      </Dropdown.Item>
                      {showMergeActions ? (
                        <>
                          <Separator />
                          <Dropdown.Item id="merge-only" textValue={t`Merge Worktree`}>
                            <GitMerge className="size-3.5" />
                            <Label>
                              <Trans>Merge Worktree</Trans>
                            </Label>
                          </Dropdown.Item>
                          <Dropdown.Item
                            id="merge-and-remove"
                            textValue={t`Merge Locally & Remove Worktree`}
                          >
                            <GitMerge className="size-3.5" />
                            <Label>
                              <Trans>Merge Locally & Remove Worktree</Trans>
                            </Label>
                          </Dropdown.Item>
                        </>
                      ) : null}
                    </Dropdown.Menu>
                  </Dropdown.Popover>
                </Dropdown>
              </ButtonGroup>
            </GitReviewSection>
          )}

          <CreatePrModal
            isOpen={createPrModalOpen}
            onOpenChange={setCreatePrModalOpen}
            effectiveBranch={effectiveBranch}
            defaultTargetBranch={defaultPrTargetBranch}
            prTitle={prTitle}
            setPrTitle={setPrTitle}
            prBody={prBody}
            setPrBody={setPrBody}
            prTargetBranch={prTargetBranch}
            setPrTargetBranch={setPrTargetBranch}
            prLoading={prLoading}
            isGeneratingPr={isGeneratingPr}
            actionPhase={actionPhase}
            canGenerateMessage={canGenerateMessage}
            branchList={prBranchList}
            handleCreatePr={handleCreatePr}
            handleGeneratePrSummary={handleGeneratePrSummary}
          />

          {addRemoteOpen && (
            <Modal.Backdrop isOpen={addRemoteOpen} onOpenChange={setAddRemoteOpen}>
              <Modal.Container>
                <Modal.Dialog className="sm:max-w-[420px]">
                  <Modal.CloseTrigger />
                  <Modal.Header>
                    <Modal.Heading>
                      <Trans>Add Remote</Trans>
                    </Modal.Heading>
                  </Modal.Header>
                  <Modal.Body className="p-4">
                    <div className="flex flex-col gap-3">
                      <label
                        htmlFor="git-add-remote-name"
                        className="flex flex-col gap-1 text-xs text-muted"
                      >
                        <span>
                          <Trans>Remote name</Trans>
                        </span>
                        <input
                          id="git-add-remote-name"
                          aria-label={t`Remote name`}
                          className="h-8 rounded-md border border-[color:var(--border)] bg-surface px-2 text-xs text-foreground outline-none transition-colors placeholder:text-muted/50 focus:border-foreground/40"
                          value={remoteName}
                          onChange={(event) => setRemoteName(event.target.value)}
                        />
                      </label>
                      <label
                        htmlFor="git-add-remote-url"
                        className="flex flex-col gap-1 text-xs text-muted"
                      >
                        <span>
                          <Trans>Remote URL</Trans>
                        </span>
                        <input
                          id="git-add-remote-url"
                          aria-label={t`Remote URL`}
                          className="h-8 rounded-md border border-[color:var(--border)] bg-surface px-2 text-xs text-foreground outline-none transition-colors placeholder:text-muted/50 focus:border-foreground/40"
                          placeholder="git@github.com:owner/repo.git"
                          value={remoteUrl}
                          onChange={(event) => setRemoteUrl(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              void handleAddRemote();
                            }
                          }}
                        />
                      </label>
                    </div>
                  </Modal.Body>
                  <Modal.Footer>
                    <Button slot="close" variant="ghost" className="text-muted">
                      <Trans>Cancel</Trans>
                    </Button>
                    <Button
                      variant="tertiary"
                      isDisabled={isAddingRemote || !remoteName.trim() || !remoteUrl.trim()}
                      isPending={isAddingRemote}
                      onPress={() => void handleAddRemote()}
                    >
                      {({ isPending }) => (
                        <>
                          {isPending ? <PixelLoader size="xs" /> : <Link2 className="size-3.5" />}
                          <Trans>Add Remote</Trans>
                        </>
                      )}
                    </Button>
                  </Modal.Footer>
                </Modal.Dialog>
              </Modal.Container>
            </Modal.Backdrop>
          )}

          {mode !== "panel" && !hideFooterNav && (
            <div className={sidebarFooterNavClass}>
              <SidebarButton
                icon={<ArrowLeft className="size-4" />}
                label={t`Return to app`}
                onPress={onClose}
              />
              <SidebarButton
                icon={<PanelLeftClose className="size-4" />}
                label={t`Hide sidebar`}
                onPress={collapse}
              />
            </div>
          )}
        </div>
      </div>
    </GitReviewPadXProvider>
  );
}
