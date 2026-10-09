import { describe, expect, it, vi } from "vitest";
import { dispatchTool, TOOLS } from "./toolRegistry";
import type { SubagentWaitResult } from "./types";
import {
  PARENT,
  SECRET,
  provider,
  savedRoute,
  requestFor,
  harness,
  json,
} from "./dispatchTrace.testHelpers";

describe("trace read contract", () => {
  it("advertises optional reads only on status and wait", () => {
    expect(
      TOOLS.filter((tool) =>
        Object.hasOwn(tool.inputSchema.properties as object, "include_trace"),
      ).map((tool) => tool.name),
    ).toEqual(["wait_for_agent", "get_status"]);
    for (const name of ["wait_for_agent", "get_status"]) {
      expect(TOOLS.find((tool) => tool.name === name)?.inputSchema).toMatchObject({
        properties: { include_trace: { type: "boolean" } },
      });
    }
  });

  it("keeps historical provenance, read mutation isolation and parent ownership", async () => {
    const h = harness();
    const route = savedRoute();
    h.roster[0] = provider("fixture-primary", "manual-override", route);
    const { run_id } = json(
      await dispatchTool("spawn_agent", { prompt: SECRET, background: true }, h.ctx),
    );
    await vi.waitFor(() => expect(h.handles[0]?.handle.startTurns).toHaveLength(1));
    route.tags[0] = "changed";
    route.fallbacks!.length = 0;
    h.roster[0] = provider();
    const wireTrace = json(
      await dispatchTool("get_status", { run_id, include_trace: true }, h.ctx),
    ).trace!;
    const first = h.manager.getStatus(run_id, PARENT, { includeTrace: true }).trace!;
    expect(first).toEqual(wireTrace);
    expect(first.selection.source).toBe("manual-override");
    expect(first.selection.routeTags).toEqual(["review"]);
    expect(first.fallbackPolicy.entries).toHaveLength(1);
    first.selection.primary.model = "tampered";
    first.selection.explicitFields!.provider = true;
    (first.selection.matchedTags as string[])[0] = "tampered";
    first.fallbackPolicy.entries.length = 0;
    first.attempts[0]!.provider = "tampered";
    const second = h.manager.getStatus(run_id, PARENT, { includeTrace: true }).trace!;
    expect(second.selection.primary.model).toBe("fixture-model");
    expect(second.selection.explicitFields!.provider).toBe(false);
    expect(second.selection.matchedTags).toEqual(["review"]);
    expect(second.fallbackPolicy.entries).toHaveLength(1);
    expect(
      h.manager.getStatus(run_id, "different-parent", { includeTrace: true }),
    ).not.toHaveProperty("trace");
    expect(
      await h.manager.waitForMany([run_id], 0, "different-parent", { includeTrace: true }),
    ).toEqual([{ run_id, status: "failed", output: `Unknown run_id: ${run_id}` }]);
    await h.manager.cancel(run_id, PARENT);
  });

  it("exposes only normalized failures and actual attempted selections through fallback", async () => {
    const h = harness({ failStartup: true });
    const { run_id } = json(
      await dispatchTool(
        "spawn_agent",
        {
          prompt: SECRET,
          provider: "fixture-primary",
          fallbacks: [{ provider: "fixture-fallback" }],
          background: true,
        },
        h.ctx,
      ),
    );
    await vi.waitFor(() => expect(h.handles[0]?.handle.startTurns).toHaveLength(1));
    const running = h.manager.getStatus(run_id, PARENT, { includeTrace: true }).trace!;
    expect(running.attempts).toMatchObject([
      { index: 1, provider: "fixture-primary", status: "failed", reason: "startup-failure" },
      { index: 2, provider: "fixture-fallback", status: "running" },
    ]);
    h.handles[0]!.handle.completeTurn("completed");
    const completed = json(
      await dispatchTool("wait_for_agent", { run_id, include_trace: true }, h.ctx),
    );
    expect(completed.trace?.attempts[1]).toMatchObject({ status: "completed" });
    expect(JSON.stringify(completed.trace)).not.toContain(SECRET);
    expect(h.manager.getStatus(run_id, PARENT)).not.toHaveProperty("trace");
  });

  it("distinguishes dispatched failures and cancellation without parsing provider errors", async () => {
    const h = harness();
    const { runId } = h.manager.spawn(PARENT, { agent: "fixture-primary", prompt: SECRET });
    await vi.waitFor(() => expect(h.handles[0]?.handle.startTurns).toHaveLength(1));
    h.handles[0]!.handle.listener?.onError(SECRET);
    expect(
      (await h.manager.waitFor(runId, 0, PARENT, { includeTrace: true })).trace?.attempts[0],
    ).toMatchObject({ status: "failed", reason: "execution-failure" });
    const next = h.manager.spawn(PARENT, { agent: "fixture-primary", prompt: SECRET });
    await h.manager.cancel(next.runId, PARENT);
    expect(
      h.manager.getStatus(next.runId, PARENT, { includeTrace: true }).trace?.attempts[0],
    ).toMatchObject({ status: "cancelled", reason: "cancelled" });
  });

  it("preserves quiet/full/progress/cursor and batch any/all envelopes", async () => {
    const h = harness();
    const runs = json<{ runs: Array<{ run_id: string }> }>(
      await dispatchTool(
        "spawn_agent",
        {
          background: true,
          tasks: [
            { prompt: SECRET, provider: "fixture-primary" },
            { prompt: SECRET, provider: "fixture-fallback" },
          ],
        },
        h.ctx,
      ),
    ).runs;
    await vi.waitFor(() => expect(h.handles).toHaveLength(2));
    for (const [index, entry] of h.handles.entries()) {
      entry.handle.emit({
        type: "content.delta",
        threadId: "child",
        itemId: `text-${index}`,
        stream: "assistant_text",
        delta: "safe-output",
      });
    }
    for (const args of [
      {},
      { full_output: true },
      { output_mode: "quiet", after_output_chars: 3 },
      { output_mode: "progress", after_output_chars: 3 },
    ]) {
      const original = json(
        await dispatchTool("get_status", { run_id: runs[0]!.run_id, ...args }, h.ctx),
      );
      const withTrace = json(
        await dispatchTool(
          "get_status",
          { run_id: runs[0]!.run_id, ...args, include_trace: true },
          h.ctx,
        ),
      );
      const { trace, ...withoutTrace } = withTrace;
      expect(withoutTrace).toEqual(original);
      expect(trace?.selection.source).toBe("explicit");
      expect(
        json(
          await dispatchTool(
            "get_status",
            { run_id: runs[0]!.run_id, ...args, include_trace: false },
            h.ctx,
          ),
        ),
      ).toEqual(original);
    }
    for (const wait_mode of ["any", "all"]) {
      const args = {
        run_ids: runs.map((run) => run.run_id),
        wait_mode,
        timeout_s: 0,
        after_output_chars_by_run: Object.fromEntries(runs.map((run, i) => [run.run_id, i * 3])),
      };
      const original = json<Array<SubagentWaitResult>>(
        await dispatchTool("wait_for_agent", args, h.ctx),
      );
      const traced = json<Array<SubagentWaitResult>>(
        await dispatchTool("wait_for_agent", { ...args, include_trace: true }, h.ctx),
      );
      expect(
        traced.map(({ trace, ...result }) => {
          expect(trace).toBeDefined();
          return result;
        }),
      ).toEqual(original);
    }
    for (const run of runs) await h.manager.cancel(run.run_id, PARENT);
  });

  it("includes trace in compact reads without expanding normal reports", async () => {
    const h = harness();
    const { run_id } = json(
      await dispatchTool(
        "spawn_agent",
        { prompt: SECRET, result_mode: "compact", background: true },
        h.ctx,
      ),
    );
    await vi.waitFor(() => expect(h.handles[0]?.handle.startTurns).toHaveLength(1));
    for (const status of ["running", "completed"]) {
      if (status === "completed") {
        h.handles[0]!.handle.completeTurn("completed");
      }
      const original = json(await dispatchTool("get_status", { run_id }, h.ctx));
      const { trace, ...result } = json(
        await dispatchTool("get_status", { run_id, include_trace: true }, h.ctx),
      );
      expect(result).toEqual(original);
      expect(trace?.attempts[0]?.status).toBe(status);
    }
  });

  it.each(["get_status", "wait_for_agent"])(
    "rejects invalid include_trace in %s, including full output",
    async (tool) => {
      const h = harness();
      for (const full_output of [true, false]) {
        expect(
          await dispatchTool(tool, { run_id: "unknown", include_trace: "yes", full_output }, h.ctx),
        ).toMatchObject({ isError: true, content: [{ text: "include_trace must be a boolean" }] });
      }
    },
  );

  it.each(["wait_for_agent", "wait_for_agents"])(
    "validates a batch trace option before blocking in %s",
    async (tool) => {
      const h = harness();
      const { runId } = h.manager.spawn(PARENT, { agent: "fixture-primary", prompt: SECRET });
      const wait = vi.spyOn(h.manager, "waitForMany");
      expect(
        await dispatchTool(tool, { run_ids: [runId], include_trace: "yes" }, h.ctx),
      ).toMatchObject({ isError: true });
      expect(wait).not.toHaveBeenCalled();
      await h.manager.cancel(runId, PARENT);
    },
  );

  it("marks continuation as reuse of the winning session without a fresh saved policy", async () => {
    const h = harness({ failStartup: true, resume: true });
    const { runId } = h.manager.spawn(
      PARENT,
      requestFor({ prompt: SECRET }, [
        provider("fixture-primary", "manual-override", savedRoute()),
      ]),
    );
    await vi.waitFor(() => expect(h.handles[0]?.handle.startTurns).toHaveLength(1));
    h.handles[0]!.handle.completeTurn("completed");
    const original = h.manager.getStatus(runId, PARENT, { includeTrace: true }).trace;
    const continued = await h.manager.steer(runId, "harmless follow-up", PARENT, true);
    const trace = h.manager.getStatus(continued.runId, PARENT, { includeTrace: true }).trace!;
    expect(trace.selection).toMatchObject({
      source: "continuation",
      primary: { provider: "fixture-fallback" },
    });
    expect(trace.fallbackPolicy).toMatchObject({
      source: "none",
      retryModeSource: "default",
      retryMode: "startup",
      entries: [],
    });
    expect(h.manager.getStatus(runId, PARENT, { includeTrace: true }).trace).toEqual(original);
    await h.manager.cancel(continued.runId, PARENT);
  });

  it("captures workflow selection while preserving its existing standalone policy", async () => {
    const h = harness();
    h.roster[0] = provider("fixture-primary", "manual-override", savedRoute());
    await dispatchTool(
      "run_workflow",
      { background: true, tasks: [{ id: "research", prompt: SECRET, write_scope: [] }] },
      h.ctx,
    );
    await vi.waitFor(() => expect(h.manager.listRuns(PARENT)).toHaveLength(1));
    const run = h.manager.listRuns(PARENT)[0]!;
    const trace = h.manager.getStatus(run.run_id, PARENT, { includeTrace: true }).trace!;
    expect(trace.selection.source).toBe("manual-override");
    expect(trace.selection.routeTags).toEqual(["review"]);
    expect(trace.fallbackPolicy).toMatchObject({
      source: "none",
      retryModeSource: "default",
      entries: [],
    });
    await h.manager.cancel(run.run_id, PARENT);
  });

  it("expires trace with the existing 50-run retention", async () => {
    const h = harness();
    let first = "";
    for (let index = 0; index < 51; index += 1) {
      const { runId } = h.manager.spawn(PARENT, { agent: "fixture-primary", prompt: SECRET });
      if (!first) first = runId;
      await vi.waitFor(() => expect(h.handles[index]?.handle.startTurns).toHaveLength(1), {
        interval: 1,
      });
      h.handles[index]!.handle.completeTurn("completed");
      await h.manager.waitForSettlement(PARENT, runId);
    }
    expect(h.manager.listRuns(PARENT)).toHaveLength(50);
    expect(h.manager.getStatus(first, PARENT, { includeTrace: true })).not.toHaveProperty("trace");
  });
});
