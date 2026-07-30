import { MAX_CONCURRENT_CHILDREN_PER_PARENT } from "./SubagentRunManager";
import { SubagentSpawnError } from "./errors";
import type { SpawnAgentRequest } from "./types";

export function parseSpawnRequest(args: Record<string, unknown>): SpawnAgentRequest {
  const agent = typeof args.provider === "string" ? args.provider : "";
  const prompt = typeof args.prompt === "string" ? args.prompt : "";
  if (!agent) throw new SubagentSpawnError("provider is required");
  if (!prompt.trim()) throw new SubagentSpawnError("prompt is required");
  if (args.permissions !== undefined && args.permissions !== "full-access") {
    throw new SubagentSpawnError("permissions must be full-access for subagents");
  }
  if (
    args.retry_on !== undefined &&
    args.retry_on !== "startup" &&
    args.retry_on !== "any-failure"
  ) {
    throw new SubagentSpawnError("retry_on must be startup or any-failure");
  }

  let fallbacks: SpawnAgentRequest["fallbacks"];
  if (args.fallbacks !== undefined) {
    if (!Array.isArray(args.fallbacks)) {
      throw new SubagentSpawnError("fallbacks must be an array");
    }
    if (args.fallbacks.length > 3) {
      throw new SubagentSpawnError("fallbacks supports at most 3 alternate selections");
    }
    fallbacks = args.fallbacks.map((value, index) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new SubagentSpawnError(`fallbacks[${index}] must be an object`);
      }
      const fallback = value as Record<string, unknown>;
      const fallbackAgent = typeof fallback.provider === "string" ? fallback.provider : "";
      if (!fallbackAgent) {
        throw new SubagentSpawnError(`fallbacks[${index}].provider is required`);
      }
      if (fallback.permissions !== undefined && fallback.permissions !== "full-access") {
        throw new SubagentSpawnError(
          `fallbacks[${index}].permissions must be full-access for subagents`,
        );
      }
      return {
        agent: fallbackAgent,
        ...(typeof fallback.model === "string" ? { model: fallback.model } : {}),
        ...(typeof fallback.reasoning === "string" ? { effort: fallback.reasoning } : {}),
        ...(fallback.fast === true ? { fast: true } : {}),
      };
    });
  }

  return {
    agent,
    prompt,
    ...(typeof args.model === "string" ? { model: args.model } : {}),
    ...(typeof args.reasoning === "string" ? { effort: args.reasoning } : {}),
    ...(args.fast === true ? { fast: true } : {}),
    ...(typeof args.name === "string" ? { name: args.name } : {}),
    ...(args.background === true ? { background: true } : {}),
    ...(fallbacks ? { fallbacks } : {}),
    ...(args.retry_on === "any-failure" ? { retryMode: "any-failure" as const } : {}),
  };
}

export function parseSpawnRequests(args: Record<string, unknown>): SpawnAgentRequest[] {
  if (!Array.isArray(args.tasks) || args.tasks.length === 0) {
    throw new SubagentSpawnError("tasks must be a non-empty array");
  }
  if (args.tasks.length > MAX_CONCURRENT_CHILDREN_PER_PARENT) {
    throw new SubagentSpawnError(
      `tasks supports at most ${MAX_CONCURRENT_CHILDREN_PER_PARENT} parallel runs`,
    );
  }
  return args.tasks.map((task, index) => {
    if (!task || typeof task !== "object" || Array.isArray(task)) {
      throw new SubagentSpawnError(`tasks[${index}] must be an object`);
    }
    return parseSpawnRequest(task as Record<string, unknown>);
  });
}

export function parseRunIds(args: Record<string, unknown>): string[] {
  if (!Array.isArray(args.run_ids) || args.run_ids.length === 0) {
    throw new SubagentSpawnError("run_ids must be a non-empty array");
  }
  if (args.run_ids.length > MAX_CONCURRENT_CHILDREN_PER_PARENT) {
    throw new SubagentSpawnError(
      `run_ids supports at most ${MAX_CONCURRENT_CHILDREN_PER_PARENT} runs`,
    );
  }
  return args.run_ids.map((runId, index) => {
    if (typeof runId !== "string" || !runId) {
      throw new SubagentSpawnError(`run_ids[${index}] must be a non-empty string`);
    }
    return runId;
  });
}
