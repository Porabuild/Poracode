import type { RemoteThreadCommand } from "@/shared/contracts";
import { useAppStore } from "@/renderer/state/appStore";
import { runHostOriginatedManagedRootMutation } from "@/renderer/state/managedRootCatalog/rootCatalogCommands";
import {
  acknowledgeThread,
  archiveThread,
  deleteThread,
  renameThread,
  toggleMarkThreadDone,
  toggleStarThread,
} from "./threadActions";
import { forgetRemovedWorktreeGroup } from "./worktreeActions";
import { primeWorktreeGitState } from "./worktreeLaunchActions";
import { applyRemoteThreadStartCommand } from "./remoteStartCommandActions";

/**
 * Host-origin thread-command application (the desktop's forwarded-command
 * callback).
 *
 * Thread-metadata commands issued by paired remote clients (mobile PWA) and
 * every command the co-located host applied are delivered to this renderer so
 * its store follows the authoritative row. This is PROJECTION, never a user
 * intent: applying it must not dispatch a command back to the host, or a
 * single user edit becomes an unbounded host→renderer→host echo. The whole
 * application therefore runs inside the explicit host-origin fence
 * ({@link runHostOriginatedManagedRootMutation}); managed-root dispatch sites
 * consult that boundary and apply locally only.
 *
 * The fence is deliberately scoped to this synchronous application: a real
 * user action runs in its own turn and is never suppressed.
 */
export function applyForwardedRemoteThreadCommand(command: RemoteThreadCommand): void {
  runHostOriginatedManagedRootMutation(() => {
    if (command.kind === "delete-worktree-group") {
      forgetRemovedWorktreeGroup(command.projectId, command.worktreePath, command.threadIds);
      return;
    }
    if (command.kind === "prepare-worktree") {
      const project = useAppStore
        .getState()
        .projects.find((entry) => entry.id === command.projectId);
      if (!project) return;
      void primeWorktreeGitState(project, command.worktreePath);
      return;
    }
    if (command.kind === "start") {
      applyRemoteThreadStartCommand(command);
      return;
    }
    const thread = useAppStore.getState().threads.find((t) => t.id === command.threadId);
    if (!thread) return;
    switch (command.kind) {
      case "acknowledge":
        acknowledgeThread(command.threadId);
        break;
      case "rename":
        renameThread(command.threadId, command.title);
        break;
      case "set-done":
        if (thread.done !== command.done) toggleMarkThreadDone(command.threadId);
        break;
      case "set-starred":
        if ((thread.starred ?? false) !== command.starred) toggleStarThread(command.threadId);
        break;
      // Orchestrator grouping: pulls the parent thread into the sidebar
      // group its children are created in.
      case "set-group":
        useAppStore.setState((state) => ({
          threads: state.threads.map((t) =>
            t.id === command.threadId
              ? { ...t, groupId: command.groupId, groupName: command.groupName }
              : t,
          ),
        }));
        break;
      case "clear-group":
        useAppStore.setState((state) => {
          const groupId = state.threads.find((t) => t.id === command.threadId)?.groupId;
          let threads = state.threads.map((candidate) =>
            candidate.id === command.threadId
              ? { ...candidate, groupId: undefined, groupName: undefined }
              : candidate,
          );
          if (groupId) {
            const remainder = threads.filter((candidate) => candidate.groupId === groupId);
            if (remainder.length === 1) {
              threads = threads.map((candidate) =>
                candidate.id === remainder[0]!.id
                  ? { ...candidate, groupId: undefined, groupName: undefined }
                  : candidate,
              );
            }
          }
          return { threads };
        });
        break;
      case "set-worktree": {
        useAppStore
          .getState()
          .setThreadWorktree(command.threadId, command.worktreePath, command.worktreeBranch);
        if (command.isNewWorktree) {
          const project = useAppStore.getState().projects.find((p) => p.id === thread.projectId);
          if (project) {
            void primeWorktreeGitState(project, command.worktreePath);
          }
        }
        break;
      }
      case "archive":
        archiveThread(command.threadId);
        break;
      case "unarchive":
        useAppStore.getState().unarchiveThread(command.threadId);
        break;
      case "delete":
        // Thread-only delete: remote clients never trigger worktree removal.
        deleteThread(command.threadId);
        break;
    }
  });
}
