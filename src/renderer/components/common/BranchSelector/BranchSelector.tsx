import { type ReactNode, useEffect, useRef, useState } from "react";
import { ChevronDown, GitBranch, GitFork, Search } from "lucide-react";
import { Popover, toast, Tooltip } from "@heroui/react";
import type { GitBranchInfo } from "@/shared/contracts";
import { friendlyError } from "@/shared/messages";
import { readBridge } from "@/renderer/bridge";
import { useGitStore } from "@/renderer/state/gitStore";
import { Button } from "../Button";
import { useBranchList } from "./parts/useBranchList";
import { BranchListBox } from "./parts/BranchListBox";
import { BranchFooterActions } from "./parts/BranchFooterActions";
import type { BranchSelection } from "./parts/types";

export type { BranchSelection };

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
  popoverPlacement?: "top" | "bottom";
  forceHideLabel?: boolean;
  iconOnly?: boolean;
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
    popoverPlacement = "top",
    forceHideLabel = false,
    iconOnly = false,
  } = props;

  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [newBranchName, setNewBranchName] = useState("");
  const [deletingBranch, setDeletingBranch] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const createRef = useRef<HTMLInputElement>(null);

  const {
    items,
    hasLocal,
    hasRemote,
    activeWorktreeBranches,
    worktreeBranches,
    branchWorktreePath,
    projectLocation,
  } = useBranchList({ projectId, search });

  useEffect(() => {
    if (isOpen) {
      setSearch("");
      setIsCreating(false);
      setNewBranchName("");
      setTimeout(() => searchRef.current?.focus(), 50);
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

  async function handleDeleteBranch(branch: GitBranchInfo) {
    if (!projectLocation) return;
    setDeletingBranch(branch.name);
    try {
      if (!branch.isRemote) {
        const wtPath = branchWorktreePath.get(branch.name);
        if (wtPath) {
          await readBridge().gitRemoveWorktree({
            projectLocation,
            path: wtPath,
            force: true,
            deleteBranch: false,
          });
        }
      }
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

  return (
    <div className={`flex items-center gap-1 ${props.className ?? ""}`}>
      {worktreeMode && <span className="shrink-0 text-xs text-muted">from</span>}
      <Popover isOpen={isOpen} onOpenChange={setIsOpen}>
        <Popover.Trigger className="flex flex-1 min-w-0 items-center">
          {trigger ?? (
            <Tooltip delay={0}>
              <Button
                aria-label="Select branch"
                isDisabled={isDisabled ?? false}
                size="sm"
                variant="ghost"
                className="lightcode-composer-menu min-w-0 max-w-48 px-2.5"
              >
                {isWorktree || worktreeMode ? (
                  <GitFork className="size-3.5 text-muted" />
                ) : (
                  <GitBranch className="size-3.5 text-muted" />
                )}
                {!iconOnly && (
                  <span
                    className={
                      forceHideLabel
                        ? "lightcode-composer-label-hideable truncate is-hidden"
                        : "truncate"
                    }
                  >
                    {value}
                  </span>
                )}
                {!iconOnly && (
                  <ChevronDown
                    className={
                      forceHideLabel
                        ? "lightcode-composer-label-hideable size-3.5 text-muted is-hidden"
                        : "size-3.5 text-muted"
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
                placeholder="Search branches..."
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
                items={items}
                hasLocal={hasLocal}
                hasRemote={hasRemote}
                currentBranch={currentBranch}
                value={value}
                baseBranch={baseBranch}
                isWorktree={isWorktree}
                worktreeMode={worktreeMode}
                deletingBranch={deletingBranch}
                activeWorktreeBranches={activeWorktreeBranches}
                worktreeBranches={worktreeBranches}
                onSelect={handleSelectBranch}
                onDelete={(b) => void handleDeleteBranch(b as GitBranchInfo)}
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
            />
          </Popover.Dialog>
        </Popover.Content>
      </Popover>
    </div>
  );
}

export { generateWorktreeBranch } from "./parts/generateWorktreeBranch";
