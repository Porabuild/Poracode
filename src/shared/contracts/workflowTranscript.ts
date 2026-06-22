import { z } from "zod";

/**
 * Persisted shape of a single workflow run, surfaced through the supervisor by
 * reading `<projectSessionDir>/workflows/<runId>.json`. The manifest captures
 * everything needed for the 3-pane viewer: header stats, the planned phases,
 * and one row per spawned agent (label, model, token totals, etc.).
 *
 * Field set is derived from a real workflow run; unknown fields on disk are
 * ignored. We intentionally keep this schema loose (most fields optional) so
 * an in-progress manifest with partial data still parses cleanly.
 */

export const workflowAgentStateSchema = z.enum([
  "queued",
  "running",
  "done",
  "failed",
  "cancelled",
]);
export type WorkflowAgentState = z.infer<typeof workflowAgentStateSchema>;

export const workflowAgentChatEntrySchema = z.object({
  role: z.enum(["user", "assistant", "tool"]),
  title: z.string().optional(),
  text: z.string().optional(),
  timestamp: z.string().optional(),
});
export type WorkflowAgentChatEntry = z.infer<typeof workflowAgentChatEntrySchema>;

export const workflowAgentSchema = z.object({
  agentId: z.string().min(1),
  label: z.string().min(1),
  phaseIndex: z.number().int().nonnegative().optional(),
  phaseTitle: z.string().optional(),
  model: z.string().optional(),
  state: workflowAgentStateSchema.optional(),
  startedAt: z.number().int().optional(),
  queuedAt: z.number().int().optional(),
  lastProgressAt: z.number().int().optional(),
  durationMs: z.number().int().nonnegative().optional(),
  tokens: z.number().int().nonnegative().optional(),
  toolCalls: z.number().int().nonnegative().optional(),
  lastToolName: z.string().optional(),
  promptPreview: z.string().optional(),
  resultPreview: z.string().optional(),
  chat: z.array(workflowAgentChatEntrySchema).optional(),
  attempt: z.number().int().nonnegative().optional(),
});
export type WorkflowAgent = z.infer<typeof workflowAgentSchema>;

export const workflowPhaseSchema = z.object({
  title: z.string().min(1),
  detail: z.string().optional(),
  agents: z.array(workflowAgentSchema),
});
export type WorkflowPhase = z.infer<typeof workflowPhaseSchema>;

export const workflowRunStatusSchema = z.enum([
  "running",
  "completed",
  "failed",
  "cancelled",
  "unknown",
]);
export type WorkflowRunStatus = z.infer<typeof workflowRunStatusSchema>;

export const workflowRunSchema = z.object({
  runId: z.string().min(1),
  taskId: z.string().optional(),
  workflowName: z.string().optional(),
  summary: z.string().optional(),
  status: workflowRunStatusSchema,
  startTime: z.number().int().optional(),
  durationMs: z.number().int().nonnegative().optional(),
  totalTokens: z.number().int().nonnegative().optional(),
  totalToolCalls: z.number().int().nonnegative().optional(),
  agentCount: z.number().int().nonnegative(),
  defaultModel: z.string().optional(),
  scriptPath: z.string().optional(),
  phases: z.array(workflowPhaseSchema),
  /** Agents that arrived before a `workflow_phase` event, kept in order. */
  unphasedAgents: z.array(workflowAgentSchema),
});
export type WorkflowRun = z.infer<typeof workflowRunSchema>;

export const WORKFLOW_STALE_PROGRESS_MS = 3 * 60 * 60 * 1000;

/**
 * A workflow run reports a "live" status while its manifest says `running` - or
 * `unknown`, the pre-manifest / can't-parse state that precedes the first
 * on-disk write. Terminal states are `completed` / `failed` / `cancelled`.
 * Internal: callers should use `isWorkflowRunLive`, which also rejects stale
 * `running` manifests left behind by a crashed runtime.
 */
function isLiveWorkflowRunStatus(status: WorkflowRunStatus): boolean {
  return status === "running" || status === "unknown";
}

/**
 * Most recent timestamp at which the run shows any sign of activity: the latest
 * agent queued/started/progress time, the run start, or its computed end. Single
 * pass with no intermediate arrays, since this runs on the manifest poll path.
 * Every timestamp is a zod-validated int, so no NaN/Infinity guarding is needed.
 */
function getWorkflowRunLastActivityAt(run: WorkflowRun): number | undefined {
  let last = -Infinity;
  const consider = (time: number | undefined): void => {
    if (time !== undefined && time > last) last = time;
  };
  for (const phase of run.phases) {
    for (const agent of phase.agents) {
      consider(agent.queuedAt);
      consider(agent.startedAt);
      consider(agent.lastProgressAt);
    }
  }
  for (const agent of run.unphasedAgents) {
    consider(agent.queuedAt);
    consider(agent.startedAt);
    consider(agent.lastProgressAt);
  }
  consider(run.startTime);
  if (run.startTime !== undefined && run.durationMs !== undefined) {
    consider(run.startTime + run.durationMs);
  }
  return last === -Infinity ? undefined : last;
}

/**
 * Status-only liveness is not enough: if a workflow process dies before writing
 * a terminal manifest, the persisted status remains `running` forever. Treat a
 * `running` manifest with no activity for `WORKFLOW_STALE_PROGRESS_MS` as dead.
 */
export function isWorkflowRunLive(run: WorkflowRun, options: { now?: number } = {}): boolean {
  if (!isLiveWorkflowRunStatus(run.status)) return false;

  const lastActivityAt = getWorkflowRunLastActivityAt(run);
  if (lastActivityAt === undefined) return true;

  const now = options.now ?? Date.now();
  return now - lastActivityAt <= WORKFLOW_STALE_PROGRESS_MS;
}
