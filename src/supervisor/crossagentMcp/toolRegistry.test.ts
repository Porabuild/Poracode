import { describe, expect, it } from "vitest";
import type { AgentKind, AgentStatus } from "@/shared/contracts";
import type { AgentAdapter } from "@/supervisor/agents/base";
import type { SubagentRunManager } from "./SubagentRunManager";
import { buildSpawnableAgents, classifyModelTier, dispatchTool, TOOLS } from "./toolRegistry";
import type { SubagentToolContext } from "./toolRegistry";
import type { SpawnableAgent } from "./types";

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
      {
        value: "claude-haiku-4",
        label: "Haiku 4",
        tier: "fast-cheap",
        reasoning: { values: [] },
      },
      {
        value: "claude-sonnet-4.5",
        label: "Sonnet 4.5",
        tier: "balanced",
        reasoning: { values: [] },
      },
      {
        value: "claude-opus-4",
        label: "Opus 4.8",
        tier: "max-capability",
        reasoning: { values: [] },
      },
    ]);
    expect(agent?.provider).toEqual({ value: "claude", label: "Claude" });
    expect(agent?.reasoningOptions).toEqual([]);
    expect(agent?.permissions).toEqual({
      options: [{ value: "full-access", label: "Full access" }],
      default: "full-access",
    });
  });

  it("nests composer reasoning and Fast data under each model", () => {
    const adapters = new Map<AgentKind, AgentAdapter>([
      [
        "claude" as AgentKind,
        { createStructuredSession: async () => ({}) } as unknown as AgentAdapter,
      ],
    ]);
    const status = makeStatus();
    status.capabilities.modelEfforts = { "claude-opus-4": ["low", "high", "xhigh"] };
    status.capabilities.defaultEffort = "high";
    status.capabilities.fastModels = ["claude-opus-4"];
    const [provider] = buildSpawnableAgents(adapters, [status]);
    expect(provider?.models[2]).toMatchObject({
      reasoning: {
        values: ["low", "high", "xhigh"],
        default: "high",
      },
      fast: { available: true },
    });
    expect(provider?.reasoningOptions).toEqual([
      { value: "low", label: "Low" },
      { value: "high", label: "High" },
      { value: "xhigh", label: "Extra High" },
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

function makeToolContext(): {
  ctx: SubagentToolContext;
} {
  return {
    ctx: {
      parentThreadId: "parent-1",
      runManager: {} as unknown as SubagentRunManager,
      listSpawnableAgents: async () => [],
    },
  };
}

function resultText(result: { content: Array<{ text: string }> }): string {
  return result.content[0]?.text ?? "";
}

describe("provider discovery", () => {
  const provider: SpawnableAgent = {
    provider: { value: "codex", label: "Codex" },
    models: [
      {
        value: "gpt-5.5",
        label: "GPT-5.5",
        reasoning: { values: ["high"], default: "high" },
      },
    ],
    reasoningOptions: [{ value: "high", label: "High" }],
    defaultModel: "gpt-5.5",
    permissions: {
      options: [{ value: "full-access", label: "Full access" }],
      default: "full-access",
    },
    execution: "structured",
  };

  it("lists compact summaries and resolves full options by id", async () => {
    const { ctx } = makeToolContext();
    ctx.listSpawnableAgents = async () => [provider];

    const listed = await dispatchTool("list_agents", {}, ctx);
    expect(JSON.parse(resultText(listed))).toEqual([
      {
        id: "codex",
        label: "Codex",
        execution: "structured",
        defaultModel: "gpt-5.5",
        modelCount: 1,
      },
    ]);

    const detail = await dispatchTool("get_agent", { id: "codex" }, ctx);
    expect(JSON.parse(resultText(detail))).toEqual(provider);
  });

  it("returns a tool error for an unknown provider id", async () => {
    const { ctx } = makeToolContext();
    ctx.listSpawnableAgents = async () => [provider];
    const result = await dispatchTool("get_agent", { id: "missing" }, ctx);
    expect(result.isError).toBe(true);
    expect(resultText(result)).toContain("Unknown provider id");
  });
});

describe("subagent tool registration", () => {
  it("registers the ephemeral subagent-run tools and no full-thread tools", () => {
    const names = new Set(TOOLS.map((tool) => tool.name));
    for (const name of [
      "list_agents",
      "get_agent",
      "spawn_agent",
      "wait_for_agent",
      "run_agent",
      "get_status",
      "cancel",
    ]) {
      expect(names.has(name)).toBe(true);
    }
    // Full-thread orchestration moved to the `poracode` (app-controls) MCP.
    for (const name of [
      "create_thread",
      "list_threads",
      "get_thread",
      "read_thread",
      "send_to_thread",
      "wait_for_thread",
      "interrupt_thread",
      "close_thread",
    ]) {
      expect(names.has(name)).toBe(false);
    }
  });

  it("declares required fields on the subagent tool schemas", () => {
    const byName = new Map(TOOLS.map((tool) => [tool.name, tool]));
    expect(byName.get("spawn_agent")!.inputSchema).toMatchObject({
      required: ["provider", "prompt"],
    });
    expect(byName.get("run_agent")!.inputSchema).toMatchObject({
      required: ["provider", "prompt"],
    });
    expect(byName.get("get_agent")!.inputSchema).toMatchObject({ required: ["id"] });
    expect(byName.get("wait_for_agent")!.inputSchema).toMatchObject({ required: ["run_id"] });
    expect(byName.get("get_status")!.inputSchema).toMatchObject({ required: ["run_id"] });
    expect(byName.get("cancel")!.inputSchema).toMatchObject({ required: ["run_id"] });
  });

  it("returns an isError result (not a throw) for removed full-thread tools", async () => {
    const { ctx } = makeToolContext();
    const result = await dispatchTool("create_thread", { prompt: "x" }, ctx);
    expect(result.isError).toBe(true);
    expect(resultText(result)).toContain("Unknown tool");
  });
});
