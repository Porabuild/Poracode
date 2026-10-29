import { z } from "zod";
import type { GoalItemPayload, RuntimeEvent } from "@/shared/contracts";
import {
  getExtensionStore,
  type AcpTextStreamExtension,
} from "../acp/canonicalMapping/textStreamExtension";
import { newItemId } from "../acp/canonicalMapping/state";
import { startGoalItemEvents, updateGoalItemEvents } from "../goalRuntime";

// Harness rc.2 exposes goal snapshots only in these tools' text results.
// Native persistence and canonical goal/wire shapes remain unchanged.
const goalResultSchema = z.object({
  goal: z
    .object({
      id: z.string().min(1),
      revision: z.number().int().positive(),
      objective: z.string().trim().min(1),
      phase: z.enum(["active", "paused", "blocked", "complete"]),
      roundsStarted: z.number().int().nonnegative(),
      maxGoalRounds: z.number().int().positive(),
      blockedReason: z.object({ code: z.string(), message: z.string() }).optional(),
    })
    .nullable(),
  activation: z.enum(["armed", "disarmed"]).optional(),
});

interface DeepSeekGoalState {
  toolCallIds: Set<string>;
  itemId?: string;
  fingerprint?: string;
  revision?: number;
  timeUsedSeconds?: number;
  updatedAt?: number;
  active?: boolean;
}

export const deepSeekGoalExtension: AcpTextStreamExtension = {
  id: "deepseek-goals",
  observeSessionUpdate({ state, update }) {
    if (update.sessionUpdate !== "tool_call" && update.sessionUpdate !== "tool_call_update")
      return [];
    const goals = getExtensionStore<DeepSeekGoalState>(state, this.id, () => ({
      toolCallIds: new Set(),
    }));
    if (
      update.sessionUpdate === "tool_call" &&
      ["create_goal", "get_goal", "update_goal"].includes(update.title)
    ) {
      goals.toolCallIds.add(update.toolCallId);
    }
    if (update.status !== "completed" && update.status !== "failed") return [];
    if (!goals.toolCallIds.delete(update.toolCallId) || update.status !== "completed") return [];

    for (const block of update.content ?? []) {
      if (block.type !== "content" || block.content.type !== "text") continue;
      let raw: unknown;
      try {
        raw = JSON.parse(block.content.text);
      } catch {
        continue;
      }
      const result = goalResultSchema.safeParse(raw);
      if (!result.success) continue;
      const { goal, activation } = result.data;
      const fingerprint = JSON.stringify(result.data);
      if (goals.fingerprint === fingerprint) return [];
      const itemId = goal
        ? `deepseek-goal-${state.threadId}-${goal.id}`
        : (goals.itemId ?? newItemId("deepseek-goal-clear"));
      const starts = itemId !== goals.itemId;
      if (goal && !starts && goals.revision !== undefined && goal.revision < goals.revision)
        return [];
      // Tool snapshots omit duration. Accumulate only active time observed
      // by this session, preserving it when an update restamps the timer.
      const now = Date.now() / 1000;
      const timeUsedSeconds = starts
        ? 0
        : (goals.timeUsedSeconds ?? 0) +
          (goals.active ? Math.max(0, now - (goals.updatedAt ?? now)) : 0);
      const payload: GoalItemPayload = goal
        ? {
            action: starts ? "set" : "updated",
            objective: goal.objective,
            status:
              goal.phase === "blocked"
                ? goal.blockedReason?.code === "round-limit"
                  ? "budget_limited"
                  : "paused"
                : goal.phase === "active" && activation === "disarmed"
                  ? "paused"
                  : goal.phase,
            iterations: goal.roundsStarted,
            timeUsedSeconds,
            updatedAt: now,
            lastReason: goal.blockedReason?.message ?? "",
            // ACP has no direct goal command/control endpoint.
            availableActions: [],
          }
        : { action: "cleared", availableActions: [] };
      goals.fingerprint = fingerprint;
      if (goal) {
        goals.itemId = itemId;
        goals.revision = goal.revision;
        goals.timeUsedSeconds = timeUsedSeconds;
        goals.updatedAt = now;
        goals.active = payload.status === "active";
      } else {
        delete goals.itemId;
        delete goals.revision;
      }
      if (!starts) return updateGoalItemEvents(state.threadId, itemId, payload);
      // A resumed native goal may already have this stable item in the DB.
      return startGoalItemEvents(state.threadId, itemId, payload).map((event): RuntimeEvent =>
        event.type === "item.completed" ? { ...event, payload } : event,
      );
    }
    return [];
  },
  resetForTurnEnd(state) {
    getExtensionStore<DeepSeekGoalState>(state, this.id, () => ({
      toolCallIds: new Set(),
    })).toolCallIds.clear();
  },
};
