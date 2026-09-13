import { expect, it } from "vitest";
import { makeHarness, PARENT, flush } from "./testHarness";
import { dispatchTool, type SubagentToolContext } from "./toolRegistry";
import { parseWaitTimeoutMs } from "./toolResult";
import type { McpToolResult, SubagentWaitResult } from "./types";

function setup() {
  const h = makeHarness();
  const ctx: SubagentToolContext = {
    parentThreadId: PARENT,
    runManager: h.manager,
    listSpawnableAgents: async () => [
      {
        provider: { value: "codex", label: "Test provider" },
        models: [{ value: "gpt-5.5", label: "Test model", reasoning: { values: [] } }],
        reasoningOptions: [],
        defaultModel: "gpt-5.5",
        execution: "structured",
        permissions: {
          options: [{ value: "full-access", label: "Full access" }],
          default: "full-access",
        },
      },
    ],
  };
  return { ...h, ctx };
}

function value(result: McpToolResult): SubagentWaitResult & { run_id: string } {
  expect(result.isError).not.toBe(true);
  return JSON.parse(result.content[0]!.text);
}

it("uses the transport-safe four-minute default to minimize parent ticks", () => {
  expect(parseWaitTimeoutMs({})).toBe(240_000);
  expect(parseWaitTimeoutMs({ timeout_s: 5 })).toBe(5_000);
  expect(parseWaitTimeoutMs({ timeout_s: 999 })).toBe(240_000);
});

it("keeps the explicit wait loop tiny without consuming worker history", async () => {
  const h = setup();
  const spawned = await dispatchTool("spawn_agent", { background: true, prompt: "Review" }, h.ctx);
  const { run_id } = value(spawned);
  expect(spawned.content[1]?.text).toContain("wait_for_agent");
  await flush();
  const narration = "Investigating the owned task. ".repeat(200);
  h.handles[0]!.emit({
    type: "content.delta",
    threadId: "child",
    itemId: "answer",
    stream: "assistant_text",
    delta: narration,
  });
  const progress = await dispatchTool(
    "wait_for_agent",
    { run_id, timeout_s: 0, output_mode: "progress" },
    h.ctx,
  );
  for (let tick = 0; tick < 3; tick++) {
    const response = await dispatchTool("wait_for_agent", { run_id, timeout_s: 0 }, h.ctx);
    expect(value(response)).toMatchObject({ status: "running", output: "", total_output_chars: 0 });
    expect(response.content[1]?.text).toContain("wait_for_agent");
    expect(JSON.stringify(response).length).toBeLessThan(JSON.stringify(progress).length / 3);
  }
  h.handles[0]!.completeTurn("completed");
  const final = await dispatchTool("wait_for_agent", { run_id }, h.ctx);
  expect(value(final)).toMatchObject({ status: "completed", output: narration });
  expect(final.content).toHaveLength(1);
  const legacy = await dispatchTool("get_status", { run_id, output_mode: "progress" }, h.ctx);
  expect(final).toEqual(legacy);
});

it("keeps retry narration out of running ticks while retaining failure metadata", async () => {
  const h = setup();
  const spawned = await dispatchTool(
    "spawn_agent",
    {
      background: true,
      prompt: "Review",
      fallbacks: [{ provider: "codex", model: "gpt-5.5" }],
      retry_on: "any-failure",
    },
    h.ctx,
  );
  const { run_id } = value(spawned);
  await flush();
  h.handles[0]!.emit({
    type: "content.delta",
    threadId: "child",
    itemId: "answer",
    stream: "assistant_text",
    delta: "Retry narration. ".repeat(400),
  });
  h.handles[0]!.completeTurn("failed");
  await flush();
  const response = value(await dispatchTool("get_status", { run_id }, h.ctx));
  expect(response).toMatchObject({ status: "running", output: "", total_output_chars: 0 });
  expect(response.attempts?.[0]).toMatchObject({
    status: "failed",
    output: "",
    error: "Subagent turn failed",
  });
  h.handles[1]!.completeTurn("completed");
  const full = value(await dispatchTool("get_status", { run_id, full_output: true }, h.ctx));
  expect(full.attempts?.[0]?.output).toContain("Retry narration.");
});

it("returns one batch continuation cue and lets the parent drop collected IDs", async () => {
  const h = setup();
  const spawned = await dispatchTool(
    "spawn_agent",
    {
      background: true,
      tasks: [{ prompt: "First" }, { prompt: "Second" }],
    },
    h.ctx,
  );
  const { runs } = JSON.parse(spawned.content[0]!.text) as { runs: Array<{ run_id: string }> };
  expect(spawned.content).toHaveLength(2);
  await flush();
  h.handles[0]!.emit({
    type: "content.delta",
    threadId: "child",
    itemId: "answer",
    stream: "assistant_text",
    delta: "First final result",
  });
  h.handles[0]!.completeTurn("completed");
  const mixed = await dispatchTool(
    "wait_for_agent",
    { run_ids: runs.map((run) => run.run_id), timeout_s: 0 },
    h.ctx,
  );
  const results = JSON.parse(mixed.content[0]!.text) as Array<
    SubagentWaitResult & { run_id: string }
  >;
  expect(results.map((run) => [run.status, run.output])).toEqual([
    ["completed", "First final result"],
    ["running", ""],
  ]);
  expect(mixed.content).toHaveLength(2);
  expect(mixed.content[1]?.text).toContain("only required running IDs");
  const remaining = results.filter((run) => run.status === "running").map((run) => run.run_id);
  const tick = await dispatchTool("wait_for_agent", { run_ids: remaining, timeout_s: 0 }, h.ctx);
  expect(JSON.stringify(tick)).not.toContain("First final result");
  h.handles[1]!.completeTurn("failed");
  const failed = await dispatchTool("wait_for_agent", { run_ids: remaining }, h.ctx);
  expect(JSON.parse(failed.content[0]!.text)[0]).toMatchObject({
    status: "failed",
    error: { message: "Subagent turn failed" },
  });
  expect(failed.content).toHaveLength(1);
});
