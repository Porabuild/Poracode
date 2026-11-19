import { randomUUID } from "node:crypto";
import type { ImportSessionThreadCommand, Thread } from "@/shared/contracts";
import {
  matchesImportedSession,
  type AppSessionImportInput,
  type AppSessionImportResult,
} from "@/shared/contracts/sessionImport";
import { msg } from "@/shared/messages";
import {
  dbDeleteThread,
  dbGetProject,
  dbGetThread,
  dbGetThreads,
  dbFlushThreadRuntimeWrites,
  dbUpsertThread,
  type CatalogIntentCommittedSignal,
} from "@/host/db";
import {
  clearPendingSessionImport,
  isSessionImportPending,
  markSessionImportPending,
} from "@/host/db/sessionImportJournal";
import { RemoteHttpError } from "../auth";
import type { RemoteServerContext } from "./context";

interface PendingImport {
  command: ImportSessionThreadCommand;
  completion: Promise<void>;
}

const pendingByHost = new WeakMap<RemoteServerContext, Map<string, PendingImport>>();

function pendingImports(ctx: RemoteServerContext): Map<string, PendingImport> {
  let pending = pendingByHost.get(ctx);
  if (!pending) {
    pending = new Map();
    pendingByHost.set(ctx, pending);
  }
  return pending;
}

function findPendingImport(
  ctx: RemoteServerContext,
  input: AppSessionImportInput,
): PendingImport | undefined {
  return [...pendingImports(ctx).values()].find(
    ({ command }) =>
      input.path === command.path ||
      (input.agentKind === command.agentKind &&
        input.providerSessionId === command.providerSessionId),
  );
}

function requireImportProject(projectId: string): void {
  if (!dbGetProject(projectId)) {
    throw new RemoteHttpError("project_not_found", msg("remote.project.notFound"), 404);
  }
}

/**
 * Imports one of this host's CLI transcripts for a remote client. Mirrors the
 * desktop import: a resumable inactive GUI row is saved first, so the replayed
 * runtime events have a durable thread, then the supervisor replays the
 * transcript (it validates the path against the agent's own transcript roots).
 * A failed replay removes the row. The startup journal covers a host crash
 * before the complete accepted transcript prefix is committed.
 */
export async function importRemoteSession(
  ctx: RemoteServerContext,
  command: ImportSessionThreadCommand,
  onCatalogCommitted?: CatalogIntentCommittedSignal,
): Promise<void> {
  requireImportProject(command.projectId);
  const pending = pendingImports(ctx);
  if (pending.has(command.threadId) || dbGetThread(command.threadId)) {
    throw new RemoteHttpError("thread_already_exists", msg("thread.alreadyExists"), 409);
  }
  if (findPendingImport(ctx, command)) {
    throw new RemoteHttpError("session_import_in_progress", msg("sessionImport.inProgress"), 409);
  }
  if (dbGetThreads().some((thread) => matchesImportedSession(command, thread))) {
    throw new RemoteHttpError("session_already_imported", msg("thread.alreadyExists"), 409);
  }
  const completion = Promise.resolve().then(() =>
    replayImportedSession(ctx, command, onCatalogCommitted),
  );
  pending.set(command.threadId, { command, completion });
  try {
    await completion;
  } finally {
    pending.delete(command.threadId);
  }
}

/** App Controls uses the same replay as the UI and returns the existing thread on retries. */
export async function importAppSession(
  ctx: RemoteServerContext,
  input: AppSessionImportInput,
): Promise<AppSessionImportResult> {
  requireImportProject(input.projectId);
  const pending = findPendingImport(ctx, input);
  if (pending) await pending.completion;
  const existing = dbGetThreads().find((thread) => matchesImportedSession(input, thread));
  if (existing) {
    if (isSessionImportPending(existing.id)) {
      throw new RemoteHttpError("session_import_in_progress", msg("sessionImport.inProgress"), 409);
    }
    return { threadId: existing.id, projectId: existing.projectId, outcome: "existing" };
  }
  const threadId = randomUUID();
  await importRemoteSession(ctx, { ...input, kind: "import-session", threadId });
  try {
    ctx.publishThreadsChanged([threadId]);
  } catch (error) {
    console.warn("[app-controls] session imported but catalog publication failed:", error);
  }
  return { threadId, projectId: input.projectId, outcome: "imported" };
}

async function replayImportedSession(
  ctx: RemoteServerContext,
  command: ImportSessionThreadCommand,
  onCatalogCommitted?: CatalogIntentCommittedSignal,
): Promise<void> {
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
  markSessionImportPending(command.threadId, now);
  try {
    dbUpsertThread(thread, -Date.now());
    await ctx.options.callSupervisor("importSessionTranscript", {
      threadId: command.threadId,
      agentKind: command.agentKind,
      path: command.path,
      providerSessionId: command.providerSessionId,
    });
    await dbFlushThreadRuntimeWrites(command.threadId);
    clearPendingSessionImport(command.threadId);
  } catch (error) {
    if (dbGetThread(command.threadId)?.config.importedFrom?.importedAt === now) {
      dbDeleteThread(command.threadId);
    }
    clearPendingSessionImport(command.threadId);
    throw error;
  }
  onCatalogCommitted?.();
}
