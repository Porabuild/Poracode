import { expect, test } from "bun:test";
import * as S from "./test-support";

test("revert.stage anchors on the previous turn; commit runs the revert, clear drops it", async () => {
  const reverts: { threadId: string; checkpointItemId: string; operationKey: string }[] = [];
  const items = [
    { id: "u1", type: "user_message", state: "completed", streams: {}, payload: {} },
    {
      id: "t1",
      type: "tool_call",
      state: "completed",
      streams: {},
      payload: { name: "read", status: "completed" },
    },
    { id: "p1", type: "plan", state: "completed", streams: {}, payload: {} },
    { id: "e1", type: "error", state: "completed", streams: {}, payload: {} },
    {
      id: "n1",
      type: "assistant_message",
      state: "completed",
      streams: {},
      payload: {},
      parentItemId: "t1",
    },
    { id: "u2", type: "user_message", state: "completed", streams: {}, payload: {} },
  ];
  let outcome: Record<string, unknown> = { outcome: "completed" };
  const client = S.promptClient({
    threadRuntimeItemsPage: async () => ({ items, nextCursor: null }),
    checkpointRevert: async (input: never) => {
      reverts.push(input);
      return outcome;
    },
  });
  const { value } = S.router(client);
  const stage = (messageID: string, session = "ses_thread-1") =>
    value.handle(
      new Request(`http://poracode.invalid/api/session/${session}/revert/stage`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messageID }),
      }),
    );
  const post = (path: string) =>
    value.handle(
      new Request(`http://poracode.invalid${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      }),
    );

  // Staging marks the boundary but never touches the host — /redo can undo it.
  const staged = await stage("msg_u2");
  expect(staged.status).toBe(200);
  expect(await staged.json()).toEqual({ data: { messageID: "msg_u2" } });
  expect(reverts).toHaveLength(0);
  const stagedInfo = await value.handle(
    new Request("http://poracode.invalid/api/session/ses_thread-1"),
  );
  const stagedBody = (await stagedInfo.json()) as { data?: { revert?: { messageID: string } } };
  expect(stagedBody.data?.revert).toEqual({ messageID: "msg_u2" });

  // Clear (POST or the generated client's DELETE) drops the pending revert.
  expect((await post("/api/session/ses_thread-1/revert/clear")).status).toBe(204);
  expect(reverts).toHaveLength(0);
  const clearedInfo = await value.handle(
    new Request("http://poracode.invalid/api/session/ses_thread-1"),
  );
  expect(
    ((await clearedInfo.json()) as { data?: { revert?: unknown } }).data?.revert,
  ).toBeUndefined();

  // The first user message has no earlier turn to revert to.
  expect((await stage("msg_u1")).status).toBe(400);
  expect(reverts).toHaveLength(0);

  // Commit performs the checkpoint revert against the staged target.
  await stage("msg_u2");
  expect((await post("/api/session/ses_thread-1/revert/commit")).status).toBe(204);
  expect(reverts.at(-1)).toMatchObject({ threadId: "thread-1", checkpointItemId: "t1" });
  expect(reverts.at(-1)!.operationKey).toMatch(/^ckpt-revert\./u);

  // Commit failure keeps the stage's outcome mapping and the pending revert.
  await stage("msg_u2");
  outcome = { outcome: "ambiguous" };
  expect((await post("/api/session/ses_thread-1/revert/commit")).status).toBe(409);
  outcome = { outcome: "failed" };
  expect((await post("/api/session/ses_thread-1/revert/commit")).status).toBe(400);
  outcome = { outcome: "completed" };
  expect((await post("/api/session/ses_thread-1/revert/commit")).status).toBe(204);

  // Virtual subsessions are read-only.
  expect((await stage("msg_u2", "ses_thread-1__task-1")).status).toBe(400);

  // Commit with nothing staged is a no-op success.
  expect((await post("/api/session/ses_thread-1/revert/commit")).status).toBe(204);
});

test("a prompt commits a pending staged revert before sending", async () => {
  const reverts: { threadId: string; checkpointItemId: string }[] = [];
  const sent: unknown[] = [];
  const items = [
    { id: "u1", type: "user_message", state: "completed", streams: {}, payload: {} },
    {
      id: "t1",
      type: "tool_call",
      state: "completed",
      streams: {},
      payload: { name: "read", status: "completed" },
    },
    { id: "u2", type: "user_message", state: "completed", streams: {}, payload: {} },
  ];
  const client = S.promptClient({
    threadRuntimeItemsPage: async () => ({ items, nextCursor: null }),
    checkpointRevert: async (input: never) => {
      reverts.push(input);
      return { outcome: "completed" };
    },
    sendThreadInput: async (input: never) => {
      sent.push(input);
      return {};
    },
  });
  const { value } = S.router(client);
  const staged = await value.handle(
    new Request("http://poracode.invalid/api/session/ses_thread-1/revert/stage", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ messageID: "msg_u2" }),
    }),
  );
  expect(staged.status).toBe(200);
  expect(reverts).toHaveLength(0);
  const prompt = await value.handle(
    new Request("http://poracode.invalid/api/session/ses_thread-1/prompt", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "hello" }),
    }),
  );
  expect(prompt.status).toBe(200);
  expect(reverts.at(-1)).toMatchObject({ threadId: "thread-1", checkpointItemId: "t1" });
  expect(sent).toHaveLength(1);
});

test("runtime.truncated resyncs live sessions like a thread reset", async () => {
  const client = S.promptClient({ sendThreadInput: async () => ({}) });
  const { value } = S.router(client);
  const stream = await value.handle(new Request("http://poracode.invalid/api/event"));
  const reader = stream.body!.getReader();
  await reader.read(); // server.connected
  value.handleRemoteEvent({
    type: "thread-runtime-event",
    threadId: "thread-1",
    event: {
      type: "runtime.truncated",
      threadId: "thread-1",
      itemId: "a1",
      removedCompletedTurnAnchors: [],
    },
  });
  // The resync closes the SSE stream so the TUI refetches fresh history.
  const next = await reader.read();
  expect(next.done).toBe(true);
});

test("file checkpoints: created before dispatch, reconciled to anchors", async () => {
  const calls: { name: string; payload: unknown }[] = [];
  const client = S.promptClient({
    sendThreadInput: async () => ({}),
    threadRuntimeItemsPage: async () => ({
      items: [
        { id: "u1", type: "user_message", state: "completed", streams: {}, payload: {} },
        { id: "anchor-1", type: "assistant_message", state: "completed", streams: {}, payload: {} },
      ],
      nextCursor: null,
    }),
    threadCompletedTurns: async () => [{ turnId: "turn-1", anchorItemId: "anchor-1" }],
    callRemoteProcedure: async (name: string, payload: unknown) => {
      calls.push({ name, payload });
      return name === "listFileCheckpoints"
        ? { checkpoints: [{ checkpointItemId: "u1" }], turns: [] }
        : null;
    },
  });
  const { value } = S.router(client);
  // A normal send creates the checkpoint BEFORE the prompt dispatch.
  const order: string[] = [];
  const orderClient = S.promptClient({
    sendThreadInput: async () => {
      order.push("send");
      return {};
    },
    callRemoteProcedure: async (name: string) => {
      order.push(name);
      return null;
    },
  });
  const { value: ordered } = S.router(orderClient);
  await ordered.handle(
    new Request("http://poracode.invalid/api/session/ses_thread-1/prompt", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "hi" }),
    }),
  );
  expect(order).toEqual(["createFileCheckpoint", "send"]);

  // Steer/queue deliveries don't create checkpoints — they belong to the turn.
  order.length = 0;
  S.working(ordered);
  await ordered.handle(
    new Request("http://poracode.invalid/api/session/ses_thread-1/prompt", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "steer me", delivery: "steer" }),
    }),
  );
  expect(order).not.toContain("createFileCheckpoint");

  // turn.completed on this S.router reconciles the anchor to its base.
  await value.handle(
    new Request("http://poracode.invalid/api/session/ses_thread-1/prompt", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "base" }),
    }),
  );
  value.handleRemoteEvent({
    type: "thread-runtime-events",
    threadId: "thread-1",
    events: [
      { type: "turn.completed", threadId: "thread-1", turnId: "turn-1", state: "completed" },
    ],
  });
  await new Promise((resolve) => setTimeout(resolve, 50));
  const finalize = calls.filter((call) => call.name === "finalizeFileCheckpoint");
  expect(finalize).toHaveLength(1);
  expect(finalize[0]!.payload).toMatchObject({
    threadId: "thread-1",
    checkpointItemId: "anchor-1",
    baseCheckpointItemId: "u1",
  });
});

test("checkpoint reconcile skips item listing when no turn needs finalizing", async () => {
  let itemPages = 0;
  let listed = 0;
  const client = S.promptClient({
    threadRuntimeItemsPage: async () => {
      itemPages += 1;
      return { items: [], nextCursor: null };
    },
    threadCompletedTurns: async () => [{ turnId: "turn-1", anchorItemId: "anchor-1" }],
    callRemoteProcedure: async (name: string) => {
      if (name === "listFileCheckpoints") listed += 1;
      return { checkpoints: [], turns: [{ checkpointItemId: "anchor-1" }] };
    },
  });
  const { value } = S.router(client);
  value.handleRemoteEvent({
    type: "thread-runtime-events",
    threadId: "thread-1",
    events: [
      { type: "turn.completed", threadId: "thread-1", turnId: "turn-1", state: "completed" },
    ],
  });
  await new Promise((resolve) => setTimeout(resolve, 1500));
  // The anchor is already finalized on the host → no candidates, so the
  // expensive item listing never ran, and with nothing captured locally the
  // reconcile does not retry.
  expect(itemPages).toBe(0);
  expect(listed).toBe(1);
});

test("session load reconciles checkpoints for turns finished while closed", async () => {
  const calls: { name: string; payload: unknown }[] = [];
  const client = S.promptClient({
    threadRuntimeItemsPage: async () => ({
      items: [
        { id: "u1", type: "user_message", state: "completed", streams: {}, payload: {} },
        { id: "anchor-1", type: "assistant_message", state: "completed", streams: {}, payload: {} },
      ],
      nextCursor: null,
    }),
    threadCompletedTurns: async () => [{ turnId: "turn-1", anchorItemId: "anchor-1" }],
    callRemoteProcedure: async (name: string, payload: unknown) => {
      calls.push({ name, payload });
      return name === "listFileCheckpoints"
        ? { checkpoints: [{ checkpointItemId: "u1" }], turns: [] }
        : null;
    },
  });
  const { value } = S.router(client);
  await value.handle(new Request("http://poracode.invalid/api/session/ses_thread-1/message"));
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(calls).toContainEqual({
    name: "finalizeFileCheckpoint",
    payload: expect.objectContaining({
      threadId: "thread-1",
      checkpointItemId: "anchor-1",
      baseCheckpointItemId: "u1",
    }),
  });
});

test("no finalize without a base checkpoint or a matching anchor", async () => {
  const calls: { name: string; payload: unknown }[] = [];
  const client = S.promptClient({
    threadRuntimeItemsPage: async () => ({
      items: [
        { id: "u1", type: "user_message", state: "completed", streams: {}, payload: {} },
        { id: "anchor-1", type: "assistant_message", state: "completed", streams: {}, payload: {} },
      ],
      nextCursor: null,
    }),
    threadCompletedTurns: async () => [{ turnId: "turn-1", anchorItemId: "anchor-1" }],
    callRemoteProcedure: async (name: string, payload: unknown) => {
      calls.push({ name, payload });
      // No checkpoint captured for the base.
      return name === "listFileCheckpoints" ? { checkpoints: [], turns: [] } : null;
    },
  });
  const { value } = S.router(client);
  await value.handle(new Request("http://poracode.invalid/api/session/ses_thread-1/message"));
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(calls.some((call) => call.name === "finalizeFileCheckpoint")).toBe(false);
});

test("an anchor whose base was never captured stops paging on later turns", async () => {
  let itemPages = 0;
  const client = S.promptClient({
    threadRuntimeItemsPage: async () => {
      itemPages += 1;
      return {
        items: [
          { id: "u1", type: "user_message", state: "completed", streams: {}, payload: {} },
          {
            id: "anchor-1",
            type: "assistant_message",
            state: "completed",
            streams: {},
            payload: {},
          },
        ],
        nextCursor: null,
      };
    },
    threadCompletedTurns: async () => [{ turnId: "turn-1", anchorItemId: "anchor-1" }],
    callRemoteProcedure: async (name: string) =>
      // The base u1 has no captured checkpoint — anchor-1 can never finalize.
      name === "listFileCheckpoints" ? { checkpoints: [], turns: [] } : null,
  });
  const { value } = S.router(client);
  const fireTurn = () =>
    value.handleRemoteEvent({
      type: "thread-runtime-events",
      threadId: "thread-1",
      events: [
        { type: "turn.completed", threadId: "thread-1", turnId: "turn-1", state: "completed" },
      ],
    });
  fireTurn();
  await new Promise((resolve) => setTimeout(resolve, 1500));
  fireTurn();
  await new Promise((resolve) => setTimeout(resolve, 1500));
  // The anchor's base was found once and remembered as uncapturable — later
  // reconciles never page the thread again.
  expect(itemPages).toBe(1);
});

test("a checkpoint failure never blocks the prompt", async () => {
  const client = S.promptClient({
    sendThreadInput: async () => ({}),
    callRemoteProcedure: async (name: string) => {
      if (name === "createFileCheckpoint") throw new Error("checkpoint store down");
      return null;
    },
  });
  const { value } = S.router(client);
  const response = await value.handle(
    new Request("http://poracode.invalid/api/session/ses_thread-1/prompt", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "hi" }),
    }),
  );
  expect(response.status).toBe(200);
});
