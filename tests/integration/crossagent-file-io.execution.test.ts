import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createOrchestrationHarness } from "./helpers/orchestrationHarness";

describe.skipIf(process.platform === "win32")("Crossagents actual filesystem execution", () => {
  let h: Awaited<ReturnType<typeof createOrchestrationHarness>> | undefined;
  afterEach(async () => {
    await h?.dispose();
    h = undefined;
  });

  it("creates, reads, edits and views exact text through real child ACP filesystem requests", async () => {
    h = await createOrchestrationHarness({
      fixtureFiles: { "fixtures/sample.txt": "original\r\n" },
    });
    const first = "created🙂\r\n",
      edited = "editedα\nlast\n";
    const run = await h.call("spawn_agent", {
      provider: h.provider,
      result_mode: "compact",
      prompt: h.plan({
        label: "file-operations",
        tools: 0,
        fsOperations: [
          { kind: "write", path: "fixtures/created.txt", content: first },
          { kind: "read", path: "fixtures/created.txt", expectedContent: first },
          { kind: "write", path: "fixtures/sample.txt", content: edited },
          { kind: "read", path: "fixtures/sample.txt", expectedContent: edited },
        ],
      }),
    });
    expect(run.status).toBe("completed");
    const compact = h.manager.getStatus(run.run_id, h.parent);
    expect(compact.result?.checks).toHaveLength(5);
    expect(compact.result?.checks.every((c) => c.result === "passed")).toBe(true);
    expect(compact.result?.evidence).toHaveLength(4);
    expect(readFileSync(join(h.projectRoot, "fixtures/created.txt"), "utf8")).toBe(first);
    expect(readFileSync(join(h.projectRoot, "fixtures/sample.txt"), "utf8")).toBe(edited);
    const replies = h.trace().filter((r) => (r.event as string) === "filesystem-reply");
    expect(replies).toHaveLength(4);
    const tools = h.events.filter(
      (e) =>
        e.type === "item.started" &&
        e.parentItemId === `sub:${run.run_id}` &&
        ["tool_call", "file_change", "mcp_tool_call", "dynamic_tool_call"].includes(e.itemType),
    );
    expect(tools).toHaveLength(4);
    await h.drained();
  });

  it("preserves bounded file-read content through an actual dependent workflow", async () => {
    h = await createOrchestrationHarness({
      fixtureFiles: {
        "fixtures/large.txt": "first\r\nsecond🙂\r\n" + "unused\n".repeat(1024 * 1024),
      },
    });
    const prompt = (label: string) =>
      h!.plan({
        label,
        tools: 0,
        fsOperations: [
          {
            kind: "read",
            path: "fixtures/large.txt",
            line: 2,
            limit: 1,
            expectedContent: "second🙂",
          },
        ],
      });
    const workflow = await h.call("run_workflow", {
      provider: h.provider,
      tasks: [
        { id: "first", prompt: prompt("first-read"), write_scope: [] },
        { id: "second", prompt: prompt("second-read"), depends_on: ["first"], write_scope: [] },
      ],
    });
    expect(workflow.status).toBe("completed");
    expect(workflow.tasks.map((t) => t.status)).toEqual(["completed", "completed"]);
    const rows = h.trace();
    expect(rows.findIndex((r) => r.event === "settled" && r.label === "first-read")).toBeLessThan(
      rows.findIndex((r) => r.event === "prompt" && r.label === "second-read"),
    );
    expect(
      rows.find((r) => r.event === "prompt" && r.label === "second-read")?.dependencies,
    ).toMatchObject([
      {
        id: "first",
        result: { summary: "first-read", checks: [{ result: "passed" }, { result: "passed" }] },
      },
    ]);
    expect(rows.filter((r) => (r.event as string) === "filesystem-reply")).toHaveLength(2);
    await h.drained();
  });

  it("blocks the dependent child when the real filesystem reply fails its content oracle", async () => {
    h = await createOrchestrationHarness({ fixtureFiles: { "fixtures/sample.txt": "actual\n" } });
    const workflow = await h.call("run_workflow", {
      provider: h.provider,
      tasks: [
        {
          id: "first",
          prompt: h.plan({
            label: "bad-read",
            tools: 0,
            fsOperations: [
              { kind: "read", path: "fixtures/sample.txt", expectedContent: "wrong\n" },
            ],
          }),
          write_scope: [],
        },
        {
          id: "second",
          prompt: h.plan({ label: "must-not-start" }),
          depends_on: ["first"],
          write_scope: [],
        },
      ],
    });
    expect(workflow.status).toBe("blocked");
    expect(workflow.tasks[1]?.status).toBe("blocked");
    expect(h.trace().some((r) => r.label === "must-not-start")).toBe(false);
    await h.drained();
  });
});
