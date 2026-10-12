import type { RemoteThreadCommand, Thread } from "@/shared/contracts";
import {
  projectAuthoritativeCatalogPatch,
  applyCatalogPatchFields,
} from "@/renderer/state/pendingCatalogEdits";
import { useAppStore } from "@/renderer/state/appStore";
import { runHostOriginatedManagedRootMutation } from "@/renderer/state/managedRootCatalog/rootCatalogCommands";
import {
  acknowledgeThread,
  archiveThread,
  deleteThread,
  renameThread,
  toggleMarkThreadDone,
  toggleStarThread,
  cleanupDoneThread,
} from "./threadActions";
import { forgetRemovedWorktreeGroup } from "./worktreeActions";
import { primeWorktreeGitState } from "./worktreeLaunchActions";
import { applyRemoteThreadStartCommand } from "./remoteStartCommandActions";
import { applyRemoteSetGroupCommand } from "./remoteGroupCommandActions";

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
    const now = new Date().toISOString();
    const patch: Partial<Thread> | undefined =
      command.kind === "rename"
        ? { title: command.title }
        : command.kind === "set-starred"
          ? { starred: command.starred }
          : command.kind === "set-done"
            ? {
                done: command.done,
                doneAt: command.done ? now : undefined,
                ...(command.done ? { starred: false } : {}),
              }
            : command.kind === "archive"
              ? { archived: true, archivedAt: now, updatedAt: now }
              : command.kind === "unarchive"
                ? { archived: false, archivedAt: undefined, updatedAt: now }
                : undefined;
    const projected = patch ? projectAuthoritativeCatalogPatch("thread", thread, patch) : undefined;
    const paintProjection = () => {
      if (!patch || !projected) return;
      useAppStore.setState((state) => ({
        threads: state.threads.map((row) =>
          row.id === thread.id ? applyCatalogPatchFields(row, projected, patch) : row,
        ),
      }));
    };
    // An older forwarded command must not close panes or unload a thread that
    // a newer pending intent has already restored.
    if (
      projected &&
      ((command.kind === "set-done" && projected.done !== command.done) ||
        (command.kind === "archive" && !projected.archived) ||
        (command.kind === "unarchive" && projected.archived))
    ) {
      paintProjection();
      return;
    }
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
        applyRemoteSetGroupCommand(command.threadId, command.groupId, command.groupName);
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
      case "set-workspace":
        useAppStore
          .getState()
          .setThreadWorkspace(command.threadId, command.workspaceId ?? undefined);
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
    paintProjection();
    if (command.kind === "set-done" && command.done) cleanupDoneThread(command.threadId);
  });
}
