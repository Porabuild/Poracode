import type { RemoteThreadCommand, Thread } from "@/shared/contracts";

/**
 * Metadata-only thread commands. These mutate the persisted thread row and,
 * for done/archive, end the thread's supervisor session; they never touch
 * worktrees or launch providers.
 */
export type ThreadMetadataCommand = Extract<
  RemoteThreadCommand,
  {
    kind:
      | "rename"
      | "acknowledge"
      | "set-done"
      | "set-starred"
      | "set-group"
      | "clear-group"
      | "archive"
      | "unarchive";
  }
>;

/**
 * True when a metadata command owns a host lifecycle effect: marking a thread
 * done (not un-done) and archiving both end its run, so the durable apply must
 * close the supervisor session rather than assuming a renderer will.
 */
export function threadMetadataClosesSession(command: ThreadMetadataCommand): boolean {
  return (command.kind === "set-done" && command.done) || command.kind === "archive";
}

/**
 * The authoritative row mutation for a metadata command, shared by the remote
 * thread-command route and the app-controls `update_thread` tool so both
 * persist identical fields and timestamps. `now` defaults to the apply-time
 * ISO stamp used by the timestamped fields (doneAt / archivedAt / updatedAt).
 */
export function applyThreadMetadataCommand(
  thread: Thread,
  command: ThreadMetadataCommand,
  now = new Date().toISOString(),
): Thread {
  switch (command.kind) {
    case "rename":
      return { ...thread, title: command.title };
    case "acknowledge":
      // Acknowledging only clears a finished thread's completion marker.
      return thread.status === "finished" ? { ...thread, status: "idle" } : thread;
    case "set-done":
      return command.done
        ? { ...thread, done: true, doneAt: now, starred: false }
        : { ...thread, done: false, doneAt: undefined };
    case "set-starred":
      return { ...thread, starred: command.starred };
    case "set-group":
      return { ...thread, groupId: command.groupId, groupName: command.groupName };
    case "clear-group": {
      const { groupId: _groupId, groupName: _groupName, ...ungrouped } = thread;
      return ungrouped;
    }
    case "archive":
      return { ...thread, archived: true, archivedAt: now, updatedAt: now };
    case "unarchive":
      return { ...thread, archived: false, archivedAt: undefined, updatedAt: now };
  }
}
