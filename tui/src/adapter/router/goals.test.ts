import { expect, test } from "bun:test";
import * as S from "./test-support";

test("goal state seeds, updates live, and clears", async () => {
  const client = S.promptClient({
    latestThreadGoalItem: async () => ({
      id: "g1",
      type: "goal",
      payload: {
        action: "set",
        objective: "Ship chunk 6",
        status: "active",
        availableActions: ["edit", "pause", "clear"],
        tokensUsed: 12,
        tokenBudget: 100,
      },
    }),
    callRemoteProcedure: async () => null,
  });
  const { value } = S.router(client);
  // Message route seeds the goal.
  await value.handle(new Request("http://poracode.invalid/api/session/ses_thread-1/message"));
  expect(await value.goalState("ses_thread-1")).toMatchObject({
    objective: "Ship chunk 6",
    status: "active",
  });
  expect(value.goalLine("ses_thread-1")).toContain("Ship chunk 6");

  // Live updated event.
  value.handleRemoteEvent({
    type: "thread-runtime-event",
    threadId: "thread-1",
    event: {
      type: "item.updated",
      itemType: "goal",
      itemId: "g1",
      payload: {
        action: "updated",
        objective: "Ship chunk 6",
        status: "paused",
        availableActions: ["resume", "clear"],
        tokensUsed: 30,
      },
    },
  });
  expect(await value.goalState("ses_thread-1")).toMatchObject({ status: "paused", tokensUsed: 30 });

  // Cleared removes it.
  value.handleRemoteEvent({
    type: "thread-runtime-event",
    threadId: "thread-1",
    event: {
      type: "item.completed",
      itemType: "goal",
      itemId: "g1",
      payload: { action: "cleared", objective: "Ship chunk 6" },
    },
  });
  expect(await value.goalState("ses_thread-1")).toBeUndefined();
});

test("controlGoal validates availability and edit bounds", async () => {
  const calls: unknown[] = [];
  const client = S.promptClient({
    latestThreadGoalItem: async () => ({
      id: "g1",
      type: "goal",
      payload: {
        action: "set",
        objective: "x",
        status: "active",
        availableActions: ["edit", "clear"],
      },
    }),
    controlThreadGoal: async (payload: unknown) => calls.push(payload),
    callRemoteProcedure: async () => null,
  });
  const { value } = S.router(client);
  await value.handle(new Request("http://poracode.invalid/api/session/ses_thread-1/message"));

  expect(await value.controlGoal("ses_thread-1", { action: "pause" })).toMatchObject({
    error: "The current goal can't be pause right now.",
  });
  expect(calls).toHaveLength(0);

  expect(await value.controlGoal("ses_thread-1", { action: "edit", objective: "" })).toMatchObject({
    error: "Goal objective must be 1-4000 characters.",
  });
  expect(
    await value.controlGoal("ses_thread-1", { action: "edit", objective: "x".repeat(4001) }),
  ).toMatchObject({
    error: "Goal objective must be 1-4000 characters.",
  });
  expect(calls).toHaveLength(0);

  expect(await value.controlGoal("ses_thread-1", { action: "edit", objective: "new" })).toEqual({
    ok: true,
  });
  expect(calls).toContainEqual({ threadId: "thread-1", action: "edit", objective: "new" });
  expect(await value.controlGoal("ses_thread-1", { action: "clear" })).toEqual({ ok: true });
  expect(calls).toContainEqual({ threadId: "thread-1", action: "clear" });
});

test("goalSupported gates on the provider slash command; truncated index falls back", async () => {
  const { client } = S.titleClient({ threadsAlways: true, commands: [{ id: "goal" }] });
  const { value } = S.router(client);
  expect(await value.goalSupported("ses_thread-new")).toBe(true);
  const { client: client2 } = S.titleClient({ threadsAlways: true, commands: [] });
  const { value: value2 } = S.router(client2);
  expect(await value2.goalSupported("ses_thread-new")).toBe(false);
});
