import type { GoalItemPayload, ThreadTitleCommand } from "@/shared/contracts";
import type { SessionNotification } from "@agentclientprotocol/sdk";
import { record } from "./acpRecord";
import { PORACODE_ACP_GOAL_META_KEY } from "../acp/canonicalMapping/goals";
import { PORACODE_ACP_NEW_ASSISTANT_ITEM_META_KEY } from "../acp/canonicalMapping/subagents";

const GOAL_META_KEY = "cognition.ai/goal";
const INFERENCE_TOOL_NAME_META_KEY = "cognition.ai/inferenceToolName";
const INSTANT_META_KEY = "cognition.ai/instant";
const DISPLAY_MESSAGE_META_KEY = "cognition.ai/displayMessage";
const SUBAGENT_CONTEXT_META_KEY = "cognition.ai/subagent_context";
const NO_GOAL_MESSAGE = /^No goal (?:set|to resume|to clear)\./;

type DevinGoalStatus = "running" | "paused" | "blocked" | "complete" | "cleared";
type DevinGoalSnapshot = {
  id: string;
  objective: string;
  status: DevinGoalStatus;
  turns: number;
};
type DevinGoalOutcome = { status: "blocked" | "complete"; summary: string };

/** `/goal <objective>` titles a thread from the objective; `resume`/`clear` are verbs. */
export const DEVIN_GOAL_THREAD_TITLE_COMMAND = {
  command: "goal",
  controlArguments: ["resume", "clear"],
} as const satisfies ThreadTitleCommand;

/**
 * Devin `/goal` → neutral ACP goal metadata (live captures,
 * fixtures/goal-lifecycle.json). Every transition is a `session_info_update`
 * snapshot (`cognition.ai/goal`, terminal ones sent twice); `update_goal`
 * carries the complete/blocked summary before its snapshot; continuation turns
 * run inside one prompt behind a `displayMessage` chunk. Goal state is
 * process-local, so "No goal …" command replies clear a persisted stale goal.
 */
export function createDevinGoalTransform(): (
  notification: SessionNotification,
) => SessionNotification {
  let goalId: string | undefined;
  let lastSnapshotFingerprint: string | undefined;
  let lastOutcome: DevinGoalOutcome | undefined;
  let timeUsedSeconds = 0;
  let activeSince: number | undefined;
  let knownEmpty = false;
  let displayBoundaryPending = false;

  return (notification) => {
    const update = notification.update as Record<string, unknown>;
    if (update.sessionUpdate === "tool_call" || update.sessionUpdate === "tool_call_update") {
      const meta = record(update._meta);
      if (meta[INFERENCE_TOOL_NAME_META_KEY] === "update_goal") {
        const outcome = readGoalOutcome(update.rawInput);
        if (outcome) lastOutcome = outcome;
      }
    }

    if (update.sessionUpdate === "session_info_update") {
      const snapshot = readGoalSnapshot(record(update._meta)[GOAL_META_KEY]);
      if (!snapshot) return notification;
      if (snapshot.status === "running") lastOutcome = undefined;
      const fingerprint = JSON.stringify([
        snapshot.id,
        snapshot.status,
        snapshot.turns,
        snapshot.objective,
      ]);
      if (fingerprint === lastSnapshotFingerprint) return notification;
      lastSnapshotFingerprint = fingerprint;
      if (snapshot.status === "cleared") {
        goalId = undefined;
        lastOutcome = undefined;
        timeUsedSeconds = 0;
        activeSince = undefined;
        knownEmpty = true;
        return withPoracodeMeta(notification, PORACODE_ACP_GOAL_META_KEY, {
          action: "cleared",
          availableActions: [],
        });
      }

      knownEmpty = false;
      const action = goalId === undefined || snapshot.id !== goalId ? "set" : "updated";
      if (action === "set") {
        timeUsedSeconds = 0;
        activeSince = undefined;
        lastOutcome = undefined;
      }

      const now = Date.now() / 1000;
      if (activeSince !== undefined) {
        timeUsedSeconds += Math.max(0, now - activeSince);
      }
      activeSince = snapshot.status === "running" ? now : undefined;
      goalId = snapshot.id;

      const status = canonicalGoalStatus(snapshot.status);
      const lastReason =
        (snapshot.status === "blocked" || snapshot.status === "complete") &&
        lastOutcome?.status === snapshot.status
          ? lastOutcome.summary
          : "";
      const payload: GoalItemPayload = {
        action,
        objective: snapshot.objective,
        status,
        availableActions: availableActions(snapshot.status),
        iterations: snapshot.turns,
        lastReason,
        timeUsedSeconds,
        updatedAt: now,
      };
      return withPoracodeMeta(notification, PORACODE_ACP_GOAL_META_KEY, payload);
    }

    if (update.sessionUpdate !== "agent_message_chunk") return notification;
    const meta = record(update._meta);
    const isRootChunk = meta[SUBAGENT_CONTEXT_META_KEY] === undefined;
    let normalized = notification;
    if (
      isRootChunk &&
      meta[INSTANT_META_KEY] === true &&
      NO_GOAL_MESSAGE.test(readTextContent(update.content) ?? "") &&
      !knownEmpty
    ) {
      knownEmpty = true;
      goalId = undefined;
      lastSnapshotFingerprint = undefined;
      lastOutcome = undefined;
      timeUsedSeconds = 0;
      activeSince = undefined;
      normalized = withPoracodeMeta(normalized, PORACODE_ACP_GOAL_META_KEY, {
        action: "cleared",
        availableActions: [],
      });
    }
    if (!isRootChunk) return normalized;
    if (meta[DISPLAY_MESSAGE_META_KEY] === true) {
      displayBoundaryPending = true;
      return withPoracodeMeta(normalized, PORACODE_ACP_NEW_ASSISTANT_ITEM_META_KEY, "owner");
    }
    if (displayBoundaryPending) {
      displayBoundaryPending = false;
      return withPoracodeMeta(normalized, PORACODE_ACP_NEW_ASSISTANT_ITEM_META_KEY, "owner");
    }
    return normalized;
  };
}

function readGoalSnapshot(value: unknown): DevinGoalSnapshot | undefined {
  if (!isPlainObject(value)) return undefined;
  const id = typeof value.id === "string" ? value.id.trim() : undefined;
  const status = readDevinGoalStatus(value.status);
  const turns = value.turns;
  if (
    !id ||
    !status ||
    typeof value.objective !== "string" ||
    typeof turns !== "number" ||
    !Number.isInteger(turns) ||
    turns < 0
  ) {
    return undefined;
  }
  const objective = value.objective.trim();
  if (status !== "cleared" && !objective) return undefined;
  return { id, objective, status, turns };
}

function readDevinGoalStatus(value: unknown): DevinGoalStatus | undefined {
  return value === "running" ||
    value === "paused" ||
    value === "blocked" ||
    value === "complete" ||
    value === "cleared"
    ? value
    : undefined;
}

function readGoalOutcome(value: unknown): DevinGoalOutcome | undefined {
  if (!isPlainObject(value)) return undefined;
  const status = value.status;
  const summary = typeof value.summary === "string" ? value.summary : undefined;
  if ((status !== "blocked" && status !== "complete") || !summary?.trim()) return undefined;
  return { status, summary };
}

function canonicalGoalStatus(
  status: Exclude<DevinGoalStatus, "cleared">,
): NonNullable<GoalItemPayload["status"]> {
  return status === "running" ? "active" : status === "complete" ? "complete" : "paused";
}

function availableActions(
  status: Exclude<DevinGoalStatus, "cleared">,
): NonNullable<GoalItemPayload["availableActions"]> {
  return status === "running"
    ? ["pause", "clear"]
    : status === "complete"
      ? ["clear"]
      : ["resume", "clear"];
}

function readTextContent(content: unknown): string | undefined {
  const block = record(content);
  return block.type === "text" && typeof block.text === "string" ? block.text : undefined;
}

function withPoracodeMeta(
  notification: SessionNotification,
  key: string,
  value: unknown,
): SessionNotification {
  const update = notification.update as Record<string, unknown>;
  return {
    ...notification,
    update: {
      ...update,
      _meta: { ...record(update._meta), [key]: value },
    } as unknown as SessionNotification["update"],
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
