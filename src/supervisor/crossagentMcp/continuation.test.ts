import { expect, it, vi } from "vitest";
import type { SessionRef } from "@/shared/contracts";
import { dispatchTool } from "./toolRegistry";
import { FakeHandle, flush, makeHarness, PARENT } from "./testHarness";

function answer(handle: FakeHandle, text: string) {
  handle.emit({
    type: "content.delta",
    threadId: "child",
    itemId: "answer",
    stream: "assistant_text",
    delta: text,
  });
  handle.completeTurn("completed");
}

async function completed() {
  const open = vi.fn<(handle: FakeHandle, ref: SessionRef | undefined) => Promise<string>>(
    async (_handle, ref) => ref?.providerSessionId ?? "original-session",
  );
  const h = makeHarness({ resume: { sessionId: "original-session", open } });
  const { runId } = h.manager.spawn(PARENT, { agent: "codex", prompt: "First task" });
  await flush();
  answer(h.handles[0]!, "Full original result");
  return { ...h, runId, open };
}

it("resumes the same provider session for successive turns while preserving each completed receipt", async () => {
  const h = await completed();
  const original = await h.manager.waitForSettlement(PARENT, h.runId);
  expect(h.handles[0]!.disposed).toBe(true);
  expect(h.manager.listRuns(PARENT)[0]?.can_steer).toBe(true);
  const next = await h.manager.steer(h.runId, "Fix the reported defect", PARENT);
  await flush();
  expect(next).toEqual({ runId: expect.any(String), continuedFrom: h.runId });
  expect(next.runId).not.toBe(h.runId);
  expect(h.inputs[1]!.sessionRef?.providerSessionId).toBe("original-session");
  expect(h.open.mock.calls[1]![1]?.providerSessionId).toBe("original-session");
  expect(h.handles[1]!.startTurns[0]!.prompt).toContain("Fix the reported defect");
  expect(h.handles[1]!.startTurns[0]!.prompt).not.toContain("First task");
  expect(h.manager.getStatus(h.runId)).toEqual(original);
  expect(h.manager.listRuns(PARENT)[0]).toMatchObject({
    can_steer: false,
    continued_by: next.runId,
  });
  await expect(h.manager.steer(h.runId, "Duplicate", PARENT)).rejects.toThrow(next.runId);
  answer(h.handles[1]!, "Corrected result");
  const third = await h.manager.steer(next.runId, "Verify once more", PARENT, true);
  await flush();
  expect(h.inputs[2]!.sessionRef?.providerSessionId).toBe("original-session");
  expect(h.manager.listRuns(PARENT).find((run) => run.run_id === third.runId)?.background).toBe(
    true,
  );
  expect(h.manager.getStatus(next.runId).output).toBe("Corrected result");
  answer(h.handles[2]!, "Verified");
  await h.manager.waitForSettlement(PARENT, third.runId);
});

it("waits for the new turn through steer_agent and resets the old transcript cursor", async () => {
  const h = await completed();
  const pending = dispatchTool(
    "steer_agent",
    {
      run_id: h.runId,
      prompt: "Fix it",
      after_output_chars: 9999,
    },
    { parentThreadId: PARENT, runManager: h.manager, listSpawnableAgents: async () => [] },
  );
  const settled = vi.fn<() => void>();
  void pending.then(settled);
  await flush();
  expect(settled).not.toHaveBeenCalled();
  answer(h.handles[1]!, "New evidence");
  const response = await pending;
  expect(response.isError).not.toBe(true);
  expect(JSON.parse(response.content[0]!.text)).toMatchObject({
    run_id: h.manager.listRuns(PARENT)[1]!.run_id,
    continued_from: h.runId,
    status: "completed",
    output: "New evidence",
  });
  await flush();
});

it("joins disposal and rejects concurrent follow-ups before reopening the session", async () => {
  const h = makeHarness({ resume: { sessionId: "same-session" } });
  const { runId } = h.manager.spawn(PARENT, { agent: "codex", prompt: "Task" });
  await flush();
  const disposal = Promise.withResolvers<void>();
  h.handles[0]!.dispose = () => disposal.promise;
  answer(h.handles[0]!, "Done");
  const pending = h.manager.steer(runId, "Follow up", PARENT);
  await expect(h.manager.steer(runId, "Concurrent", PARENT)).rejects.toThrow("already starting");
  await flush();
  expect(h.handles).toHaveLength(1);
  disposal.resolve();
  const next = await pending;
  await flush();
  expect(h.handles).toHaveLength(2);
  answer(h.handles[1]!, "Follow-up done");
  await h.manager.waitForSettlement(PARENT, next.runId);
});

it.each(["parent", "worker"] as const)(
  "does not start a follow-up after its %s closes during cleanup",
  async (target) => {
    const h = makeHarness({ resume: { sessionId: "same-session" } });
    const { runId } = h.manager.spawn(PARENT, { agent: "codex", prompt: "Task" });
    await flush();
    const disposal = Promise.withResolvers<void>();
    h.handles[0]!.dispose = () => disposal.promise;
    answer(h.handles[0]!, "Done");
    const pending = h.manager.steer(runId, "Follow up", PARENT);
    const rejected = pending.catch((error: unknown) => error);
    const cancel =
      target === "parent" ? h.manager.cancelAllForThread(PARENT) : h.manager.cancel(runId, PARENT);
    disposal.resolve();
    await cancel;
    expect(await rejected).toMatchObject({
      message: expect.stringContaining("closed before the follow-up"),
    });
    expect(h.handles).toHaveLength(1);
  },
);

it("keeps capacity enforced for completed follow-ups", async () => {
  const h = await completed();
  await h.manager.waitForSettlement(PARENT, h.runId);
  h.manager.spawnMany(
    PARENT,
    Array.from({ length: 16 }, () => ({ agent: "codex", prompt: "Task" })),
  );
  await expect(h.manager.steer(h.runId, "Follow up", PARENT)).rejects.toThrow(
    "Too many concurrent",
  );
  expect(h.manager.getCapacity(PARENT).running).toBe(16);
  h.manager.cancelAllForThread(PARENT);
  await flush();
});

it("does not send a follow-up when the provider opens a different conversation", async () => {
  const h = await completed();
  h.open.mockResolvedValueOnce("wrong-session");
  const next = await h.manager.steer(h.runId, "Must retain context", PARENT);
  const result = await h.manager.waitForSettlement(PARENT, next.runId);
  expect(result.status).toBe("failed");
  expect(result.output).toContain("different session; follow-up was not sent");
  expect(h.handles[1]!.startTurns).toHaveLength(0);
  expect(h.handles[1]!.disposed).toBe(true);
  expect(h.handles).toHaveLength(2);
});

it("excludes replayed history and old completion events from the new result", async () => {
  const h = await completed();
  h.open.mockImplementationOnce(async (handle, ref) => {
    answer(handle, "Replayed history must stay out");
    handle.update("idle");
    return ref!.providerSessionId;
  });
  const next = await h.manager.steer(h.runId, "New turn", PARENT);
  await flush();
  expect(h.manager.getStatus(next.runId)).toMatchObject({ status: "running", output: "" });
  answer(h.handles[1]!, "Only new evidence");
  const result = await h.manager.waitForSettlement(PARENT, next.runId);
  expect(result.output).toBe("Only new evidence");
  expect(JSON.stringify(h.appended)).not.toContain("Replayed history");
});

it("resumes the winning fallback's identity and selection without a fresh fallback chain", async () => {
  let sessions = 0;
  const h = makeHarness({
    models: [
      { id: "first", label: "First" },
      { id: "second", label: "Second" },
    ],
    resume: {
      sessionId: "unused",
      open: async (_handle, ref) => ref?.providerSessionId ?? `session-${++sessions}`,
    },
  });
  const { runId } = h.manager.spawn(PARENT, {
    agent: "codex",
    model: "first",
    prompt: "Task",
    retryMode: "any-failure",
    fallbacks: [{ agent: "codex", model: "second", effort: "high" }],
  });
  await flush();
  h.handles[0]!.completeTurn("failed");
  await flush();
  answer(h.handles[1]!, "Second attempt worked");
  const next = await h.manager.steer(runId, "Correct result", PARENT);
  await flush();
  expect(h.inputs[2]!.sessionRef?.providerSessionId).toBe("session-2");
  expect(h.inputs[2]!.config).toMatchObject({ model: "second", effort: "high" });
  expect(h.manager.listRuns(PARENT)[1]!.attempt_count).toBe(1);
  answer(h.handles[2]!, "Corrected");
  await h.manager.waitForSettlement(PARENT, next.runId);
});

it("rejects unavailable completed context and cross-parent access without opening a session", async () => {
  const h = makeHarness();
  const { runId } = h.manager.spawn(PARENT, { agent: "codex", prompt: "Task" });
  await flush();
  answer(h.handles[0]!, "Done without a resumable identity");
  await expect(h.manager.steer(runId, "Follow up", PARENT)).rejects.toThrow(
    "no completed, resumable",
  );
  await expect(h.manager.steer(runId, "Follow up", "other-parent")).rejects.toThrow(
    "Unknown run_id",
  );
  expect(h.handles).toHaveLength(1);
  await h.manager.waitForSettlement(PARENT, runId);
});

it("keeps completed compact reports stable and parses only the follow-up's report", async () => {
  const h = makeHarness({ resume: { sessionId: "compact-session" } });
  const { runId } = h.manager.spawn(PARENT, {
    agent: "codex",
    prompt: "Task",
    resultMode: "compact",
  });
  const envelope = (summary: string) =>
    "```crossagents-result\n" +
    JSON.stringify({
      version: 1,
      outcome: "completed",
      summary,
      changes: [],
      checks: [],
      findings: [],
      risks: [],
      evidence: [],
    }) +
    "\n```";
  await flush();
  answer(h.handles[0]!, envelope("Original report"));
  const originalJoin = h.manager.waitForSettlement(PARENT, runId);
  const next = await h.manager.steer(runId, "Correction with acceptance checks", PARENT);
  await flush();
  expect(h.handles[1]!.startTurns[0]!.prompt).toContain("crossagents-result");
  answer(h.handles[1]!, envelope("Correction report"));
  expect(await originalJoin).toMatchObject({ result: { summary: "Original report" } });
  expect(await h.manager.waitForSettlement(PARENT, next.runId)).toMatchObject({
    result: { summary: "Correction report" },
  });
  expect(h.manager.getStatus(runId)).toMatchObject({ result: { summary: "Original report" } });
});

it("allows an explicit retry after a pre-dispatch resume failure but never replays dispatched work", async () => {
  const h = await completed();
  h.open.mockRejectedValueOnce(new Error("Temporary resume failure"));
  const failed = await h.manager.steer(h.runId, "Correction", PARENT);
  const failure = await h.manager.waitForSettlement(PARENT, failed.runId);
  expect(failure).toMatchObject({ status: "failed", error: { may_have_side_effects: false } });
  expect(h.manager.listRuns(PARENT)[0]?.can_steer).toBe(true);
  const retry = await h.manager.steer(h.runId, "Correction", PARENT);
  await flush();
  expect(h.inputs[2]!.sessionRef?.providerSessionId).toBe("original-session");
  h.handles[2]!.completeTurn("failed");
  await h.manager.waitForSettlement(PARENT, retry.runId);
  expect(h.manager.listRuns(PARENT)[0]?.can_steer).toBe(false);
  await expect(h.manager.steer(h.runId, "Repeat dispatched correction", PARENT)).rejects.toThrow(
    retry.runId,
  );
  expect(h.manager.getStatus(failed.runId)).toEqual(failure);
});

it.each([false, true])(
  "honors parent Stop while a follow-up joins disposal (background=%s)",
  async (background) => {
    const h = makeHarness({ resume: { sessionId: "same-session" } });
    const { runId } = h.manager.spawn(PARENT, {
      agent: "codex",
      prompt: "Task",
      background: !background,
    });
    await flush();
    const disposal = Promise.withResolvers<void>();
    h.handles[0]!.dispose = () => disposal.promise;
    answer(h.handles[0]!, "Done");
    const pending = h.manager.steer(runId, "Follow up", PARENT, background);
    const outcome = pending.catch((error: unknown) => error);
    h.manager.cancelForegroundForThread(PARENT);
    disposal.resolve();
    const result = await outcome;
    await flush();
    expect(h.handles).toHaveLength(background ? 2 : 1);
    expect(result instanceof Error).toBe(!background);
    expect(h.manager.getStatus(runId).status).toBe("completed");
    h.manager.cancelAllForThread(PARENT);
    await flush();
  },
);
