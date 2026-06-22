import { type ReactNode, useEffect, useRef, useState } from "react";
import { Plural, Trans, useLingui } from "@lingui/react/macro";
import { ChevronDown, GitBranch, GitFork, Search } from "lucide-react";
import { Popover, toast, Tooltip } from "@heroui/react";
import type { GitBranchInfo } from "@/shared/contracts";
import { friendlyError } from "@/shared/messages";
import { readBridge } from "@/renderer/bridge";
import { useAppStore } from "@/renderer/state/appStore";
import { useGitStore } from "@/renderer/state/gitStore";
import { prefetchBranchPrData, refreshGitProject } from "@/renderer/state/gitRefresh";
import { buildBranchNamePrKey } from "@/renderer/state/gitSelectors";
import { usePanelStore } from "@/renderer/state/panelStore";
import { openNewThreadInWorktree } from "@/renderer/actions/threadActions";
import { worktreePlacementPayload } from "@/renderer/actions/worktreePlacement";
import { deleteWorktreeGroup } from "@/renderer/actions/worktreeActions";
import { Button } from "../Button";
import { ConfirmDialog } from "../ConfirmDialog";
import { useBranchList } from "./parts/useBranchList";
import { BranchListBox, type OpenPrReviewArgs } from "./parts/BranchListBox";
import { BranchFooterActions } from "./parts/BranchFooterActions";
import { generateWorktreeBranch } from "./parts/generateWorktreeBranch";
import type { BranchSelection } from "./parts/types";

export type { BranchSelection };

interface PendingDelete {
  branch: GitBranchInfo;
  worktreePath?: string;
  threadIds: string[];
  threadCount: number;
}

export interface BranchSelectorProps {
  projectId: string;
  currentBranch: string;
  value: string;
  isWorktree?: boolean | undefined;
  baseBranch?: string | undefined;
  worktreeMode?: boolean;
  onWorktreeModeChange?: (value: boolean) => void;
  onSelect?: (selection: BranchSelection) => void;
  onSwitchBranch?: (branch: string, createNew: boolean) => void;
  isDisabled?: boolean;
  trigger?: ReactNode;
  hideWorktreeToggle?: boolean;
  /** Show the "Move changes to a new worktree" action in the popover footer. */
  showMoveBranchAction?: boolean;
  /** Project copy patterns to preserve when moving the current branch. */
  moveBranchCopyIgnoredPatterns?: string[];
  popoverPlacement?: "top" | "bottom";
  forceHideLabel?: boolean;
  collapseTier?: number;
  iconOnly?: boolean;
  /** Hide the leading branch/fork glyph on the trigger (e.g. when a sibling control already shows it). */
  hideTriggerIcon?: boolean;
  /** Render a shorter trigger for secondary control rows. */
  compact?: boolean;
  className?: string;
}

export function BranchSelector(props: BranchSelectorProps) {
  const {
    projectId,
    currentBranch,
    value,
    isWorktree,
    baseBranch,
    worktreeMode = false,
    onWorktreeModeChange,
    onSelect,
    onSwitchBranch,
    isDisabled,
    trigger,
    hideWorktreeToggle,
    showMoveBranchAction = false,
    moveBranchCopyIgnoredPatterns,
    popoverPlacement = "top",
    forceHideLabel = false,
    collapseTier,
    iconOnly = false,
    hideTriggerIcon = false,
    compact = false,
  } = props;
  const triggerIconSize = compact ? "size-3" : "size-3.5";
  const hideLabelOnWrap = collapseTier !== undefined;
  const { t } = useLingui();

  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [newBranchName, setNewBranchName] = useState("");
  const [deletingBranch, setDeletingBranch] = useState<string | null>(null);
  const [isMovingBranch, setIsMovingBranch] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const createRef = useRef<HTMLInputElement>(null);

  const {
    items,
    hasLocal,
    hasRemote,
    worktreeBranches,
    branchWorktreePath,
    threadsByBranch,
    projectLocation,
  } = useBranchList({ projectId, search });

  useEffect(() => {
    if (isOpen) {
      setSearch("");
      setIsCreating(false);
      setNewBranchName("");
      setTimeout(() => searchRef.current?.focus(), 50);
      // Refresh PR status for all branches in the background; cached icons show
      // immediately (prefetch self-throttles + dedupes).
      if (projectLocation) {
        void prefetchBranchPrData({ id: projectId, location: projectLocation });
      }
    }
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps -- only on open/close

  useEffect(() => {
    if (isCreating) {
      setTimeout(() => createRef.current?.focus(), 0);
    }
  }, [isCreating]);

  function handleSelectBranch(branch: string) {
    if (worktreeMode) {
      onSelect?.({
        branch,
        baseBranch: branch,
        isWorktree: true,
      });
    } else if (branchWorktreePath.has(branch)) {
      const existingWorktreePath = branchWorktreePath.get(branch);
      if (existingWorktreePath) {
        onSelect?.({
          branch,
          baseBranch: branch,
          isWorktree: true,
          worktreePath: existingWorktreePath,
        });
      } else {
        onSelect?.({ branch, isWorktree: false });
      }
    } else if (branch !== currentBranch && onSwitchBranch) {
      onSwitchBranch(branch, false);
      onSelect?.({ branch, isWorktree: false });
    } else {
      onSelect?.({ branch, isWorktree: false });
    }
    setIsOpen(false);
  }

  function handleCreateBranch() {
    const name = newBranchName.trim();
    if (!name) return;
    onWorktreeModeChange?.(false);
    if (onSwitchBranch) {
      onSwitchBranch(name, true);
    }
    onSelect?.({ branch: name, isWorktree: false });
    setIsOpen(false);
    setIsCreating(false);
    setNewBranchName("");
  }

  function handleRequestDelete(branch: GitBranchInfo) {
    const worktreePath = branch.isRemote ? undefined : branchWorktreePath.get(branch.name);
    const threads = threadsByBranch.get(branch.name) ?? [];
    setIsOpen(false);
    setPendingDelete({
      branch,
      ...(worktreePath ? { worktreePath } : {}),
      threadIds: threads.map((thread) => thread.id),
      threadCount: threads.length,
    });
  }

  function handleOpenPrReview(args: OpenPrReviewArgs) {
    setIsOpen(false);
    usePanelStore.getState().setPrReviewContext({
      projectId,
      prNumber: args.prNumber,
      ...(args.worktreePath
        ? { worktreePath: args.worktreePath }
        : { prKey: buildBranchNamePrKey(projectId, args.branch) }),
    });
  }

  async function confirmDelete() {
    const target = pendingDelete;
    setPendingDelete(null);
    if (!target || !projectLocation) return;
    const { branch, worktreePath, threadIds } = target;
    // Worktree branches reuse the sidebar's removal path (closes linked threads,
    // runs the cleanup script, removes the worktree, then deletes the branch).
    if (worktreePath) {
      deleteWorktreeGroup(projectId, worktreePath, threadIds);
      return;
    }
    // Plain local or remote branch with no worktree — delete the ref directly.
    setDeletingBranch(branch.name);
    try {
      await readBridge().gitDeleteBranch({
        projectLocation,
        branch: branch.name,
        force: true,
        ...(branch.remote ? { remote: branch.remote } : {}),
      });
    } catch (error) {
      toast.danger(friendlyError(error));
    }
    try {
      const [branches, wts] = await Promise.all([
        readBridge().gitListBranches({ projectLocation, includeRemote: true }),
        readBridge().gitListWorktrees({ projectLocation }),
      ]);
      const store = useGitStore.getState();
      store.setBranches(projectId, branches);
      store.setWorktrees(projectId, wts.worktrees);
    } catch {
      // ignore refresh errors
    } finally {
      setDeletingBranch(null);
    }
  }

  async function handleMoveBranchToWorktree() {
    if (!projectLocation || isMovingBranch) return;
    setIsMovingBranch(true);
    setIsOpen(false);
    try {
      const newBranch = generateWorktreeBranch();
      const project = useAppStore.getState().projects.find((p) => p.id === projectId);
      const result = await readBridge().gitAddWorktree({
        projectLocation,
        branch: newBranch,
        createBranch: true,
        startPoint: currentBranch,
        transferUncommitted: true,
        // This action MOVES the changes — leave the current branch clean.
        keepChangesInSource: false,
        ...(project ? worktreePlacementPayload(project) : {}),
        ...(moveBranchCopyIgnoredPatterns?.length
          ? { copyIgnoredPatterns: moveBranchCopyIgnoredPatterns }
          : {}),
      });
      await refreshGitProject({ id: projectId, location: projectLocation }, "manual", "full");
      openNewThreadInWorktree({
        projectId,
        worktreePath: result.path,
        worktreeBranch: newBranch,
      });
      if (result.changesTransferred === false) {
        toast.danger(
          t`Created a worktree on "${newBranch}", but the changes conflicted and remain in a git stash — resolve them in the worktree.`,
        );
      } else {
        toast.success(
          t`Moved your changes into a new worktree on "${newBranch}". "${currentBranch}" is now clean.`,
        );
      }
    } catch (error) {
      toast.danger(friendlyError(error));
    } finally {
      setIsMovingBranch(false);
    }
  }

  return (
    <div className={`flex items-center gap-1 ${props.className ?? ""}`}>
      {worktreeMode && <span className="shrink-0 text-xs text-muted">from</span>}
      <Popover isOpen={isOpen} onOpenChange={setIsOpen}>
        <Popover.Trigger className="flex flex-1 min-w-0 items-center">
          {trigger ?? (
            <Tooltip delay={0}>
              <Button
                aria-label={t`Select branch`}
                isDisabled={isDisabled ?? false}
                size="sm"
                variant="ghost"
                className={`lightcode-composer-menu min-w-0 max-w-48 ${
                  compact ? "lightcode-composer-menu--compact px-2" : "px-2.5"
                }`}
              >
                {!hideTriggerIcon || iconOnly ? (
                  isWorktree || worktreeMode ? (
                    <GitFork className={`${triggerIconSize} text-muted`} />
                  ) : (
                    <GitBranch className={`${triggerIconSize} text-muted`} />
                  )
                ) : null}
                {!iconOnly && (
                  <span
                    data-collapse-tier={collapseTier}
                    className={
                      hideLabelOnWrap
                        ? `lightcode-composer-label-hideable truncate${forceHideLabel ? " is-hidden" : ""}`
                        : "truncate"
                    }
                  >
                    {value}
                  </span>
                )}
                {!iconOnly && (
                  <ChevronDown
                    data-collapse-tier={collapseTier}
                    className={
                      hideLabelOnWrap
                        ? `lightcode-composer-label-hideable ${triggerIconSize} text-muted${forceHideLabel ? " is-hidden" : ""}`
                        : `${triggerIconSize} text-muted`
                    }
                  />
                )}
              </Button>
              <Tooltip.Content placement="top">{value}</Tooltip.Content>
            </Tooltip>
          )}
        </Popover.Trigger>
        <Popover.Content placement={popoverPlacement} className="w-80 p-0">
          <Popover.Dialog className="flex max-h-[24rem] flex-col overflow-hidden !p-0 !pb-1.5">
            {/* Search */}
            <div className="flex items-center gap-2 border-b border-border px-3 py-2">
              <Search className="size-3.5 shrink-0 text-muted" />
              <input
                ref={searchRef}
                className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted outline-none"
                placeholder={t`Search branches...`}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === "Escape") {
                    if (isCreating) {
                      setIsCreating(false);
                      setNewBranchName("");
                    } else {
                      setIsOpen(false);
                    }
                  }
                }}
              />
            </div>

            <div className="flex-1 overflow-hidden pb-1.5">
              <BranchListBox
                projectId={projectId}
                items={items}
                hasLocal={hasLocal}
                hasRemote={hasRemote}
                currentBranch={currentBranch}
                value={value}
                baseBranch={baseBranch}
                isWorktree={isWorktree}
                worktreeMode={worktreeMode}
                deletingBranch={deletingBranch}
                worktreeBranches={worktreeBranches}
                branchWorktreePath={branchWorktreePath}
                threadsByBranch={threadsByBranch}
                onSelect={handleSelectBranch}
                onDelete={(b) => handleRequestDelete(b as GitBranchInfo)}
                onOpenPrReview={handleOpenPrReview}
              />
            </div>

            <BranchFooterActions
              isCreating={isCreating}
              setIsCreating={setIsCreating}
              newBranchName={newBranchName}
              setNewBranchName={setNewBranchName}
              createRef={createRef}
              searchRef={searchRef}
              handleCreateBranch={handleCreateBranch}
              hideWorktreeToggle={hideWorktreeToggle}
              worktreeMode={worktreeMode}
              onWorktreeModeChange={onWorktreeModeChange}
              baseBranch={baseBranch}
              value={value}
              isWorktree={isWorktree}
              branchWorktreePath={branchWorktreePath}
              onSelect={onSelect}
              showMoveBranch={showMoveBranchAction}
              isMovingBranch={isMovingBranch}
              onMoveBranchToWorktree={() => void handleMoveBranchToWorktree()}
            />
          </Popover.Dialog>
        </Popover.Content>
      </Popover>
      <ConfirmDialog
        isOpen={pendingDelete !== null}
        title={pendingDelete?.worktreePath ? t`Remove worktree?` : t`Delete branch?`}
        body={
          pendingDelete?.worktreePath ? (
            pendingDelete.threadCount > 0 ? (
              <Trans>
                This removes the worktree on "{pendingDelete.branch.name}" and closes{" "}
                <Plural
                  value={pendingDelete.threadCount}
                  one="# linked thread"
                  other="# linked threads"
                />
                , then deletes the branch.
              </Trans>
            ) : (
              <Trans>
                This removes the worktree on "{pendingDelete.branch.name}", then deletes the branch.
              </Trans>
            )
          ) : pendingDelete?.branch.isRemote ? (
            <Trans>
              This permanently deletes the branch "{pendingDelete.branch.name}" from its remote.
            </Trans>
          ) : (
            <Trans>This permanently deletes the branch "{pendingDelete?.branch.name ?? ""}".</Trans>
          )
        }
        confirmLabel={pendingDelete?.worktreePath ? t`Remove` : t`Delete`}
        onConfirm={() => void confirmDelete()}
        onClose={() => setPendingDelete(null)}
      />
    </div>
  );
}

export { generateWorktreeBranch } from "./parts/generateWorktreeBranch";
