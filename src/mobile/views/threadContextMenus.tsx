import type { ReactNode } from "react";
import { useLingui } from "@lingui/react/macro";
import { Archive, CircleCheck, Pencil, Play, Plus, Star, Terminal, Trash2 } from "lucide-react";
import type { Project, Thread } from "@/shared/contracts";
import { ContextMenu, type ContextMenuEntry } from "@/renderer/components/common/ContextMenu";
import { resolveActionIcon } from "@/renderer/utils/actionIcons";
import { worktreeBranchOf, worktreeSiblingIds } from "../threadUtils";
import type { GroupEntry } from "./threadGrouping";
import type { ThreadActionCallbacks } from "./threadActionSurfaces";

interface ThreadContextMenuProps extends ThreadActionCallbacks {
  readonly thread: Thread;
  readonly project?: Project | undefined;
  readonly threads: readonly Thread[];
  readonly children: ReactNode;
  readonly onRename: () => void;
}

export function ThreadContextMenu(props: ThreadContextMenuProps) {
  const { t } = useLingui();
  const { thread } = props;
  const worktreePath = thread.worktreePath;
  const worktreeBranch = worktreeBranchOf(thread);
  const runActions = props.project?.scripts?.actions ?? [];
  const entries: ContextMenuEntry[] = [
    {
      id: "open-terminal",
      label: worktreePath ? t`Open terminal in worktree` : t`Open terminal`,
      icon: <Terminal className="size-3.5" />,
    },
    ...(worktreePath && worktreeBranch
      ? [
          {
            id: "new-thread-in-worktree",
            label: t`New thread in worktree`,
            icon: <Plus className="size-3.5" />,
          },
        ]
      : []),
    ...(runActions.length > 0
      ? [
          {
            type: "submenu" as const,
            id: "run",
            label: t`Run`,
            icon: <Play className="size-3.5" />,
            items: runActions.map((action) => ({
              id: `action:${action.id}`,
              label: action.name,
              icon: resolveActionIcon(action.icon),
            })),
          },
        ]
      : []),
    { id: "rename", label: t`Rename`, icon: <Pencil className="size-3.5" /> },
    {
      id: "toggle-done",
      label: thread.done ? t`Unmark Done` : t`Mark Done`,
      icon: <CircleCheck className="size-3.5" />,
    },
    {
      id: "toggle-star",
      label: thread.starred ? t`Unpin` : t`Pin to top`,
      icon: <Star className="size-3.5" />,
    },
    { type: "separator" as const },
    {
      id: "archive",
      label: t`Archive Thread`,
      icon: <Archive className="size-3.5" />,
      variant: "warning" as const,
    },
    ...(worktreePath
      ? [
          {
            id: "delete-worktree",
            label: t`Delete Worktree`,
            icon: <Trash2 className="size-3.5" />,
            variant: "danger" as const,
          },
        ]
      : []),
    {
      id: "delete-thread",
      label: t`Delete Thread`,
      icon: <Trash2 className="size-3.5" />,
      variant: "danger" as const,
    },
  ];

  const runAction = (key: string) => {
    if (key === "open-terminal") {
      props.onOpenTerminal({
        projectId: thread.projectId,
        ...(worktreePath ? { worktreePath } : {}),
        sourceThreadId: thread.id,
      });
    } else if (key === "new-thread-in-worktree" && worktreePath && worktreeBranch) {
      props.onNewThreadInWorktree({
        projectId: thread.projectId,
        worktreePath,
        worktreeBranch,
      });
    } else if (key === "rename") {
      props.onRename();
    } else if (key === "toggle-done") {
      props.onThreadAction(thread, { kind: "set-done", done: !thread.done });
    } else if (key === "toggle-star") {
      props.onThreadAction(thread, {
        kind: "set-starred",
        starred: !(thread.starred ?? false),
      });
    } else if (key === "archive") {
      props.onThreadAction(thread, { kind: "archive" });
    } else if (key === "delete-worktree" && worktreePath) {
      props.onDeleteWorktreeGroup({
        projectId: thread.projectId,
        worktreePath,
        threadIds: worktreeSiblingIds(props.threads, thread.projectId, worktreePath),
      });
    } else if (key === "delete-thread") {
      props.onThreadAction(thread, { kind: "delete" });
    } else if (key.startsWith("action:")) {
      props.onRunProjectAction({
        projectId: thread.projectId,
        actionId: key.slice("action:".length),
        ...(worktreePath ? { worktreePath } : {}),
        sourceThreadId: thread.id,
      });
    }
  };

  return (
    <ContextMenu items={entries} onAction={runAction}>
      {props.children}
    </ContextMenu>
  );
}

interface GroupContextMenuProps extends ThreadActionCallbacks {
  readonly entry: GroupEntry;
  readonly project?: Project | undefined;
  readonly children: ReactNode;
}

export function GroupContextMenu(props: GroupContextMenuProps) {
  const { t } = useLingui();
  const { entry } = props;
  const isWorktree = entry.kind === "worktree-group";
  const threads = entry.group.threads;
  const projectId = threads[0]!.projectId;
  const runActions = isWorktree ? (props.project?.scripts?.actions ?? []) : [];
  const allDone = threads.every((thread) => thread.done);
  const entries: ContextMenuEntry[] = [
    ...(isWorktree
      ? [
          {
            id: "new-thread-in-worktree",
            label: t`New thread in worktree`,
            icon: <Plus className="size-3.5" />,
          },
          {
            id: "open-terminal",
            label: t`Open terminal`,
            icon: <Terminal className="size-3.5" />,
          },
        ]
      : []),
    ...(runActions.length > 0
      ? [
          {
            type: "submenu" as const,
            id: "run",
            label: t`Run`,
            icon: <Play className="size-3.5" />,
            items: runActions.map((action) => ({
              id: `action:${action.id}`,
              label: action.name,
              icon: resolveActionIcon(action.icon),
            })),
          },
        ]
      : []),
    {
      id: allDone ? "unmark-all" : "mark-all",
      label: allDone ? t`Unmark all done` : t`Mark all done`,
      icon: <CircleCheck className="size-3.5" />,
    },
    {
      id: "archive-all",
      label: t`Archive all threads`,
      icon: <Archive className="size-3.5" />,
      variant: "warning" as const,
    },
    ...(isWorktree
      ? [
          { type: "separator" as const },
          {
            id: "delete-worktree",
            label: t`Delete Worktree`,
            icon: <Trash2 className="size-3.5" />,
            variant: "danger" as const,
          },
        ]
      : []),
  ];

  const runAction = (key: string) => {
    if (key === "new-thread-in-worktree" && entry.kind === "worktree-group") {
      props.onNewThreadInWorktree({
        projectId,
        worktreePath: entry.group.worktreePath,
        worktreeBranch: entry.group.worktreeBranch,
      });
    } else if (key === "open-terminal" && entry.kind === "worktree-group") {
      props.onOpenTerminal({ projectId, worktreePath: entry.group.worktreePath });
    } else if (key === "mark-all") {
      threads
        .filter((thread) => !thread.done)
        .forEach((thread) => props.onThreadAction(thread, { kind: "set-done", done: true }));
    } else if (key === "unmark-all") {
      threads.forEach(
        (thread) => thread.done && props.onThreadAction(thread, { kind: "set-done", done: false }),
      );
    } else if (key === "archive-all") {
      threads.forEach((thread) => props.onThreadAction(thread, { kind: "archive" }));
    } else if (key === "delete-worktree" && entry.kind === "worktree-group") {
      props.onDeleteWorktreeGroup({
        projectId,
        worktreePath: entry.group.worktreePath,
        threadIds: threads.map((thread) => thread.id),
      });
    } else if (key.startsWith("action:")) {
      props.onRunProjectAction({
        projectId,
        actionId: key.slice("action:".length),
        ...(entry.kind === "worktree-group" ? { worktreePath: entry.group.worktreePath } : {}),
      });
    }
  };

  return (
    <ContextMenu items={entries} onAction={runAction}>
      {props.children}
    </ContextMenu>
  );
}
