import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import {
  Check,
  GitBranch,
  GitFork,
  GitPullRequest,
  Globe,
  MessageSquare,
  Trash2,
} from "lucide-react";
import { Header, Label, ListBox, ListLayout, Tooltip, Virtualizer } from "@heroui/react";
import type { Thread } from "@/shared/contracts";
import {
  buildBranchNamePrKey,
  usePrChecksStatus,
  usePrMergeStateStatus,
  usePrMergeable,
  usePrNumber,
  usePrReviewDecision,
  usePrState,
  usePrTitle,
} from "@/renderer/state/gitSelectors";
import { getPrStatusTone, PR_TONE_TEXT_CLASS } from "@/renderer/utils/prStatus";
import { getStatusTone, type StatusTone } from "@/renderer/components/providers/statusTone";
import {
  COMPACT_DROPDOWN_ROW_HEIGHT,
  VIRTUALIZED_COMPACT_DROPDOWN_ITEM_CLASS,
} from "../../dropdownVirtualization";
import { PixelLoader } from "../../PixelLoader";
import { useResponsiveMenu } from "../../ResponsiveMenuSurface";
import type { BranchListItem } from "./useBranchList";
import { localBranchNameFromRef } from "./worktreeBaseRef";

const STATUS_DOT_CLASS: Record<StatusTone, string> = {
  inactive: "bg-muted/40",
  active: "bg-success",
  working: "bg-warning",
  finished: "bg-success",
  error: "bg-danger",
  attention: "bg-warning",
  done: "bg-muted/40",
};

// Matches the virtualizer's `layoutOptions.padding`, used to translate a row
// index into the scroll offset that keeps the keyboard-active row visible.
const BRANCH_LIST_PADDING = 8;

export interface OpenPrReviewArgs {
  branch: string;
  prNumber: number;
  worktreePath?: string;
}

/**
 * DOM id React Aria assigns to a listbox option. Mirrors the library's
 * `${listId}-option-${normalizedKey}` scheme so the search combobox can point
 * `aria-activedescendant` at a row without moving focus out of the field.
 */
export function branchOptionDomId(listboxId: string, branchName: string): string {
  return `${listboxId}-option-${branchName.replace(/\s*/g, "")}`;
}

export interface BranchListBoxHandle {
  moveActive: (delta: number) => void;
  selectActive: () => void;
}

export interface BranchListBoxProps {
  listboxId: string;
  projectId: string;
  items: BranchListItem[];
  hasLocal: boolean;
  hasRemote: boolean;
  currentBranch: string;
  value: string;
  baseBranch: string | undefined;
  isWorktree: boolean | undefined;
  worktreeMode: boolean;
  deletingBranch: string | null;
  worktreeBranches: Set<string>;
  branchWorktreePath: Map<string, string>;
  threadsByBranch: Map<string, Thread[]>;
  allowWorktreeDelete?: boolean;
  selectionOnly?: boolean;
  onSelect: (branchName: string) => void;
  onDelete: (branch: { name: string; remote?: string; isRemote?: boolean }) => void;
  onOpenPrReview: (args: OpenPrReviewArgs) => void;
  onActiveChange: (branchName: string | null) => void;
}

export const BranchListBox = forwardRef<BranchListBoxHandle, BranchListBoxProps>(
  function BranchListBox(props, ref) {
    const {
      listboxId,
      projectId,
      items,
      hasLocal,
      hasRemote,
      currentBranch,
      value,
      baseBranch,
      isWorktree,
      worktreeMode,
      deletingBranch,
      worktreeBranches,
      branchWorktreePath,
      threadsByBranch,
      allowWorktreeDelete = true,
      selectionOnly = false,
      onSelect,
      onDelete,
      onOpenPrReview,
      onActiveChange,
    } = props;
    const { t } = useLingui();
    // In the mobile drawer, grow branch rows to a finger target. Drop the compact
    // `!h-7` force-class so the `.m-sheet .list-box-item { min-height }` rule sizes
    // them, and match the virtualizer's rowHeight so the scroll math stays in sync.
    const { mobile } = useResponsiveMenu();
    const rowHeight = mobile ? 44 : COMPACT_DROPDOWN_ROW_HEIGHT;
    const listBoxRef = useRef<HTMLDivElement>(null);
    const skipScrollRef = useRef(false);
    const listedBranches = items.flatMap((item) => (item.type === "branch" ? [item.branch] : []));
    const branchNames = listedBranches.map((branch) => branch.name);
    const selectedRef = isWorktree || worktreeMode ? (baseBranch ?? value) : value;
    const selectedKey = items.some((item) => item.type === "branch" && item.id === selectedRef)
      ? selectedRef
      : localBranchNameFromRef(selectedRef, listedBranches);
    // The keyboard-active row starts on the selected branch (or the first row)
    // and falls back to it whenever the search narrows the row out of the list.
    const initialActiveBranchName = branchNames.includes(selectedKey)
      ? selectedKey
      : (branchNames[0] ?? null);
    const [activeBranchName, setActiveBranchName] = useState<string | null>(
      initialActiveBranchName,
    );
    // The mobile drawer has no hover affordance, so only show the highlight
    // once the user actually navigates with the keyboard.
    const [showMobileKeyboardHighlight, setShowMobileKeyboardHighlight] = useState(false);
    const activeBranchIndex =
      activeBranchName === null ? -1 : branchNames.indexOf(activeBranchName);
    if (activeBranchIndex < 0 && activeBranchName !== initialActiveBranchName) {
      setActiveBranchName(initialActiveBranchName);
    }

    useEffect(() => {
      onActiveChange(activeBranchIndex >= 0 ? activeBranchName : null);
    }, [activeBranchIndex, activeBranchName, onActiveChange]);

    useEffect(() => {
      if (skipScrollRef.current) {
        skipScrollRef.current = false;
        return;
      }
      if (activeBranchIndex < 0 || activeBranchName === null) return;
      const listBox = listBoxRef.current;
      if (!listBox) return;
      const itemIndex = items.findIndex((item) => item.id === activeBranchName);
      if (itemIndex < 0) return;
      const viewHeight = listBox.clientHeight;
      if (viewHeight <= 0) return;
      const rowTop = BRANCH_LIST_PADDING + itemIndex * rowHeight;
      const rowBottom = rowTop + rowHeight;
      const viewTop = listBox.scrollTop;
      if (rowTop < viewTop) listBox.scrollTop = rowTop;
      else if (rowBottom > viewTop + viewHeight) listBox.scrollTop = rowBottom - viewHeight;
    }, [activeBranchIndex, activeBranchName, items, rowHeight]);

    function moveActive(delta: number) {
      if (branchNames.length === 0) return;
      if (mobile) setShowMobileKeyboardHighlight(true);
      const basePosition = activeBranchIndex < 0 ? (delta > 0 ? -1 : 0) : activeBranchIndex;
      const nextPosition = Math.max(0, Math.min(branchNames.length - 1, basePosition + delta));
      setActiveBranchName(branchNames[nextPosition] ?? null);
    }

    useImperativeHandle(ref, () => ({
      moveActive,
      selectActive() {
        const nextBranch = activeBranchIndex >= 0 ? activeBranchName : (branchNames[0] ?? null);
        if (nextBranch !== null) onSelect(nextBranch);
      },
    }));

    if (!hasLocal && !hasRemote) {
      return (
        <div className="px-3 py-3 text-center text-sm text-muted">
          <Trans>No branches found</Trans>
        </div>
      );
    }

    return (
      <Virtualizer layout={ListLayout} layoutOptions={{ rowHeight, padding: BRANCH_LIST_PADDING }}>
        <ListBox
          ref={listBoxRef}
          id={listboxId}
          aria-label={t`Branches`}
          className={`poracode-menu max-h-60 overflow-y-auto ${mobile ? "" : VIRTUALIZED_COMPACT_DROPDOWN_ITEM_CLASS}`}
          items={items}
          dependencies={[activeBranchName, showMobileKeyboardHighlight]}
          selectedKeys={new Set([selectedKey])}
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
              const headerLabel = t(item.name);
              return (
                <ListBox.Item
                  id={item.id}
                  isDisabled
                  className="!bg-transparent !cursor-default !opacity-100 !p-0 h-7 flex items-center"
                  textValue={headerLabel}
                >
                  <Header className="px-2 text-[10px] font-semibold uppercase tracking-wider text-muted/70">
                    {headerLabel}
                  </Header>
                </ListBox.Item>
              );
            }
            const { branch } = item;
            const isCurrent = branch.name === currentBranch;
            const isDeleting = deletingBranch === branch.name;
            const worktreePath = branchWorktreePath.get(branch.name);
            const isWorktreeBranch = worktreeBranches.has(branch.name) && !isCurrent;
            const threads = threadsByBranch.get(branch.name) ?? [];
            const isSelected = branch.name === selectedKey;
            const isActive =
              branch.name === activeBranchName && (!mobile || showMobileKeyboardHighlight);
            return (
              <ListBox.Item
                key={branch.name}
                id={branch.name}
                textValue={branch.name}
                data-active={isActive ? "true" : undefined}
                className="group focus-visible:outline-none data-[active=true]:bg-default"
                onFocus={() => setActiveBranchName(branch.name)}
                onPointerMove={(event) => {
                  if (mobile) return;
                  if (event.movementX === 0 && event.movementY === 0) return;
                  if (branch.name === activeBranchName) return;
                  skipScrollRef.current = true;
                  setActiveBranchName(branch.name);
                }}
              >
                <BranchRowBody
                  branch={branch}
                  projectId={projectId}
                  isCurrent={isCurrent}
                  isSelected={isSelected}
                  isWorktreeBranch={isWorktreeBranch}
                  {...(worktreePath ? { worktreePath } : {})}
                  threads={threads}
                  isDeleting={isDeleting}
                  allowWorktreeDelete={allowWorktreeDelete}
                  selectionOnly={selectionOnly}
                  onDelete={onDelete}
                  onOpenPrReview={onOpenPrReview}
                />
              </ListBox.Item>
            );
          }}
        </ListBox>
      </Virtualizer>
    );
  },
);

function BranchRowBody(props: {
  branch: { name: string; isRemote: boolean; remote?: string };
  projectId: string;
  isCurrent: boolean;
  isSelected: boolean;
  isWorktreeBranch: boolean;
  worktreePath?: string;
  threads: Thread[];
  isDeleting: boolean;
  allowWorktreeDelete: boolean;
  selectionOnly: boolean;
  onDelete: (branch: { name: string; remote?: string; isRemote?: boolean }) => void;
  onOpenPrReview: (args: OpenPrReviewArgs) => void;
}) {
  const {
    branch,
    projectId,
    isCurrent,
    isSelected,
    isWorktreeBranch,
    worktreePath,
    threads,
    isDeleting,
    allowWorktreeDelete,
    selectionOnly,
    onDelete,
    onOpenPrReview,
  } = props;
  const { t } = useLingui();
  const canDelete = !selectionOnly && !isCurrent && (allowWorktreeDelete || !worktreePath);

  const prKey = worktreePath ?? buildBranchNamePrKey(projectId, branch.name);
  const prState = usePrState(prKey);
  const prChecksStatus = usePrChecksStatus(prKey);
  const prReviewDecision = usePrReviewDecision(prKey);
  const prMergeable = usePrMergeable(prKey);
  const prMergeStateStatus = usePrMergeStateStatus(prKey);
  const prNumber = usePrNumber(prKey);
  const prTitle = usePrTitle(prKey);
  const showPr = prState !== undefined && prState !== "closed" && prNumber !== undefined;

  // The leading glyph carries the row's kind: a fork for worktree branches, a
  // globe for remote ones, a plain branch otherwise. The current branch keeps
  // its glyph but brightens to foreground (white) instead of a "current" label.
  const LeadingIcon = branch.isRemote ? Globe : isWorktreeBranch ? GitFork : GitBranch;

  return (
    <>
      <LeadingIcon
        className={`size-3.5 shrink-0 ${isCurrent ? "text-foreground" : "text-muted"}`}
      />
      <Label className="flex-1 truncate">{branch.name}</Label>
      <div className="flex shrink-0 items-center gap-1.5">
        {!selectionOnly && threads.length > 0 && (
          <Tooltip delay={150}>
            <Tooltip.Trigger
              tabIndex={-1}
              role="none"
              className="flex items-center gap-0.5 text-[10px] text-muted"
            >
              <span className="flex items-center gap-0.5">
                <MessageSquare className="size-3 shrink-0" />
                {threads.length}
              </span>
            </Tooltip.Trigger>
            <Tooltip.Content placement="top" className="max-w-[16rem]">
              <div className="flex flex-col gap-1 py-0.5">
                {threads.map((thread) => (
                  <div key={thread.id} className="flex items-center gap-1.5 text-xs">
                    <span
                      className={`size-1.5 shrink-0 rounded-full ${STATUS_DOT_CLASS[getStatusTone(thread)]}`}
                    />
                    <span className="truncate">{thread.title}</span>
                  </div>
                ))}
              </div>
            </Tooltip.Content>
          </Tooltip>
        )}
        {!selectionOnly && showPr && (
          <Tooltip delay={150}>
            <Tooltip.Trigger tabIndex={-1} role="none">
              <button
                type="button"
                aria-label={t`Review PR #${prNumber} for ${branch.name}`}
                className={`flex items-center rounded border-0 bg-transparent p-0.5 transition hover:bg-[var(--row-hover)] ${PR_TONE_TEXT_CLASS[getPrStatusTone(prState, prChecksStatus, { reviewDecision: prReviewDecision, mergeable: prMergeable, mergeStateStatus: prMergeStateStatus })]}`}
                onPointerDown={(e) => e.stopPropagation()}
                onPointerUp={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenPrReview({
                    branch: branch.name,
                    prNumber,
                    ...(worktreePath ? { worktreePath } : {}),
                  });
                }}
              >
                <GitPullRequest className="size-3.5" />
              </button>
            </Tooltip.Trigger>
            <Tooltip.Content placement="top" className="max-w-[18rem]">
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="truncate font-medium">{prTitle || `PR #${prNumber}`}</span>
                <span className="text-[10px] text-muted">
                  #{prNumber} · {prState}
                </span>
              </div>
            </Tooltip.Content>
          </Tooltip>
        )}
        {isSelected && !isDeleting && <Check className="size-3.5 shrink-0 text-foreground" />}
        <div className="flex w-5 shrink-0 items-center justify-center">
          {isDeleting ? (
            <PixelLoader size="xs" className="text-muted" />
          ) : canDelete ? (
            <button
              type="button"
              aria-label={t`Delete ${branch.name}`}
              className="flex items-center justify-center rounded border-0 bg-transparent p-0 text-muted/55 opacity-0 transition hover:text-danger group-hover:opacity-100 [@media(hover:none)]:opacity-100 [@media(pointer:coarse)]:opacity-100"
              onPointerDown={(e) => e.stopPropagation()}
              onPointerUp={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onDelete(branch);
              }}
            >
              <Trash2 className="size-3.5" />
            </button>
          ) : null}
        </div>
      </div>
    </>
  );
}
