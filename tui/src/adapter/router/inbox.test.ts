import { expect, test } from "bun:test";
import * as S from "./test-support";

test("inbox delete clears the pending steer; an unknown id is a 204 no-op", async () => {
  const cleared: string[] = [];
  const client = S.promptClient({
    clearPendingSteer: async (id: string) => {
      cleared.push(id);
    },
  });
  const { value } = S.router(client);
  value.handleRemoteEvent({
    type: "thread-pending-steer",
    threadId: "thread-1",
    pending: { id: "s1", prompt: "steered", stagedAt: 3 },
  });
  // An id that is neither the steer nor a queued item: 204, no clearPendingSteer.
  const noop = await value.handle(
    new Request("http://poracode.invalid/api/session/ses_thread-1/inbox/inbox-1", {
      method: "DELETE",
    }),
  );
  expect(noop.status).toBe(204);
  expect(cleared).toEqual([]);
  // The steer id itself still clears the pending steer.
  const steer = await value.handle(
    new Request("http://poracode.invalid/api/session/ses_thread-1/inbox/s1", {
      method: "DELETE",
    }),
  );
  expect(steer.status).toBe(204);
  expect(cleared).toEqual(["thread-1"]);
});

test("inbox mirrors host events: list, delivered on drop, cancelled on delete, delivery changed on patch", async () => {
  const calls: { name: string; payload: unknown }[] = [];
  const client = S.promptClient({
    clearPendingSteer: async (rawId: string) => calls.push({ name: "clear", payload: rawId }),
    callRemoteProcedure: async (name: string, payload: unknown) => {
      calls.push({ name, payload });
      return name === "getThreadFollowUpQueue"
        ? { items: [{ id: "q1", prompt: "queued", stagedAt: 2 }], paused: false }
        : null;
    },
  });
  const { value } = S.router(client);
  const sessionID = "ses_thread-1";
  const list = async () =>
    (
      (await (
        await value.handle(new Request(`http://poracode.invalid/api/session/${sessionID}/inbox`))
      ).json()) as { data: { id: string; delivery: string }[] }
    ).data;

  expect(await list()).toMatchObject([{ id: "q1", delivery: "queue" }]);

  value.handleRemoteEvent({
    type: "thread-pending-steer",
    threadId: "thread-1",
    pending: { id: "s1", prompt: "steered", stagedAt: 3 },
  });
  expect(await list()).toMatchObject([
    { id: "s1", delivery: "steer" },
    { id: "q1", delivery: "queue" },
  ]);

  value.handleRemoteEvent({ type: "thread-pending-steer", threadId: "thread-1", pending: null });
  expect(await list()).toMatchObject([{ id: "q1" }]);

  const patchSteer = await value.handle(
    new Request(`http://poracode.invalid/api/session/${sessionID}/inbox/q1`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ delivery: "steer" }),
    }),
  );
  expect(patchSteer.status).toBe(204);
  expect(calls).toContainEqual({
    name: "steerQueuedThreadFollowUp",
    payload: { threadId: "thread-1", id: "q1" },
  });

  value.handleRemoteEvent({
    type: "thread-pending-steer",
    threadId: "thread-1",
    pending: { id: "s2", prompt: "move me", stagedAt: 4 },
  });
  const patchQueue = await value.handle(
    new Request(`http://poracode.invalid/api/session/${sessionID}/inbox/s2`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ delivery: "queue" }),
    }),
  );
  expect(patchQueue.status).toBe(204);
  expect(calls).toContainEqual({ name: "clear", payload: "thread-1" });
  expect(calls).toContainEqual({
    name: "queueThreadFollowUp",
    payload: { threadId: "thread-1", prompt: "move me", config: { model: "m1" } },
  });

  const del = await value.handle(
    new Request(`http://poracode.invalid/api/session/${sessionID}/inbox/q1`, {
      method: "DELETE",
    }),
  );
  expect(del.status).toBe(204);
  expect(calls).toContainEqual({
    name: "removeQueuedThreadFollowUp",
    payload: { threadId: "thread-1", id: "q1" },
  });
});

test("resumeQueue calls resumeThreadFollowUps only when paused", async () => {
  const calls: { name: string; payload: unknown }[] = [];
  const client = S.promptClient({
    callRemoteProcedure: async (name: string, payload: unknown) => {
      calls.push({ name, payload });
      return name === "getThreadFollowUpQueue" ? { items: [], paused: true } : null;
    },
  });
  const { value } = S.router(client);
  expect(await value.resumeQueue("ses_thread-1")).toEqual({ resumed: true });
  expect(calls).toContainEqual({
    name: "resumeThreadFollowUps",
    payload: { threadId: "thread-1" },
  });
  expect(await value.resumeQueue("ses_thread-1")).toEqual({ resumed: false });
});
