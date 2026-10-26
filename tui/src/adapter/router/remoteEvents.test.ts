import { expect, test } from "bun:test";
import * as S from "./test-support";
import { agentStatusSchema } from "@/shared/contracts";
import { remoteProjectSchema } from "@/shared/remote/protocol/resources";
import type { RemoteDesktopClient } from "@/shared/remote/client";

test("starts SSE with server.connected and closes streams on resync", async () => {
  const { events, value } = S.router();
  const response = await value.handle(new Request("http://poracode.invalid/api/event"));
  const reader = response.body!.getReader();
  const first = await reader.read();
  const data = new TextDecoder().decode(first.value).match(/^data: (.+)$/mu)?.[1];
  expect(JSON.parse(data!).type).toBe("server.connected");
  events.resync();
  expect((await reader.read()).done).toBe(true);
});

test("sends an OpenCode session interrupt to the mapped remote thread", async () => {
  let interruptedThreadID: string | undefined;
  const client = S.promptClient({
    interruptThread: async (threadID: string) => {
      interruptedThreadID = threadID;
    },
  });
  const { value } = S.router(client);
  S.working(value);
  const response = await value.handle(
    new Request("http://poracode.invalid/api/session/ses_thread-1/interrupt", {
      method: "POST",
    }),
  );
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ interrupted: true });
  expect(interruptedThreadID).toBe("thread-1");
});

test("maps usage.spent, context.updated, and persisted occupancy to usage events", async () => {
  const project = remoteProjectSchema.parse({
    id: "project-1",
    name: "project",
    location: { kind: "windows", path: "C:/repo" },
    createdAt: "2026-01-01T00:00:00.000Z",
  });
  const thread = {
    id: "thread-1",
    projectId: "project-1",
    agentKind: "codex",
    presentationMode: "gui",
    config: { model: "gpt-5" },
    title: "Thread",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
    archived: false,
  };
  const client = {
    boundedProjectListPage: async () => ({ projects: [project] }),
    boundedThreadListPage: async () => ({ page: { threads: [thread] } }),
    threadRuntimeItemsPage: async () => ({ items: [], nextCursor: null }),
    threadContextUsage: async () => ({ usedTokens: 42_000, maxTokens: 200_000 }),
  } as unknown as RemoteDesktopClient;
  const { value } = S.router(client);
  const stream = await value.handle(new Request("http://poracode.invalid/api/event"));
  const reader = stream.body!.getReader();
  const decoder = new TextDecoder();
  const queue: Array<{ type: string; data: Record<string, unknown> }> = [];
  const readEvent = async (timeoutMs = 4_000) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const queued = queue.shift();
      if (queued) return queued;
      const chunk = await Promise.race([
        reader.read(),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 300)),
      ]);
      if (!chunk || chunk.done) break;
      for (const line of decoder.decode(chunk.value).matchAll(/^data: (.+)$/gmu)) {
        queue.push(JSON.parse(line[1]!));
      }
    }
    return queue.shift() ?? null;
  };
  expect((await readEvent())?.type).toBe("server.connected");

  // On-load: persisted context occupancy emits session.usage.updated.
  await value.handle(new Request("http://poracode.invalid/api/session/ses_thread-1/message"));
  const loaded = await readEvent();
  expect(loaded?.type).toBe("session.usage.updated");
  expect(loaded?.data).toMatchObject({
    sessionID: "ses_thread-1",
    cost: 0,
    tokens: { input: 42_000, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
  });

  // usage.spent maps canonical categories to the OpenCode token buckets.
  value.handleRemoteEvent({
    type: "thread-runtime-event",
    threadId: "thread-1",
    event: {
      type: "usage.spent",
      threadId: "thread-1",
      usage: {
        counterKind: "cumulative",
        counter: 1,
        scopeId: "thread-1",
        epoch: 0,
        sampleId: "sample-1",
        tokens: { input: 100, output: 50, cacheRead: 20, cacheWrite: 5 },
        cost: { amount: 1.5, currency: "USD" },
      },
    },
  });
  const spent = await readEvent();
  expect(spent?.type).toBe("session.usage.updated");
  expect(spent?.data).toMatchObject({
    sessionID: "ses_thread-1",
    cost: 1.5,
    tokens: { input: 100, output: 50, reasoning: 0, cache: { read: 20, write: 5 } },
  });

  // context.updated carries window occupancy and keeps the last spend.
  value.handleRemoteEvent({
    type: "thread-runtime-event",
    threadId: "thread-1",
    event: {
      type: "context.updated",
      threadId: "thread-1",
      usage: { usedTokens: 9_000, maxTokens: 200_000 },
    },
  });
  const context = await readEvent();
  expect(context?.type).toBe("session.usage.updated");
  expect(context?.data).toMatchObject({
    sessionID: "ses_thread-1",
    cost: 1.5,
    tokens: { input: 9_000 },
  });
});

test("agent-status changes emit list-refresh events, never resync", async () => {
  const { events, value } = S.router(S.promptClient());
  const emitted: string[] = [];
  const emit = events.emit.bind(events);
  const resync = events.resync.bind(events);
  events.emit = ((event: unknown) => {
    emitted.push(String((event as { type?: string })?.type));
    return emit(event as never);
  }) as never;
  events.resync = (() => {
    emitted.push("resync");
    return resync();
  }) as never;
  value.handleRemoteEvent({
    type: "windows-agent-statuses",
    statuses: [
      agentStatusSchema.parse({
        kind: "codex",
        label: "Codex",
        installed: true,
        authState: "authenticated",
        capabilities: {
          presentationMode: "gui",
          presentationModes: ["gui"],
          models: [],
          modes: ["agent"],
        },
      }),
    ],
  });
  expect(emitted).toEqual(
    expect.arrayContaining([
      "agent.updated",
      "provider.updated",
      "model.updated",
      "integration.updated",
    ]),
  );
  expect(emitted).not.toContain("resync");
});

test("a duplicate turn.started emits one session.execution.started", async () => {
  const { events, value } = S.router(S.promptClient());
  const emitted: unknown[] = [];
  const emit = events.emit.bind(events);
  events.emit = ((event: unknown) => {
    emitted.push(event);
    return emit(event as never);
  }) as never;
  S.working(value);
  value.handleRemoteEvent({
    type: "thread-runtime-event",
    threadId: "thread-1",
    event: { type: "turn.started", threadId: "thread-1", turnId: "turn-1" },
  });
  value.handleRemoteEvent({
    type: "thread-runtime-event",
    threadId: "thread-1",
    event: { type: "turn.started", threadId: "thread-1", turnId: "turn-2" },
  });
  expect(
    emitted.filter((e) => (e as { type?: string }).type === "session.execution.started"),
  ).toHaveLength(1);
});
