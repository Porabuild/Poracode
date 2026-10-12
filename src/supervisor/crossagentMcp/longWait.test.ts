import { afterEach, expect, it, vi } from "vitest";
import { makeHarness, PARENT, flush } from "./testHarness";
import { dispatchTool, type SubagentToolContext } from "./toolRegistry";
import { CROSSAGENT_MCP_TIMEOUT_MS, DEFAULT_WAIT_TIMEOUT_MS } from "./waitTiming";

afterEach(() => vi.useRealTimers());

async function setup(count = 1, compact = false) {
  const h = makeHarness();
  const runs = h.manager.spawnMany(
    PARENT,
    Array.from({ length: count }, () => ({
      agent: "codex",
      prompt: "Work",
      ...(compact ? { resultMode: "compact" as const } : {}),
    })),
  );
  await flush();
  vi.useFakeTimers();
  return { ...h, ids: runs.map((run) => run.runId) };
}

it("keeps an eight-minute join inside the configured client deadline", () => {
  expect(DEFAULT_WAIT_TIMEOUT_MS).toBe(480_000);
  expect(CROSSAGENT_MCP_TIMEOUT_MS).toBeGreaterThan(DEFAULT_WAIT_TIMEOUT_MS + 30_000);
});

it("holds one call beyond the old cap and returns as soon as the worker finishes", async () => {
  const h = await setup();
  const settled = vi.fn<() => void>();
  const waiting = h.manager.waitFor(h.ids[0]!, DEFAULT_WAIT_TIMEOUT_MS, PARENT);
  void waiting.then(settled);
  await vi.advanceTimersByTimeAsync(310_000);
  expect(settled).not.toHaveBeenCalled();
  h.handles[0]!.completeTurn("completed");
  expect((await waiting).status).toBe("completed");
  expect(vi.getTimerCount()).toBe(0);
  expect((await h.manager.waitFor(h.ids[0]!, DEFAULT_WAIT_TIMEOUT_MS, PARENT)).status).toBe(
    "completed",
  );
  expect(vi.getTimerCount()).toBe(0);
});

it("returns running at eight minutes without stopping the worker", async () => {
  const h = await setup();
  const settled = vi.fn<() => void>();
  const waiting = h.manager.waitFor(h.ids[0]!, DEFAULT_WAIT_TIMEOUT_MS, PARENT);
  void waiting.then(settled);
  await vi.advanceTimersByTimeAsync(479_999);
  expect(settled).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  expect((await waiting).status).toBe("running");
  expect(h.handles[0]!.interrupted).toBe(false);
  h.handles[0]!.completeTurn("completed");
});

it.each(
  (["single", "all", "any"] as const).flatMap((mode) =>
    [false, true].flatMap((compact) =>
      [
        { label: "quiet", output: {} },
        { label: "progress", output: { output_mode: "progress" } },
        { label: "full", output: { full_output: true } },
      ].map(({ label, output }) => ({ mode, compact, label, output })),
    ),
  ),
)(
  "wakes $mode/$label waits (compact=$compact) for new and already-pending requests",
  async ({ mode, compact, output }) => {
    const h = await setup(mode === "single" ? 1 : 2, compact);
    const ctx: SubagentToolContext = {
      parentThreadId: PARENT,
      runManager: h.manager,
      listSpawnableAgents: async () => [],
    };
    const args = {
      ...(mode === "single" ? { run_id: h.ids[0] } : { run_ids: h.ids, wait_mode: mode }),
      ...output,
    };
    const waiting = dispatchTool("wait_for_agent", args, ctx);
    await vi.advanceTimersByTimeAsync(10_000);
    h.handles[0]!.openRequest("permission");
    const result = await waiting;
    expect(result.content[0]!.text).toContain('"pending_requests":1');
    expect(result.content[1]!.text).toContain("Attend to its pending request");
    expect(vi.getTimerCount()).toBe(0);
    expect(await dispatchTool("wait_for_agent", args, ctx)).toEqual(result);
    for (const handle of h.handles) handle.completeTurn("completed");
  },
);

it("keeps all and any completion semantics under the longer deadline", async () => {
  const h = await setup(2);
  const allDone = vi.fn<() => void>();
  const all = h.manager.waitForMany(h.ids, DEFAULT_WAIT_TIMEOUT_MS, PARENT);
  void all.then(allDone);
  const any = h.manager.waitForMany(h.ids, DEFAULT_WAIT_TIMEOUT_MS, PARENT, undefined, "any");
  await vi.advanceTimersByTimeAsync(310_000);
  h.handles[0]!.completeTurn("completed");
  expect((await any).map((run) => run.status)).toEqual(["completed", "running"]);
  expect(allDone).not.toHaveBeenCalled();
  h.handles[1]!.completeTurn("completed");
  expect((await all).map((run) => run.status)).toEqual(["completed", "completed"]);
  expect(vi.getTimerCount()).toBe(0);
});
