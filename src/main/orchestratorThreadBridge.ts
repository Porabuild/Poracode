import type { RemoteThreadCommand, StartThreadPayload, Thread } from "@/shared/contracts";
import type { SupervisorEvent } from "@/shared/ipc";
import { dbDeleteThread, dbGetThread, dbUpsertThread } from "./db";

type OrchestratorThreadCreatedEvent = Extract<
  SupervisorEvent,
  { type: "orchestrator-thread-created" }
>;

export interface OrchestratorThreadBridgeDeps {
  /** Launch the child session in the supervisor (main → supervisor request). */
  startThread(payload: StartThreadPayload): Promise<unknown>;
  /** Mirror a thread command to the renderer store; false when no window is up. */
  sendThreadCommand(command: RemoteThreadCommand): boolean;
}

/**
 * Main-process half of the subagents MCP orchestrator lane's `create_thread`.
 * Mirrors the proven remote (mobile) start ordering exactly:
 *
 * 1. Resolve `projectId` from the PARENT thread's DB row (the supervisor
 *    doesn't know project ids) and complete the child `Thread` record.
 * 2. `dbUpsertThread` — persist the row first, so the thread survives even if
 *    a later step fails mid-flight.
 * 3. Mirror to the renderer (`remoteThreadCommand` "start" with
 *    `launchRuntime: false` — the launch happens below, not in the renderer —
 *    and `focus: false` so orchestrator fan-out doesn't steal the user's view).
 * 4. `startThread` back into the supervisor. On failure the fresh row is
 *    deleted and the renderer told to drop it; the supervisor-side
 *    `create_thread` call then times out and surfaces a tool error.
 */
export async function handleOrchestratorThreadCreated(
  event: OrchestratorThreadCreatedEvent,
  deps: OrchestratorThreadBridgeDeps,
): Promise<void> {
  const parent = dbGetThread(event.parentThreadId);
  if (!parent) {
    console.warn(
      `[main] orchestrator create_thread: parent thread ${event.parentThreadId} not found in DB; dropping child ${event.thread.id}`,
    );
    return;
  }

  const thread: Thread = { ...event.thread, projectId: parent.projectId };
  const existing = dbGetThread(thread.id) != null;
  // New rows sort to the top via a descending timestamp (same convention as
  // the remote-access server's sortOrderForThread).
  dbUpsertThread(thread, -Date.now());

  deps.sendThreadCommand({
    kind: "start",
    threadId: thread.id,
    projectId: thread.projectId,
    agentKind: thread.agentKind,
    config: thread.config,
    prompt: event.start.prompt,
    // Forward the title only when the orchestrator gave a custom one (e.g. a
    // ticket key) — a forwarded title is authoritative and disables AI title
    // generation in the renderer; a prompt-derived title still gets one.
    ...(event.hasCustomTitle ? { title: thread.title } : {}),
    presentationMode: "gui",
    ...(thread.worktreePath ? { worktreePath: thread.worktreePath } : {}),
    ...(thread.worktreeBranch ? { worktreeBranch: thread.worktreeBranch } : {}),
    ...(event.isNewWorktree ? { isNewWorktree: true } : {}),
    launchRuntime: false,
    focus: false,
    parentThreadId: event.parentThreadId,
  });

  try {
    await deps.startThread(event.start);
  } catch (error) {
    console.warn(`[main] orchestrator child thread ${thread.id} failed to launch:`, error);
    if (!existing) {
      dbDeleteThread(thread.id);
      deps.sendThreadCommand({ kind: "delete", threadId: thread.id });
    }
  }
}
