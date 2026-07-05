import { describe, expect, it } from "vitest";
import type { AgentKind, AgentStatus } from "@/shared/contracts";
import type { AgentAdapter } from "@/supervisor/agents/base";
import type { OrchestratorThreadManager } from "./OrchestratorThreadManager";
import type { SubagentRunManager } from "./SubagentRunManager";
import { buildSpawnableAgents, classifyModelTier, dispatchTool, TOOLS } from "./toolRegistry";
import type { SubagentToolContext } from "./toolRegistry";

describe("classifyModelTier", () => {
  it.each([
    ["claude-haiku-4", "Haiku 4", "fast-cheap"],
    ["gpt-5-mini", "GPT-5 Mini", "fast-cheap"],
    ["gemini-flash", "Gemini Flash", "fast-cheap"],
    ["gpt-5-nano", "GPT-5 Nano", "fast-cheap"],
    ["codex-lite", "Codex Lite", "fast-cheap"],
    ["some-small-model", "Small Model", "fast-cheap"],
    ["codex-spark-5.3", "Spark 5.3", "fast-cheap"],
    ["model-fast", "Fast Mode", "fast-cheap"],
    ["claude-opus-4", "Opus 4.8", "max-capability"],
    ["fable-5", "Fable 5", "max-capability"],
    ["gemini-pro", "Gemini Pro", "max-capability"],
    ["gpt-5-max", "GPT-5 Max", "max-capability"],
    ["model-ultra", "Ultra", "max-capability"],
    ["big-model", "Big Model", "max-capability"],
    ["claude-sonnet-4.5", "Sonnet 4.5", "balanced"],
    ["gpt-5.5", "GPT-5.5", "balanced"],
  ])("classifies %s / %s as %s", (id, label, expected) => {
    expect(classifyModelTier(id, label)).toBe(expected);
  });

  it("matches keywords case-insensitively", () => {
    expect(classifyModelTier("HAIKU-4", "MODEL")).toBe("fast-cheap");
    expect(classifyModelTier("model", "OPUS 4.8")).toBe("max-capability");
  });
});

function makeStatus(overrides: Partial<AgentStatus> = {}): AgentStatus {
  return {
    kind: "claude" as AgentKind,
    label: "Claude",
    installed: true,
    authState: "authenticated",
    capabilities: {
      models: [
        { id: "claude-haiku-4", label: "Haiku 4" },
        { id: "claude-sonnet-4.5", label: "Sonnet 4.5" },
        { id: "claude-opus-4", label: "Opus 4.8" },
      ],
      efforts: [],
      modelEfforts: {},
      modes: [],
      approvalPolicies: [],
      sandboxModes: [],
      supportsResume: false,
      supportsDirectInput: true,
    },
    ...overrides,
  } as unknown as AgentStatus;
}

describe("buildSpawnableAgents", () => {
  it("attaches a tier to each model", () => {
    const adapters = new Map<AgentKind, AgentAdapter>([
      [
        "claude" as AgentKind,
        { createStructuredSession: async () => ({}) } as unknown as AgentAdapter,
      ],
    ]);
    const [agent] = buildSpawnableAgents(adapters, [makeStatus()]);
    expect(agent?.models).toEqual([
      { value: "claude-haiku-4", label: "Haiku 4", tier: "fast-cheap" },
      { value: "claude-sonnet-4.5", label: "Sonnet 4.5", tier: "balanced" },
      { value: "claude-opus-4", label: "Opus 4.8", tier: "max-capability" },
    ]);
  });

  it("marks structured-runtime agents with execution: structured", () => {
    const adapters = new Map<AgentKind, AgentAdapter>([
      [
        "claude" as AgentKind,
        { createStructuredSession: async () => ({}) } as unknown as AgentAdapter,
      ],
    ]);
    const [agent] = buildSpawnableAgents(adapters, [makeStatus()]);
    expect(agent?.execution).toBe("structured");
  });

  it("includes CLI-only agents via buildSubagentOneShotCommand, marked one-shot", () => {
    const adapters = new Map<AgentKind, AgentAdapter>([
      [
        "claude" as AgentKind,
        {
          buildSubagentOneShotCommand: () => ({ command: "x", args: [] }),
        } as unknown as AgentAdapter,
      ],
    ]);
    const [agent] = buildSpawnableAgents(adapters, [makeStatus()]);
    expect(agent?.execution).toBe("one-shot");
  });

  it("excludes agents that support neither a structured session nor a one-shot child", () => {
    const adapters = new Map<AgentKind, AgentAdapter>([
      ["claude" as AgentKind, {} as unknown as AgentAdapter],
    ]);
    expect(buildSpawnableAgents(adapters, [makeStatus()])).toEqual([]);
  });
});

const ORCHESTRATOR_TOOL_NAMES = [
  "create_thread",
  "list_threads",
  "get_thread",
  "read_thread",
  "send_to_thread",
  "wait_for_thread",
  "interrupt_thread",
  "close_thread",
] as const;

function makeToolContext(orchestrator: Partial<OrchestratorThreadManager>): {
  ctx: SubagentToolContext;
} {
  return {
    ctx: {
      parentThreadId: "parent-1",
      runManager: {} as unknown as SubagentRunManager,
      orchestrator: orchestrator as unknown as OrchestratorThreadManager,
      listSpawnableAgents: async () => [],
    },
  };
}

function resultText(result: { content: Array<{ text: string }> }): string {
  return result.content[0]?.text ?? "";
}

describe("orchestrator tool registration", () => {
  it("registers all orchestrator tools alongside the existing run tools", () => {
    const names = new Set(TOOLS.map((tool) => tool.name));
    for (const name of ORCHESTRATOR_TOOL_NAMES) expect(names.has(name)).toBe(true);
    for (const name of [
      "list_agents",
      "spawn_agent",
      "wait_for_agent",
      "run_agent",
      "get_status",
      "cancel",
    ]) {
      expect(names.has(name)).toBe(true);
    }
  });

  it("declares required fields on the new tool schemas", () => {
    const byName = new Map(TOOLS.map((tool) => [tool.name, tool]));
    expect(byName.get("create_thread")!.inputSchema).toMatchObject({
      required: ["agent", "prompt"],
    });
    expect(byName.get("get_thread")!.inputSchema).toMatchObject({ required: ["thread_id"] });
    expect(byName.get("read_thread")!.inputSchema).toMatchObject({ required: ["thread_id"] });
    expect(byName.get("send_to_thread")!.inputSchema).toMatchObject({
      required: ["thread_id", "message"],
    });
    expect(byName.get("wait_for_thread")!.inputSchema).toMatchObject({
      required: ["thread_ids"],
    });
    expect(byName.get("interrupt_thread")!.inputSchema).toMatchObject({
      required: ["thread_id"],
    });
  });
});

describe("orchestrator tool dispatch", () => {
  it("routes create_thread to the manager and returns snake_case fields", async () => {
    const calls: Array<{ parent: string; request: unknown }> = [];
    const { ctx } = makeToolContext({
      createThread: async (parent: string, request: unknown) => {
        calls.push({ parent, request });
        return {
          threadId: "child-1",
          title: "Ticket",
          worktreePath: "/tmp/wt/x",
          branch: "lightcode/x",
        };
      },
    } as Partial<OrchestratorThreadManager>);
    const result = await dispatchTool(
      "create_thread",
      { agent: "codex", prompt: "do it", worktree: true },
      ctx,
    );
    expect(result.isError).toBeUndefined();
    expect(JSON.parse(resultText(result))).toEqual({
      thread_id: "child-1",
      title: "Ticket",
      worktree_path: "/tmp/wt/x",
      branch: "lightcode/x",
    });
    expect(calls).toEqual([
      { parent: "parent-1", request: { agent: "codex", prompt: "do it", worktree: true } },
    ]);
  });

  it("returns tool errors (not throws) for missing required arguments", async () => {
    const { ctx } = makeToolContext({});
    for (const [name, args] of [
      ["create_thread", { prompt: "x" }],
      ["create_thread", { agent: "codex" }],
      ["get_thread", {}],
      ["read_thread", {}],
      ["send_to_thread", { thread_id: "t" }],
      ["interrupt_thread", {}],
    ] as const) {
      const result = await dispatchTool(name, args as Record<string, unknown>, ctx);
      expect(result.isError).toBe(true);
    }
  });

  it("maps wait_for_thread args (id filtering + timeout clamp) onto the manager", async () => {
    const calls: Array<{ ids: string[]; timeoutMs: number }> = [];
    const { ctx } = makeToolContext({
      waitForThreads: async (_parent: string, ids: string[], timeoutMs: number) => {
        calls.push({ ids, timeoutMs });
        return {
          statuses: { a: { status: "idle" as const, attention: "none" as const } },
          settled: ["a"],
          timedOut: false,
        };
      },
    } as Partial<OrchestratorThreadManager>);
    const result = await dispatchTool(
      "wait_for_thread",
      { thread_ids: ["a", 42, "", "b"], timeout_s: 9_999 },
      ctx,
    );
    expect(JSON.parse(resultText(result))).toEqual({
      statuses: { a: { status: "idle", attention: "none" } },
      settled: ["a"],
      timed_out: false,
    });
    expect(calls).toEqual([{ ids: ["a", "b"], timeoutMs: 240_000 }]);
  });

  it("surfaces manager errors as MCP tool errors", async () => {
    const { ctx } = makeToolContext({
      getThread: () => {
        throw new Error("Unknown thread_id: nope");
      },
    } as Partial<OrchestratorThreadManager>);
    const result = await dispatchTool("get_thread", { thread_id: "nope" }, ctx);
    expect(result.isError).toBe(true);
    expect(resultText(result)).toContain("Unknown thread_id");
  });

  it("routes send_to_thread and interrupt_thread with the caller's parent id", async () => {
    const sends: unknown[] = [];
    const interrupts: unknown[] = [];
    const { ctx } = makeToolContext({
      sendToThread: async (...args: unknown[]) => {
        sends.push(args);
        return { delivery: "steered" as const };
      },
      interruptThread: async (...args: unknown[]) => {
        interrupts.push(args);
      },
    } as Partial<OrchestratorThreadManager>);
    const sendResult = await dispatchTool(
      "send_to_thread",
      { thread_id: "child-1", message: "hi", interrupt: true },
      ctx,
    );
    expect(JSON.parse(resultText(sendResult))).toEqual({ ok: true, delivery: "steered" });
    expect(sends).toEqual([["parent-1", "child-1", "hi", true]]);

    const interruptResult = await dispatchTool("interrupt_thread", { thread_id: "child-1" }, ctx);
    expect(JSON.parse(resultText(interruptResult))).toEqual({ ok: true });
    expect(interrupts).toEqual([["parent-1", "child-1"]]);
  });

  it("routes close_thread with the caller's parent id", async () => {
    const closes: unknown[] = [];
    const { ctx } = makeToolContext({
      closeThread: async (...args: unknown[]) => {
        closes.push(args);
      },
    } as Partial<OrchestratorThreadManager>);
    const result = await dispatchTool("close_thread", { thread_id: "child-1" }, ctx);
    expect(JSON.parse(resultText(result))).toEqual({ ok: true });
    expect(closes).toEqual([["parent-1", "child-1"]]);
  });
});
