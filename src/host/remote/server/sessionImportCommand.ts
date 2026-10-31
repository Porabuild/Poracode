import type { RemoteThreadCommand, Thread } from "@/shared/contracts";
import { msg } from "@/shared/messages";
import {
  dbDeleteThread,
  dbGetProject,
  dbGetThread,
  dbUpsertThread,
  type CatalogIntentCommittedSignal,
} from "@/host/db";
import { RemoteHttpError } from "../auth";
import type { RemoteServerContext } from "./context";

type ImportSessionCommand = Extract<RemoteThreadCommand, { kind: "import-session" }>;

/**
 * Imports one of this host's CLI transcripts for a remote client. Mirrors the
 * desktop import: a resumable inactive GUI row is saved first, so the replayed
 * runtime events have a durable thread, then the supervisor replays the
 * transcript (it validates the path against the agent's own transcript roots).
 * A failed replay removes the row, so the client never sees a half import.
 */
export async function importRemoteSession(
  ctx: RemoteServerContext,
  command: ImportSessionCommand,
  onCatalogCommitted?: CatalogIntentCommittedSignal,
): Promise<void> {
  if (!dbGetProject(command.projectId)) {
    throw new RemoteHttpError("project_not_found", msg("remote.project.notFound"), 404);
  }
  if (dbGetThread(command.threadId)) {
    throw new RemoteHttpError("thread_already_exists", msg("thread.alreadyExists"), 409);
  }
  const now = new Date().toISOString();
  const thread: Thread = {
    id: command.threadId,
    projectId: command.projectId,
    title: command.title,
    agentKind: command.agentKind,
    config: { model: command.model, importedFrom: { path: command.path, importedAt: now } },
    presentationMode: "gui",
    threadStatusSource: "server",
    status: "inactive",
    attention: "none",
    canResumeWithConfig: true,
    sessionRef: { providerSessionId: command.providerSessionId, discoveredAt: now },
    archived: false,
    done: false,
    starred: false,
    createdAt: now,
    updatedAt: now,
  };
  dbUpsertThread(thread, -Date.now(), onCatalogCommitted);
  try {
    await ctx.options.callSupervisor("importSessionTranscript", {
      threadId: command.threadId,
      agentKind: command.agentKind,
      path: command.path,
      providerSessionId: command.providerSessionId,
    });
  } catch (error) {
    dbDeleteThread(command.threadId);
    throw error;
  }
}
