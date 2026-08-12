import { useEffect, useState } from "react";
import { Button } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import {
  Archive,
  CircleCheck,
  Ellipsis,
  GitFork,
  NotebookPen,
  Pencil,
  Plus,
  SquareTerminal,
  Star,
  Trash2,
} from "lucide-react";
import { baseAgentKind, type AgentStatus, type Project, type Thread } from "@/shared/contracts";
import { readBridge } from "@/renderer/bridge";
import { openNotesPanel, openUsagePanel } from "@/renderer/actions/panelActions";
import { moveThreadToWorktree } from "@/renderer/actions/moveThreadToWorktreeActions";
import {
  archiveThread,
  deleteThread,
  openNewThreadInWorktree,
  renameThread,
  toggleMarkThreadDone,
  toggleStarThread,
} from "@/renderer/actions/threadActions";
import { openTerminal, openWorktreeTerminal } from "@/renderer/actions/terminalActions";
import { BottomSheet } from "@/renderer/components/common/BottomSheet";
import { SidebarButton } from "@/renderer/components/common/SidebarButton";
import { ProviderUsageCircle } from "@/renderer/components/providers/ProviderUsageCircle";
import {
  resolveDisplayedProviders,
  USAGE_PROVIDERS,
} from "@/renderer/components/providers/usageProviders";
import { useProviderUsageStore } from "@/renderer/state/providerUsageStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { InlineRenameInput } from "@/renderer/views/MainView/parts/Sidebar/parts/InlineRenameInput";
import { resolveWorktreeBranch } from "@/renderer/utils/gitHelpers";
import { ThreadHeaderStatusButton } from "./ThreadHeaderStatus";

function resolveThreadUsageProviderId(
  thread: { readonly agentKind: string; readonly agentInstanceId?: string | undefined },
  availableIds: readonly string[],
): string {
  const ids = new Set(availableIds);
  const base = baseAgentKind(thread.agentKind);
  const candidates = thread.agentInstanceId
    ? [thread.agentKind, `${base}:${thread.agentInstanceId}`]
    : [thread.agentKind];
  for (const candidate of candidates) {
    if (ids.has(candidate)) return candidate;
  }
  return availableIds.find((id) => baseAgentKind(id) === base) ?? thread.agentKind;
}

function CompactThreadActions(props: { thread: Thread; onRename: () => void }) {
  const { t } = useLingui();
  const [open, setOpen] = useState(false);
  const { thread } = props;
  const worktreeBranch = thread.worktreePath
    ? resolveWorktreeBranch(thread.projectId, thread.worktreePath, thread.worktreeBranch)
    : undefined;
  const run = (action: () => void) => {
    setOpen(false);
    action();
  };

  return (
    <>
      <Button
        isIconOnly
        size="sm"
        variant="ghost"
        className="m-topbar__actions"
        aria-label={t`Thread actions`}
        onPress={() => setOpen(true)}
      >
        <Ellipsis className="size-4" />
      </Button>
      {open ? (
        <BottomSheet
          label={t`Thread actions`}
          closeLabel={t`Close thread actions`}
          onClose={() => setOpen(false)}
        >
          <div className="m-sheet-head">
            <span>{t`Thread actions`}</span>
          </div>
          <div className="m-sheet-list">
            <SidebarButton
              icon={<Pencil className="size-4" />}
              label={t`Rename`}
              onPress={() => run(props.onRename)}
            />
            <SidebarButton
              icon={<NotebookPen className="size-4" />}
              label={t`Notes & to-dos`}
              onPress={() => run(openNotesPanel)}
            />
            <SidebarButton
              icon={<SquareTerminal className="size-4" />}
              label={thread.worktreePath ? t`Open terminal in worktree` : t`Open terminal`}
              onPress={() =>
                run(() => {
                  if (thread.worktreePath) {
                    openWorktreeTerminal(thread.projectId, thread.worktreePath);
                  } else {
                    openTerminal(thread.projectId);
                  }
                })
              }
            />
            {thread.worktreePath && worktreeBranch ? (
              <SidebarButton
                icon={<Plus className="size-4" />}
                label={t`New thread in worktree`}
                onPress={() =>
                  run(() =>
                    openNewThreadInWorktree({
                      projectId: thread.projectId,
                      worktreePath: thread.worktreePath!,
                      worktreeBranch,
                    }),
                  )
                }
              />
            ) : (
              <>
                <SidebarButton
                  icon={<GitFork className="size-4" />}
                  label={t`Move to worktree with changes`}
                  onPress={() => run(() => void moveThreadToWorktree(thread.id, true))}
                />
                <SidebarButton
                  icon={<GitFork className="size-4" />}
                  label={t`Move to clean worktree`}
                  onPress={() => run(() => void moveThreadToWorktree(thread.id, false))}
                />
              </>
            )}
            <SidebarButton
              icon={<CircleCheck className="size-4" />}
              label={thread.done ? t`Unmark Done` : t`Mark Done`}
              onPress={() => run(() => toggleMarkThreadDone(thread.id))}
            />
            <SidebarButton
              icon={<Star className="size-4" />}
              label={thread.starred ? t`Unpin` : t`Pin to top`}
              onPress={() => run(() => toggleStarThread(thread.id))}
            />
            <SidebarButton
              icon={<Archive className="size-4 text-warning" />}
              label={t`Archive Thread`}
              className="text-warning"
              onPress={() => run(() => archiveThread(thread.id))}
            />
            <SidebarButton
              icon={<Trash2 className="size-4 text-danger" />}
              label={t`Delete Thread`}
              className="text-danger"
              onPress={() =>
                run(() => deleteThread(thread.id, thread.worktreePath, thread.projectId))
              }
            />
          </div>
        </BottomSheet>
      ) : null}
    </>
  );
}

export function CompactThreadHeader(props: {
  thread: Thread;
  project: Project;
  agentStatus: AgentStatus | undefined;
}) {
  const { t } = useLingui();
  const { thread, agentStatus } = props;
  const [renaming, setRenaming] = useState(false);
  const snapshots = useProviderUsageStore((state) => state.snapshots);
  const agentInstances = useSharedSettings((state) => state.agentInstances);

  useEffect(() => {
    let cancelled = false;
    void readBridge()
      .getProviderUsage({})
      .then((result) => {
        if (cancelled || !result) return;
        const store = useProviderUsageStore.getState();
        for (const snapshot of result.snapshots) store.mergeSnapshot(snapshot);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [thread.id]);

  const providerId = resolveThreadUsageProviderId(thread, Object.keys(snapshots));
  const snapshot = snapshots[providerId];
  const label =
    resolveDisplayedProviders([], [], agentInstances).find((provider) => provider.id === providerId)
      ?.label ??
    USAGE_PROVIDERS.find((provider) => provider.id === baseAgentKind(providerId))?.label ??
    baseAgentKind(providerId);

  return (
    <div className="m-topbar__thread-row">
      <span className="m-topbar__thread">
        {renaming ? (
          <InlineRenameInput
            initialValue={thread.title}
            onCommit={(title) => {
              renameThread(thread.id, title);
              setRenaming(false);
            }}
            onCancel={() => setRenaming(false)}
          />
        ) : (
          <>
            <ThreadHeaderStatusButton
              threadId={thread.id}
              fallbackThread={thread}
              fallbackAgentKind={thread.agentKind}
              agentLabel={agentStatus?.label}
              agentIcon={agentStatus?.icon}
            />
            <span className="m-topbar__title">{thread.title}</span>
          </>
        )}
      </span>
      <Button
        isIconOnly
        size="sm"
        variant="ghost"
        className="m-usage-chip"
        aria-label={t`${label} usage`}
        onPress={openUsagePanel}
      >
        <ProviderUsageCircle kind={providerId} windows={snapshot?.windows} size={26} />
      </Button>
      <CompactThreadActions thread={thread} onRename={() => setRenaming(true)} />
    </div>
  );
}
