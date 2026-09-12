import { makeHarness, PARENT, flush } from "./testHarness";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentAdapter } from "@/supervisor/agents/base";
import { SubagentRunManager } from "./SubagentRunManager";
import type { SubagentRunHost } from "./types";
import { dispatchTool, type SubagentToolContext } from "./toolRegistry";
import { jsonResult } from "./toolResult";
import type { CompactResult } from "./compactResult";
import type { WorkflowSnapshot } from "./SubagentWorkflowManager";

function report(summary = "Completed the owned task"): CompactResult {
  return {
    version: 1,
    outcome: "completed",
    summary,
    changes: ["src/owned.ts"],
    checks: [{ command: "focused verification", result: "passed" }],
    findings: [],
    risks: [],
    evidence: ["tmp/proof.log"],
  };
}
function finalText(value: unknown): string {
  return `\`\`\`crossagents-result\n${JSON.stringify(value)}\n\`\`\``;
}
function context(h: ReturnType<typeof makeHarness>): SubagentToolContext {
  return {
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
}
function emit(h: ReturnType<typeof makeHarness>, index: number, text: string): void {
  h.handles[index]!.emit({
    type: "content.delta",
    threadId: "child",
    itemId: "answer",
    stream: "assistant_text",
    delta: text,
  });
}
async function startWorkflow(ctx: SubagentToolContext): Promise<WorkflowSnapshot> {
  const response = await dispatchTool(
    "run_workflow",
    {
      background: true,
      tasks: [
        {
          id: "implement",
          name: "Implement owned fix",
          prompt: "Implement the fix and verify it",
          write_scope: ["src/owned.ts"],
        },
        {
          id: "review",
          name: "Review owned fix",
          prompt: "Independently review the changes",
          depends_on: ["implement"],
          write_scope: [],
        },
      ],
    },
    ctx,
  );
  expect(response.isError).not.toBe(true);
  return JSON.parse(response.content[0]!.text) as WorkflowSnapshot;
}

describe("compact worker results through the real run manager", () => {
  it("returns the worker report without consuming evidence and keeps legacy/full reads available", async () => {
    const h = makeHarness();
    const ctx = context(h);
    const response = await dispatchTool(
      "spawn_agent",
      { prompt: "Implement", result_mode: "compact", background: true },
      ctx,
    );
    const { run_id } = JSON.parse(response.content[0]!.text) as { run_id: string };
    await flush();
    expect(h.handles[0]!.startTurns[0]!.prompt).toContain("crossagents-result");
    const narration = "Investigating details in the owned files. ".repeat(1000);
    const text = narration + "\n" + finalText(report());
    emit(h, 0, text);
    h.handles[0]!.openRequest("approval");
    expect(h.manager.getStatus(run_id, PARENT)).toMatchObject({
      output: "",
      pending_requests: 1,
      total_output_chars: 0,
    });
    h.handles[0]!.completeTurn("completed");
    const compact = h.manager.getStatus(run_id, PARENT);
    expect(compact).toMatchObject({
      status: "completed",
      output: "",
      result: report(),
      total_output_chars: 0,
    });
    const legacy = h.manager.getStatus(run_id, PARENT, {
      outputMode: "progress",
      afterOutputChars: 0,
    });
    const bytes = (value: unknown) => Buffer.byteLength(JSON.stringify(jsonResult(value)));
    expect(bytes(compact)).toBeLessThan(bytes(legacy) / 20);
    expect(h.manager.getStatus(run_id, PARENT, { fullOutput: true }).output).toBe(text);
    expect(h.manager.getStatus(run_id, "foreign").output).toContain("Unknown run_id");
  });

  it.each([false, true])(
    "accepts a distinct final message after commentary without changing legacy joins (authoritative=%s)",
    async (authoritative) => {
      const h = makeHarness();
      const { runId } = h.manager.spawn(PARENT, {
        agent: "codex",
        prompt: "go",
        resultMode: "compact",
      });
      await flush();
      h.handles[0]!.emit({
        type: "content.delta",
        threadId: "child",
        itemId: "commentary",
        stream: "assistant_text",
        delta: "I will inspect the code.",
      });
      const final = finalText(report());
      h.handles[0]!.emit({
        type: "content.delta",
        threadId: "child",
        itemId: "final",
        stream: "assistant_text",
        delta: authoritative ? "Draft" : final,
      });
      if (authoritative)
        h.handles[0]!.emit({
          type: "item.updated",
          threadId: "child",
          itemId: "final",
          payload: { content: [{ kind: "text", text: final }], displayAuthoritative: true },
        });
      h.handles[0]!.completeTurn("completed");
      expect(h.manager.getStatus(runId, PARENT).result).toEqual(report());
      expect(h.manager.getStatus(runId, PARENT, { fullOutput: true }).output).toBe(
        "I will inspect the code." + final,
      );
    },
  );

  it("does not infer success from an invalid report or hide the original failure", async () => {
    const h = makeHarness();
    const { runId } = h.manager.spawn(PARENT, {
      agent: "codex",
      prompt: "go",
      resultMode: "compact",
    });
    await flush();
    emit(h, 0, "Done, trust me.");
    h.handles[0]!.listener!.onError("verification failed");
    const result = h.manager.getStatus(runId, PARENT);
    expect(result).toMatchObject({
      status: "failed",
      output: "",
      error: { message: "verification failed" },
    });
    expect(result.result_error).toBeTruthy();
    expect(result.result).toBeUndefined();
    expect(h.manager.getStatus(runId, PARENT, { fullOutput: true }).output).toContain(
      "Done, trust me.",
    );
  });
});

describe("workflow MCP integration", () => {
  const testHostPlatform = Object.getOwnPropertyDescriptor(process, "platform")!;
  beforeEach(() => {
    // Exercise native workflow behavior consistently on every test-runner OS.
    Object.defineProperty(process, "platform", { value: "linux", configurable: true });
  });
  afterEach(() => {
    Object.defineProperty(process, "platform", testHostPlatform);
  });

  it.each([
    {
      projectLocation: {
        kind: "wsl",
        distro: "Ubuntu",
        linuxPath: "/work",
        uncPath: "\\\\wsl$\\Ubuntu\\work",
      },
    },
    { executionEnvironment: { kind: "wsl", distro: "Ubuntu" } },
    { projectLocation: { kind: "windows", path: "C:\\work" }, windowsProjectExecution: "wsl" },
  ] satisfies NonNullable<Parameters<typeof makeHarness>[0]>[])(
    "rejects a workflow's WSL execution before side effects but supports standalone compact runs %#",
    async (options) => {
      const h = makeHarness(options);
      const response = await dispatchTool(
        "run_workflow",
        {
          background: true,
          tasks: [
            { id: "first", prompt: "Read first", write_scope: [] },
            { id: "second", prompt: "Read second", depends_on: ["first"], write_scope: [] },
          ],
        },
        context(h),
      );
      expect(response.isError).toBe(true);
      expect(response.content[0]!.text).toContain("native macOS or Linux execution");
      await flush();
      expect(h.inputs).toEqual([]);
      expect(h.appended).toEqual([]);
      const { runId } = h.manager.spawn(PARENT, {
        agent: "codex",
        prompt: "Read only",
        resultMode: "compact",
      });
      await flush();
      expect(h.handles).toHaveLength(1);
      expect(h.handles[0]!.startTurns[0]!.prompt).toContain("crossagents-result");
      await h.manager.cancel(runId, PARENT);
    },
  );

  it("rejects native Windows workflows before launch without restricting standalone compact spawn", async () => {
    const platform = Object.getOwnPropertyDescriptor(process, "platform")!;
    Object.defineProperty(process, "platform", { value: "win32", configurable: true });
    try {
      const h = makeHarness({ projectLocation: { kind: "windows", path: "C:\\work" } });
      const response = await dispatchTool(
        "run_workflow",
        {
          background: true,
          tasks: [{ id: "read", prompt: "Read", write_scope: [] }],
        },
        context(h),
      );
      expect(response.isError).toBe(true);
      expect(response.content[0]!.text).toContain("native macOS or Linux execution");
      await flush();
      expect(h.inputs).toEqual([]);
      expect(h.appended).toEqual([]);
      const { runId } = h.manager.spawn(PARENT, {
        agent: "codex",
        prompt: "Read",
        resultMode: "compact",
      });
      await flush();
      expect(h.handles).toHaveLength(1);
      await h.manager.cancel(runId, PARENT);
    } finally {
      Object.defineProperty(process, "platform", platform);
    }
  });

  it("rejects a later stage's WSL fallback before launching earlier native stages", async () => {
    const create = vi.fn<NonNullable<AgentAdapter["createStructuredSession"]>>(async () => {
      throw new Error("unexpected launch");
    });
    const native = {
      kind: "codex",
      label: "Native worker",
      createStructuredSession: create,
      capabilities: {
        models: [{ id: "gpt-5.5", label: "Model" }],
        efforts: [],
        approvalPolicies: [],
        sandboxModes: [],
      },
    } as unknown as AgentAdapter;
    const fallback = { ...native, kind: "claude", windowsProjectExecution: "wsl" } as AgentAdapter;
    const append = vi.fn<SubagentRunHost["appendRuntimeEvent"]>();
    const manager = new SubagentRunManager({
      adapters: new Map([
        [native.kind, native],
        [fallback.kind, fallback],
      ]),
      host: {
        getParentContext: () => ({
          projectLocation: { kind: "windows", path: "C:\\work" },
          config: { model: "parent" },
        }),
        appendRuntimeEvent: append,
      },
    });
    const ctx = { ...context(makeHarness()), runManager: manager };
    const response = await dispatchTool(
      "run_workflow",
      {
        background: true,
        tasks: [
          { id: "first", prompt: "Read", write_scope: [] },
          {
            id: "second",
            prompt: "Read",
            write_scope: [],
            fallbacks: [{ provider: "claude", model: "gpt-5.5" }],
          },
        ],
      },
      ctx,
    );
    expect(response.isError).toBe(true);
    expect(response.content[0]!.text).toContain("native macOS or Linux execution");
    await flush();
    expect(create).not.toHaveBeenCalled();
    expect(append).not.toHaveBeenCalled();
  });

  it("runs implementation then review from one submission, forwarding reports without parent transcript handoffs", async () => {
    const h = makeHarness();
    const ctx = context(h);
    const started = await startWorkflow(ctx);
    await flush();
    expect(h.handles).toHaveLength(1);
    const narration = "Do not forward this investigation transcript. ".repeat(300);
    emit(h, 0, narration + "\n" + finalText(report("Implementation verified")));
    h.handles[0]!.completeTurn("completed");
    await flush();
    expect(h.handles).toHaveLength(2);
    expect(h.handles[1]!.startTurns[0]!.prompt).toContain("Implementation verified");
    expect(h.handles[1]!.startTurns[0]!.prompt).not.toContain(narration);
    const waiting = dispatchTool(
      "run_workflow",
      { action: "wait", workflow_id: started.workflow_id, timeout_s: 1 },
      ctx,
    );
    emit(h, 1, finalText(report("Independent review passed")));
    h.handles[1]!.completeTurn("completed");
    const response = await waiting;
    const settled = JSON.parse(response.content[0]!.text) as WorkflowSnapshot;
    expect(settled.status).toBe("completed");
    expect(settled.tasks[0]!.result).toBeUndefined();
    expect(settled.tasks[1]!.result?.summary).toBe("Independent review passed");
    expect(response.content[0]!.text).not.toContain(narration);
    expect(
      h.manager.getStatus(settled.tasks[0]!.run_id!, PARENT, { fullOutput: true }).output,
    ).toContain(narration);
    h.manager.cancelAllForThread(PARENT);
  });

  it("collects a foreground two-stage workflow in one MCP call", async () => {
    const h = makeHarness();
    const resultPromise = dispatchTool(
      "run_workflow",
      {
        timeout_s: 1,
        tasks: [
          { id: "implement", prompt: "Implement and verify", write_scope: ["src/owned.ts"] },
          {
            id: "review",
            prompt: "Review independently",
            depends_on: ["implement"],
            write_scope: [],
          },
        ],
      },
      context(h),
    );
    await flush();
    emit(h, 0, finalText(report("Implemented")));
    h.handles[0]!.completeTurn("completed");
    await flush();
    emit(h, 1, finalText(report("Reviewed")));
    h.handles[1]!.completeTurn("completed");
    const response = await resultPromise;
    expect(JSON.parse(response.content[0]!.text)).toMatchObject({ status: "completed" });
    expect(h.handles).toHaveLength(2);
    h.manager.cancelAllForThread(PARENT);
  });

  it("retains workflow ownership while a direct run cancellation is still disposing", async () => {
    const h = makeHarness();
    const ctx = context(h);
    const started = await startWorkflow(ctx);
    await flush();
    const snapshot = await dispatchTool(
      "run_workflow",
      { action: "status", workflow_id: started.workflow_id },
      ctx,
    );
    const runId = (JSON.parse(snapshot.content[0]!.text) as WorkflowSnapshot).tasks[0]!.run_id!;
    let release!: () => void;
    const disposal = new Promise<void>((resolve) => {
      release = resolve;
    });
    h.handles[0]!.dispose = async () => {
      await disposal;
    };
    const cancelling = h.manager.cancel(runId, PARENT);
    await flush();
    const replacement = {
      background: true,
      tasks: [{ id: "replacement", prompt: "Implement", write_scope: ["src/owned.ts"] }],
    };
    expect((await dispatchTool("run_workflow", replacement, ctx)).isError).toBe(true);
    release();
    await cancelling;
    await flush();
    expect((await dispatchTool("run_workflow", replacement, ctx)).isError).not.toBe(true);
    h.manager.cancelAllForThread(PARENT);
  });

  it("counts disposing workers against capacity until queued workflow work can start", async () => {
    const h = makeHarness();
    const ctx = context(h);
    const runs = h.manager.spawnMany(
      PARENT,
      Array.from({ length: 16 }, () => ({ agent: "codex", prompt: "go" })),
    );
    await flush();
    let release!: () => void;
    const disposal = new Promise<void>((resolve) => {
      release = resolve;
    });
    for (const handle of h.handles)
      handle.dispose = async () => {
        await disposal;
      };
    const cancellations = runs.map(({ runId }) => h.manager.cancel(runId, PARENT));
    await flush();
    expect(h.manager.getCapacity(PARENT).available_slots).toBe(0);
    expect(
      (
        await dispatchTool(
          "run_workflow",
          { background: true, tasks: [{ id: "queued", prompt: "go", write_scope: ["other.ts"] }] },
          ctx,
        )
      ).isError,
    ).not.toBe(true);
    await flush();
    expect(h.handles).toHaveLength(16);
    release();
    await Promise.all(cancellations);
    await flush();
    expect(h.handles).toHaveLength(17);
    h.manager.cancelAllForThread(PARENT);
  });

  it("retains failed cleanup records under retention pressure until workflow cancellation retries", async () => {
    const h = makeHarness();
    const ctx = context(h);
    const started = await startWorkflow(ctx);
    await flush();
    const snapshot = JSON.parse(
      (
        await dispatchTool(
          "run_workflow",
          { action: "status", workflow_id: started.workflow_id },
          ctx,
        )
      ).content[0]!.text,
    ) as WorkflowSnapshot;
    const original = snapshot.tasks[0]!.run_id!;
    let fail = true;
    h.handles[0]!.dispose = async () => {
      if (fail) throw new Error("not stopped");
    };
    emit(h, 0, finalText(report()));
    h.handles[0]!.completeTurn("completed");
    await flush();
    for (let index = 0; index < 55; index++) {
      h.manager.spawn(PARENT, { agent: "codex", prompt: "independent" });
      await flush();
      h.handles.at(-1)!.completeTurn("completed");
      await flush();
    }
    expect(h.manager.getStatus(original, PARENT).output).not.toContain("Unknown run_id");
    const replacement = {
      background: true,
      tasks: [{ id: "replacement", prompt: "go", write_scope: ["src/owned.ts"] }],
    };
    expect((await dispatchTool("run_workflow", replacement, ctx)).isError).toBe(true);
    fail = false;
    expect(
      (
        await dispatchTool(
          "run_workflow",
          { action: "cancel", workflow_id: started.workflow_id },
          ctx,
        )
      ).isError,
    ).not.toBe(true);
    expect((await dispatchTool("run_workflow", replacement, ctx)).isError).not.toBe(true);
    h.manager.cancelAllForThread(PARENT);
  });

  it("returns attention, stops on parent close and never launches the dependent stage", async () => {
    const h = makeHarness();
    const ctx = context(h);
    const started = await startWorkflow(ctx);
    await flush();
    const waiting = dispatchTool(
      "run_workflow",
      { action: "wait", workflow_id: started.workflow_id, timeout_s: 1 },
      ctx,
    );
    h.handles[0]!.openRequest("permission");
    const response = await waiting;
    expect(JSON.parse(response.content[0]!.text)).toMatchObject({
      status: "running",
      tasks: [{ pending_requests: 1 }, {}],
    });
    h.manager.cancelAllForThread(PARENT);
    await flush();
    expect(h.handles).toHaveLength(1);
    expect(h.handles[0]!.disposed).toBe(true);
    expect((await dispatchTool("run_workflow", { action: "list" }, ctx)).content[0]!.text).toBe(
      "[]",
    );
  });

  it.each([
    { action: null },
    { tasks: [{ id: "a", prompt: "go" }] },
    { tasks: [{ id: "a", prompt: "go", write_scope: [], result_mode: "wrong" }] },
    { tasks: [{ id: "a", prompt: "go", write_scope: [], depends_on: ["missing"] }] },
    {
      tasks: [
        { id: "a", prompt: "go", write_scope: [] },
        { id: "b", prompt: "go", model: "unavailable", write_scope: [] },
      ],
    },
  ])("rejects invalid workflow input before any child starts: %j", async (args) => {
    const h = makeHarness();
    expect((await dispatchTool("run_workflow", args, context(h))).isError).toBe(true);
    await flush();
    expect(h.handles).toHaveLength(0);
  });
});
