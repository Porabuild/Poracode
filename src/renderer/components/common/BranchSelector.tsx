import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, GitBranch, GitFork, Plus, Search } from "lucide-react";
import { Checkbox, Header, Label, ListBox, Popover } from "@heroui/react";
import type { GitBranchInfo } from "../../../shared/contracts";
import { useGitStore } from "../../state/gitStore";
import { Button } from "./Button";

export interface BranchSelection {
  branch: string;
  baseBranch?: string;
  isNew: boolean;
  isWorktree: boolean;
  worktreePath?: string;
}

const ADJECTIVES = [
  "awesome",
  "brave",
  "calm",
  "daring",
  "eager",
  "fair",
  "gentle",
  "happy",
  "keen",
  "lively",
  "merry",
  "noble",
  "polite",
  "quiet",
  "royal",
  "sharp",
  "swift",
  "tender",
  "vivid",
  "warm",
  "bold",
  "clear",
  "fresh",
  "grand",
];
const NOUNS = [
  "albatross",
  "badger",
  "condor",
  "dolphin",
  "eagle",
  "falcon",
  "gazelle",
  "heron",
  "ibis",
  "jaguar",
  "kestrel",
  "lemur",
  "marten",
  "newt",
  "otter",
  "puma",
  "quail",
  "raven",
  "stork",
  "tern",
  "viper",
  "wren",
  "yak",
  "zebra",
];

export function generateWorktreeBranch(): string {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)]!;
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)]!;
  return `lightcode/${adj}-${noun}`;
}

export interface BranchSelectorProps {
  projectId: string;
  currentBranch: string;
  value: string;
  isWorktree?: boolean | undefined;
  isNew?: boolean | undefined;
  baseBranch?: string | undefined;
  worktreeMode: boolean;
  onWorktreeModeChange: (value: boolean) => void;
  onSelect: (selection: BranchSelection) => void;
  isDisabled?: boolean;
}

export function BranchSelector(props: BranchSelectorProps) {
  const {
    projectId,
    currentBranch,
    value,
    isWorktree,
    isNew,
    baseBranch,
    worktreeMode,
    onWorktreeModeChange,
    onSelect,
    isDisabled,
  } = props;
  const branchData = useGitStore((s) => s.branches[projectId]);
  const worktrees = useGitStore((s) => s.worktrees[projectId]);
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [newBranchName, setNewBranchName] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const createRef = useRef<HTMLInputElement>(null);

  const worktreeBranches = new Set(worktrees?.filter((w) => !w.isMain).map((w) => w.branch) ?? []);
  const branchWorktreePath = new Map(
    worktrees?.filter((w) => !w.isMain && w.branch).map((w) => [w.branch, w.path]) ?? [],
  );

  // Deduplicate: prefer local over remote with same name
  const allBranches = branchData?.branches ?? [];
  const seen = new Set<string>();
  const deduped: GitBranchInfo[] = [];
  for (const b of allBranches) {
    if (!b.isRemote && !seen.has(b.name)) {
      seen.add(b.name);
      deduped.push(b);
    }
  }
  for (const b of allBranches) {
    if (b.isRemote && !seen.has(b.name)) {
      seen.add(b.name);
      deduped.push(b);
    }
  }

  const filtered = search.trim()
    ? deduped.filter((b) => b.name.toLowerCase().includes(search.toLowerCase()))
    : deduped;

  const localBranches = filtered.filter((b) => !b.isRemote);
  const remoteBranches = filtered.filter((b) => b.isRemote);

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
      onSelect({
        branch,
        baseBranch: branch,
        isNew: false,
        isWorktree: true,
      });
    } else if (branchWorktreePath.has(branch)) {
      const existingWorktreePath = branchWorktreePath.get(branch);
      if (existingWorktreePath) {
        onSelect({
          branch,
          baseBranch: branch,
          isNew: false,
          isWorktree: true,
          worktreePath: existingWorktreePath,
        });
      } else {
        onSelect({ branch, isNew: false, isWorktree: false });
      }
    } else {
      onSelect({ branch, isNew: false, isWorktree: false });
    }
    setIsOpen(false);
  }

  function handleCreateBranch() {
    const name = newBranchName.trim();
    if (!name) return;
    onWorktreeModeChange(false);
    onSelect({ branch: name, isNew: true, isWorktree: false });
    setIsOpen(false);
    setIsCreating(false);
    setNewBranchName("");
  }

  const hasLocal = localBranches.length > 0;
  const hasRemote = remoteBranches.length > 0;

  return (
    <div className="flex items-center gap-1">
      {isNew && !isWorktree && <span className="shrink-0 text-xs text-muted">new</span>}
      {(isWorktree || worktreeMode) && (
        <span className="shrink-0 text-xs text-muted">from</span>
      )}
      <Popover isOpen={isOpen} onOpenChange={setIsOpen}>
        <Popover.Trigger>
          <Button
            aria-label="Select branch"
            isDisabled={isDisabled ?? false}
            size="sm"
            variant="ghost"
            className="lightcode-composer-menu min-w-0 px-2.5"
          >
            {isWorktree || worktreeMode ? (
              <GitFork className="size-3.5 text-muted" />
            ) : (
              <GitBranch className="size-3.5 text-muted" />
            )}
            <span className="truncate">{value}</span>
            <ChevronDown className="size-3.5 text-muted" />
          </Button>
        </Popover.Trigger>
        <Popover.Content placement="top" className="w-96 p-0">
          <Popover.Dialog className="flex max-h-80 flex-col overflow-hidden">
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

            {/* Branch list */}
            <div className="flex-1 overflow-y-auto">
              {(hasLocal || hasRemote) && (
                <ListBox
                  aria-label="Branches"
                  className="p-1"
                  selectedKeys={
                    isWorktree || worktreeMode
                      ? new Set([baseBranch ?? value])
                      : new Set([value])
                  }
                  selectionMode="single"
                  disallowEmptySelection
                  onSelectionChange={(keys) => {
                    if (keys === "all") return;
                    const selected = [...keys][0];
                    if (selected !== undefined) handleSelectBranch(String(selected));
                  }}
                >
                  {hasLocal ? (
                    <ListBox.Section>
                      <Header>Branches</Header>
                      {localBranches.map((branch) => (
                        <ListBox.Item key={branch.name} id={branch.name} textValue={branch.name}>
                          <ListBox.ItemIndicator />
                          <GitBranch className="size-3.5 shrink-0 text-muted" />
                          <Label className="flex-1 truncate">{branch.name}</Label>
                          {branch.name === currentBranch && (
                            <span className="text-[10px] text-muted">current</span>
                          )}
                          {worktreeBranches.has(branch.name) && branch.name !== currentBranch && (
                            <span className="text-[10px] text-muted">worktree</span>
                          )}
                        </ListBox.Item>
                      ))}
                    </ListBox.Section>
                  ) : null}
                  {hasRemote ? (
                    <ListBox.Section>
                      <Header>Remote</Header>
                      {remoteBranches.map((branch) => (
                        <ListBox.Item
                          key={`remote-${branch.name}`}
                          id={branch.name}
                          textValue={branch.name}
                        >
                          <ListBox.ItemIndicator />
                          <GitBranch className="size-3.5 shrink-0 text-muted" />
                          <Label className="flex-1 truncate">{branch.name}</Label>
                        </ListBox.Item>
                      ))}
                    </ListBox.Section>
                  ) : null}
                </ListBox>
              )}

              {filtered.length === 0 && (
                <div className="px-3 py-3 text-center text-sm text-muted">No branches found</div>
              )}
            </div>

            {/* Footer */}
            <div className="border-t border-border">
              {/* Create new branch */}
              <ListBox
                aria-label="Actions"
                className="p-1"
                selectionMode="none"
                onAction={() => {
                  setIsCreating(true);
                  setNewBranchName(isNew ? value : "");
                }}
              >
                <ListBox.Item
                  id="create"
                  textValue="Create new branch"
                  className={isCreating ? "!transform-none !transition-none" : ""}
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
                  ) : isNew && !isWorktree ? (
                    <>
                      <Plus className="size-3.5 shrink-0 text-muted" />
                      <Label className="flex-1 truncate">{value}</Label>
                      <span className="text-[10px] text-muted">new</span>
                      <Check className="size-3 shrink-0 text-default-foreground" />
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
              <ListBox
                aria-label="Options"
                className="p-1"
                selectionMode="none"
                disabledKeys={isNew && !isWorktree ? ["worktree"] : []}
                onAction={() => {
                  if (!isNew || isWorktree) {
                    const next = !worktreeMode;
                    onWorktreeModeChange(next);
                    if (!next && isWorktree && baseBranch) {
                      onSelect({ branch: baseBranch, isNew: false, isWorktree: false });
                    }
                  }
                }}
              >
                <ListBox.Item id="worktree" textValue="New worktree">
                  <GitFork className="size-3.5 text-muted" />
                  <Label className="flex-1">New worktree</Label>
                  <Checkbox
                    slot={null}
                    isDisabled={!!isNew && !isWorktree}
                    isSelected={worktreeMode}
                    onChange={(checked) => {
                      onWorktreeModeChange(checked);
                      if (!checked && isWorktree && baseBranch) {
                        const existingWorktreePath = branchWorktreePath.get(baseBranch);
                        if (existingWorktreePath) {
                          onSelect({
                            branch: baseBranch,
                            baseBranch,
                            isNew: false,
                            isWorktree: true,
                            ...(existingWorktreePath ? { worktreePath: existingWorktreePath } : {}),
                          });
                        } else {
                          onSelect({ branch: baseBranch, isNew: false, isWorktree: false });
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
            </div>
          </Popover.Dialog>
        </Popover.Content>
      </Popover>
    </div>
  );
}
