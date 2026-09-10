import { describe, expect, it, vi } from "vitest";
import type { AgentCapability, AgentKind } from "@/shared/contracts";
import type { AgentAdapter } from "@/supervisor/agents/base";
import {
  visibleCrossagentCapabilitiesForAdapter,
  type CrossagentVisibilitySettings,
} from "./availability";
import { dispatchTool } from "./toolRegistry";
import type { SubagentToolContext } from "./toolRegistry";
import { SubagentRunManager, SubagentSpawnError } from "./SubagentRunManager";
import { normalizeSharedSettings, type CrossagentRoutingOverride } from "@/shared/settings";
import type { SpawnableAgent } from "./types";

function makeProvider(
  id: string,
  model: string,
  override?: CrossagentRoutingOverride,
): SpawnableAgent {
  return {
    provider: { value: id, label: id },
    models: [
      {
        value: model,
        label: model,
        reasoning: { values: ["high"], default: "high" },
        fast: { available: true },
      },
    ],
    reasoningOptions: [{ value: "high", label: "High" }],
    defaultModel: model,
    permissions: {
      options: [{ value: "full-access", label: "Full access" }],
      default: "full-access",
    },
    execution: "structured",
    preference: {
      rank: 1,
      source: override ? "manual-override" : "built-in",
      usageCount: 0,
      model,
      reasoning: "high",
      fast: override?.fast ?? false,
      matchedTags: override ? override.tags : [],
      learnedTags: [],
      ...(override ? { override } : {}),
    },
  };
}

function makeCtx(override: CrossagentRoutingOverride): {
  ctx: SubagentToolContext;
  saved: CrossagentRoutingOverride[];
  spawned: unknown[];
} {
  const saved: CrossagentRoutingOverride[] = [];
  const spawned: unknown[] = [];
  const ctx: SubagentToolContext = {
    parentThreadId: "parent-1",
    runManager: {
      spawn: (_parentThreadId: string, request: unknown) => {
        spawned.push(request);
        return { runId: "run-1" };
      },
      waitFor: async () => ({ status: "completed" as const, output: "done" }),
    } as unknown as SubagentRunManager,
    listSpawnableAgents: async () => [
      makeProvider("codex", "gpt-5.5", override),
      makeProvider("claude", "sonnet"),
    ],
    listRoutingOverrides: () => saved,
    setRoutingOverride: (entry) => {
      saved.length = 0;
      saved.push(entry);
    },
    removeRoutingOverride: () => {},
  };
  return { ctx, saved, spawned };
}

function capabilities(model: string | readonly string[]): AgentCapability {
  const models = typeof model === "string" ? [model] : [...model];
  return {
    models: models.map((id) => ({ id, label: id })),
    efforts: ["high"],
    modelEfforts: Object.fromEntries(models.map((id) => [id, ["high"]])),
    modes: [],
    approvalPolicies: [{ id: "never", label: "Full access" }],
    sandboxModes: [{ id: "danger-full-access", label: "Full access" }],
    defaultApprovalPolicy: "never",
    defaultSandboxMode: "danger-full-access",
    supportsResume: false,
    supportsDirectInput: true,
    liveInputMode: "terminal",
    presentationMode: "terminal",
    settingDefs: [],
  };
}

function makeValidatedCtx(
  overrides: Readonly<Record<string, CrossagentRoutingOverride>>,
  statusCapabilities: Readonly<Partial<Record<AgentKind, AgentCapability | null>>>,
  visibility: CrossagentVisibilitySettings = { disabledAgents: [], hiddenModels: {} },
): {
  ctx: SubagentToolContext;
  createStructuredSession: ReturnType<typeof vi.fn>;
  manager: SubagentRunManager;
} {
  const createStructuredSession = vi.fn<NonNullable<AgentAdapter["createStructuredSession"]>>();
  const adapters = new Map<AgentKind, AgentAdapter>(
    (["codex", "claude"] as const).map((kind) => [
      kind,
      {
        kind,
        label: kind,
        capabilities: capabilities(kind === "codex" ? "gpt-5.5" : "sonnet"),
        createStructuredSession,
      } as unknown as AgentAdapter,
    ]),
  );
  const manager = new SubagentRunManager({
    adapters,
    host: {
      getParentContext: (threadId) =>
        threadId === "parent-1"
          ? {
              projectLocation: { kind: "posix", path: "/tmp/project" },
              config: { model: "parent-model" },
            }
          : undefined,
      appendRuntimeEvent: () => {},
    },
    getStatusCapabilities: (kind) => {
      const adapter = adapters.get(kind);
      if (!adapter) return null;
      const cached = statusCapabilities[kind];
      if (cached === null) return null;
      return visibleCrossagentCapabilitiesForAdapter(adapter, cached, visibility);
    },
  });
  const ctx: SubagentToolContext = {
    parentThreadId: "parent-1",
    runManager: manager,
    listSpawnableAgents: async (tags) => {
      const override = overrides[(tags ?? []).join(",")];
      return [makeProvider("codex", "gpt-5.5", override), makeProvider("claude", "sonnet")];
    },
  };
  return { ctx, createStructuredSession, manager };
}

function resultText(result: Awaited<ReturnType<typeof dispatchTool>>): string {
  return result.content[0]?.text ?? "";
}

describe("persistent fallback chain routing", () => {
  it("inherits the saved fallback chain when the primary is from the manual route", async () => {
    const override: CrossagentRoutingOverride = {
      tags: ["backend"],
      agentKind: "codex",
      modelId: "gpt-5.5",
      effort: "high",
      fallbacks: [
        { agentKind: "claude", modelId: "sonnet" },
        { agentKind: "kimi", modelId: "k1.5" },
      ],
      retryMode: "any-failure",
      updatedAt: 1,
    };
    const { ctx, spawned } = makeCtx(override);
    await dispatchTool("spawn_agent", { tags: ["backend"], prompt: "do it" }, ctx);
    expect(spawned[0]).toMatchObject({
      agent: "codex",
      model: "gpt-5.5",
      effort: "high",
      retryMode: "any-failure",
      fallbacks: [
        { agent: "claude", model: "sonnet" },
        { agent: "kimi", model: "k1.5" },
      ],
    });
  });

  it("replaces the saved chain when the call explicitly supplies fallbacks", async () => {
    const override: CrossagentRoutingOverride = {
      tags: ["backend"],
      agentKind: "codex",
      modelId: "gpt-5.5",
      fallbacks: [{ agentKind: "claude", modelId: "sonnet" }],
      updatedAt: 1,
    };
    const { ctx, spawned } = makeCtx(override);
    await dispatchTool(
      "spawn_agent",
      {
        tags: ["backend"],
        prompt: "do it",
        fallbacks: [{ provider: "kimi" }],
      },
      ctx,
    );
    expect(spawned[0]).toMatchObject({
      agent: "codex",
      fallbacks: [{ agent: "kimi" }],
    });
    expect((spawned[0] as { retryMode?: unknown }).retryMode).toBeUndefined();
  });

  it("disables saved fallbacks when the call passes fallbacks: []", async () => {
    const override: CrossagentRoutingOverride = {
      tags: ["backend"],
      agentKind: "codex",
      modelId: "gpt-5.5",
      fallbacks: [{ agentKind: "claude" }],
      retryMode: "any-failure",
      updatedAt: 1,
    };
    const { ctx, spawned } = makeCtx(override);
    await dispatchTool(
      "spawn_agent",
      {
        tags: ["backend"],
        prompt: "do it",
        fallbacks: [],
      },
      ctx,
    );
    const request = spawned[0] as { fallbacks?: unknown[]; retryMode?: unknown };
    expect(request.fallbacks).toEqual([]);
    expect(request.retryMode).toBe(undefined);
  });

  it("retains the saved chain but overrides retry mode when only retry_on is supplied", async () => {
    const override: CrossagentRoutingOverride = {
      tags: ["backend"],
      agentKind: "codex",
      modelId: "gpt-5.5",
      fallbacks: [{ agentKind: "claude" }],
      retryMode: "any-failure",
      updatedAt: 1,
    };
    const { ctx, spawned } = makeCtx(override);
    await dispatchTool(
      "spawn_agent",
      {
        tags: ["backend"],
        prompt: "do it",
        retry_on: "startup",
      },
      ctx,
    );
    expect(spawned[0]).toMatchObject({
      agent: "codex",
      fallbacks: [{ agent: "claude" }],
      retryMode: "startup",
    });
  });

  it("uses an explicit fallback chain and explicit retry mode together", async () => {
    const override: CrossagentRoutingOverride = {
      tags: ["backend"],
      agentKind: "codex",
      fallbacks: [{ agentKind: "claude", modelId: "saved" }],
      retryMode: "startup",
      updatedAt: 1,
    };
    const { ctx, spawned } = makeCtx(override);

    await dispatchTool(
      "spawn_agent",
      {
        tags: ["backend"],
        prompt: "do it",
        fallbacks: [{ provider: "kimi", model: "explicit" }],
        retry_on: "any-failure",
      },
      ctx,
    );

    expect(spawned[0]).toMatchObject({
      fallbacks: [{ agent: "kimi", model: "explicit" }],
      retryMode: "any-failure",
    });
  });

  it("does not inherit when the primary is not from the manual route", async () => {
    const override: CrossagentRoutingOverride = {
      tags: ["backend"],
      agentKind: "codex",
      modelId: "gpt-5.5",
      fallbacks: [{ agentKind: "claude" }],
      updatedAt: 1,
    };
    const { ctx, spawned } = makeCtx(override);
    await dispatchTool(
      "spawn_agent",
      {
        tags: ["backend"],
        prompt: "do it",
        provider: "claude",
      },
      ctx,
    );
    const request = spawned[0] as { fallbacks?: unknown[] };
    expect(request.fallbacks).toBeUndefined();
  });

  it("inherits when an omitted saved fast field is compatible with explicit fast mode", async () => {
    const override: CrossagentRoutingOverride = {
      tags: ["backend"],
      agentKind: "codex",
      fallbacks: [{ agentKind: "claude" }],
      updatedAt: 1,
    };
    const { ctx, spawned } = makeCtx(override);

    await dispatchTool("spawn_agent", { tags: ["backend"], prompt: "do it fast", fast: true }, ctx);

    expect(spawned[0]).toMatchObject({
      agent: "codex",
      fast: true,
      fallbacks: [{ agent: "claude" }],
    });
  });

  it("does not inherit when an explicit fast field conflicts with the saved route", async () => {
    const override: CrossagentRoutingOverride = {
      tags: ["backend"],
      agentKind: "codex",
      fast: true,
      fallbacks: [{ agentKind: "claude" }],
      updatedAt: 1,
    };
    const { ctx, spawned } = makeCtx(override);

    await dispatchTool(
      "spawn_agent",
      { tags: ["backend"], prompt: "do it normally", fast: false },
      ctx,
    );

    expect((spawned[0] as { fallbacks?: unknown[] }).fallbacks).toBeUndefined();
  });

  it("round-trips fallbacks and retryMode through set_routing_preference and list_routing_preferences", async () => {
    const { ctx, saved } = makeCtx({
      tags: ["backend"],
      agentKind: "codex",
      updatedAt: 0,
    });
    await dispatchTool(
      "set_routing_preference",
      {
        tags: ["backend"],
        provider: "codex",
        model: "gpt-5.5",
        reasoning: "high",
        fallbacks: [
          { provider: "claude", model: "sonnet", reasoning: "high", fast: false },
          { provider: "kimi", model: "k1.5", fast: true },
        ],
        retry_on: "any-failure",
      },
      ctx,
    );
    expect(saved[0]).toMatchObject({
      tags: ["backend"],
      agentKind: "codex",
      modelId: "gpt-5.5",
      effort: "high",
      fallbacks: [
        {
          agentKind: "claude",
          modelId: "sonnet",
          effort: "high",
          fast: false,
        },
        { agentKind: "kimi", modelId: "k1.5", fast: true },
      ],
      retryMode: "any-failure",
    });
    const listed = await dispatchTool("list_routing_preferences", {}, ctx);
    expect(JSON.parse(resultText(listed))).toEqual(saved);
  });

  it("rejects an oversized nested fallback and preserves existing routes", async () => {
    const existing: CrossagentRoutingOverride = {
      tags: ["backend"],
      agentKind: "codex",
      modelId: "gpt-5.5",
      updatedAt: 1,
    };
    const { ctx, saved } = makeCtx(existing);
    saved.push(existing);

    const result = await dispatchTool(
      "set_routing_preference",
      {
        tags: ["review"],
        provider: "claude",
        model: "sonnet",
        fallbacks: [{ provider: "claude", reasoning: "x".repeat(257) }],
      },
      ctx,
    );

    expect(result.isError).toBe(true);
    expect(saved).toEqual([existing]);
    const normalized = normalizeSharedSettings({ crossagentRoutingOverrides: saved });
    expect(normalized.crossagentRoutingOverrides).toEqual([existing]);
  });

  it("rejects an invalid inherited fallback before starting the child", async () => {
    const override: CrossagentRoutingOverride = {
      tags: ["invalid"],
      agentKind: "codex",
      fallbacks: [{ agentKind: "claude", modelId: "sonnet" }, { agentKind: "missing-provider" }],
      updatedAt: 1,
    };
    const { ctx, createStructuredSession } = makeValidatedCtx(
      { invalid: override },
      { codex: capabilities("gpt-5.5"), claude: capabilities("sonnet") },
    );

    const result = await dispatchTool(
      "spawn_agent",
      { tags: ["invalid"], prompt: "do not start" },
      ctx,
    );

    expect(result.isError).toBe(true);
    expect(resultText(result)).toContain("fallbacks[1]: Unknown provider: missing-provider");
    expect(createStructuredSession).not.toHaveBeenCalled();
  });

  it("rejects an inherited fallback whose provider is paused or disabled", async () => {
    const override: CrossagentRoutingOverride = {
      tags: ["paused"],
      agentKind: "codex",
      fallbacks: [{ agentKind: "claude", modelId: "sonnet" }],
      updatedAt: 1,
    };
    const { ctx, createStructuredSession } = makeValidatedCtx(
      { paused: override },
      { codex: capabilities("gpt-5.5"), claude: capabilities("sonnet") },
      {
        disabledAgents: [],
        hiddenModels: {},
        crossagentPausedProviders: ["claude"],
      },
    );

    const result = await dispatchTool(
      "spawn_agent",
      { tags: ["paused"], prompt: "do not start" },
      ctx,
    );

    expect(result.isError).toBe(true);
    expect(resultText(result)).toContain("fallbacks[0]: Provider claude is disabled in settings");
    expect(createStructuredSession).not.toHaveBeenCalled();
  });

  it("rejects an inherited fallback model removed by the filtered capability surface", async () => {
    const override: CrossagentRoutingOverride = {
      tags: ["filtered"],
      agentKind: "codex",
      fallbacks: [{ agentKind: "claude", modelId: "hidden-sonnet" }],
      updatedAt: 1,
    };
    const { ctx, createStructuredSession } = makeValidatedCtx(
      { filtered: override },
      {
        codex: capabilities("gpt-5.5"),
        claude: capabilities(["sonnet", "hidden-sonnet"]),
      },
      {
        disabledAgents: [],
        hiddenModels: {},
        crossagentHiddenModels: { claude: ["hidden-sonnet"] },
      },
    );

    const result = await dispatchTool(
      "spawn_agent",
      { tags: ["filtered"], prompt: "do not start" },
      ctx,
    );

    expect(result.isError).toBe(true);
    expect(resultText(result)).toContain("fallbacks[0]: Unknown model: hidden-sonnet");
    expect(createStructuredSession).not.toHaveBeenCalled();
  });

  it("keeps a batch atomic when one inherited fallback is invalid", async () => {
    const validOverride: CrossagentRoutingOverride = {
      tags: ["valid"],
      agentKind: "codex",
      fallbacks: [{ agentKind: "claude", modelId: "sonnet" }],
      updatedAt: 1,
    };
    const invalidOverride: CrossagentRoutingOverride = {
      tags: ["invalid"],
      agentKind: "codex",
      fallbacks: [{ agentKind: "claude", modelId: "hidden-sonnet" }],
      updatedAt: 2,
    };
    const { ctx, createStructuredSession, manager } = makeValidatedCtx(
      { valid: validOverride, invalid: invalidOverride },
      { codex: capabilities("gpt-5.5"), claude: capabilities("sonnet") },
    );

    const result = await dispatchTool(
      "spawn_agent",
      {
        background: true,
        tasks: [
          { tags: ["valid"], prompt: "valid child" },
          { tags: ["invalid"], prompt: "invalid child" },
        ],
      },
      ctx,
    );

    expect(result.isError).toBe(true);
    expect(resultText(result)).toContain("fallbacks[0]: Unknown model: hidden-sonnet");
    expect(createStructuredSession).not.toHaveBeenCalled();
    expect(manager.listRuns("parent-1")).toHaveLength(0);
  });

  it("keeps existing primary validation error text unchanged", () => {
    const { manager } = makeValidatedCtx(
      {},
      { codex: capabilities("gpt-5.5"), claude: capabilities("sonnet") },
    );

    expect(() =>
      manager.spawn("parent-1", {
        agent: "codex",
        model: "missing-model",
        prompt: "do not start",
      }),
    ).toThrowError(new SubagentSpawnError("Unknown model: missing-model"));
  });
});
