import {
  isThreadTurnActive,
  threadFollowUpQueueStateSchema,
  type Thread,
  type ThreadFollowUpQueueState,
  type ThreadRuntimeSnapshot,
} from "@/shared/contracts";
import type { RemoteThreadSnapshot } from "@/shared/remote";
import type { RemoteBroadcastEvent, RemoteServerContext } from "./context";
import { dbGetThread } from "@/host/db";
import { deriveThreadTurnTiming } from "./threadStatePersistence";

type RuntimeLevel = Pick<
  Thread,
  | "agentKind"
  | "status"
  | "attention"
  | "activeTurnStartedAt"
  | "lastTurnStartedAt"
  | "lastTurnEndedAt"
>;

/** Host-owned queue levels. Unknown stays absent; a known retirement is null.
 * Event revisions and incarnation changes fence late startup seeds. */
export class ThreadLiveReadState {
  private readonly queues = new Map<string, ThreadFollowUpQueueState | null>();
  private readonly runtimeLevels = new Map<string, RuntimeLevel>();
  private readonly revisions = new Map<string, { queue: number; tasks: number; runtime: number }>();
  private generation = 0;

  queueFor(threadId: string): ThreadFollowUpQueueState | null | undefined {
    return this.queues.get(threadId);
  }

  runtimeThreadFor(thread: Thread): Thread | undefined {
    const level = this.runtimeLevels.get(thread.id);
    if (!level) return undefined;
    if (level.agentKind !== thread.agentKind) {
      this.touch(thread.id, "runtime");
      this.runtimeLevels.delete(thread.id);
      return undefined;
    }
    return { ...thread, ...level };
  }

  projectSnapshotRuntime(
    thread: Thread,
  ): Pick<RemoteThreadSnapshot, "thread" | "runtimeStateCurrent"> {
    const runtimeThread = this.runtimeThreadFor(thread);
    return runtimeThread ? { thread: runtimeThread, runtimeStateCurrent: true } : { thread };
  }

  retainThreads(ids: ReadonlySet<string>): void {
    for (const id of this.runtimeLevels.keys()) {
      if (!ids.has(id)) {
        this.touch(id, "runtime");
        this.runtimeLevels.delete(id);
      }
    }
  }

  beginRuntimeSeed(): (snapshots: readonly ThreadRuntimeSnapshot[]) => void {
    const current = this.beginIncarnation();
    const revisions = new Map([...this.revisions].map(([id, revision]) => [id, revision.runtime]));
    return (snapshots) => {
      if (!current()) return;
      for (const snapshot of snapshots) {
        if (
          snapshot.agentKind === undefined ||
          (revisions.get(snapshot.threadId) ?? 0) !==
            (this.revisions.get(snapshot.threadId)?.runtime ?? 0)
        )
          continue;
        this.observe({ type: "thread-state", ...snapshot });
      }
    };
  }

  observe(event: RemoteBroadcastEvent): void {
    if (event.type === "thread-state") {
      const thread = dbGetThread(event.threadId);
      if (!thread || event.agentKind === undefined || event.agentKind !== thread.agentKind) return;
      const previous = this.runtimeThreadFor(thread) ?? thread;
      this.touch(event.threadId, "runtime");
      this.runtimeLevels.set(event.threadId, {
        agentKind: thread.agentKind,
        status: event.status,
        attention: event.attention,
        ...deriveThreadTurnTiming(previous, event.status, new Date().toISOString()),
      });
    } else if (event.type === "thread-follow-up-queue") {
      this.touch(event.threadId, "queue");
      this.queues.set(event.threadId, event.queue);
    } else if (event.type === "thread-reset" || event.type === "thread-exited") {
      this.touch(event.threadId, "queue");
      this.touch(event.threadId, "tasks");
      this.touch(event.threadId, "runtime");
      // A settled owner-tagged level still certifies a completed receipt
      // replay after process exit. An active level cannot survive an exit.
      const level = this.runtimeLevels.get(event.threadId);
      if (event.type === "thread-reset" || (level && isThreadTurnActive(level.status)))
        this.runtimeLevels.delete(event.threadId);
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
      for (const runtimeEvent of events) {
        if (runtimeEvent.type === "background_tasks.changed")
          this.touch(runtimeEvent.threadId, "tasks");
        if (runtimeEvent.type === "item.started" && runtimeEvent.itemType === "user_message") {
          // Launches can publish the prompt before their working state. An
          // older idle level cannot certify the status of that new prompt.
          this.touch(runtimeEvent.threadId, "runtime");
          const level = this.runtimeLevels.get(runtimeEvent.threadId);
          if (level && !isThreadTurnActive(level.status))
            this.runtimeLevels.delete(runtimeEvent.threadId);
        }
      }
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
    this.runtimeLevels.clear();
    this.revisions.clear();
  }

  private touch(threadId: string, field: "queue" | "tasks" | "runtime"): void {
    const revision = this.revisions.get(threadId) ?? { queue: 0, tasks: 0, runtime: 0 };
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
  const seedRuntime = ctx.threadLiveReadState.beginRuntimeSeed();
  const incarnationCurrent = ctx.threadLiveReadState.beginIncarnation();
  const snapshots = await ctx.options.callSupervisor("getThreadSnapshots", {});
  if (ctx.stopping || !incarnationCurrent() || !Array.isArray(snapshots)) return;
  seedRuntime(snapshots);
  const seeded = ctx.sessionConfigInventory.applySeed(inventoryToken, snapshots);
  // Events (including seeds) must carry actual runtime state, never db defaults.
  for (const snapshot of snapshots) {
    const entry = ctx.sessionConfigInventory.entryFor(snapshot.threadId);
    const thread = seeded && dbGetThread(snapshot.threadId);
    if (entry && thread && entry.agentKind === thread.agentKind) {
      const runtimeThread = ctx.threadLiveReadState.runtimeThreadFor(thread) ?? thread;
      publish({
        type: "thread-state",
        threadId: thread.id,
        status: runtimeThread.status,
        attention: runtimeThread.attention,
        canResumeWithConfig: thread.canResumeWithConfig,
        agentKind: thread.agentKind,
        sessionConfigOptions: entry.options,
      });
    }
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
