import type { RemoteThreadCommand, Thread } from "@/shared/contracts";
import { msg } from "@/shared/messages";
import {
  dbGetProject,
  dbGetThread,
  dbUpsertThread,
  type CatalogIntentCommittedSignal,
} from "@/host/db";
import { assertPersistedThreadGroupChangeSafe } from "../experimentOwnership";
import { RemoteHttpError } from "../auth";

/** Metadata-only creation. Runtime launch and worktree preparation remain separate intents. */
export function createRemoteThread(
  command: Extract<RemoteThreadCommand, { kind: "create" }>,
  onCatalogCommitted?: CatalogIntentCommittedSignal,
): void {
  if (!dbGetProject(command.projectId)) {
    throw new RemoteHttpError("project_not_found", msg("remote.project.notFound"), 404);
  }
  if (dbGetThread(command.threadId)) {
    throw new RemoteHttpError("thread_already_exists", msg("thread.alreadyExists"), 409);
  }
  assertPersistedThreadGroupChangeSafe(undefined, command.groupId);
  const { kind: _kind, threadId, ...metadata } = command;
  const now = new Date().toISOString();
  const presentationMode = command.presentationMode ?? "terminal";
  const thread: Thread = {
    ...metadata,
    id: threadId,
    presentationMode,
    ...(presentationMode !== "terminal" ? { threadStatusSource: "server" } : {}),
    status: "inactive",
    attention: "none",
    canResumeWithConfig: false,
    archived: false,
    done: false,
    starred: false,
    createdAt: now,
    updatedAt: now,
  };
  dbUpsertThread(thread, -Date.now(), onCatalogCommitted);
}
