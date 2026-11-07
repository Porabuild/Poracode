import type { Thread } from "@/shared/contracts/thread";
import {
  HOST_ADMIN_SESSION_FORMAT_VERSION,
  hostAdminSessionInspectionSchema,
  hostAdminSessionListSchema,
  hostAdminSessionStopSchema,
  hostAdminSessionSummarySchema,
  hostAdminSessionUpdateSchema,
  type HostAdminCommand,
} from "@/shared/hostAdminProtocol";
import type { HostControlContext } from "@/backend/ownership/HostControlServer";
import type { AdminSupervisorCall } from "./hostProviderAuth";
import { dbUpdateThreadMetadata } from "@/host/db";
import { dbReadThreadWorkspaceGrantOwner } from "@/host/db/threadWorkspaceGrants";
import {
  applyThreadMetadataCommand,
  threadMetadataClosesSession,
  type ThreadMetadataCommand,
} from "@/host/remote/server/threadMetadataCommands";

type SessionCommand = Extract<
  HostAdminCommand,
  { action: "sessions-list" | "sessions-inspect" | "sessions-stop" | "sessions-update" }
>;
export interface HostSessionReads {
  readThread(id: string): Thread | null;
  readPage(input: {
    limit: number;
    cursor?: string;
    projectId?: string;
  }): Promise<{ threads: Thread[]; nextCursor: string | null }>;
}

function summarize(thread: Thread) {
  return hostAdminSessionSummarySchema.parse({
    id: thread.id,
    projectId: thread.projectId,
    title: thread.title,
    agentKind: thread.agentKind,
    presentationMode: thread.presentationMode ?? "terminal",
    storedStatus: thread.status,
    archived: thread.archived,
    done: thread.done,
    createdAt: thread.createdAt,
    updatedAt: thread.updatedAt,
  });
}

export async function administerSession(
  command: SessionCommand,
  context: HostControlContext,
  reads: HostSessionReads,
  call: AdminSupervisorCall,
) {
  context.assertActive();
  const metadata = { formatVersion: HOST_ADMIN_SESSION_FORMAT_VERSION, scope: "persisted-profile" };
  if (command.action === "sessions-list") {
    const page = await reads.readPage({
      limit: command.limit,
      ...(command.cursor !== undefined ? { cursor: command.cursor } : {}),
      ...(command.projectId !== undefined ? { projectId: command.projectId } : {}),
    });
    context.assertActive();
    if (
      page.threads.length > command.limit ||
      (command.projectId !== undefined &&
        page.threads.some((thread) => thread.projectId !== command.projectId))
    )
      throw new Error(
        "The session page did not match the requested limit/project; no metadata was returned.",
      );
    return hostAdminSessionListSchema.parse({
      ...metadata,
      sessions: page.threads.map(summarize),
      nextCursor: page.nextCursor,
    });
  }
  const thread = reads.readThread(command.threadId);
  if (!thread || thread.id !== command.threadId)
    throw new Error(
      "Persisted session not found in this profile. Run sessions list with the same --base-dir.",
    );
  if (command.action === "sessions-inspect")
    return hostAdminSessionInspectionSchema.parse({ ...metadata, session: summarize(thread) });
  if (command.action === "sessions-update") {
    if (thread.remoteServerId || thread.remoteId)
      throw new Error("Select the session on its owning host. No remote session was changed.");
    const owner = dbReadThreadWorkspaceGrantOwner(thread.id).owner;
    const change: ThreadMetadataCommand =
      command.change.kind === "done" || command.change.kind === "reopen"
        ? { kind: "set-done", threadId: thread.id, done: command.change.kind === "done" }
        : { ...command.change, threadId: thread.id };
    const closes = threadMetadataClosesSession(change);
    if (closes) {
      const result = await call("closeThreadConfirmed", { threadId: thread.id });
      context.assertActive();
      if (!result.confirmed)
        throw new Error("Session runtime retirement was not confirmed. Metadata was not changed.");
    }
    const updated = dbUpdateThreadMetadata(thread.id, (current) => {
      context.assertActive();
      if (dbReadThreadWorkspaceGrantOwner(thread.id).owner !== owner)
        throw new Error(
          "The session execution identity changed. Metadata was not changed; inspect it before retrying.",
        );
      return applyThreadMetadataCommand(current, change);
    });
    if (!updated) throw new Error("The session was removed. No metadata was recreated.");
    return hostAdminSessionUpdateSchema.parse({
      ...metadata,
      change: command.change,
      session: summarize(updated),
      runtime: closes ? "retired" : "unchanged",
    });
  }
  context.assertActive();
  const result = await call("closeThreadConfirmed", { threadId: thread.id });
  context.assertActive();
  if (!result.confirmed)
    throw new Error(
      "Session runtime retirement was not confirmed. Its persisted history was preserved; inspect the host diagnostics before retrying. No success or process-kill fallback was reported.",
    );
  return hostAdminSessionStopSchema.parse({ ...metadata, threadId: thread.id, retired: true });
}
