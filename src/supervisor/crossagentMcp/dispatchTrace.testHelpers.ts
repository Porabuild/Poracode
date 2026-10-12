import { expect } from "vitest";
import type { AgentKind, ThreadConfig } from "@/shared/contracts";
import type { AgentAdapter } from "@/supervisor/agents/base";
import type { CrossagentRankSource } from "@/shared/crossagentRanking";
import type { CrossagentRoutingOverride } from "@/shared/settings";
import { SubagentRunManager } from "./SubagentRunManager";
import type { SubagentToolContext } from "./toolRegistry";
import { resolveSelectionArgs } from "./toolSpawn";
import { parseSpawnRequest } from "./toolRequests";
import { FakeHandle } from "./testHarness";
import type { McpToolResult, SpawnableAgent, SpawnAgentRequest, SubagentWaitResult } from "./types";

export const PARENT = "trace-parent";
export const SECRET = "PRIVATE_SENTINEL_DO_NOT_EXPOSE";

export function provider(
  id = "fixture-primary",
  source: CrossagentRankSource = "built-in",
  route?: CrossagentRoutingOverride,
): SpawnableAgent {
  return {
    provider: { value: id, label: id },
    models: [
      {
        value: "fixture-model",
        label: "Fixture",
        reasoning: { values: ["high"], default: "high" },
        fast: { available: true },
      },
    ],
    reasoningOptions: [{ value: "high", label: "High" }],
    defaultModel: "fixture-model",
    execution: "structured",
    permissions: {
      options: [{ value: "full-access", label: "Full access" }],
      default: "full-access",
    },
    preference: {
      rank: 1,
      source,
      usageCount: 0,
      model: "fixture-model",
      fast: false,
      matchedTags: route?.tags ?? ["review"],
      ...(route ? { override: route } : {}),
    },
  };
}

export function savedRoute(): CrossagentRoutingOverride {
  return {
    tags: ["review"],
    agentKind: "fixture-primary",
    fallbacks: [{ agentKind: "fixture-fallback" }],
    retryMode: "any-failure",
    updatedAt: 1,
  };
}

export function requestFor(
  args: Record<string, unknown>,
  roster: SpawnableAgent[] = [provider()],
): SpawnAgentRequest {
  const resolved = resolveSelectionArgs(args, roster);
  return parseSpawnRequest(
    resolved.args,
    resolved.inheritedFallbacks,
    resolved.inheritedRetryMode,
    resolved.provenance,
  );
}

export function harness(options: { failStartup?: boolean; resume?: boolean } = {}) {
  const handles: Array<{ provider: string; handle: FakeHandle }> = [];
  const adapters = new Map<AgentKind, AgentAdapter>();
  for (const id of ["fixture-primary", "fixture-fallback"]) {
    const adapter: AgentAdapter = {
      kind: id as AgentKind,
      label: id,
      binary: "unused-fixture",
      detectInstall: async () => ({
        kind: id as AgentKind,
        label: id,
        installed: true,
        authState: "authenticated",
        capabilities: adapter.capabilities,
      }),
      capabilities: {
        models: [{ id: "fixture-model", label: "Fixture" }],
        efforts: ["high"],
        fastModels: ["fixture-model"],
        modelEfforts: {},
        modes: [],
        approvalPolicies: [],
        sandboxModes: [],
        supportsResume: options.resume === true,
        supportsDirectInput: false,
        liveInputMode: "server",
        presentationMode: "gui",
        settingDefs: [],
      },
      buildLaunchArgv: () => ({ binary: "unused-fixture", args: [] }),
      buildResumeArgv: () => ({ binary: "unused-fixture", args: [] }),
      createInitialSessionRef: () => undefined,
      createStructuredSession: async () => {
        if (id === "fixture-primary" && options.failStartup) throw new Error(SECRET);
        const handle = new FakeHandle();
        if (options.resume) handle.openThread = async () => "fixture-session";
        handles.push({ provider: id, handle });
        return handle;
      },
    };
    adapters.set(id as AgentKind, adapter);
  }
  const parent = {
    projectLocation: { kind: "posix" as const, path: "/tmp/trace-fixture" },
    config: { model: "parent" } as ThreadConfig,
  };
  const manager = new SubagentRunManager({
    adapters,
    host: { getParentContext: () => parent, appendRuntimeEvent: () => {} },
  });
  const roster = [provider(), provider("fixture-fallback")];
  const ctx: SubagentToolContext = {
    parentThreadId: PARENT,
    runManager: manager,
    listSpawnableAgents: async () => roster,
  };
  return { adapters, parent, manager, handles, roster, ctx };
}

export function json<T = SubagentWaitResult & { run_id: string }>(result: McpToolResult): T {
  expect(result.isError).not.toBe(true);
  return JSON.parse(result.content[0]!.text) as T;
}
