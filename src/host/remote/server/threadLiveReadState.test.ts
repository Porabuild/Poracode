import { expect, it, vi } from "vitest";
import { ThreadLiveReadState, seedThreadLiveReadState } from "./threadLiveReadState";
import { SessionConfigInventory } from "./sessionConfigInventory";
import type { RemoteBroadcastEvent, RemoteServerContext } from "./context";
import type { BackgroundTask } from "@/shared/contracts";
vi.mock("@/host/db", () => ({
  dbGetThread: () => ({
    id: "t1",
    agentKind: "agent",
    status: "idle",
    attention: "none",
    canResumeWithConfig: false,
  }),
}));

it.each(["stream", "queue", "tasks", "exit", "reset", "previous-owner"] as const)(
  "merges initial control levels independently when a %s event races the startup seed",
  async (race) => {
    let queueReady!: (value: unknown) => void;
    let tasksReady!: (value: unknown) => void;
    const queues = new ThreadLiveReadState();
    const tasks = new Map<string, readonly BackgroundTask[]>();
    const published: RemoteBroadcastEvent[] = [];
    const apply = (event: RemoteBroadcastEvent) => {
      queues.observe(event);
      if (event.type === "thread-runtime-event" && event.event.type === "background_tasks.changed")
        tasks.set(event.threadId, event.event.tasks);
      if (event.type === "thread-reset" || event.type === "thread-exited")
        tasks.set(event.threadId, []);
    };
    const ctx = {
      stopping: false,
      sessionConfigInventory: new SessionConfigInventory(),
      threadLiveReadState: queues,
      backgroundTasksByThread: tasks,
      options: {
        callSupervisor: async (method: string) => {
          if (method === "getThreadSnapshots") return [{ threadId: "t1", agentKind: "agent" }];
          if (method === "getThreadFollowUpQueue")
            return new Promise((resolve) => {
              queueReady = resolve;
            });
          return new Promise((resolve) => {
            tasksReady = resolve;
          });
        },
      },
    } as unknown as RemoteServerContext;
    const seed = seedThreadLiveReadState(ctx, (event) => {
      published.push(event);
      apply(event);
    });
    await Promise.resolve();
    const queue = { paused: true, items: [{ id: "q1", prompt: "Continue", stagedAt: 1 }] };
    const initialTasks = [{ taskId: "job", kind: "command" as const, description: "Job" }];
    if (race === "previous-owner")
      apply({
        type: "thread-state",
        threadId: "t1",
        agentKind: "previous",
        status: "inactive",
        attention: "none",
        canResumeWithConfig: false,
      });
    if (race === "stream")
      apply({
        type: "thread-runtime-event",
        threadId: "t1",
        event: { type: "item.updated", threadId: "t1", itemId: "i", payload: { text: "update" } },
      });
    if (race === "queue") apply({ type: "thread-follow-up-queue", threadId: "t1", queue: null });
    if (race === "tasks")
      apply({
        type: "thread-runtime-event",
        threadId: "t1",
        event: { type: "background_tasks.changed", threadId: "t1", tasks: [] },
      });
    if (race === "exit") apply({ type: "thread-exited", threadId: "t1", exitCode: 0 });
    if (race === "reset") queues.clear();
    queueReady(queue);
    tasksReady(initialTasks);
    await seed;
    expect(queues.queueFor("t1")).toEqual(
      race === "queue" || race === "exit" ? null : race === "reset" ? undefined : queue,
    );
    expect(tasks.get("t1")).toEqual(
      race === "tasks" || race === "exit" ? [] : race === "reset" ? undefined : initialTasks,
    );
    const expected =
      race === "exit" || race === "reset"
        ? []
        : race === "queue"
          ? ["thread-runtime-event"]
          : race === "tasks"
            ? ["thread-follow-up-queue"]
            : ["thread-follow-up-queue", "thread-runtime-event"];
    expect(published.map(({ type }) => type)).toEqual(expected);
  },
);
