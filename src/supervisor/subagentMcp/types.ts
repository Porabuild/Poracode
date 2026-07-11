import type {
  AgentCapability,
  ProjectLocation,
  RuntimeEvent,
  ThreadConfig,
} from "@/shared/contracts";
import { resolveUnrestrictedPermissionConfig } from "@/shared/agents/unrestrictedPermissions";
import type { McpThreadIdentity } from "@/shared/browserMcpThread";
import type { BrowserMcpHttpConfig } from "@/supervisor/agents/browserMcp";
import type { ChromeMcpHttpConfig } from "@/supervisor/agents/chromeMcp";
import type { ComputerUseMcpHttpConfig } from "@/supervisor/agents/computerUseMcp";
import type { AppControlsMcpHttpConfig } from "@/supervisor/agents/appControlsMcp";

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
  reasoning: {
    values: string[];
    default?: string;
  };
  fast?: {
    available: boolean;
    disabledReason?: string;
  };
}

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
 * Build an unrestricted child config using the target provider's strongest
 * advertised policy, falling back to its declared bypass posture when the
 * probe exposes no choices. Subagents must not inherit a potentially
 * incompatible or supervised parent policy. Browser, Computer Use, and Chrome
 * MCP choices are inherited; Subagents MCP is deliberately excluded so a child
 * cannot spawn grandchildren. One-shot-only providers already enforce the
 * permission rule in `buildSubagentOneShotCommand`.
 */
export function buildUnrestrictedChildConfig(
  child: { model: string; effort?: string; fast?: boolean },
  targetCapabilities: Pick<
    AgentCapability,
    "approvalPolicies" | "sandboxModes" | "bypassPermissions"
  >,
  parentConfig?: ThreadConfig,
): ThreadConfig {
  return {
    model: child.model,
    ...(child.effort ? { effort: child.effort } : {}),
    ...(child.fast === true ? { fast: true } : {}),
    ...resolveUnrestrictedPermissionConfig(targetCapabilities),
    ...(parentConfig?.browserMcp === true ? { browserMcp: true } : {}),
    ...(parentConfig?.computerUse === true ? { computerUse: true } : {}),
    ...(parentConfig?.chromeMcp === true ? { chromeMcp: true } : {}),
  };
}

/** Composer-shaped choices for a connected provider the caller can spawn. */
export interface SpawnableAgent {
  provider: { value: string; label: string };
  models: SpawnableAgentModel[];
  reasoningOptions: Array<{ value: string; label: string }>;
  defaultModel: string;
  permissions: {
    options: Array<{ value: "full-access"; label: string }>;
    default: "full-access";
  };
  execution: SpawnableAgentExecution;
}

/** Compact first-stage provider discovery returned by `list_agents`. */
export interface SpawnableAgentSummary {
  id: string;
  label: string;
  execution: SpawnableAgentExecution;
  defaultModel: string;
  modelCount: number;
}

/** Arguments accepted by `spawn_agent` / `run_agent`. */
export interface SpawnAgentRequest {
  agent: string;
  model?: string;
  effort?: string;
  fast?: boolean;
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
  /** Resolve a live parent thread's project and non-recursive MCP context. */
  getParentContext(
    threadId: string,
  ): { projectLocation: ProjectLocation; config: ThreadConfig } | undefined;
  /** Resolve the parent's non-recursive MCP access for a structured child. */
  resolveParentMcpAccess?(
    threadId: string,
    identity: McpThreadIdentity,
  ): Promise<{
    browserMcp?: BrowserMcpHttpConfig;
    computerUseMcp?: ComputerUseMcpHttpConfig;
    chromeMcp?: ChromeMcpHttpConfig;
    appControlsMcp?: AppControlsMcpHttpConfig;
  }>;
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
