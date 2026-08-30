import { useState, type ReactNode } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import {
  Archive,
  ArrowRightLeft,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  GitFork,
  Pencil,
  Play,
  Plus,
  Star,
  Terminal,
  Trash2,
} from "lucide-react";
import type {
  AgentStatus,
  Project,
  ProjectAction,
  Thread,
  ThreadConfig,
  ThreadPresentationMode,
} from "@/shared/contracts";
import { crossagentRankingPreferences } from "@/shared/crossagentRanking";
import {
  rankContinueProviders,
  resolveInitialPresentationMode,
} from "@/shared/continueProviderRanking";
import { useProjectAgentStatuses } from "@/renderer/hooks/uiSelectors";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { InlineRenameInput } from "@/renderer/views/MainView/parts/Sidebar/parts/InlineRenameInput";
import { resolveActionIcon } from "@/renderer/utils/actionIcons";
import { BottomSheet } from "../components";
import { worktreeBranchOf, worktreeSiblingIds } from "../threadUtils";
import type { ContinueProviderInput, ThreadAction } from "../useRemoteDesktop";
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
  /** Move a main-checkout thread into a fresh worktree (optionally carrying uncommitted changes). */
  readonly onMoveThreadToWorktree: (thread: Thread, withChanges: boolean) => void;
  readonly onOpenTerminal: (input: {
    readonly projectId: string;
    readonly worktreePath?: string;
    readonly sourceThreadId?: string;
  }) => void;
  /** Continue the thread under another provider on its host (switch or fork). */
  readonly onContinueInProvider?:
    | ((thread: Thread, input: ContinueProviderInput) => void)
    | undefined;
  readonly onRunProjectAction: (input: {
    readonly projectId: string;
    readonly actionId: string;
    readonly worktreePath?: string;
    readonly sourceThreadId?: string;
  }) => void;
}

/**
 * Ranked "continue elsewhere" targets for a thread: the host's installed
 * agents minus the thread's own, ordered by the user's actual usage so the
 * realistic pick sits on top. Mirrors the desktop dialog's proposal.
 */
function useContinueProviderTargets(thread: Thread, project: Project | undefined) {
  const statuses = useProjectAgentStatuses(project?.location);
  const lastPresentationModeByAgent = useSharedSettings((s) => s.lastPresentationModeByAgent);
  const agentSelectionUsage = useSharedSettings((s) => s.agentSelectionUsage);
  const crossagentSelectionUsage = useSharedSettings((s) => s.crossagentSelectionUsage);
  const crossagentRoutingOverrides = useSharedSettings((s) => s.crossagentRoutingOverrides);
  const favoriteModels = useSharedSettings((s) => s.favoriteModels);
  const sourceMode = thread.presentationMode ?? "terminal";
  const others = statuses.filter((s) => s.installed && s.kind !== thread.agentKind);
  const ranked = rankContinueProviders(
    others,
    lastPresentationModeByAgent,
    sourceMode,
    crossagentRankingPreferences({
      agentSelectionUsage,
      crossagentSelectionUsage,
      crossagentRoutingOverrides,
      favoriteModels,
    }),
  );
  const order = new Map(ranked.map((entry, index) => [entry.provider, index]));
  const targets = [...others].sort(
    (a, b) => (order.get(a.kind) ?? others.length) - (order.get(b.kind) ?? others.length),
  );
  const configFor = (agent: AgentStatus): ThreadConfig => {
    const selection = ranked.find((entry) => entry.provider === agent.kind)?.preferredSelection;
    const model = selection?.model ?? agent.capabilities.models[0]?.id ?? "";
    return {
      model,
      ...(selection?.effort ? { effort: selection.effort } : {}),
      ...(selection?.fast ? { fast: true } : {}),
    };
  };
  const presentationFor = (agent: AgentStatus): ThreadPresentationMode =>
    resolveInitialPresentationMode(agent, lastPresentationModeByAgent, sourceMode);
  return { targets, configFor, presentationFor };
}

function ContinueProviderPage(props: {
  readonly fork: boolean;
  readonly targets: readonly AgentStatus[];
  readonly configFor: (agent: AgentStatus) => ThreadConfig;
  readonly onBack: () => void;
  readonly onPick: (agent: AgentStatus) => void;
}) {
  const { t } = useLingui();

  return (
    <>
      <div className="m-sheet-head">
        <span className="truncate">
          {props.fork ? t`Fork to another provider` : t`Continue in another provider`}
        </span>
      </div>
      <div className="m-sheet-list">
        <button type="button" className="m-sheet-action" onClick={props.onBack}>
          <ChevronLeft className="size-4 shrink-0 text-muted" />
          <span>{t`Back`}</span>
        </button>
        {props.targets.map((agent) => (
          <button
            type="button"
            key={agent.kind}
            className="m-sheet-action"
            onClick={() => props.onPick(agent)}
          >
            <span className="flex-1 truncate">
              {agent.label}
              <span className="block truncate text-xs text-muted">
                {props.configFor(agent).model}
              </span>
            </span>
          </button>
        ))}
      </div>
    </>
  );
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

function MoveToWorktreePage(props: {
  readonly onBack: () => void;
  readonly onPick: (withChanges: boolean) => void;
}) {
  const { t } = useLingui();

  return (
    <>
      <div className="m-sheet-head">
        <span className="truncate">{t`Move to Worktree`}</span>
      </div>
      <div className="m-sheet-list">
        <button type="button" className="m-sheet-action" onClick={props.onBack}>
          <ChevronLeft className="size-4 shrink-0 text-muted" />
          <span>{t`Back`}</span>
        </button>
        <button type="button" className="m-sheet-action" onClick={() => props.onPick(true)}>
          <GitFork className="size-4 shrink-0 text-muted" />
          <span>{t`Bring Uncommitted Changes`}</span>
        </button>
        <button type="button" className="m-sheet-action" onClick={() => props.onPick(false)}>
          <GitFork className="size-4 shrink-0 text-muted" />
          <span>{t`Clean Worktree`}</span>
        </button>
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
  readonly onContinueInProvider?: ThreadActionCallbacks["onContinueInProvider"];
  readonly onNewThreadInWorktree: ThreadActionCallbacks["onNewThreadInWorktree"];
  readonly onDeleteWorktreeGroup: ThreadActionCallbacks["onDeleteWorktreeGroup"];
  readonly onMoveThreadToWorktree: ThreadActionCallbacks["onMoveThreadToWorktree"];
  readonly onOpenTerminal: ThreadActionCallbacks["onOpenTerminal"];
  readonly onRunProjectAction: ThreadActionCallbacks["onRunProjectAction"];
  readonly onClose: () => void;
}) {
  const { thread } = props;
  const { t } = useLingui();
  const [renaming, setRenaming] = useState(props.initialRenaming ?? false);
  const [submenu, setSubmenu] = useState<"run" | "move" | "continue" | "fork-provider" | null>(
    null,
  );
  const runActions = props.project?.scripts?.actions ?? [];
  const continueTargets = useContinueProviderTargets(thread, props.project);

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
        submenuOpen={submenu !== null}
        submenu={
          submenu === "move" ? (
            <MoveToWorktreePage
              onBack={() => setSubmenu(null)}
              onPick={(withChanges) =>
                runAndClose(() => props.onMoveThreadToWorktree(thread, withChanges))
              }
            />
          ) : submenu === "continue" || submenu === "fork-provider" ? (
            <ContinueProviderPage
              fork={submenu === "fork-provider"}
              targets={continueTargets.targets}
              configFor={continueTargets.configFor}
              onBack={() => setSubmenu(null)}
              onPick={(agent) => {
                const fork = submenu === "fork-provider";
                if (!props.onContinueInProvider) return;
                runAndClose(() =>
                  props.onContinueInProvider?.(thread, {
                    targetAgentKind: agent.kind,
                    targetConfig: continueTargets.configFor(agent),
                    targetPresentationMode: continueTargets.presentationFor(agent),
                    fork,
                  }),
                );
              }}
            />
          ) : (
            <RunActionsPage
              actions={runActions}
              onBack={() => setSubmenu(null)}
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
          )
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
              {!worktreePath ? (
                <button type="button" className="m-sheet-action" onClick={() => setSubmenu("move")}>
                  <GitFork className="size-4 shrink-0 text-muted" />
                  <span className="flex-1">{t`Move to Worktree`}</span>
                  <ChevronRight className="size-4 shrink-0 text-muted" />
                </button>
              ) : null}
              {props.onContinueInProvider && continueTargets.targets.length > 0 ? (
                <>
                  <button
                    type="button"
                    className="m-sheet-action"
                    onClick={() => setSubmenu("continue")}
                  >
                    <ArrowRightLeft className="size-4 shrink-0 text-muted" />
                    <span className="flex-1">{t`Continue in...`}</span>
                    <ChevronRight className="size-4 shrink-0 text-muted" />
                  </button>
                  <button
                    type="button"
                    className="m-sheet-action"
                    onClick={() => setSubmenu("fork-provider")}
                  >
                    <GitFork className="size-4 shrink-0 text-muted" />
                    <span className="flex-1">{t`Fork to another provider`}</span>
                    <ChevronRight className="size-4 shrink-0 text-muted" />
                  </button>
                </>
              ) : null}
              {runActions.length > 0 ? (
                <button type="button" className="m-sheet-action" onClick={() => setSubmenu("run")}>
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
