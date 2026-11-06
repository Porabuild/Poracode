import type { SessionRef } from "@/shared/contracts";
import { SubagentSpawnError } from "./errors";
import { prepareSubagentRun, type PreparedSubagentRun } from "./spawnPlan";
import type { SpawnAgentRequest, SubagentRunStatus } from "./types";

export interface ContinuableRun {
  status: SubagentRunStatus;
  plan: PreparedSubagentRun;
  attemptIndex: number;
  sessionRef?: SessionRef;
  cancelRequested: boolean;
  resuming?: { background: boolean; cancelled: boolean };
  continuedBy?: string;
}

function hasCompletedSession(run: ContinuableRun): boolean {
  return (
    run.status === "completed" &&
    !run.cancelRequested &&
    !!run.sessionRef &&
    run.plan.attempts[run.attemptIndex]?.supportsResume === true
  );
}

export function canContinueRun(run: ContinuableRun): boolean {
  return hasCompletedSession(run) && !run.resuming && !run.continuedBy;
}

/** Validate current settings; crew follow-ups replace the full role snapshot. */
export function prepareContinuation(
  deps: Parameters<typeof prepareSubagentRun>[0],
  parent: Parameters<typeof prepareSubagentRun>[1],
  run: ContinuableRun,
  prompt: string,
  background: boolean,
  selectionUpdate?: SpawnAgentRequest,
  name?: string,
): PreparedSubagentRun {
  if (run.continuedBy) {
    throw new SubagentSpawnError(
      `This worker already continued as run_id ${run.continuedBy}; use that run_id`,
    );
  }
  if (!hasCompletedSession(run)) {
    throw new SubagentSpawnError("This run has no completed, resumable worker session");
  }
  const plan = prepareWorkerTurn(deps, parent, run, prompt, background, selectionUpdate, name);
  if (!plan.attempts[0]!.supportsResume) {
    throw new SubagentSpawnError("This provider no longer supports session resume");
  }
  return plan;
}

/** Plan a new provider turn without silently replacing its conversation. */
export function prepareWorkerTurn(
  deps: Parameters<typeof prepareSubagentRun>[0],
  parent: Parameters<typeof prepareSubagentRun>[1],
  run: Pick<ContinuableRun, "plan" | "attemptIndex">,
  prompt: string,
  background: boolean,
  selectionUpdate?: SpawnAgentRequest,
  name?: string,
): PreparedSubagentRun {
  const taskName = name?.trim();
  const attempt = run.plan.attempts[run.attemptIndex]!;
  const request: SpawnAgentRequest = selectionUpdate ?? {
    agent: attempt.provider,
    model: attempt.model,
    ...(attempt.config.effort ? { effort: attempt.config.effort } : {}),
    ...(attempt.config.fast === true ? { fast: true } : {}),
    ...(attempt.config.contextSize ? { contextSize: attempt.config.contextSize } : {}),
    ...(run.plan.crewRole ? { crewRole: run.plan.crewRole } : {}),
    prompt,
  };
  // A resumed conversation cannot fall back to a different conversation. The
  // caller can spawn a fresh role task with a complete brief after a failure.
  const { fallbacks: _fallbacks, retryMode: _retryMode, ...selection } = request;
  const plan = prepareSubagentRun(deps, parent, {
    ...selection,
    ...(run.plan.resultMode ? { resultMode: run.plan.resultMode } : {}),
    prompt,
    ...(taskName ? { name: taskName } : {}),
    background,
    dispatchProvenance: {
      selection: { source: "continuation" },
      fallbackSource: "none",
      retryModeSource: "default",
    },
  });
  const next = plan.attempts[0]!;
  // Compatible crew turns retain the worker's execution/tool scope, replacing
  // selection fields completely so clearing effort or Fast cannot revive them.
  if (selectionUpdate) {
    if (
      attempt.provider !== next.provider ||
      attempt.model !== next.model ||
      (attempt.config.contextSize || undefined) !== (next.config.contextSize || undefined)
    ) {
      throw new SubagentSpawnError(
        `Crew role ${selectionUpdate.crewRole?.id ?? "selection"} changed provider, model or context length. Use spawn_agent with the current role and a self-contained task brief to start a fresh helper; this worker's conversation was not changed.`,
      );
    }
    plan.prompt = `[crew update] The following role configuration replaces previous role instructions for this task, including editing restrictions.\n\n${plan.prompt}`;
    const { effort: _effort, fast: _fast, contextSize: _contextSize, ...rest } = attempt.config;
    next.config = {
      ...rest,
      model: next.model,
      ...(next.config.effort !== undefined ? { effort: next.config.effort } : {}),
      ...(next.config.fast !== undefined ? { fast: next.config.fast } : {}),
      ...(next.config.contextSize ? { contextSize: next.config.contextSize } : {}),
    };
  } else {
    next.config = attempt.config;
    // A supplied name resolves a new descriptive label; without one the old
    // label (including its original name) stays authoritative.
    if (!taskName) next.label = attempt.label;
  }
  plan.projectLocation = run.plan.projectLocation;
  return plan;
}
