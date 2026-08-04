import { useState, type ReactNode } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import {
  Archive,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  Pencil,
  Play,
  Plus,
  Star,
  Terminal,
  Trash2,
} from "lucide-react";
import type { Project, ProjectAction, Thread } from "@/shared/contracts";
import { InlineRenameInput } from "@/renderer/views/MainView/parts/Sidebar/parts/InlineRenameInput";
import { resolveActionIcon } from "@/renderer/utils/actionIcons";
import { BottomSheet } from "../components";
import { worktreeBranchOf, worktreeSiblingIds } from "../threadUtils";
import type { ThreadAction } from "../useRemoteDesktop";
import { groupEntryTitle, type GroupEntry } from "./threadGrouping";

export interface ThreadActionCallbacks {
  readonly onThreadAction: (thread: Thread, action: ThreadAction) => void;
  readonly onNewThreadInWorktree: (input: {
    readonly projectId: string;
    readonly worktreePath: string;
    readonly worktreeBranch: string;
  }) => void;
  readonly onDeleteWorktreeGroup: (input: {
    readonly projectId: string;
    readonly worktreePath: string;
    readonly threadIds: readonly string[];
  }) => void;
  readonly onOpenTerminal: (input: {
    readonly projectId: string;
    readonly worktreePath?: string;
    readonly sourceThreadId?: string;
  }) => void;
  readonly onRunProjectAction: (input: {
    readonly projectId: string;
    readonly actionId: string;
    readonly worktreePath?: string;
    readonly sourceThreadId?: string;
  }) => void;
}

function RunActionsPage(props: {
  readonly actions: readonly ProjectAction[];
  readonly onBack: () => void;
  readonly onRun: (actionId: string) => void;
}) {
  const { t } = useLingui();

  return (
    <>
      <div className="m-sheet-head">
        <span className="truncate">{t`Run`}</span>
      </div>
      <div className="m-sheet-list">
        <button type="button" className="m-sheet-action" onClick={props.onBack}>
          <ChevronLeft className="size-4 shrink-0 text-muted" />
          <span>{t`Back`}</span>
        </button>
        {props.actions.map((action) => (
          <button
            type="button"
            key={action.id}
            className="m-sheet-action"
            onClick={() => props.onRun(action.id)}
          >
            <span className="size-4 shrink-0 text-muted">{resolveActionIcon(action.icon)}</span>
            <span>{action.name}</span>
          </button>
        ))}
      </div>
    </>
  );
}

function SheetSubmenuPages(props: {
  readonly submenuOpen: boolean;
  readonly main: ReactNode;
  readonly submenu: ReactNode;
}) {
  return (
    <div className="m-sheet-page-stack" data-page={props.submenuOpen ? "submenu" : "main"}>
      <div
        className="m-sheet-page m-sheet-page--main"
        aria-hidden={props.submenuOpen || undefined}
        inert={props.submenuOpen}
      >
        {props.main}
      </div>
      <div
        className="m-sheet-page m-sheet-page--submenu"
        aria-hidden={!props.submenuOpen || undefined}
        inert={!props.submenuOpen}
      >
        {props.submenu}
      </div>
    </div>
  );
}

export function ThreadActionsSheet(props: {
  readonly thread: Thread;
  readonly project?: Project | undefined;
  readonly threads: readonly Thread[];
  readonly closing?: boolean;
  readonly initialRenaming?: boolean;
  readonly onAction: (action: ThreadAction) => void;
  readonly onNewThreadInWorktree: ThreadActionCallbacks["onNewThreadInWorktree"];
  readonly onDeleteWorktreeGroup: ThreadActionCallbacks["onDeleteWorktreeGroup"];
  readonly onOpenTerminal: ThreadActionCallbacks["onOpenTerminal"];
  readonly onRunProjectAction: ThreadActionCallbacks["onRunProjectAction"];
  readonly onClose: () => void;
}) {
  const { thread } = props;
  const { t } = useLingui();
  const [renaming, setRenaming] = useState(props.initialRenaming ?? false);
  const [showRunActions, setShowRunActions] = useState(false);
  const runActions = props.project?.scripts?.actions ?? [];

  const act = (action: ThreadAction) => {
    props.onAction(action);
    props.onClose();
  };
  const runAndClose = (run: () => void) => {
    run();
    props.onClose();
  };

  const openTerminal = () => {
    props.onOpenTerminal({
      projectId: thread.projectId,
      ...(thread.worktreePath ? { worktreePath: thread.worktreePath } : {}),
      sourceThreadId: thread.id,
    });
    props.onClose();
  };
  const worktreePath = thread.worktreePath;
  const worktreeBranch = worktreeBranchOf(thread);

  return (
    <BottomSheet
      label={t`Actions for ${thread.title}`}
      closeLabel={t`Close thread actions`}
      closing={props.closing}
      onClose={props.onClose}
    >
      <SheetSubmenuPages
        submenuOpen={showRunActions}
        submenu={
          <RunActionsPage
            actions={runActions}
            onBack={() => setShowRunActions(false)}
            onRun={(actionId) =>
              runAndClose(() =>
                props.onRunProjectAction({
                  projectId: thread.projectId,
                  actionId,
                  ...(thread.worktreePath ? { worktreePath: thread.worktreePath } : {}),
                  sourceThreadId: thread.id,
                }),
              )
            }
          />
        }
        main={
          <>
            <div className="m-sheet-head">
              <span className="truncate">{thread.title}</span>
            </div>
            <div className="m-sheet-list">
              <button type="button" className="m-sheet-action" onClick={openTerminal}>
                <Terminal className="size-4 shrink-0 text-muted" />
                <span>{thread.worktreePath ? t`Open terminal in worktree` : t`Open terminal`}</span>
              </button>
              {worktreePath && worktreeBranch ? (
                <button
                  type="button"
                  className="m-sheet-action"
                  onClick={() =>
                    runAndClose(() =>
                      props.onNewThreadInWorktree({
                        projectId: thread.projectId,
                        worktreePath,
                        worktreeBranch,
                      }),
                    )
                  }
                >
                  <Plus className="size-4 shrink-0 text-muted" />
                  <span>
                    <Trans>New thread in worktree</Trans>
                  </span>
                </button>
              ) : null}
              {runActions.length > 0 ? (
                <button
                  type="button"
                  className="m-sheet-action"
                  onClick={() => setShowRunActions(true)}
                >
                  <Play className="size-4 shrink-0 text-muted" />
                  <span className="flex-1">{t`Run`}</span>
                  <ChevronRight className="size-4 shrink-0 text-muted" />
                </button>
              ) : null}
              {renaming ? (
                <div className="m-sheet-action" data-static="true">
                  <Pencil className="size-4 shrink-0 text-muted" />
                  <InlineRenameInput
                    initialValue={thread.title}
                    onCommit={(title) => act({ kind: "rename", title })}
                    onCancel={() => setRenaming(false)}
                  />
                </div>
              ) : (
                <button type="button" className="m-sheet-action" onClick={() => setRenaming(true)}>
                  <Pencil className="size-4 shrink-0 text-muted" />
                  <span>
                    <Trans>Rename</Trans>
                  </span>
                </button>
              )}
              <button
                type="button"
                className="m-sheet-action"
                onClick={() => act({ kind: "set-done", done: !thread.done })}
              >
                <CircleCheck className="size-4 shrink-0 text-muted" />
                <span>{thread.done ? t`Unmark Done` : t`Mark Done`}</span>
              </button>
              <button
                type="button"
                className="m-sheet-action"
                onClick={() => act({ kind: "set-starred", starred: !(thread.starred ?? false) })}
              >
                <Star className="size-4 shrink-0 text-muted" />
                <span>{thread.starred ? t`Unpin` : t`Pin to top`}</span>
              </button>
              <button
                type="button"
                className="m-sheet-action text-warning"
                onClick={() => act({ kind: "archive" })}
              >
                <Archive className="size-4 shrink-0" />
                <span>
                  <Trans>Archive Thread</Trans>
                </span>
              </button>
              <button
                type="button"
                className="m-sheet-action text-danger"
                onClick={() =>
                  worktreePath
                    ? runAndClose(() =>
                        props.onDeleteWorktreeGroup({
                          projectId: thread.projectId,
                          worktreePath,
                          threadIds: worktreeSiblingIds(
                            props.threads,
                            thread.projectId,
                            worktreePath,
                          ),
                        }),
                      )
                    : act({ kind: "delete" })
                }
              >
                <Trash2 className="size-4 shrink-0" />
                <span>
                  {worktreePath ? <Trans>Delete Worktree</Trans> : <Trans>Delete Thread</Trans>}
                </span>
              </button>
              {worktreePath ? (
                <button
                  type="button"
                  className="m-sheet-action text-danger"
                  onClick={() => act({ kind: "delete" })}
                >
                  <Trash2 className="size-4 shrink-0" />
                  <span>
                    <Trans>Delete Thread</Trans>
                  </span>
                </button>
              ) : null}
            </div>
          </>
        }
      />
    </BottomSheet>
  );
}

export function GroupActionsSheet(props: {
  readonly entry: GroupEntry;
  readonly project?: Project | undefined;
  readonly closing?: boolean;
  readonly onThreadAction: ThreadActionCallbacks["onThreadAction"];
  readonly onNewThreadInWorktree: ThreadActionCallbacks["onNewThreadInWorktree"];
  readonly onDeleteWorktreeGroup: ThreadActionCallbacks["onDeleteWorktreeGroup"];
  readonly onOpenTerminal: ThreadActionCallbacks["onOpenTerminal"];
  readonly onRunProjectAction: ThreadActionCallbacks["onRunProjectAction"];
  readonly onClose: () => void;
}) {
  const { entry } = props;
  const { t } = useLingui();
  const threads = entry.group.threads;
  const title = groupEntryTitle(entry);
  const activeThreads = threads.filter((thread) => !thread.done);
  const allDone = activeThreads.length === 0;
  const [showRunActions, setShowRunActions] = useState(false);
  const runActions = entry.kind === "worktree-group" ? (props.project?.scripts?.actions ?? []) : [];

  const act = (run: () => void) => {
    run();
    props.onClose();
  };

  return (
    <BottomSheet
      label={t`Actions for ${title}`}
      closeLabel={t`Close group actions`}
      closing={props.closing}
      onClose={props.onClose}
    >
      <SheetSubmenuPages
        submenuOpen={showRunActions}
        submenu={
          <RunActionsPage
            actions={runActions}
            onBack={() => setShowRunActions(false)}
            onRun={(actionId) =>
              act(() =>
                props.onRunProjectAction({
                  projectId: entry.group.threads[0]!.projectId,
                  actionId,
                  ...(entry.kind === "worktree-group"
                    ? { worktreePath: entry.group.worktreePath }
                    : {}),
                }),
              )
            }
          />
        }
        main={
          <>
            <div className="m-sheet-head">
              <span className="truncate">{title}</span>
              <span className="shrink-0 font-normal text-muted">{threads.length}</span>
            </div>
            <div className="m-sheet-list">
              {entry.kind === "worktree-group" ? (
                <button
                  type="button"
                  className="m-sheet-action"
                  onClick={() =>
                    act(() =>
                      props.onNewThreadInWorktree({
                        projectId: entry.group.threads[0]!.projectId,
                        worktreePath: entry.group.worktreePath,
                        worktreeBranch: entry.group.worktreeBranch,
                      }),
                    )
                  }
                >
                  <Plus className="size-4 shrink-0 text-muted" />
                  <span>
                    <Trans>New thread in worktree</Trans>
                  </span>
                </button>
              ) : null}
              {entry.kind === "worktree-group" ? (
                <button
                  type="button"
                  className="m-sheet-action"
                  onClick={() =>
                    act(() =>
                      props.onOpenTerminal({
                        projectId: entry.group.threads[0]!.projectId,
                        worktreePath: entry.group.worktreePath,
                      }),
                    )
                  }
                >
                  <Terminal className="size-4 shrink-0 text-muted" />
                  <span>
                    <Trans>Open terminal</Trans>
                  </span>
                </button>
              ) : null}
              {runActions.length > 0 ? (
                <button
                  type="button"
                  className="m-sheet-action"
                  onClick={() => setShowRunActions(true)}
                >
                  <Play className="size-4 shrink-0 text-muted" />
                  <span className="flex-1">{t`Run`}</span>
                  <ChevronRight className="size-4 shrink-0 text-muted" />
                </button>
              ) : null}
              {allDone ? (
                <button
                  type="button"
                  className="m-sheet-action"
                  onClick={() =>
                    act(() =>
                      threads.forEach(
                        (thread) =>
                          thread.done &&
                          props.onThreadAction(thread, {
                            kind: "set-done",
                            done: false,
                          }),
                      ),
                    )
                  }
                >
                  <CircleCheck className="size-4 shrink-0 text-muted" />
                  <span>
                    <Trans>Unmark all done</Trans>
                  </span>
                </button>
              ) : (
                <button
                  type="button"
                  className="m-sheet-action"
                  onClick={() =>
                    act(() =>
                      activeThreads.forEach((thread) =>
                        props.onThreadAction(thread, { kind: "set-done", done: true }),
                      ),
                    )
                  }
                >
                  <CircleCheck className="size-4 shrink-0 text-muted" />
                  <span>
                    <Trans>Mark all done</Trans>
                  </span>
                </button>
              )}
              <button
                type="button"
                className="m-sheet-action text-warning"
                onClick={() =>
                  act(() =>
                    threads.forEach((thread) => props.onThreadAction(thread, { kind: "archive" })),
                  )
                }
              >
                <Archive className="size-4 shrink-0" />
                <span>
                  <Trans>Archive all threads</Trans>
                </span>
              </button>
              {entry.kind === "worktree-group" ? (
                <button
                  type="button"
                  className="m-sheet-action text-danger"
                  onClick={() =>
                    act(() =>
                      props.onDeleteWorktreeGroup({
                        projectId: entry.group.threads[0]!.projectId,
                        worktreePath: entry.group.worktreePath,
                        threadIds: entry.group.threads.map((thread) => thread.id),
                      }),
                    )
                  }
                >
                  <Trash2 className="size-4 shrink-0" />
                  <span>
                    <Trans>Delete Worktree</Trans>
                  </span>
                </button>
              ) : null}
            </div>
          </>
        }
      />
    </BottomSheet>
  );
}
