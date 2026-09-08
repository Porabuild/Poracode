import type { SDKActiveGoalMessage, SDKAssistantMessage } from "@anthropic-ai/claude-agent-sdk";
import type { RuntimeEvent, TurnState } from "@/shared/contracts";
import {
  goalPayloadFromProviderState,
  startGoalItemEvents,
  updateGoalItemEvents,
  type ProviderGoalState,
} from "../../goalRuntime";
import type { ClaudeMapperState } from "../sdkCanonicalMappingState";
import { newItemId } from "./helpers";
import { readClaudeAssistantSpendTokens, readClaudeAssistantUsageSampleId } from "./usageSpent";

type ActiveGoalState = ClaudeMapperState & {
  activeGoalItemId: string;
  activeGoalObjective: string;
  activeGoalStartedAtMs: number;
};

function hasActiveGoal(state: ClaudeMapperState): state is ActiveGoalState {
  return (
    state.activeGoalItemId !== undefined &&
    state.activeGoalObjective !== undefined &&
    state.activeGoalStartedAtMs !== undefined
  );
}

export function resetActiveGoalTokenAccounting(state: ClaudeMapperState): void {
  delete state.activeGoalTokensUsed;
  delete state.activeGoalUsageSampleIds;
}

export function clearActiveGoal(state: ClaudeMapperState): void {
  delete state.activeGoalItemId;
  delete state.activeGoalObjective;
  delete state.activeGoalStartedAtMs;
  delete state.activeGoalIterations;
  delete state.activeGoalLastReason;
  delete state.pendingGoalCompletionOnTaskDrain;
  // Frame observation is per goal, not per session: leaving it set would make
  // every later goal look evaluator-owned, so a goal whose evaluator never
  // reported would stick in the dock instead of resolving at turn end.
  delete state.sawActiveGoalMessage;
  resetActiveGoalTokenAccounting(state);
}

/**
 * The SDK yields `active_goal` frames alongside `SDKMessage`s, but the
 * published union does not include them — detect by shape.
 */
export function isActiveGoalMessage(message: unknown): message is SDKActiveGoalMessage {
  return (
    typeof message === "object" &&
    message !== null &&
    (message as { type?: unknown }).type === "active_goal"
  );
}

/**
 * Apply the CLI's native /goal evaluation stream. `/goal` is a wrapper around
 * a prompt-based Stop hook: after each turn a small fast model judges the
 * condition and the SDK reports the verdict as an `active_goal` message —
 * non-null `value` means "not yet met" (with bumped `iterations` and the
 * evaluator's `last_reason`), `value: null` means the goal was met and
 * cleared. That verdict — not the turn `result` — is the authoritative
 * completion signal for the goal item.
 */
export function applyActiveGoalMessage(
  state: ClaudeMapperState,
  message: SDKActiveGoalMessage,
): RuntimeEvent[] {
  state.sawActiveGoalMessage = true;
  // The native evaluator owns completion from here on; drop any pending
  // turn-end complete-on-task-drain.
  delete state.pendingGoalCompletionOnTaskDrain;
  const value = message.value;
  if (value === null) return completeGoalFromEvaluatorVerdict(state);

  const objective = value.condition.trim();
  if (!objective) return [];
  const lastReason =
    typeof value.last_reason === "string" && value.last_reason.trim().length > 0
      ? value.last_reason.trim()
      : undefined;

  if (!hasActiveGoal(state)) {
    // A goal can be armed natively without a local `/goal` turn — most
    // commonly a still-active goal restored by resuming the session. Create
    // the goal item so the dock reflects it.
    const itemId = newItemId("goal");
    state.activeGoalItemId = itemId;
    state.activeGoalObjective = objective;
    state.activeGoalStartedAtMs = epochSecondsToMs(value.set_at) ?? Date.now();
    resetActiveGoalTokenAccounting(state);
    state.activeGoalIterations = value.iterations;
    if (lastReason) state.activeGoalLastReason = lastReason;
    if (!hasActiveGoal(state)) return []; // unreachable; re-narrows after mutation
    return startGoalItemEvents(
      state.threadId,
      itemId,
      goalPayloadFromProviderState({ ...activeGoalProviderState(state), status: "active" }, "set"),
    );
  }

  // A new `/goal` replacing the old one mid-session also lands here. A changed
  // condition is a NEW goal: restart its clock and token accounting so the
  // dock never carries the previous goal's spend into the replacement.
  if (state.activeGoalObjective !== objective) {
    state.activeGoalObjective = objective;
    state.activeGoalStartedAtMs = epochSecondsToMs(value.set_at) ?? Date.now();
    resetActiveGoalTokenAccounting(state);
    delete state.activeGoalLastReason;
  }
  state.activeGoalIterations = value.iterations;
  if (lastReason) state.activeGoalLastReason = lastReason;
  return [activeGoalUpdatedEvent(state)];
}

/** The evaluator reported the condition met: complete and clear the goal. */
function completeGoalFromEvaluatorVerdict(state: ClaudeMapperState): RuntimeEvent[] {
  // A null verdict also follows our own `/goal clear` (handled eagerly in
  // startClaudeTurn, which already cleared local state) — nothing to do then.
  if (!hasActiveGoal(state)) return [];
  return completeActiveGoalNow(state);
}

export function completeActiveGoalEvents(
  state: ClaudeMapperState,
  turnState: TurnState,
): RuntimeEvent[] {
  if (!hasActiveGoal(state)) return [];

  // Goal token spend is NOT read from the turn `result`: the CLI reports
  // `result.usage` as a session-cumulative counter (all models, all
  // sidechains, since session start), so adding it per turn would count
  // pre-goal spend and multiply-count later turns. Per-call assistant-message
  // spend is accumulated live by accumulateActiveGoalAssistantSpend instead;
  // here we only roll the aggregate/time snapshot forward.
  //
  // While the native Stop-hook evaluator is live, a turn `result` is not a
  // goal outcome — the evaluator keeps starting turns until the condition is
  // met and reports that via `active_goal: null`.
  if (turnState === "interrupted" || state.sawActiveGoalMessage) {
    return [activeGoalUpdatedEvent(state)];
  }

  // No `active_goal` frame has been seen for this goal, so nothing else will
  // resolve it. Frames are opportunistic, NOT expected: the CLI streams goal
  // verdicts only to its own interactive surface — over the SDK/stream-json
  // transport a `/goal` is armed and its Stop-hook loop runs, yet not one
  // `active_goal` message (not even the `value: null` "met" verdict) reaches
  // us. Silence therefore says nothing about whether the goal was armed, and
  // the turn end is the only completion signal available.
  //
  // With background work still running (subagent tasks, and plain backgrounded
  // Bash via the `background_tasks_changed` level signal), the turn end is not
  // the end of the goal's work — the CLI wakes the model when a background task
  // finishes and the goal's work continues. Hold the goal active and complete
  // it when the last live task drains (completeActiveGoalOnTaskDrainEvents);
  // with a clean turn end, treat it as completion so the dock never sticks.
  if (hasLiveBackgroundWork(state)) {
    state.pendingGoalCompletionOnTaskDrain = true;
    return [activeGoalUpdatedEvent(state)];
  }

  return completeActiveGoalNow(state);
}

/**
 * Turn-end fallback continuation: a clean turn end deferred goal completion
 * because background work was still live. The session calls this after its
 * post-drain resume grace expires. A goal the native evaluator has reported on
 * never gets here — the pending flag is dropped as soon as a frame arrives.
 */
export function completeActiveGoalOnTaskDrainEvents(state: ClaudeMapperState): RuntimeEvent[] {
  if (!state.pendingGoalCompletionOnTaskDrain) return [];
  if (hasLiveBackgroundWork(state)) return [];
  delete state.pendingGoalCompletionOnTaskDrain;
  if (!hasActiveGoal(state)) return [];
  return completeActiveGoalNow(state);
}

function completeActiveGoalNow(state: ActiveGoalState): RuntimeEvent[] {
  const { threadId } = state;
  const itemId = state.activeGoalItemId;
  const payload = goalPayloadFromProviderState(
    { ...activeGoalProviderState(state), status: "complete" },
    "updated",
  );
  clearActiveGoal(state);
  return updateGoalItemEvents(threadId, itemId, payload);
}

function hasLiveSubAgentTaskEntries(state: ClaudeMapperState): boolean {
  return (state.activeSubAgentTaskToTool?.size ?? 0) > 0;
}

/**
 * Whether background work of any kind is still live: tracked subagent tasks
 * (edge bookends, present on older CLIs too) or any entry of the
 * `background_tasks_changed` level set — plain backgrounded Bash included.
 * While this is true, a clean turn end is not the end of the goal's work: the
 * CLI wakes the model when a background task finishes and the work continues.
 */
function hasLiveBackgroundWork(state: ClaudeMapperState): boolean {
  return hasLiveSubAgentTaskEntries(state) || (state.liveBackgroundTaskIds?.size ?? 0) > 0;
}

/**
 * Snapshot of the active goal's payload fields (objective, aggregate token
 * spend, elapsed time, evaluator iterations/reason). Every goal emission
 * builds from this so partial updates never wipe fields off the dock.
 */
function activeGoalProviderState(state: ActiveGoalState): ProviderGoalState {
  const nowMs = Date.now();
  return {
    objective: state.activeGoalObjective,
    // Always carry the counter (0 before the first spend): the renderer merges
    // goal payloads shallowly, so omitting the field would leave a replaced
    // goal's total on the dock after resetActiveGoalTokenAccounting. The dock
    // hides a zero total (it only renders tokensUsed > 0).
    tokensUsed: state.activeGoalTokensUsed ?? 0,
    timeUsedSeconds: Math.max(0, Math.round((nowMs - state.activeGoalStartedAtMs) / 1000)),
    ...(state.activeGoalIterations !== undefined ? { iterations: state.activeGoalIterations } : {}),
    ...(state.activeGoalLastReason ? { lastReason: state.activeGoalLastReason } : {}),
    updatedAt: nowMs / 1000,
  };
}

function activeGoalUpdatedEvent(state: ActiveGoalState): RuntimeEvent {
  return {
    type: "item.updated",
    threadId: state.threadId,
    itemId: state.activeGoalItemId,
    payload: goalPayloadFromProviderState(
      { ...activeGoalProviderState(state), status: "active" },
      "updated",
    ),
  };
}

/**
 * Fold one assistant API message's per-call spend into the active goal's
 * running total. Called for every assistant message — main thread and
 * subagent sidechain alike — at the same point the Profile usage ledger's
 * `usage.spent` event is created, so the goal dock and the Profile token
 * stats share one exact spend definition. Emits a dock update on growth.
 */
export function accumulateActiveGoalAssistantSpend(
  state: ClaudeMapperState,
  message: SDKAssistantMessage,
): RuntimeEvent | undefined {
  if (!hasActiveGoal(state)) return undefined;
  const spend = readClaudeAssistantSpendTokens(message);
  if (spend === undefined || spend <= 0) return undefined;
  const sampleId = readClaudeAssistantUsageSampleId(message);
  const sampleIds = (state.activeGoalUsageSampleIds ??= new Set<string>());
  if (sampleIds.has(sampleId)) return undefined;
  sampleIds.add(sampleId);
  state.activeGoalTokensUsed = (state.activeGoalTokensUsed ?? 0) + spend;
  return activeGoalUpdatedEvent(state);
}

/**
 * 15s goal-tracking poll tick: re-emit the current totals so the dock's
 * elapsed-time display rolls forward even while no assistant message lands.
 */
export function emitActiveGoalTick(state: ClaudeMapperState): RuntimeEvent | undefined {
  if (!hasActiveGoal(state)) return undefined;
  return activeGoalUpdatedEvent(state);
}

function epochSecondsToMs(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return undefined;
  // Guard against the field ever arriving in milliseconds.
  return value > 1_000_000_000_000 ? value : value * 1000;
}
