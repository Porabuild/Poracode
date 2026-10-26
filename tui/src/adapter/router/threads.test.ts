import { expect, test } from "bun:test";
import * as S from "./test-support";
import { remoteProjectSchema } from "@/shared/remote/protocol/resources";
import type { RemoteDesktopClient } from "@/shared/remote/client";
import type { MessageListOutput, SessionInfo } from "@opencode/client";

test("subagent task parts link to a virtual read-only subsession", async () => {
  const project = remoteProjectSchema.parse({
    id: "project-1",
    name: "project",
    location: { kind: "windows", path: "C:/repo" },
    createdAt: "2026-01-01T00:00:00.000Z",
  });
  const parentThread = {
    id: "thread-1",
    projectId: "project-1",
    agentKind: "codex",
    presentationMode: "gui",
    config: { model: "gpt-5" },
    title: "Parent",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
    archived: false,
  };
  const items = [
    {
      id: "task-1",
      type: "tool_call",
      state: "completed",
      streams: {},
      payload: {
        name: "Task",
        title: "Search the codebase",
        status: "success",
        isSubAgent: true,
        subAgentType: "explore",
      },
    },
    {
      id: "nested-1",
      type: "assistant_message",
      state: "completed",
      streams: {},
      parentItemId: "task-1",
      payload: {
        displayAuthoritative: true,
        content: [{ kind: "text", text: "subagent found three callers" }],
      },
    },
  ];
  const client = {
    boundedProjectListPage: async () => ({ projects: [project] }),
    boundedThreadListPage: async () => ({ page: { threads: [parentThread] } }),
    threadRuntimeItemsPage: async () => ({ items, nextCursor: null }),
  } as unknown as RemoteDesktopClient;
  const { value } = S.router(client);

  const subSessionID = "ses_thread-1__task-1";

  // The parent transcript's task part carries the navigation id.
  const parentMessages = (await (
    await value.handle(new Request("http://poracode.invalid/api/session/ses_thread-1/message"))
  ).json()) as MessageListOutput;
  const taskPart = parentMessages.data
    .flatMap((message) => (message.type === "assistant" ? message.content : []))
    .find((part) => part.type === "tool" && part.name === "task");
  expect(
    taskPart && taskPart.type === "tool" && taskPart.state.status !== "streaming"
      ? taskPart.state.metadata?.sessionID
      : undefined,
  ).toBe(subSessionID);

  // The virtual session resolves with its parent linkage and title.
  const subSession = await value.handle(
    new Request(`http://poracode.invalid/api/session/${subSessionID}`),
  );
  expect(subSession.status).toBe(200);
  const subSessionData = (await subSession.json()) as { data: SessionInfo };
  expect(subSessionData.data.parentID).toBe("ses_thread-1");
  expect(subSessionData.data.title).toBe("Search the codebase");

  // Its transcript is the parent's items nested under the task item.
  const subMessages = (await (
    await value.handle(new Request(`http://poracode.invalid/api/session/${subSessionID}/message`))
  ).json()) as MessageListOutput;
  const nestedText = subMessages.data
    .flatMap((message) => (message.type === "assistant" ? message.content : []))
    .find((part) => part.type === "text");
  expect(nestedText && nestedText.type === "text" ? nestedText.text : "").toContain(
    "subagent found three callers",
  );

  // The subsession is read-only.
  const prompt = await value.handle(
    new Request(`http://poracode.invalid/api/session/${subSessionID}/prompt`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ parts: [{ type: "text", text: "hi" }] }),
    }),
  );
  expect(prompt.status).toBe(400);
  const interrupt = await value.handle(
    new Request(`http://poracode.invalid/api/session/${subSessionID}/interrupt`, {
      method: "POST",
    }),
  );
  expect(interrupt.status).toBe(400);
});

test("listThreadItems returns chronological order across history pages", async () => {
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
    status: "idle",
    config: { model: "m1" },
    title: "Thread",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
    archived: false,
  };
  const older = [
    { id: "u1", type: "user_message", state: "completed", streams: {}, payload: {} },
    { id: "a1", type: "assistant_message", state: "completed", streams: {}, payload: {} },
  ];
  const newer = [{ id: "u2", type: "user_message", state: "completed", streams: {}, payload: {} }];
  const threads = [thread];
  const commands: unknown[] = [];
  const client = {
    boundedProjectListPage: async () => ({ projects: [project] }),
    boundedThreadListPage: async () => ({ page: { threads } }),
    // Newest page first; beforePosition walks backward in time.
    threadRuntimeItemsPage: async (input: { beforePosition?: number }) => ({
      items: input.beforePosition === undefined ? newer : older,
      nextCursor: input.beforePosition === undefined ? 10 : null,
    }),
    threadCompletedTurns: async () => [
      {
        startedAt: "2026-01-01T00:00:00.000Z",
        endedAt: "2026-01-01T00:01:00.000Z",
        anchorItemId: "a1",
      },
    ],
    environment: async () => ({ capabilities: { catalogMutations: { versions: [1] } } }),
    sendThreadCommand: async (command: unknown) => {
      commands.push(command);
      const parsed = command as { kind: string; threadId: string };
      if (parsed.kind === "fork") threads.push({ ...thread, id: parsed.threadId });
    },
  } as unknown as RemoteDesktopClient;
  const { value } = S.router(client);

  const response = await value.handle(
    new Request("http://poracode.invalid/api/session/ses_thread-1/fork", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ before: "msg_u2" }),
    }),
  );
  expect(response.status).toBe(200);
  // u2 sits after the turn-1 anchor only when pages are chronological.
  expect(commands[0]).toMatchObject({ throughItemId: "a1" });
});

test("live subagent child items route to the virtual subsession, nested to the root, replays dedup", async () => {
  const client = S.promptClient({
    sendThreadInput: async () => ({}),
    callRemoteProcedure: async () => null,
  });
  const { value } = S.router(client);
  // Register the thread context so runtime events translate.
  await value.handle(
    new Request("http://poracode.invalid/api/session/ses_thread-1/prompt", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "go" }),
    }),
  );
  const stream = await value.handle(new Request("http://poracode.invalid/api/event"));
  const reader = stream.body!.getReader();
  const decoder = new TextDecoder();
  const queue: { type: string; data: Record<string, unknown> }[] = [];
  const readEvent = async () => {
    const deadline = Date.now() + 2_000;
    while (Date.now() < deadline) {
      if (queue.length > 0) return queue.shift();
      const chunk = await Promise.race([
        reader.read(),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 250)),
      ]);
      if (!chunk || chunk.done) break;
      for (const line of decoder.decode(chunk.value ?? []).matchAll(/^data: (.+)$/gmu))
        queue.push(JSON.parse(line[1]!));
    }
    return queue.shift() ?? null;
  };
  const emit = (event: Record<string, unknown>) =>
    value.handleRemoteEvent({
      type: "thread-runtime-event",
      threadId: "thread-1",
      event: { threadId: "thread-1", ...event },
    });

  await readEvent(); // server.connected

  emit({
    type: "item.started",
    itemId: "task-1",
    itemType: "task",
    payload: {},
  });
  emit({
    type: "item.started",
    itemId: "child-1",
    parentItemId: "task-1",
    itemType: "assistant_message",
    payload: {},
  });
  emit({
    type: "content.delta",
    itemId: "child-1",
    itemType: "assistant_message",
    stream: "assistant_text",
    delta: "child text",
  });
  emit({
    type: "item.started",
    itemId: "grandchild-1",
    parentItemId: "child-1",
    itemType: "reasoning",
    payload: {},
  });
  emit({ type: "item.completed", itemId: "child-1", itemType: "assistant_message", payload: {} });
  // Replay of a known item.started must not duplicate parts.
  emit({
    type: "item.started",
    itemId: "child-1",
    parentItemId: "task-1",
    itemType: "assistant_message",
    payload: {},
  });

  const seen: { type: string; sessionID?: string }[] = [];
  for (let i = 0; i < 12; i += 1) {
    const next = await readEvent();
    if (!next) break;
    seen.push({ type: next.type, sessionID: String(next.data.sessionID ?? "") });
  }
  const sub = "ses_thread-1__task-1";
  // Child text routes to the subsession; the nested reasoning item joins it.
  expect(seen).toContainEqual({ type: "session.text.started", sessionID: sub });
  expect(seen).toContainEqual({ type: "session.reasoning.started", sessionID: sub });
  // Exactly one text part despite the replayed item.started.
  expect(
    seen.filter((entry) => entry.type === "session.text.started" && entry.sessionID === sub),
  ).toHaveLength(1);
  // Child item parts never leak into the parent session — only the task item's
  // own part belongs there.
  expect(
    seen.filter(
      (entry) =>
        entry.sessionID === "ses_thread-1" &&
        ["session.text.started", "session.reasoning.started", "session.text.delta"].includes(
          entry.type,
        ),
    ),
  ).toEqual([]);
});

test("subagent subscription: load running subagent subscribes, completed does not, completion unsubscribes", async () => {
  const calls: { name: string; payload: unknown }[] = [];
  const runningItem = {
    id: "task-1",
    type: "task",
    state: "started",
    streams: {},
    payload: {},
  };
  const client = S.promptClient({
    threadRuntimeItemsPage: async () => ({ items: [runningItem], nextCursor: null }),
    callRemoteProcedure: async (name: string, payload: unknown) => {
      calls.push({ name, payload });
      return null;
    },
  });
  const { value } = S.router(client);
  await value.handle(
    new Request("http://poracode.invalid/api/session/ses_thread-1__task-1/message"),
  );
  expect(calls).toContainEqual({
    name: "subagentSubscribe",
    payload: { threadId: "thread-1", parentItemId: "task-1" },
  });

  // A second load does not resubscribe.
  await value.handle(
    new Request("http://poracode.invalid/api/session/ses_thread-1__task-1/message"),
  );
  expect(calls.filter((call) => call.name === "subagentSubscribe")).toHaveLength(1);

  // Completion unsubscribes.
  value.handleRemoteEvent({
    type: "thread-runtime-event",
    threadId: "thread-1",
    event: { type: "item.completed", itemId: "task-1" },
  });
  expect(calls).toContainEqual({
    name: "subagentUnsubscribe",
    payload: { threadId: "thread-1", parentItemId: "task-1" },
  });
});

test("a completed subagent does not subscribe on load", async () => {
  const calls: { name: string }[] = [];
  const client = S.promptClient({
    threadRuntimeItemsPage: async () => ({
      items: [{ id: "task-1", type: "task", state: "completed", streams: {}, payload: {} }],
      nextCursor: null,
    }),
    callRemoteProcedure: async (name: string) => {
      calls.push({ name });
      return null;
    },
  });
  const { value } = S.router(client);
  await value.handle(
    new Request("http://poracode.invalid/api/session/ses_thread-1__task-1/message"),
  );
  expect(calls.some((call) => call.name === "subagentSubscribe")).toBe(false);
});

test("session list cursor round-trips across two host pages", async () => {
  const pages = [
    {
      threads: [
        {
          id: "t-new",
          title: "new",
          agentKind: "codex",
          projectId: "project-1",
          presentationMode: "gui",
          config: {},
          archived: false,
          createdAt: "2024-01-02T00:00:00Z",
          updatedAt: "2024-01-02T00:00:00Z",
        },
      ],
      nextCursor: "host-c1",
    },
    {
      threads: [
        {
          id: "t-old",
          title: "old",
          agentKind: "codex",
          projectId: "project-1",
          presentationMode: "gui",
          config: {},
          archived: false,
          createdAt: "2024-01-01T00:00:00Z",
          updatedAt: "2024-01-01T00:00:00Z",
        },
      ],
      nextCursor: null,
    },
  ];
  let calls = 0;
  const cursors: (string | undefined)[] = [];
  const client = S.promptClient({
    boundedThreadListPage: async (options: { cursor?: string }) => {
      calls += 1;
      cursors.push(options.cursor);
      return { page: pages[calls - 1]!, reads: { page: calls - 1 } };
    },
    agentStatuses: async () => ({ windows: [], wsl: [] }),
  });
  const { value } = S.router(client);
  const first = await value.handle(new Request("http://poracode.invalid/api/session"));
  expect(first.status).toBe(200);
  const firstBody = await first.json();
  expect(firstBody.data).toHaveLength(1);
  const next = firstBody.cursor.next as string;
  expect(next.startsWith("tp1.")).toBe(true);
  const second = await value.handle(
    new Request("http://poracode.invalid/api/session?cursor=" + encodeURIComponent(next)),
  );
  const secondBody = await second.json();
  expect(secondBody.data).toHaveLength(1);
  expect(cursors[0]).toBeUndefined();
  expect(cursors[1]).toBe("host-c1");
});

test("a cachedThreadById miss pages onward until the thread is found", async () => {
  const pages = [
    {
      threads: [
        {
          id: "t-new",
          agentKind: "codex",
          projectId: "project-1",
          presentationMode: "gui",
          config: {},
          archived: false,
          createdAt: "",
          updatedAt: "",
        },
      ],
      nextCursor: "c1",
    },
    {
      threads: [
        {
          id: "t-old",
          agentKind: "codex",
          projectId: "project-1",
          presentationMode: "gui",
          config: {},
          archived: false,
          createdAt: "",
          updatedAt: "",
        },
      ],
      nextCursor: null,
    },
  ];
  let calls = 0;
  const client = S.promptClient({
    boundedThreadListPage: async () => ({ page: pages[calls++]!, reads: {} }),
    agentStatuses: async () => ({ windows: [], wsl: [] }),
  });
  const { value } = S.router(client);
  // t-old lives on page 2 — a route that resolves the thread reaches it.
  const response = await value.handle(
    new Request("http://poracode.invalid/api/experimental/session/ses_t-old/wait", {
      method: "POST",
    }),
  );
  expect(response.status).toBe(204);
  expect(calls).toBeGreaterThanOrEqual(2);
});
