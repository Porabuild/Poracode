import { lazy, Suspense, useEffect } from "react";
import { Trans } from "@lingui/react/macro";
import { MessageCircle } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { useAppStore } from "@/renderer/state/appStore";
import type { Thread } from "@/shared/contracts";
import { EmptyState } from "./components";
import { useDesktopPanelStore } from "./desktopPanelStore";
import { openWorktreeDraft, preselectWorktreeDraft, runThreadAction } from "./navHelpers";
import { useRemote } from "./remoteContext";
import { DESKTOP_RIGHT_PANEL_QUERY, useMediaQuery } from "./useMediaQuery";

const ThreadView = lazy(() =>
  import("./views/ThreadView").then((module) => ({ default: module.ThreadView })),
);

/**
 * Shared thread detail pane. NarrowShell keeps this mounted behind routed
 * subagent pages; wide shells use it as their ordinary thread detail.
 */
export function ThreadDetail(props: {
  readonly thread: Thread | null;
  readonly hideHeader: boolean;
}) {
  const remote = useRemote();
  const navigate = useNavigate();
  const useRightPanel = useMediaQuery(DESKTOP_RIGHT_PANEL_QUERY);
  const thread = props.thread;
  const threadId = thread?.id ?? null;

  // Ensure the displayed thread is actually OPEN, not just rendered. This
  // effect also retries cold deep links after the desktop connection arrives.
  const activeDesktopId = remote.activeDesktop?.desktopId ?? null;
  useEffect(() => {
    if (!threadId) return;
    const state = useAppStore.getState();
    const watched = state.view.kind === "thread" && state.view.panes.includes(threadId);
    const hasSnapshot = remote.selectedThreadSnapshot?.thread.id === threadId;
    if (watched && hasSnapshot) return;
    const target = remote.activeThreads.find((entry) => entry.id === threadId);
    if (target) void remote.openThread(target);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on displayed thread + desktop; openThread deduplicates the racing click path
  }, [threadId, activeDesktopId]);

  if (!thread) {
    return (
      <section className="m-thread">
        <EmptyState
          icon={<MessageCircle className="size-5" />}
          title={<Trans>No thread selected</Trans>}
          hint={<Trans>Pick a thread from the list to follow the agent from here.</Trans>}
        />
      </section>
    );
  }

  const loading = remote.selectedThreadSnapshot?.thread.id !== thread.id;
  return (
    <Suspense
      fallback={
        <div className="m-page m-route-loading">
          <div className="text-sm text-muted">
            <Trans>Loading…</Trans>
          </div>
        </div>
      }
    >
      <ThreadView
        thread={thread}
        terminalScrollback={remote.selectedThreadSnapshot?.terminalScrollback}
        terminalSize={remote.selectedThreadSnapshot?.terminalSize}
        hideHeader={props.hideHeader}
        loading={loading}
        onThreadAction={(action) =>
          runThreadAction(remote, thread, action, () => void navigate({ to: "/threads" }))
        }
        onSubmitInput={(prompt, segments) => remote.sendPrompt(prompt, segments)}
        onOpenSubAgent={(parentItemId) => {
          if (useRightPanel) {
            useDesktopPanelStore.getState().showSubAgent(thread.id, parentItemId);
            return;
          }
          void navigate({
            to: "/subagent/$threadId/$parentItemId",
            params: { threadId: thread.id, parentItemId },
          });
        }}
        onOpenWorkspace={(tab) => {
          if (useRightPanel) {
            useDesktopPanelStore.getState().show(tab === "changes" ? "git" : "files", thread.id);
            return;
          }
          void navigate({
            to: "/workspace/$threadId",
            params: { threadId: thread.id },
            search: { tab },
          });
        }}
        onOpenWorkspaceFile={(path, lineNumber) => {
          if (useRightPanel) {
            useDesktopPanelStore.getState().showFile(thread.id, path, lineNumber);
            return;
          }
          void navigate({
            to: "/workspace/$threadId",
            params: { threadId: thread.id },
            search: {
              tab: "files",
              file: path,
              ...(lineNumber !== undefined ? { line: lineNumber } : {}),
            },
          });
        }}
        onOpenWorkspaceFolder={(path) => {
          if (useRightPanel) {
            useDesktopPanelStore.getState().showFolder(thread.id, path);
            return;
          }
          void navigate({
            to: "/workspace/$threadId",
            params: { threadId: thread.id },
            search: { tab: "files", folder: path },
          });
        }}
        onOpenTerminal={() => {
          if (useRightPanel) {
            useDesktopPanelStore.getState().show("terminal", thread.id);
            return;
          }
          void navigate({
            to: "/terminal/$projectId",
            params: { projectId: thread.projectId },
            search: {
              fromThread: thread.id,
              ...(thread.worktreePath ? { worktree: thread.worktreePath } : {}),
            },
          });
        }}
        onOpenNotes={() => {
          if (useRightPanel) {
            useDesktopPanelStore.getState().show("notes", thread.id);
            return;
          }
          void navigate({
            to: "/notes/$threadId",
            params: { threadId: thread.id },
          });
        }}
        onNewThreadInWorktree={(input) => {
          if (props.hideHeader) {
            preselectWorktreeDraft(input);
            void navigate({ to: "/threads" });
            return;
          }
          void openWorktreeDraft(input, () => navigate({ to: "/new" }));
        }}
        onDeleteWorktreeGroup={(input) => {
          void remote.deleteWorktreeGroup(input);
          void navigate({ to: "/threads" });
        }}
        onMoveThreadToWorktree={(target, withChanges) => {
          void remote.moveThreadToWorktree(target, withChanges);
        }}
      />
    </Suspense>
  );
}
