import { useState } from "react";
import { ArrowLeft, FileDiff, GitPullRequest, PanelLeft, PanelLeftClose } from "lucide-react";
import { Button } from "@heroui/react";
import type { GitBranchInfo, GitStatusResult, Project } from "@/shared/contracts";
import { getProjectAgentStatuses } from "@/shared/agentStatus";
import { useAgentStatusesStore } from "@/renderer/state/agentStatusesStore";
import { useGitStore } from "@/renderer/state/gitStore";
import {
  buildBranchPrKey,
  useCommitsAhead,
  useHasPr,
  usePrBaseBranch,
  usePrState,
  useSourceAhead,
  useSourceBranch,
} from "@/renderer/state/gitSelectors";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { SidebarButton } from "@/renderer/components/common";
import { useScrollFade } from "@/renderer/hooks/useScrollFade";
import { useSidebar } from "@/renderer/views/MainView/parts/AppShell/AppShell";
import { getCommitGenCandidates } from "@/renderer/components/providers";
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
import { useConflictResolver } from "./parts/useConflictResolver";
import { ConflictResolutionActions } from "./parts/ConflictResolutionActions";
import { CommitSyncPanel } from "./parts/CommitSyncPanel";
import { PrSection } from "./parts/PrSection";
import { CreatePrModal } from "./parts/CreatePrModal";
import { MergeToSourceSection } from "./parts/MergeToSourceSection";
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
  /** Store key for optimistic updates — worktree statusKey or project.id */
  statusKey?: string | undefined;
  mode?: "overlay" | "panel";
  wrapLines?: boolean;
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
    statusKey,
    mode = "overlay",
    wrapLines = false,
  } = props;
  const storeKey = statusKey ?? project.id;
  const isWorktreeStatus = Boolean(statusKey);
  const { isCollapsed, collapse, expand } = useSidebar();
  const diffTheme = useDiffTheme();
  const { setScrollContainer, scrollFadeStyle } = useScrollFade<HTMLDivElement>({
    maxFadePx: 10,
  });
  const agentStatuses = useAgentStatusesStore((s) => s.agentStatuses);
  const wslAgentStatuses = useAgentStatusesStore((s) => s.wslAgentStatuses);
  const isWsl = project.location.kind === "wsl";
  const commitGenProvider = useSharedSettings((s) =>
    isWsl ? s.wslCommitGenProvider : s.commitGenProvider,
  );

  // Treat "unknown" as "might be GitHub" — covers SSH host aliases where the
  // remote URL hostname doesn't contain "github" but resolves to github.com.
  const remotePlatform = gitStatus?.remoteInfo?.platform;
  const isGitHub = remotePlatform === "github" || remotePlatform === "unknown";
  const ghAvailable = useGitStore((s) => s.ghAvailable[project.id] ?? false);
  const branchList = useGitStore((s) => s.branches[project.id]?.branches) ?? EMPTY_BRANCHES;
  const effectiveBranch = worktreeBranch ?? gitStatus?.branch;
  const effectivePrKey =
    worktreePath ?? (gitStatus?.branch ? buildBranchPrKey(project.id) : undefined);
  const hasPr = useHasPr(effectivePrKey);
  const prState = usePrState(effectivePrKey);
  const prBaseBranch = usePrBaseBranch(effectivePrKey);
  const sourceBranch = useSourceBranch(effectivePrKey) ?? null;
  const commitsAhead = useCommitsAhead(effectivePrKey);
  const sourceAhead = useSourceAhead(effectivePrKey);
  const showPrSection = Boolean(isGitHub && effectiveBranch);

  const mergeConflicting = gitStatus?.mergeInProgress ?? false;
  const mergeConflictFiles = gitStatus?.conflictFiles ?? [];

  const { sourceBranchLoading } = useSourceBranchData({
    project,
    effectiveBranch,
    effectivePrKey,
    worktreePath,
    isGitHub,
    ghAvailable,
    preferredSourceBranch: prBaseBranch,
    refreshKey,
  });

  const {
    commitMessage,
    setCommitMessage,
    isCommitting,
    isGenerating,
    isSyncing,
    isMerging,
    isPullingFromSource,
    isAbortingMerge,
    prTitle,
    setPrTitle,
    prBody,
    setPrBody,
    prTargetBranch,
    setPrTargetBranch,
    prLoading,
    isGeneratingPr,
    handleCommit,
    handleGenerateMessage,
    handleSyncOrPush,
    handleSyncAction,
    handleMergeOnly,
    handleMergeAndRemove,
    handlePullFromSource,
    handleAbortMerge,
    handleCreatePr,
    handleMergePr,
    handleClosePr,
    handleMarkPrReady,
    handleUpdatePrBranch,
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
    branchList,
  });

  const { canResolveWithAgent, handleResolveWithAgent } = useConflictResolver({
    project,
    mergeConflictFiles,
    worktreePath,
    worktreeBranch,
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

  const showMergeSection = Boolean(
    worktreeBranch && worktreePath && !hasAnyChanges && (sourceBranchLoading || commitsAhead > 0),
  );
  const showPullFromSource = Boolean(effectiveBranch && sourceBranch && sourceAhead > 0);
  const isPushed = hasTracking && ahead === 0;
  const showCreatePrButton = Boolean(
    showPrSection && ghAvailable && isPushed && sourceBranch && (!prState || prState === "closed"),
  );
  const [createPrModalOpen, setCreatePrModalOpen] = useState(false);

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
                label="Changes"
                isActive
              />
            </div>
            <div className={sidebarIconRailFooterClass}>
              {mode !== "panel" && (
                <>
                  <SidebarButton
                    iconOnly
                    icon={<ArrowLeft className="size-4" />}
                    label="Return to app"
                    onPress={onClose}
                  />
                  <SidebarButton
                    iconOnly
                    icon={<PanelLeft className="size-4" />}
                    label="Show sidebar"
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
              />
            )}
            {gitStatus && gitStatus.staged.length > 0 && (
              <FileGroup
                title="Staged"
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
              />
            )}
            {gitStatus && gitStatus.unstaged.length > 0 && (
              <FileGroup
                title="Changes"
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
              />
            )}
            {gitStatus &&
              gitStatus.staged.length === 0 &&
              gitStatus.unstaged.length === 0 &&
              !mergeConflicting && (
                <p
                  className={`py-4 text-center text-xs text-muted/60 ${mode === "panel" ? "px-2" : "px-0"}`}
                >
                  No changes
                </p>
              )}
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
              hasStagedChanges={hasStagedChanges}
              hasRemote={hasRemote}
              needsPush={needsPush}
              ahead={ahead}
              behind={behind}
              commitMessage={commitMessage}
              setCommitMessage={setCommitMessage}
              canCommitStaged={canCommitStaged}
              canGenerateMessage={canGenerateMessage}
              isCommitting={isCommitting}
              isGenerating={isGenerating}
              isSyncing={isSyncing}
              isPullingFromSource={isPullingFromSource}
              showPullFromSource={showPullFromSource}
              sourceBranch={sourceBranch}
              sourceAhead={sourceAhead}
              handleCommit={handleCommit}
              handleGenerateMessage={handleGenerateMessage}
              handleSyncOrPush={handleSyncOrPush}
              handleSyncAction={handleSyncAction}
              hasTracking={hasTracking}
              handlePullFromSource={handlePullFromSource}
            />
          )}

          {showPrSection && ghAvailable && hasPr && prState !== "closed" && effectivePrKey && (
            <PrSection
              prKey={effectivePrKey}
              projectId={project.id}
              worktreePath={worktreePath}
              prLoading={prLoading}
              handleMergePr={handleMergePr}
              handleClosePr={handleClosePr}
              handleMarkPrReady={handleMarkPrReady}
              handleUpdatePrBranch={handleUpdatePrBranch}
            />
          )}

          {showCreatePrButton && (
            <GitReviewSection>
              <Button
                variant="tertiary"
                className="w-full"
                onPress={() => setCreatePrModalOpen(true)}
              >
                <GitPullRequest className="size-3.5" />
                Create Pull Request
              </Button>
            </GitReviewSection>
          )}

          <CreatePrModal
            isOpen={createPrModalOpen}
            onOpenChange={setCreatePrModalOpen}
            effectiveBranch={effectiveBranch}
            sourceBranch={sourceBranch}
            prTitle={prTitle}
            setPrTitle={setPrTitle}
            prBody={prBody}
            setPrBody={setPrBody}
            prTargetBranch={prTargetBranch}
            setPrTargetBranch={setPrTargetBranch}
            prLoading={prLoading}
            isGeneratingPr={isGeneratingPr}
            canGenerateMessage={canGenerateMessage}
            branchList={branchList}
            handleCreatePr={handleCreatePr}
            handleGeneratePrSummary={handleGeneratePrSummary}
          />

          {showMergeSection && (
            <MergeToSourceSection
              sourceBranchLoading={sourceBranchLoading}
              sourceBranch={sourceBranch}
              worktreeBranch={worktreeBranch}
              commitsAhead={commitsAhead}
              isMerging={isMerging}
              handleMergeAndRemove={handleMergeAndRemove}
              handleMergeOnly={handleMergeOnly}
            />
          )}

          {mode !== "panel" && (
            <div className={sidebarFooterNavClass}>
              <SidebarButton
                icon={<ArrowLeft className="size-4" />}
                label="Return to app"
                onPress={onClose}
              />
              <SidebarButton
                icon={<PanelLeftClose className="size-4" />}
                label="Hide sidebar"
                onPress={collapse}
              />
            </div>
          )}
        </div>
      </div>
    </GitReviewPadXProvider>
  );
}
