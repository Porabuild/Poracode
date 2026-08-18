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

export interface OpenPrReviewArgs {
  branch: string;
  prNumber: number;
  worktreePath?: string;
}

export function BranchListBox(props: {
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
}) {
  const {
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
  } = props;
  const { t } = useLingui();
  // In the mobile drawer, grow branch rows to a finger target. Drop the compact
  // `!h-7` force-class so the `.m-sheet .list-box-item { min-height }` rule sizes
  // them, and match the virtualizer's rowHeight so the scroll math stays in sync.
  const { mobile } = useResponsiveMenu();
  const rowHeight = mobile ? 44 : COMPACT_DROPDOWN_ROW_HEIGHT;

  if (!hasLocal && !hasRemote) {
    return (
      <div className="px-3 py-3 text-center text-sm text-muted">
        <Trans>No branches found</Trans>
      </div>
    );
  }

  const selectedRef = isWorktree || worktreeMode ? (baseBranch ?? value) : value;
  const listedBranches = items.flatMap((item) => (item.type === "branch" ? [item.branch] : []));
  const selectedKey = items.some((item) => item.type === "branch" && item.id === selectedRef)
    ? selectedRef
    : localBranchNameFromRef(selectedRef, listedBranches);

  return (
    <Virtualizer layout={ListLayout} layoutOptions={{ rowHeight, padding: 8 }}>
      <ListBox
        aria-label={t`Branches`}
        className={`poracode-menu max-h-60 overflow-y-auto ${mobile ? "" : VIRTUALIZED_COMPACT_DROPDOWN_ITEM_CLASS}`}
        items={items}
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
          return (
            <ListBox.Item
              key={branch.name}
              id={branch.name}
              textValue={branch.name}
              className="group focus-visible:outline-none"
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
}

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
