import { afterEach, expect, it, vi } from "vitest";
import { makeHarness, PARENT, flush } from "./testHarness";
import { dispatchTool, type SubagentToolContext } from "./toolRegistry";
import type { McpToolResult } from "./types";

async function setup(native = true) {
  const h = makeHarness();
  const { runId } = h.manager.spawn(PARENT, { agent: "codex", prompt: "Implement the brief" });
  await flush();
  const handle = h.handles[0]!;
  const deliver = vi.fn<() => Promise<void>>(async () => {});
  if (native) handle.steerTurn = deliver;
  const ctx: SubagentToolContext = {
    parentThreadId: PARENT,
    runManager: h.manager,
    listSpawnableAgents: async () => [],
  };
  return { ...h, runId, handle, deliver, ctx };
}

function value(result: McpToolResult) {
  expect(result.isError).not.toBe(true);
  return JSON.parse(result.content[0]!.text);
}

afterEach(() => vi.useRealTimers());

it("holds the legacy two-argument call until the worker completes, beyond short polling intervals", async () => {
  const h = await setup();
  vi.useFakeTimers();
  const settled = vi.fn<() => void>();
  const response = dispatchTool(
    "steer_agent",
    { run_id: h.runId, prompt: "The user changed the required output format" },
    h.ctx,
  );
  void response.then(settled);
  await vi.advanceTimersByTimeAsync(479_999);
  expect(h.deliver).toHaveBeenCalledOnce();
  expect(settled).not.toHaveBeenCalled();
  h.handle.emit({
    type: "content.delta",
    threadId: "child",
    itemId: "answer",
    stream: "assistant_text",
    delta: "Implemented and verified the new format",
  });
  h.handle.completeTurn("completed");
  expect(value(await response)).toMatchObject({
    run_id: h.runId,
    status: "completed",
    output: "Implemented and verified the new format",
  });
});

it("times out quietly and joins later without delivering the correction again", async () => {
  const h = await setup();
  vi.useFakeTimers();
  const response = dispatchTool(
    "steer_agent",
    { run_id: h.runId, prompt: "A verified input assumption is invalid" },
    h.ctx,
  );
  h.handle.emit({
    type: "content.delta",
    threadId: "child",
    itemId: "answer",
    stream: "assistant_text",
    delta: "Worker evidence",
  });
  await vi.advanceTimersByTimeAsync(480_000);
  const tick = await response;
  expect(value(tick)).toMatchObject({ status: "running", output: "", total_output_chars: 0 });
  expect(tick.content[1]?.text).toContain("Do not poll status or steer");
  expect(h.handle.interrupted).toBe(false);
  const joined = dispatchTool("wait_for_agent", { run_id: h.runId }, h.ctx);
  h.handle.completeTurn("completed");
  expect(value(await joined)).toMatchObject({ status: "completed", output: "Worker evidence" });
  expect(h.deliver).toHaveBeenCalledOnce();
});

it("allows explicit background delivery and identifies it as an uncollected result", async () => {
  const h = await setup();
  const wait = vi.spyOn(h.manager, "waitFor");
  const response = await dispatchTool(
    "steer_agent",
    { run_id: h.runId, prompt: "Stop editing the newly reassigned file", background: true },
    h.ctx,
  );
  expect(value(response)).toEqual({ run_id: h.runId, status: "accepted" });
  expect(response.content[1]?.text).toContain("wait_for_agent");
  expect(wait).not.toHaveBeenCalled();
  h.handle.completeTurn("completed");
});

it.each([{ background: "true" }, { output_mode: "invalid" }])(
  "rejects invalid options before delivering a correction: %j",
  async (options) => {
    const h = await setup();
    const result = await dispatchTool(
      "steer_agent",
      { run_id: h.runId, prompt: "Correction", ...options },
      h.ctx,
    );
    expect(result.isError).toBe(true);
    expect(h.deliver).not.toHaveBeenCalled();
    h.handle.completeTurn("completed");
  },
);

it("waits for the replacement turn on an interrupt-and-restart execution lane", async () => {
  const h = await setup(false);
  h.handle.interruptTurn = async () => h.handle.completeTurn("completed");
  const settled = vi.fn<() => void>();
  const response = dispatchTool(
    "steer_agent",
    { run_id: h.runId, prompt: "Correct the invalid assumption" },
    h.ctx,
  );
  void response.then(settled);
  await flush();
  expect(h.handle.startTurns).toHaveLength(2);
  expect(settled).not.toHaveBeenCalled();
  h.handle.completeTurn("completed");
  expect(value(await response)).toMatchObject({ status: "completed" });
});

it("surfaces a stopped child without retrying the correction", async () => {
  const h = await setup();
  const response = dispatchTool(
    "steer_agent",
    { run_id: h.runId, prompt: "Correct the invalid assumption" },
    h.ctx,
  );
  await flush();
  await h.manager.cancel(h.runId, PARENT);
  expect(value(await response)).toMatchObject({ status: "cancelled" });
  expect(h.deliver).toHaveBeenCalledOnce();
});
