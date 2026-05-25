import { Check, GitBranch, Globe, Trash2 } from "lucide-react";
import { Header, Label, ListBox, ListLayout, Virtualizer } from "@heroui/react";
import { handleKeyActivate } from "@/renderer/utils/a11y";
import {
  COMPACT_DROPDOWN_ROW_HEIGHT,
  VIRTUALIZED_COMPACT_DROPDOWN_ITEM_CLASS,
} from "../../dropdownVirtualization";
import { PixelLoader } from "../../PixelLoader";
import type { BranchListItem } from "./useBranchList";

export function BranchListBox(props: {
  items: BranchListItem[];
  hasLocal: boolean;
  hasRemote: boolean;
  currentBranch: string;
  value: string;
  baseBranch: string | undefined;
  isWorktree: boolean | undefined;
  worktreeMode: boolean;
  deletingBranch: string | null;
  activeWorktreeBranches: Set<string>;
  worktreeBranches: Set<string>;
  onSelect: (branchName: string) => void;
  onDelete: (branch: { name: string; remote?: string; isRemote?: boolean }) => void;
}) {
  const {
    items,
    hasLocal,
    hasRemote,
    currentBranch,
    value,
    baseBranch,
    isWorktree,
    worktreeMode,
    deletingBranch,
    activeWorktreeBranches,
    worktreeBranches,
    onSelect,
    onDelete,
  } = props;

  if (!hasLocal && !hasRemote) {
    return <div className="px-3 py-3 text-center text-sm text-muted">No branches found</div>;
  }

  return (
    <Virtualizer
      layout={ListLayout}
      layoutOptions={{ rowHeight: COMPACT_DROPDOWN_ROW_HEIGHT, padding: 8 }}
    >
      <ListBox
        aria-label="Branches"
        className={`lightcode-menu max-h-60 overflow-y-auto ${VIRTUALIZED_COMPACT_DROPDOWN_ITEM_CLASS}`}
        items={items}
        selectedKeys={
          isWorktree || worktreeMode ? new Set([baseBranch ?? value]) : new Set([value])
        }
        selectionMode="single"
        disallowEmptySelection
        onSelectionChange={(keys) => {
          if (keys === "all") return;
          const selected = [...keys][0];
          if (selected !== undefined) {
            const item = items.find((i) => i.id === selected);
            if (item?.type === "branch") {
              onSelect(item.branch.name);
            }
          }
        }}
      >
        {(item) => {
          if (item.type === "header") {
            return (
              <ListBox.Item
                id={item.id}
                isDisabled
                className="!bg-transparent !cursor-default !opacity-100 !p-0 h-7 flex items-center"
                textValue={item.name}
              >
                <Header className="px-2 text-[10px] font-semibold uppercase tracking-wider text-muted/70">
                  {item.name}
                </Header>
              </ListBox.Item>
            );
          }
          const { branch } = item;
          const canDelete =
            branch.name !== currentBranch && !activeWorktreeBranches.has(branch.name);
          return (
            <ListBox.Item
              key={branch.name}
              id={branch.name}
              textValue={branch.name}
              className="group focus-visible:outline-none"
            >
              <ListBox.ItemIndicator>
                {({ isSelected }) => {
                  const isDeleting = deletingBranch === branch.name;
                  if (isDeleting) {
                    return <PixelLoader size="xs" className="text-muted" />;
                  }
                  return canDelete ? (
                    <>
                      {isSelected && <Check className="size-3 group-hover:hidden" />}
                      <div
                        role="button"
                        tabIndex={0}
                        aria-label={`Delete ${branch.name}`}
                        className={`items-center justify-center rounded text-muted/55 transition hover:text-danger ${isSelected ? "hidden group-hover:flex" : "opacity-0 group-hover:opacity-100 flex"}`}
                        onPointerDown={(e) => e.stopPropagation()}
                        onPointerUp={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          onDelete(branch);
                        }}
                        onKeyDown={(e) =>
                          handleKeyActivate(e, () => onDelete(branch), { stopPropagation: true })
                        }
                      >
                        <Trash2 className="size-3.5" />
                      </div>
                    </>
                  ) : isSelected ? (
                    <Check className="size-3" />
                  ) : null;
                }}
              </ListBox.ItemIndicator>
              {branch.isRemote ? (
                <Globe className="size-3.5 shrink-0 text-muted" />
              ) : (
                <GitBranch className="size-3.5 shrink-0 text-muted" />
              )}
              <Label className="flex-1 truncate">{branch.name}</Label>
              {branch.name === currentBranch && (
                <span className="text-[10px] text-muted">current</span>
              )}
              {worktreeBranches.has(branch.name) && branch.name !== currentBranch && (
                <span className="text-[10px] text-muted">worktree</span>
              )}
            </ListBox.Item>
          );
        }}
      </ListBox>
    </Virtualizer>
  );
}
