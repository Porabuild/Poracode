import type { ThreadStatus } from "@/shared/contracts";
import { dbGetThread, dbTouchThreadUpdatedAt } from "@/host/db";
import { isDatabaseInitialized } from "@/host/db/connection";
import type { RemoteServerContext } from "./context";
import { notePendingThreadUpdatedAt, pendingThreadActivity } from "./pendingInterruptedTurns";

interface BeforeActivitySnapshot {
  readonly status: ThreadStatus;
  readonly presentationMode: "terminal" | "gui";
}

function readThreadSnapshot(
  ctx: RemoteServerContext,
  threadId: string,
): BeforeActivitySnapshot | undefined {
  const thread = dbGetThread(threadId);
  if (!thread) return undefined;
  const status =
    pendingThreadActivity(thread)?.status ??
    ctx.threadLiveReadState.runtimeThreadFor(thread)?.status ??
    thread.status;
  return {
    status,
    presentationMode: thread.presentationMode ?? "terminal",
  };
}

/**
 * Persists user-driven thread activity (`updated_at`) on the host after a
 * supervisor input/request/steer/queue call succeeds. When the call itself
 * starts a new GUI turn, the resulting `thread-state` (`working`) event already
 * carries the host timestamp to live clients; otherwise (working steers, queued
 * follow-ups, terminal input without an immediate `working` transition) a
 * membership notification keeps remote clients and the managed catalog aligned.
 */
export function beginHostThreadActivityTouch(
  ctx: RemoteServerContext,
  threadId: string,
  options: { readonly forceBroadcast?: boolean } = {},
): () => void {
  if (!isDatabaseInitialized()) return () => {};
  const before = readThreadSnapshot(ctx, threadId);
  if (!before) return () => {};
  return () => {
    if (!isDatabaseInitialized()) return;
    const after = readThreadSnapshot(ctx, threadId);
    if (!after) return;
    const transitionedIntoWorking = before.status !== "working" && after.status === "working";
    if (transitionedIntoWorking) return;

    const nowIso = new Date().toISOString();
    const touched = dbTouchThreadUpdatedAt(threadId, nowIso);
    notePendingThreadUpdatedAt(threadId, nowIso);
    if (!touched) return;

    const expectsWorkingStateEvent =
      before.presentationMode === "gui" &&
      before.status !== "working" &&
      options.forceBroadcast !== true;
    if (!expectsWorkingStateEvent) {
      ctx.publishThreadsChanged([threadId]);
    }
  };
}
