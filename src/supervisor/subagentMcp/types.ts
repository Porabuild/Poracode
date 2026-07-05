import type { ProjectLocation, RuntimeEvent, ThreadConfig } from "@/shared/contracts";

/** Terminal states a subagent run can settle into. */
export type SubagentRunStatus = "running" | "completed" | "failed" | "cancelled";

/**
 * Coarse capability/cost hint for a model, so calling agents can route without
 * guessing from labels alone: fast-cheap for light tasks, max-capability for
 * the hardest ones, balanced as the default.
 */
export type ModelTier = "fast-cheap" | "balanced" | "max-capability";

/** A model choice offered to the calling agent for a spawnable agent. */
export interface SpawnableAgentModel {
  value: string;
  label: string;
  tier?: ModelTier;
}

/**
 * A connected agent the caller can spawn as a subagent. Sourced from the agent
 * status service + adapter registry, filtered to installed + authenticated
 * providers whose adapter implements `createStructuredSession`.
 */
/**
 * How a spawnable agent executes as a child:
 * - `structured`: a full provider structured (GUI) runtime session — supports
 *   incremental tool calls, permission forwarding, live steering.
 * - `one-shot`: a single non-interactive CLI invocation (bypass-permissions);
 *   streams stdout as its output and settles when the process exits. No
 *   interactive approval channel.
 */
export type SpawnableAgentExecution = "structured" | "one-shot";

/**
 * Single source of truth for which lane an adapter runs as a subagent child:
 * `structured` if it has a GUI runtime, else `one-shot` if it can build a
 * bypass-permissions CLI invocation, else `undefined` (not spawnable). Uses a
 * structural param so it stays free of an `AgentAdapter` import (no cycles).
 */
export function resolveSubagentExecution(adapter: {
  createStructuredSession?: unknown;
  buildSubagentOneShotCommand?: unknown;
}): SpawnableAgentExecution | undefined {
  if (adapter.createStructuredSession) return "structured";
  if (adapter.buildSubagentOneShotCommand) return "one-shot";
  return undefined;
}

/**
 * Build a child thread config that inherits the parent's approval/sandbox
 * posture but NEVER carries `subagentMcp`/`browserMcp` — the recursion guard so
 * children can't spawn grandchildren. Shared by both subagent lanes (ephemeral
 * runs and orchestrator threads) so the inherited posture can't drift between them.
 */
export function buildInheritedChildConfig(
  parentConfig: ThreadConfig,
  child: { model: string; effort?: string },
): ThreadConfig {
  return {
    model: child.model,
    ...(child.effort ? { effort: child.effort } : {}),
    ...(parentConfig.approvalPolicy ? { approvalPolicy: parentConfig.approvalPolicy } : {}),
    ...(parentConfig.sandboxMode ? { sandboxMode: parentConfig.sandboxMode } : {}),
  };
}

export interface SpawnableAgent {
  kind: string;
  label: string;
  models: SpawnableAgentModel[];
  efforts?: string[];
  defaultModel?: string;
  execution?: SpawnableAgentExecution;
}

/** Arguments accepted by `spawn_agent` / `run_agent`. */
export interface SpawnAgentRequest {
  agent: string;
  model?: string;
  effort?: string;
  prompt: string;
  name?: string;
}

/** Result of `wait_for_agent` / `run_agent`. */
export interface SubagentWaitResult {
  status: SubagentRunStatus;
  output: string;
}

/**
 * Host surface the run manager needs from the supervisor's thread session
 * manager. Kept minimal so the TSM only exposes thin hooks (no-god-files).
 */
export interface SubagentRunHost {
  /** Resolve a live parent thread's project location + config for child inheritance. */
  getParentContext(
    threadId: string,
  ): { projectLocation: ProjectLocation; config: ThreadConfig } | undefined;
  /** Append a (re-tagged) runtime event into the parent thread's event stream. */
  appendRuntimeEvent(parentThreadId: string, event: RuntimeEvent): void;
}

/** MCP tool result content shape. */
export interface McpTextContent {
  type: "text";
  text: string;
}

export interface McpToolResult {
  content: McpTextContent[];
  isError?: boolean;
}

/** An MCP tool catalog entry (name + description + JSON input schema). */
export interface ToolSpec {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}
