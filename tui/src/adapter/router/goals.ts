import { goalItemPayloadSchema } from "@/shared/contracts";
import { threadId } from "../ids";
import { record } from "./helpers";
import type { RouterContext } from "./context";

export function createGoals(ctx: RouterContext) {
  const recordGoal = (rawThreadId: string, payload: unknown) => {
    const parsed = goalItemPayloadSchema.safeParse(payload);
    if (!parsed.success) return;
    const goal = parsed.data;
    if (goal.action === "cleared" || goal.status === "cancelled") ctx.goals.delete(rawThreadId);
    else ctx.goals.set(rawThreadId, goal);
    for (const listener of ctx.goalListeners) listener(rawThreadId);
  };
  const seedBackgroundTasks = async (rawThreadId: string) => {
    if (ctx.backgroundTasks.has(rawThreadId)) return;
    let result: unknown = null;
    try {
      result = await ctx.input.client.callRemoteProcedure("readThreadBackgroundTasks", {
        threadId: rawThreadId,
      });
    } catch {
      // Old hosts answer an empty task list.
    }
    const tasks = record(result).tasks;
    ctx.backgroundTasks.set(rawThreadId, Array.isArray(tasks) ? tasks.map(record) : []);
  };

  const seedGoal = async (rawThreadId: string) => {
    try {
      const item = await ctx.input.client.latestThreadGoalItem(rawThreadId);
      if (item) recordGoal(rawThreadId, item.payload);
    } catch {
      /* older hosts without goal support */
    }
  };
  const goalState = async (session: string) => {
    const goal = ctx.goals.get(threadId(session));
    if (!goal || !goal.objective) return undefined;
    return {
      objective: goal.objective,
      status: goal.status ?? "active",
      availableActions: goal.availableActions ?? [],
      ...(goal.tokensUsed !== undefined ? { tokensUsed: goal.tokensUsed } : {}),
      ...(goal.tokenBudget !== undefined ? { tokenBudget: goal.tokenBudget } : {}),
      ...(goal.timeUsedSeconds !== undefined ? { timeUsedSeconds: goal.timeUsedSeconds } : {}),
      ...(goal.lastReason ? { lastReason: goal.lastReason } : {}),
    };
  };
  const controlGoal = async (
    session: string,
    control: { action: "pause" | "resume" | "clear" | "edit"; objective?: string },
  ) => {
    const rawId = threadId(session);
    const goal = ctx.goals.get(rawId);
    if (!goal) return { error: "This thread has no goal." };
    if (!goal.availableActions?.includes(control.action))
      return { error: `The current goal can't be ${control.action} right now.` };
    if (control.action === "edit") {
      const objective = control.objective?.trim() ?? "";
      if (objective.length === 0 || objective.length > 4000)
        return { error: "Goal objective must be 1-4000 characters." };
      await ctx.input.client.controlThreadGoal({ threadId: rawId, action: "edit", objective });
      return { ok: true as const };
    }
    await ctx.input.client.controlThreadGoal({ threadId: rawId, action: control.action });
    return { ok: true as const };
  };
  const subscribeGoal = (listener: (rawThreadId: string) => void) => {
    ctx.goalListeners.add(listener);
    return () => {
      ctx.goalListeners.delete(listener);
    };
  };
  const goalSupported = async (session: string) => {
    const remote = await ctx.cachedThreadById(threadId(session));
    if (!remote) return false;
    try {
      const commands = await ctx.input.client.agentSlashCommands(remote.agentKind);
      return commands.commands.some((command) => command.id === "goal");
    } catch {
      return false;
    }
  };
  const goalLine = (session: string) => {
    const goal = ctx.goals.get(threadId(session));
    if (!goal?.objective) return undefined;
    const objective =
      goal.objective.length > 60 ? `${goal.objective.slice(0, 57)}...` : goal.objective;
    const tokens =
      goal.tokensUsed !== undefined
        ? ` · ${goal.tokensUsed}${goal.tokenBudget ? `/${goal.tokenBudget}` : ""} tokens`
        : "";
    return `Goal · ${goal.status ?? "active"} · ${objective}${tokens}`;
  };
  return {
    recordGoal,
    seedBackgroundTasks,
    seedGoal,
    goalState,
    controlGoal,
    subscribeGoal,
    goalSupported,
    goalLine,
  };
}
