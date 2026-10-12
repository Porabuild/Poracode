import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createOrchestrationHarness } from "./helpers/orchestrationHarness";
type Harness = Awaited<ReturnType<typeof createOrchestrationHarness>>;

/** Production process/orchestration execution, distinct from live provider or UI qualification. */
describe.skipIf(process.platform === "win32")(
  "Crossagents execution through owned ACP subprocesses",
  () => {
    let h: Harness | undefined;
    let parent: Harness["parent"];
    let manager: Harness["manager"];
    let admission: Harness["admission"];
    let provider: Harness["provider"];
    let events: Harness["events"];
    let trace: Harness["trace"];
    let plan: Harness["plan"];
    let call: Harness["call"];
    let drained: Harness["drained"];
    let rpc: Harness["rpc"];
    let until: Harness["until"];
    beforeEach(async () => {
      h = undefined;
      h = await createOrchestrationHarness();
      ({ parent, manager, admission, provider, events, trace, plan, call, drained, rpc, until } =
        h);
    });
    afterEach(async () => {
      await h?.dispose();
    });

    it("authenticates, launches, forwards child tools and confirms process retirement", async () => {
      expect((await rpc("tools/list", {}, "foreign")).status).toBe(401);
      const run = await call("spawn_agent", {
        provider,
        name: "process-rich",
        prompt: plan({ label: "rich", tools: 32 }),
      });
      expect(run.status).toBe("completed");
      expect(run.output).toContain('"summary":"rich"');
      const tile = events.find(
        (event) => event.type === "item.started" && event.itemId === `sub:${run.run_id}`,
      );
      expect(tile).toMatchObject({ payload: { isCrossagent: true } });
      const tools = events.filter(
        (event) =>
          event.type === "item.started" &&
          event.itemType === "tool_call" &&
          event.itemId.startsWith(`${run.run_id}:`),
      );
      expect(tools).toHaveLength(32);
      expect(
        tools.every(
          (event) => event.type === "item.started" && event.parentItemId === `sub:${run.run_id}`,
        ),
      ).toBe(true);
      expect(events.every((event) => event.threadId === parent)).toBe(true);
      expect(manager.getStatus(run.run_id, "foreign").status).toBe("failed");
      await drained();
    });

    it("cancels an actually running background child without releasing a live process slot", async () => {
      const run = await call("spawn_agent", {
        provider,
        background: true,
        prompt: plan({ label: "hold", holdMs: 60_000 }),
      });
      await until(() => trace().some((row) => row.event === "prompt" && row.label === "hold"));
      expect(manager.getStatus(run.run_id, parent).status).toBe("running");
      expect(admission.usage().total).toBe(1);
      const result = await call("cancel", { run_id: run.run_id });
      expect(result.ok).toBe(true);
      expect(manager.getStatus(run.run_id, parent).status).toBe("cancelled");
      // Disposal can retire the process before it reads the ACP cancel frame.
      expect(
        trace().some(
          (row) => row.event === "settled" && row.label === "hold" && row.cancelled === false,
        ),
      ).toBe(false);
      await drained();
    });

    it("continues a completed worker in a fresh process with the same provider session identity", async () => {
      const first = await call("spawn_agent", { provider, prompt: plan({ label: "original" }) });
      await drained();
      const next = await call("steer_agent", {
        run_id: first.run_id,
        prompt: plan({ label: "continued" }),
      });
      expect(next.status).toBe("completed");
      expect(next.continued_from).toBe(first.run_id);
      expect(next.run_id).not.toBe(first.run_id);
      const original = trace().find((row) => row.event === "prompt" && row.label === "original")!;
      const continued = trace().find((row) => row.event === "prompt" && row.label === "continued")!;
      expect(continued.pid).not.toBe(original.pid);
      expect(continued.sessionId).toBe(original.sessionId);
      expect(continued.priorLabels).toContain("original");
      expect(trace().some((row) => row.event === "load" && row.pid === continued.pid)).toBe(true);
      await drained();
    });

    it("executes DAG dependencies only after compact reports settle and forwards their evidence", async () => {
      const workflow = await call("run_workflow", {
        provider,
        tasks: [
          { id: "first", name: "First", prompt: plan({ label: "first" }), write_scope: [] },
          {
            id: "second",
            name: "Second",
            prompt: plan({ label: "second" }),
            depends_on: ["first"],
            write_scope: [],
          },
        ],
      });
      expect(workflow.status).toBe("completed");
      expect(workflow.tasks.map((task) => task.status)).toEqual(["completed", "completed"]);
      const rows = trace();
      expect(
        rows.findIndex((row) => row.event === "settled" && row.label === "first"),
      ).toBeLessThan(rows.findIndex((row) => row.event === "prompt" && row.label === "second"));
      expect(
        rows.find((row) => row.event === "prompt" && row.label === "second")?.dependencies,
      ).toMatchObject([
        { id: "first", result: { version: 1, outcome: "completed", summary: "first" } },
      ]);
      await drained();
    });

    it.each(["invalidReport", "failedCheck"])(
      "blocks downstream processes on %s",
      async (failure) => {
        const workflow = await call("run_workflow", {
          provider,
          tasks: [
            { id: "first", prompt: plan({ label: "blocked", [failure]: true }), write_scope: [] },
            {
              id: "second",
              prompt: plan({ label: "must-not-start" }),
              depends_on: ["first"],
              write_scope: [],
            },
          ],
        });
        expect(workflow.status).toBe("blocked");
        expect(workflow.tasks[1]!.status).toBe("blocked");
        expect(trace().some((row) => row.label === "must-not-start")).toBe(false);
        await drained();
      },
    );

    it("forwards a real child permission request, returns attention and resumes after denial", async () => {
      const workflow = await call("run_workflow", {
        provider,
        background: true,
        tasks: [
          { id: "first", prompt: plan({ label: "attention", permission: true }), write_scope: [] },
        ],
      });
      await until(() => events.some((event) => event.type === "request.opened"));
      const attention = await call("run_workflow", {
        action: "wait",
        workflow_id: workflow.workflow_id,
      });
      expect(attention.status).toBe("running");
      expect(attention.tasks[0]!.pending_requests).toBe(1);
      const request = events.find((event) => event.type === "request.opened")!;
      expect(request.type).toBe("request.opened");
      if (request.type !== "request.opened") throw new Error("Missing forwarded request");
      expect(
        manager.resolveChildServerRequest(request.requestId, {
          optionId: "reject",
        }),
      ).toBe(true);
      const settled = await call("run_workflow", {
        action: "wait",
        workflow_id: workflow.workflow_id,
      });
      expect(settled.status).toBe("completed");
      expect(trace().find((row) => row.event === "permission-resolved")?.outcome).toEqual({
        outcome: "selected",
        optionId: "reject",
      });
      await drained();
    });
    it("cancels a running workflow and retires its child before freeing admission", async () => {
      const workflow = await call("run_workflow", {
        provider,
        background: true,
        tasks: [
          {
            id: "first",
            prompt: plan({ label: "workflow-hold", holdMs: 60_000 }),
            write_scope: [],
          },
        ],
      });
      await until(() =>
        trace().some((row) => row.event === "prompt" && row.label === "workflow-hold"),
      );
      expect(admission.usage().total).toBe(1);
      const cancelled = await call("run_workflow", {
        action: "cancel",
        workflow_id: workflow.workflow_id,
      });
      expect(cancelled.status).toBe("cancelled");
      expect(cancelled.tasks[0]!.status).toBe("cancelled");
      // Disposal can retire the process before it reads the ACP cancel frame.
      expect(
        trace().some(
          (row) =>
            row.event === "settled" && row.label === "workflow-hold" && row.cancelled === false,
        ),
      ).toBe(false);
      await drained();
    });

    it("rejects a cyclic graph before launching any workflow child process", async () => {
      const initial = trace().filter((row) => row.event === "started").length;
      const response = await rpc("tools/call", {
        name: "run_workflow",
        arguments: {
          provider,
          tasks: [
            {
              id: "first",
              prompt: plan({ label: "must-not-start" }),
              depends_on: ["second"],
              write_scope: [],
            },
            {
              id: "second",
              prompt: plan({ label: "must-not-start" }),
              depends_on: ["first"],
              write_scope: [],
            },
          ],
        },
      });
      const body = await response.json();
      expect(body.result.isError).toBe(true);
      expect(body.result.content[0].text).toContain("cycles");
      expect(trace().filter((row) => row.event === "started")).toHaveLength(initial);
      expect(admission.usage().total).toBe(0);
    });
  },
);
