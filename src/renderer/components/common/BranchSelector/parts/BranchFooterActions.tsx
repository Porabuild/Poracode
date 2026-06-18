import type { RefObject } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import { FolderInput, GitFork, Plus } from "lucide-react";
import { Checkbox, Label, ListBox } from "@heroui/react";
import type { BranchSelection } from "./types";

export function BranchFooterActions(props: {
  isCreating: boolean;
  setIsCreating: (v: boolean) => void;
  newBranchName: string;
  setNewBranchName: (v: string) => void;
  createRef: RefObject<HTMLInputElement | null>;
  searchRef: RefObject<HTMLInputElement | null>;
  handleCreateBranch: () => void;
  hideWorktreeToggle: boolean | undefined;
  worktreeMode: boolean;
  onWorktreeModeChange: ((value: boolean) => void) | undefined;
  baseBranch: string | undefined;
  value: string;
  isWorktree: boolean | undefined;
  branchWorktreePath: Map<string, string>;
  onSelect: ((selection: BranchSelection) => void) | undefined;
  showMoveBranch: boolean;
  isMovingBranch: boolean;
  onMoveBranchToWorktree: () => void;
}) {
  const {
    isCreating,
    setIsCreating,
    newBranchName,
    setNewBranchName,
    createRef,
    searchRef,
    handleCreateBranch,
    hideWorktreeToggle,
    worktreeMode,
    onWorktreeModeChange,
    baseBranch,
    value,
    isWorktree,
    branchWorktreePath,
    onSelect,
    showMoveBranch,
    isMovingBranch,
    onMoveBranchToWorktree,
  } = props;
  const { t } = useLingui();

  return (
    <div className="border-t border-border px-1.5 pt-1.5">
      {/* Create new branch */}
      <ListBox
        aria-label={t`Actions`}
        className="lightcode-menu"
        selectionMode="none"
        onAction={() => {
          setIsCreating(true);
          setNewBranchName("");
        }}
      >
        <ListBox.Item
          id="create"
          textValue={t`Create new branch`}
          className={`focus-visible:outline-none ${isCreating ? "!transform-none !transition-none" : ""}`}
        >
          {isCreating ? (
            <>
              <Plus className="size-3.5 shrink-0 text-muted" />
              <input
                ref={createRef}
                className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted outline-none"
                placeholder={t`New branch name...`}
                value={newBranchName}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => setNewBranchName(e.target.value)}
                onBlur={() => {
                  setIsCreating(false);
                  setNewBranchName("");
                }}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === "Enter") handleCreateBranch();
                  if (e.key === "Escape") {
                    setIsCreating(false);
                    setNewBranchName("");
                    searchRef.current?.focus();
                  }
                }}
              />
            </>
          ) : (
            <>
              <Plus className="size-3.5 shrink-0 text-muted" />
              <Label>
                <Trans>Create new branch...</Trans>
              </Label>
            </>
          )}
        </ListBox.Item>
      </ListBox>

      {/* Worktree toggle */}
      {!hideWorktreeToggle && (
        <ListBox
          aria-label={t`Options`}
          className="lightcode-menu"
          selectionMode="none"
          onAction={() => {
            const next = !worktreeMode;
            onWorktreeModeChange?.(next);
            if (next) {
              const base = baseBranch ?? value;
              onSelect?.({ branch: base, baseBranch: base, isWorktree: true });
            } else if (isWorktree && baseBranch) {
              const existingWorktreePath = branchWorktreePath.get(baseBranch);
              if (existingWorktreePath) {
                onSelect?.({
                  branch: baseBranch,
                  baseBranch,
                  isWorktree: true,
                  worktreePath: existingWorktreePath,
                });
              } else {
                onSelect?.({ branch: baseBranch, isWorktree: false });
              }
            }
          }}
        >
          <ListBox.Item
            id="worktree"
            textValue={t`New worktree`}
            className="focus-visible:outline-none"
          >
            <GitFork className="size-3.5 text-muted" />
            <Label className="flex-1">
              <Trans>New worktree</Trans>
            </Label>
            <Checkbox
              slot={null}
              isSelected={worktreeMode}
              onChange={(checked) => {
                onWorktreeModeChange?.(checked);
                if (checked) {
                  const base = baseBranch ?? value;
                  onSelect?.({
                    branch: base,
                    baseBranch: base,
                    isWorktree: true,
                  });
                } else if (isWorktree && baseBranch) {
                  const existingWorktreePath = branchWorktreePath.get(baseBranch);
                  if (existingWorktreePath) {
                    onSelect?.({
                      branch: baseBranch,
                      baseBranch,
                      isWorktree: true,
                      ...(existingWorktreePath ? { worktreePath: existingWorktreePath } : {}),
                    });
                  } else {
                    onSelect?.({ branch: baseBranch, isWorktree: false });
                  }
                }
              }}
            >
              <Checkbox.Control>
                <Checkbox.Indicator />
              </Checkbox.Control>
            </Checkbox>
          </ListBox.Item>
        </ListBox>
      )}

      {/* Move the current uncommitted changes into a new worktree */}
      {showMoveBranch && (
        <ListBox
          aria-label={t`Move changes to a new worktree`}
          className="lightcode-menu"
          selectionMode="none"
          disabledKeys={isMovingBranch ? ["move-branch"] : []}
          onAction={() => onMoveBranchToWorktree()}
        >
          <ListBox.Item
            id="move-branch"
            textValue={t`Move changes to a new worktree`}
            className="focus-visible:outline-none"
          >
            <FolderInput className="size-3.5 shrink-0 text-muted" />
            <Label className="flex-1">
              {isMovingBranch ? (
                <Trans>Moving changes…</Trans>
              ) : (
                <Trans>Move changes to a new worktree</Trans>
              )}
            </Label>
          </ListBox.Item>
        </ListBox>
      )}
    </div>
  );
}
