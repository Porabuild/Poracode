import { useState } from "react";
import { useLingui } from "@lingui/react/macro";
import {
  Archive,
  ArrowRightLeft,
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
import type { Project, Thread } from "@/shared/contracts";
import { openNotesPanel } from "@/renderer/actions/panelActions";
import { moveThreadToWorktree } from "@/renderer/actions/moveThreadToWorktreeActions";
import {
  archiveThread,
  openNewThreadInWorktree,
  renameThread,
  requestDeleteThread,
  toggleMarkThreadDone,
  toggleStarThread,
} from "@/renderer/actions/threadActions";
import { openTerminal, openWorktreeTerminal } from "@/renderer/actions/terminalActions";
import { BottomSheet } from "@/renderer/components/common/BottomSheet";
import {
  ProjectRemoteServerChip,
  useProjectRemoteServer,
} from "@/renderer/components/common/ProjectRemoteServer";
import { SidebarButton } from "@/renderer/components/common/SidebarButton";
import { MobileCircleButton } from "@/renderer/components/mobileComposer/MobileCircleButton";
import { InlineRenameInput } from "@/renderer/views/MainView/parts/Sidebar/parts/InlineRenameInput";
import { useThreadAgentStatuses } from "@/renderer/hooks/uiSelectors";
import { useContinueInProviderStore } from "@/renderer/state/continueInProviderStore";
import { findExperimentByThreadId } from "@/renderer/state/experimentStore";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import { remoteConnectionKey } from "@/renderer/state/remoteServers/types";
import { resolveWorktreeBranch } from "@/renderer/utils/gitHelpers";

function CompactThreadActions(props: {
  thread: Thread;
  canContinue: boolean;
  onRename: () => void;
}) {
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
      <MobileCircleButton aria-label={t`Thread actions`} onPress={() => setOpen(true)}>
        <Ellipsis className="size-4" />
      </MobileCircleButton>
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
            {props.canContinue ? (
              <SidebarButton
                icon={<ArrowRightLeft className="size-4" />}
                label={t`Continue in another provider`}
                onPress={() => run(() => useContinueInProviderStore.getState().request(thread.id))}
              />
            ) : null}
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
                run(() => requestDeleteThread(thread.id, thread.worktreePath, thread.projectId))
              }
            />
          </div>
        </BottomSheet>
      ) : null}
    </>
  );
}

export function CompactThreadHeader(props: { thread: Thread; project: Project }) {
  const { thread } = props;
  const [renaming, setRenaming] = useState(false);
  const remote = useProjectRemoteServer(props.project);
  const installedAgents = useThreadAgentStatuses({
    remoteServerId: thread.remoteServerId,
    projectLocation: props.project.location,
  });
  const canOperate = useRemoteServersStore(
    (state) =>
      thread.remoteServerId === undefined ||
      state.servers.some(
        (server) =>
          remoteConnectionKey(server) === thread.remoteServerId &&
          server.scopes.includes("session:operate"),
      ),
  );
  const canContinue =
    canOperate &&
    !findExperimentByThreadId(thread.id) &&
    installedAgents.some((agent) => agent.kind !== thread.agentKind);
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
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="m-topbar__title">{thread.title}</span>
              <span className="flex min-w-0 items-center gap-1 text-[10px] leading-4 text-muted/70">
                <span className="truncate">{props.project.name}</span>
                <ProjectRemoteServerChip info={remote} size="xs" />
              </span>
            </span>
          </>
        )}
      </span>
      <CompactThreadActions
        thread={thread}
        canContinue={canContinue}
        onRename={() => setRenaming(true)}
      />
    </div>
  );
}
