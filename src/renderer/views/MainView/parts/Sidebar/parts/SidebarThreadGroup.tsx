import { useState } from "react";
import { Tooltip } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import {
  Archive,
  Check,
  ChevronRight,
  CircleCheck,
  Columns2,
  FlaskConical,
  Pencil,
  Trash2,
} from "lucide-react";
import type { Project } from "@/shared/contracts";
import { ContextMenu, type ContextMenuEntry } from "@/renderer/components/common/ContextMenu";
import { ConfirmDialog } from "@/renderer/components/common/ConfirmDialog";
import { RelativeTime } from "@/renderer/components/common/RelativeTime";
import { discardExperiment } from "@/renderer/actions/experimentActions";
import { archiveThread, deleteThread, markThreadDone } from "@/renderer/actions/threadActions";
import { useAppStore } from "@/renderer/state/appStore";
import { useExperimentStore } from "@/renderer/state/experimentStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { useIsWorktreeCollapsed, useSidebarUiStore } from "@/renderer/state/sidebarUiStore";
import { ExperimentGroupHeader } from "./ExperimentGroupHeader";
import { InlineRenameInput } from "./InlineRenameInput";
import type { ThreadListEntry } from "./groupThreads";

export function SidebarThreadGroup(props: {
  entry: Extract<ThreadListEntry, { kind: "thread-group" }>;
  project: Project;
  editingThreadId: string | null;
  setEditingThreadId: (id: string | null) => void;
}) {
  const { entry, editingThreadId, setEditingThreadId } = props;
  const { t } = useLingui();
  const groupKey = entry.group.groupId;
  const experiment = useExperimentStore((state) => state.experiments[groupKey]);
  const renameExperiment = useExperimentStore((state) => state.renameExperiment);
  const [discardConfirmOpen, setDiscardConfirmOpen] = useState(false);
  const [discardPending, setDiscardPending] = useState(false);
  const collapseKey = `group:${groupKey}`;
  const isGroupCollapsed = useIsWorktreeCollapsed(collapseKey);
  const toggleWorktreeCollapsed = useSidebarUiStore((s) => s.toggleWorktreeCollapsed);
  const activeThreads = entry.group.threads.filter((thread) => !thread.done);
  const isDone = activeThreads.length === 0;
  const isRenamingGroup = editingThreadId === collapseKey;
  const threadRemoveAction = useSharedSettings((s) => s.threadRemoveAction);
  const latestThreadUpdatedAt = entry.group.threads.reduce(
    (latest, thread) => (thread.updatedAt > latest ? thread.updatedAt : latest),
    entry.group.threads[0]!.updatedAt,
  );
  const removeGroupThreads = () => {
    if (experiment) {
      if (!discardPending) setDiscardConfirmOpen(true);
      return;
    }
    const threadIds = entry.group.threads.map((thread) => thread.id);
    for (const thread of entry.group.threads) {
      if (threadRemoveAction === "archive") {
        archiveThread(thread.id);
      }
    }
    if (threadRemoveAction === "delete") {
      for (const threadId of threadIds) {
        deleteThread(threadId);
      }
    }
    clearThreadGroup(groupKey);
  };
  const hiddenGroupActionClass =
    "w-0 -mr-[3px] overflow-hidden p-0 opacity-0 pointer-events-none group-hover:w-[18px] group-hover:mr-0 group-hover:p-0.5 group-hover:opacity-100 group-hover:pointer-events-auto focus-visible:w-[18px] focus-visible:mr-0 focus-visible:p-0.5 focus-visible:opacity-100 focus-visible:pointer-events-auto";

  const contextItems: ContextMenuEntry[] = experiment
    ? [
        {
          id: "open-experiment",
          label: t`Open experiment`,
          icon: <FlaskConical className="size-3.5" />,
        },
        {
          id: "open-all",
          label: t`Open All`,
          icon: <Columns2 className="size-3.5" />,
          isDisabled: activeThreads.length < 2,
        },
        {
          id: "rename-group",
          label: t`Rename experiment`,
          icon: <Pencil className="size-3.5" />,
        },
        { type: "separator" },
        {
          id: "discard-experiment",
          label: t`Discard experiment`,
          icon: <Trash2 className="size-3.5" />,
          variant: "danger",
          isDisabled: discardPending,
        },
      ]
    : [
        {
          id: "open-all",
          label: t`Open All`,
          icon: <Columns2 className="size-3.5" />,
          isDisabled: activeThreads.length < 2,
        },
        {
          id: "rename-group",
          label: t`Rename Group`,
          icon: <Pencil className="size-3.5" />,
        },
        {
          id: "mark-all-done",
          label: t`Mark All Done`,
          icon: <CircleCheck className="size-3.5" />,
          isDisabled: activeThreads.length === 0,
        },
        { type: "separator" },
        {
          id: "archive-all",
          label: t`Archive All`,
          icon: <Archive className="size-3.5" />,
          variant: "warning",
        },
        { id: "ungroup-all", label: t`Ungroup All`, variant: "warning" },
      ];

  function openExperimentBoard() {
    if (!experiment) return;
    useAppStore.getState().openExperiment(experiment.id, experiment.projectId);
  }

  function confirmDiscardExperiment() {
    if (!experiment || discardPending) return;
    setDiscardConfirmOpen(false);
    setDiscardPending(true);
    void discardExperiment(experiment.id).finally(() => setDiscardPending(false));
  }

  return (
    <>
      <div key={collapseKey} className="space-y-0.5">
        <ContextMenu
          items={contextItems}
          onAction={(key) => {
            if (key === "open-experiment") {
              openExperimentBoard();
            }
            if (key === "open-all") {
              if (experiment) useAppStore.getState().openGroupGrid(entry.group.groupId);
              else useAppStore.getState().openGroupView(entry.group.groupId);
            }
            if (key === "rename-group") {
              setEditingThreadId(collapseKey);
            }
            if (key === "discard-experiment") {
              if (!discardPending) setDiscardConfirmOpen(true);
            }
            if (key === "mark-all-done") {
              for (const thread of entry.group.threads) {
                markThreadDone(thread.id);
              }
            }
            if (key === "archive-all") {
              for (const thread of entry.group.threads) {
                archiveThread(thread.id);
              }
              clearThreadGroup(groupKey);
            }
            if (key === "ungroup-all") {
              clearThreadGroup(groupKey);
            }
          }}
        >
          {experiment ? (
            <ExperimentGroupHeader
              title={entry.group.groupName}
              isCollapsed={isGroupCollapsed}
              isDone={isDone}
              updatedAt={latestThreadUpdatedAt}
              canOpenAll={activeThreads.length >= 2}
              isRenaming={isRenamingGroup}
              onRenameCommit={(newName) => {
                useAppStore.setState((state) => ({
                  threads: state.threads.map((thread) =>
                    thread.groupId === groupKey ? { ...thread, groupName: newName } : thread,
                  ),
                }));
                renameExperiment(experiment.id, newName);
                setEditingThreadId(null);
              }}
              onRenameCancel={() => setEditingThreadId(null)}
              onToggleCollapse={() => toggleWorktreeCollapsed(collapseKey)}
              onOpenBoard={openExperimentBoard}
              onOpenAll={() => useAppStore.getState().openGroupGrid(entry.group.groupId)}
              onDiscard={removeGroupThreads}
            />
          ) : (
            <div className="group flex w-full items-center gap-1 rounded px-2 py-1">
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-xs font-medium text-muted transition-colors hover:text-foreground"
                onClick={() => toggleWorktreeCollapsed(collapseKey)}
              >
                <ChevronRight
                  className={`size-3 shrink-0 transition-transform ${
                    isGroupCollapsed ? "" : "rotate-90"
                  }`}
                />
                {isDone && <Check className="size-3.5 shrink-0 text-success" strokeWidth={4} />}
                {isRenamingGroup ? (
                  <InlineRenameInput
                    ariaLabel={t`Rename Group`}
                    initialValue={entry.group.groupName}
                    onCommit={(newName) => {
                      useAppStore.setState((state) => ({
                        threads: state.threads.map((thread) =>
                          thread.groupId === groupKey ? { ...thread, groupName: newName } : thread,
                        ),
                      }));
                      setEditingThreadId(null);
                    }}
                    onCancel={() => setEditingThreadId(null)}
                  />
                ) : (
                  <>
                    <span className={`truncate ${isDone ? "opacity-50 line-through" : ""}`}>
                      {entry.group.groupName}
                    </span>
                    <span className={`shrink-0 text-muted/60 ${isDone ? "opacity-50" : ""}`}>
                      {entry.group.threads.length}
                    </span>
                  </>
                )}
              </button>
              {!isRenamingGroup && activeThreads.length >= 2 && (
                <Tooltip delay={300}>
                  <Tooltip.Trigger>
                    <button
                      type="button"
                      aria-label={t`Open all in group`}
                      className={`flex h-[18px] shrink-0 items-center justify-center rounded text-muted/40 transition-[opacity,color,background-color] hover:bg-[var(--row-hover)] hover:text-foreground ${hiddenGroupActionClass}`}
                      onClick={() => useAppStore.getState().openGroupView(entry.group.groupId)}
                    >
                      <Columns2 className="size-3" />
                    </button>
                  </Tooltip.Trigger>
                  <Tooltip.Content>
                    <Trans>Open all in group</Trans>
                  </Tooltip.Content>
                </Tooltip>
              )}
              {!isRenamingGroup && (
                <span className="relative w-[2.4ch] shrink-0">
                  <RelativeTime
                    iso={latestThreadUpdatedAt}
                    className="block text-center font-mono text-[10px] tabular-nums text-muted group-hover:invisible"
                  />
                  <div
                    role="button"
                    tabIndex={0}
                    aria-label={
                      threadRemoveAction === "archive"
                        ? t`Archive ${entry.group.groupName}`
                        : t`Delete ${entry.group.groupName}`
                    }
                    className={`absolute inset-0 flex items-center justify-center rounded text-muted/55 opacity-0 transition group-hover:opacity-100 ${threadRemoveAction === "archive" ? "hover:text-warning" : "hover:text-danger"}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      removeGroupThreads();
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.stopPropagation();
                        removeGroupThreads();
                      }
                    }}
                  >
                    {threadRemoveAction === "archive" ? (
                      <Archive className="size-3.5" />
                    ) : (
                      <Trash2 className="size-3.5" />
                    )}
                  </div>
                </span>
              )}
            </div>
          )}
        </ContextMenu>
      </div>
      <ConfirmDialog
        isOpen={discardConfirmOpen}
        title={t`Discard experiment?`}
        confirmLabel={t`Discard experiment`}
        body={
          <p className="text-sm text-muted">
            <Trans>All candidate sessions, worktrees, and branches will be removed.</Trans>
          </p>
        }
        onConfirm={confirmDiscardExperiment}
        onClose={() => setDiscardConfirmOpen(false)}
      />
    </>
  );
}

function clearThreadGroup(groupKey: string) {
  useAppStore.setState((state) => {
    const updatedThreads = state.threads.map((t) =>
      t.groupId === groupKey ? { ...t, groupId: undefined, groupName: undefined } : t,
    );
    const view =
      state.view.kind === "thread" && state.view.activeGroupId === groupKey
        ? { kind: "thread" as const, panes: [state.view.panes[0]] as [string] }
        : state.view;
    return { threads: updatedThreads, view };
  });
}
