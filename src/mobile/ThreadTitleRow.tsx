import { useState } from "react";
import { useLingui } from "@lingui/react/macro";
import {
  Archive,
  CircleCheck,
  Ellipsis,
  Pencil,
  Plus,
  SquareTerminal,
  Star,
  Trash2,
} from "lucide-react";
import type { Thread } from "@/shared/contracts";
import { Button } from "@/renderer/components/common";
import { InlineRenameInput } from "@/renderer/views/MainView/parts/Sidebar/parts/InlineRenameInput";
import { SheetMenu, StatusBadge, type SheetMenuItem } from "./components";
import { WorkspaceChip } from "./GitSummaryParts";
import { worktreeBranchOf, worktreeSiblingIds } from "./threadUtils";
import type { ThreadAction } from "./useRemoteDesktop";
import type { WorkspaceTab } from "./views/WorkspaceView";

function ThreadActionsMenuTrigger(props: { readonly open: () => void; readonly label: string }) {
  return (
    <Button
      isIconOnly
      className="m-topbar__actions"
      aria-label={props.label}
      size="sm"
      variant="ghost"
      onPress={props.open}
    >
      <Ellipsis className="size-4" />
    </Button>
  );
}

/**
 * Builds the `SheetMenu` `trigger` render-prop for `ThreadActionsMenu`. Defined
 * at module scope (rather than as an inline arrow in the render body) so the
 * callback isn't redefined as an anonymous nested function on every render —
 * `SheetMenu` calls this directly (not as a JSX component).
 */
function createThreadActionsMenuTrigger(label: string) {
  return function renderThreadActionsMenuTrigger(api: { readonly open: () => void }) {
    return <ThreadActionsMenuTrigger open={api.open} label={label} />;
  };
}

/**
 * The PWA shows one thread at a time, so the actions the desktop sidebar
 * hides behind hover/context menus live here, next to the thread title — as a
 * bottom drawer, matching the rest of the phone shell.
 */
function ThreadActionsMenu(props: {
  readonly thread: Thread;
  /** Full thread list, so a worktree delete can gather every sibling id. */
  readonly threads?: readonly Thread[] | undefined;
  readonly onRename: () => void;
  readonly onAction: (action: ThreadAction) => void;
  readonly onNewThreadInWorktree?: ((input: WorktreeThreadInput) => void) | undefined;
  readonly onDeleteWorktreeGroup?: ((input: WorktreeDeleteInput) => void) | undefined;
  readonly onOpenTerminal?: (() => void) | undefined;
}) {
  const { thread } = props;
  const { t } = useLingui();
  const worktreePath = thread.worktreePath;
  const worktreeBranch = worktreeBranchOf(thread);

  const items: SheetMenuItem[] = [
    { id: "rename", label: t`Rename`, icon: <Pencil className="size-4 text-muted" /> },
    ...(props.onOpenTerminal
      ? [
          {
            id: "open-terminal",
            label: worktreePath ? t`Open terminal in worktree` : t`Open terminal`,
            icon: <SquareTerminal className="size-4 text-muted" />,
          },
        ]
      : []),
    ...(worktreePath && worktreeBranch && props.onNewThreadInWorktree
      ? [
          {
            id: "new-worktree-thread",
            label: t`New thread in worktree`,
            icon: <Plus className="size-4 text-muted" />,
          },
        ]
      : []),
    {
      id: "toggle-done",
      label: thread.done ? t`Unmark Done` : t`Mark Done`,
      icon: <CircleCheck className="size-4 text-muted" />,
    },
    {
      id: "toggle-star",
      label: thread.starred ? t`Unpin` : t`Pin to top`,
      icon: <Star className="size-4 text-muted" />,
    },
    {
      id: "archive",
      label: t`Archive Thread`,
      icon: <Archive className="size-4" />,
      tone: "warning",
    },
    ...(worktreePath && props.onDeleteWorktreeGroup
      ? [
          {
            id: "delete-worktree",
            label: t`Delete Worktree`,
            icon: <Trash2 className="size-4" />,
            tone: "danger" as const,
          },
        ]
      : []),
    { id: "delete", label: t`Delete Thread`, icon: <Trash2 className="size-4" />, tone: "danger" },
  ];

  const handleSelect = (id: string) => {
    if (id === "rename") props.onRename();
    if (id === "open-terminal") props.onOpenTerminal?.();
    if (id === "new-worktree-thread" && worktreePath && worktreeBranch) {
      props.onNewThreadInWorktree?.({
        projectId: thread.projectId,
        worktreePath,
        worktreeBranch,
      });
    }
    if (id === "toggle-done") props.onAction({ kind: "set-done", done: !thread.done });
    if (id === "toggle-star")
      props.onAction({ kind: "set-starred", starred: !(thread.starred ?? false) });
    if (id === "archive") props.onAction({ kind: "archive" });
    if (id === "delete-worktree" && worktreePath) {
      const threadIds = props.threads
        ? worktreeSiblingIds(props.threads, thread.projectId, worktreePath)
        : [thread.id];
      props.onDeleteWorktreeGroup?.({
        projectId: thread.projectId,
        worktreePath,
        threadIds: threadIds.length > 0 ? threadIds : [thread.id],
      });
    }
    if (id === "delete") props.onAction({ kind: "delete" });
  };

  return (
    <SheetMenu
      label={t`Thread actions`}
      closeLabel={t`Close thread actions`}
      items={items}
      onSelect={handleSelect}
      trigger={createThreadActionsMenuTrigger(t`Thread actions`)}
    />
  );
}

export interface WorktreeThreadInput {
  readonly projectId: string;
  readonly worktreePath: string;
  readonly worktreeBranch: string;
}

export interface WorktreeDeleteInput {
  readonly projectId: string;
  readonly worktreePath: string;
  readonly threadIds: readonly string[];
}

/** Thread title + status + actions; rename swaps the title for an inline input. */
export function ThreadTitleRow(props: {
  readonly thread: Thread;
  /** Full thread list, so a worktree delete can gather every sibling id. */
  readonly threads?: readonly Thread[] | undefined;
  readonly workspaceLabel?: string;
  readonly onOpenWorkspace?: (tab: WorkspaceTab) => void;
  readonly onAction: (action: ThreadAction) => void;
  readonly onNewThreadInWorktree?: ((input: WorktreeThreadInput) => void) | undefined;
  readonly onDeleteWorktreeGroup?: ((input: WorktreeDeleteInput) => void) | undefined;
  /** Adds an "Open terminal" entry to the actions menu. */
  readonly onOpenTerminal?: (() => void) | undefined;
}) {
  const { thread } = props;
  const [renaming, setRenaming] = useState(false);

  return (
    <>
      <span className="m-topbar__thread">
        {renaming ? (
          <InlineRenameInput
            initialValue={thread.title}
            onCommit={(title) => {
              props.onAction({ kind: "rename", title });
              setRenaming(false);
            }}
            onCancel={() => setRenaming(false)}
          />
        ) : (
          <>
            <StatusBadge status={thread.status} />
            <span className="m-topbar__title">{thread.title}</span>
            {props.onOpenWorkspace ? (
              <WorkspaceChip
                threadId={thread.id}
                projectLabel={props.workspaceLabel ?? ""}
                onOpen={props.onOpenWorkspace}
              />
            ) : null}
          </>
        )}
      </span>
      <ThreadActionsMenu
        thread={thread}
        threads={props.threads}
        onRename={() => setRenaming(true)}
        onAction={props.onAction}
        onNewThreadInWorktree={props.onNewThreadInWorktree}
        onDeleteWorktreeGroup={props.onDeleteWorktreeGroup}
        onOpenTerminal={props.onOpenTerminal}
      />
    </>
  );
}
