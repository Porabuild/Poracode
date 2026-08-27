import type {
  AgentKind,
  AgentCapability,
  McpToolAnnotations,
  ProjectLocation,
  RuntimeEvent,
  ThreadConfig,
  ResolvedMcpServer,
} from "@/shared/contracts";
import { resolveUnrestrictedPermissionConfig } from "@/shared/agents/unrestrictedPermissions";
import type {
  CrossagentExecution,
  CrossagentRankingCandidate,
  CrossagentRankSource,
} from "@/shared/crossagentRanking";
import type { McpThreadIdentity } from "@/shared/browserMcpThread";

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
/**
 * Single source of truth for which lane an adapter runs as a subagent child:
 * `structured` if it has a GUI runtime, else `one-shot` if it can build a
 * bypass-permissions CLI invocation, else `undefined` (not spawnable). Uses a
 * structural param so it stays free of an `AgentAdapter` import (no cycles).
 */
export function resolveSubagentExecution(adapter: {
  createStructuredSession?: unknown;
  buildSubagentOneShotCommand?: unknown;
}): CrossagentExecution | undefined {
  if (adapter.createStructuredSession) return "structured";
  if (adapter.buildSubagentOneShotCommand) return "one-shot";
  return undefined;
}

/**
 * Build an unrestricted child config using the target provider's strongest
 * advertised policy, falling back to its declared bypass posture when the
 * probe exposes no choices. Subagents must not inherit a potentially
 * incompatible or supervised parent policy. Browser, Computer Use, and Chrome
 * MCP choices are inherited; Crossagents MCP is deliberately excluded so a child
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
  execution: CrossagentExecution;
  preference?: {
    rank: number;
    source: CrossagentRankSource;
    usageCount: number;
    model: string;
    reasoning?: string;
    fast: boolean;
    matchedTags?: string[];
    learnedTags?: Array<{ tag: string; count: number }>;
  };
}

/** Adapt a spawnable agent to the ranking layer's candidate shape. */
export function rankingCandidateOf(
  agent: Omit<SpawnableAgent, "preference">,
): CrossagentRankingCandidate {
  return {
    provider: agent.provider.value,
    defaultModel: agent.defaultModel,
    models: agent.models.map((model) => ({
      id: model.value,
      efforts: model.reasoning.values,
      ...(model.reasoning.default ? { defaultEffort: model.reasoning.default } : {}),
      fastAvailable: model.fast?.available === true,
    })),
  };
}

/** Compact first-stage provider discovery returned by `list_agents`. */
export interface SpawnableAgentSummary {
  id: string;
  label: string;
  execution: CrossagentExecution;
  defaultModel: string;
  modelCount: number;
  rank: number;
  preferenceSource: CrossagentRankSource;
  usageCount: number;
  preferredModel: string;
  preferredReasoning?: string;
  preferredFast: boolean;
  matchedTags: string[];
  learnedTags: Array<{ tag: string; count: number }>;
}

/** Provider/model selection for one subagent attempt. */
export interface SpawnAgentSelection {
  agent: string;
  model?: string;
  effort?: string;
  fast?: boolean;
}

export interface ExplicitSpawnAgentSelection {
  selection: SpawnAgentSelection;
  tags: string[];
  explicitFields: {
    provider: boolean;
    model: boolean;
    effort: boolean;
    fast: boolean;
  };
}

/** Arguments accepted by `spawn_agent` / `run_agent`. */
export interface SpawnAgentRequest extends SpawnAgentSelection {
  prompt: string;
  name?: string;
  /**
   * Run without blocking the parent agent. Background runs remain tied to the
   * parent thread, survive interruption of its current turn, and are cancelled
   * when that thread closes.
   */
  background?: boolean;
  /** Ordered alternate selections tried after a failed attempt. */
  fallbacks?: SpawnAgentSelection[];
  /**
   * `startup` retries only before a turn was dispatched (safe default).
   * `any-failure` may repeat work that already changed files or external state.
   */
  retryMode?: "startup" | "any-failure";
}

/** One completed attempt in a retry/fallback chain. */
export interface SubagentAttemptResult {
  attempt: number;
  provider: string;
  model: string;
  status: Exclude<SubagentRunStatus, "running">;
  output: string;
  error?: string;
  may_have_side_effects?: boolean;
}

/** Options accepted by the wait/status read paths. */
export interface SubagentWaitOptions {
  /** Return the entire accumulated transcript instead of the incremental tail. */
  fullOutput?: boolean;
  /** Return output produced after this caller-owned character offset. */
  afterOutputChars?: number;
  /** Internal foreground compatibility: return only the final attempt's complete output. */
  currentAttemptOnly?: boolean;
}

/** Result of `wait_for_agent` / `run_agent`. */
export interface SubagentWaitResult {
  status: SubagentRunStatus;
  /**
   * Assistant text after `afterOutputChars`, tail-clipped (tight while running,
   * generous once settled). `fullOutput` returns the entire accumulated
   * transcript instead.
   */
  output: string;
  /** Full run transcript length and cursor for the next incremental read. */
  total_output_chars?: number;
  error?: {
    message: string;
    may_have_side_effects: boolean;
  };
  /** Included only for runs configured with fallbacks. */
  attempts?: SubagentAttemptResult[];
}

/** Caller-scoped summary returned by `list_runs`. */
export interface SubagentRunSummary {
  run_id: string;
  name: string;
  status: SubagentRunStatus;
  background: boolean;
  attempt: number;
  attempt_count: number;
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
    targetAgentKind: AgentKind,
  ): Promise<{ mcpServers?: ResolvedMcpServer[] }>;
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
  annotations?: McpToolAnnotations;
}
