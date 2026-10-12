import { threadFollowUpQueueStateSchema, type ThreadFollowUpQueueState } from "@/shared/contracts";
import type { RemoteBroadcastEvent, RemoteServerContext } from "./context";
import { dbGetThread } from "@/host/db";

/** Host-owned queue levels. Unknown stays absent; a known retirement is null.
 * Event revisions and incarnation changes fence late startup seeds. */
export class ThreadLiveReadState {
  private readonly queues = new Map<string, ThreadFollowUpQueueState | null>();
  private readonly revisions = new Map<string, { queue: number; tasks: number }>();
  private generation = 0;

  queueFor(threadId: string): ThreadFollowUpQueueState | null | undefined {
    return this.queues.get(threadId);
  }

  observe(event: RemoteBroadcastEvent): void {
    if (event.type === "thread-follow-up-queue") {
      this.touch(event.threadId, "queue");
      this.queues.set(event.threadId, event.queue);
    } else if (event.type === "thread-reset" || event.type === "thread-exited") {
      this.touch(event.threadId, "queue");
      this.touch(event.threadId, "tasks");
      this.queues.set(event.threadId, null);
    } else {
      const events =
        event.type === "thread-runtime-event"
          ? [event.event]
          : event.type === "thread-runtime-events"
            ? event.events
            : event.type === "thread-runtime-events-multi"
              ? event.batches.flatMap((batch) => batch.events)
              : [];
      for (const runtimeEvent of events)
        if (runtimeEvent.type === "background_tasks.changed")
          this.touch(runtimeEvent.threadId, "tasks");
    }
  }

  beginSeed(threadId: string, field: "queue" | "tasks", agentKind?: string): () => boolean {
    const incarnationCurrent = this.beginIncarnation();
    const revision = this.revisions.get(threadId)?.[field] ?? 0;
    return () => {
      if (!incarnationCurrent() || revision !== (this.revisions.get(threadId)?.[field] ?? 0))
        return false;
      // Departed sessions can publish their final thread-state after a switch.
      // Persistence already rejects those events; the durable row owns this check too.
      const thread = dbGetThread(threadId);
      return !!thread && (agentKind === undefined || thread.agentKind === agentKind);
    };
  }

  beginIncarnation(): () => boolean {
    const generation = this.generation;
    return () => generation === this.generation;
  }

  clear(): void {
    this.generation++;
    this.queues.clear();
    this.revisions.clear();
  }

  private touch(threadId: string, field: "queue" | "tasks"): void {
    const revision = this.revisions.get(threadId) ?? { queue: 0, tasks: 0 };
    revision[field]++;
    this.revisions.set(threadId, revision);
  }
}

/** Warm volatile controls when a listener joins an already running host.
 * This runs independently of listener startup and all history reads. Seeded
 * controls are published so an early reader learns them through live replay.
 * Canonical history never needs an agent or supervisor connection. */
export async function seedThreadLiveReadState(
  ctx: RemoteServerContext,
  publish: (event: RemoteBroadcastEvent) => void,
): Promise<void> {
  const inventoryToken = ctx.sessionConfigInventory.beginSeed();
  const incarnationCurrent = ctx.threadLiveReadState.beginIncarnation();
  const snapshots = await ctx.options.callSupervisor("getThreadSnapshots", {});
  if (ctx.stopping || !incarnationCurrent() || !Array.isArray(snapshots)) return;
  const seeded = ctx.sessionConfigInventory.applySeed(inventoryToken, snapshots);
  // Events (including seeds) must carry actual runtime state, never db defaults.
  for (const snapshot of snapshots) {
    const entry = ctx.sessionConfigInventory.entryFor(snapshot.threadId);
    const thread = seeded && dbGetThread(snapshot.threadId);
    if (entry && thread && entry.agentKind === thread.agentKind)
      publish({
        type: "thread-state",
        threadId: thread.id,
        status: thread.status,
        attention: thread.attention,
        canResumeWithConfig: thread.canResumeWithConfig,
        agentKind: thread.agentKind,
        sessionConfigOptions: entry.options,
      });
  }
  // A fixed worker count keeps late listener attachment from fan-out over all
  // active sessions. No task or queue read lies on the history request path.
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(4, snapshots.length) }, async () => {
      while (next < snapshots.length && !ctx.stopping && incarnationCurrent()) {
        const snapshot = snapshots[next++]!;
        const queueCurrent = ctx.threadLiveReadState.beginSeed(
          snapshot.threadId,
          "queue",
          snapshot.agentKind,
        );
        const tasksCurrent = ctx.threadLiveReadState.beginSeed(
          snapshot.threadId,
          "tasks",
          snapshot.agentKind,
        );
        const [queue, tasks] = await Promise.allSettled([
          ctx.threadLiveReadState.queueFor(snapshot.threadId) === undefined
            ? ctx.options.callSupervisor("getThreadFollowUpQueue", { threadId: snapshot.threadId })
            : Promise.resolve(undefined),
          ctx.options.callSupervisor("readThreadBackgroundTasks", { threadId: snapshot.threadId }),
        ]);
        if (ctx.stopping || !incarnationCurrent()) continue;
        if (queue.status === "fulfilled" && queueCurrent()) {
          const parsed = threadFollowUpQueueStateSchema.nullable().safeParse(queue.value);
          if (parsed.success)
            publish({
              type: "thread-follow-up-queue",
              threadId: snapshot.threadId,
              queue: parsed.data,
            });
        }
        if (
          tasksCurrent() &&
          tasks.status === "fulfilled" &&
          Array.isArray(tasks.value) &&
          tasks.value.length > 0 &&
          !ctx.backgroundTasksByThread.has(snapshot.threadId)
        )
          publish({
            type: "thread-runtime-event",
            threadId: snapshot.threadId,
            event: {
              type: "background_tasks.changed",
              threadId: snapshot.threadId,
              tasks: tasks.value,
            },
          });
      }
    }),
  );
}
