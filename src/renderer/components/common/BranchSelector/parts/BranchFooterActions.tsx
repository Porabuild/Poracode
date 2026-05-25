import type { RefObject } from "react";
import { GitFork, Plus } from "lucide-react";
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
  } = props;

  return (
    <div className="border-t border-border px-1.5 pt-1.5">
      {/* Create new branch */}
      <ListBox
        aria-label="Actions"
        className="lightcode-menu"
        selectionMode="none"
        onAction={() => {
          setIsCreating(true);
          setNewBranchName("");
        }}
      >
        <ListBox.Item
          id="create"
          textValue="Create new branch"
          className={`focus-visible:outline-none ${isCreating ? "!transform-none !transition-none" : ""}`}
        >
          {isCreating ? (
            <>
              <Plus className="size-3.5 shrink-0 text-muted" />
              <input
                ref={createRef}
                className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted outline-none"
                placeholder="New branch name..."
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
              <Label>Create new branch...</Label>
            </>
          )}
        </ListBox.Item>
      </ListBox>

      {/* Worktree toggle */}
      {!hideWorktreeToggle && (
        <ListBox
          aria-label="Options"
          className="lightcode-menu"
          selectionMode="none"
          onAction={() => {
            const next = !worktreeMode;
            onWorktreeModeChange?.(next);
            if (next) {
              const base = baseBranch ?? value;
              onSelect?.({ branch: base, baseBranch: base, isWorktree: true });
            } else if (isWorktree && baseBranch) {
              onSelect?.({ branch: baseBranch, isWorktree: false });
            }
          }}
        >
          <ListBox.Item
            id="worktree"
            textValue="New worktree"
            className="focus-visible:outline-none"
          >
            <GitFork className="size-3.5 text-muted" />
            <Label className="flex-1">New worktree</Label>
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
    </div>
  );
}
