import { homedir } from "node:os";
import { join } from "node:path";
import type { GoalItemPayload, ProjectLocation, RuntimeEvent } from "@/shared/contracts";
import { readSessionFileText, readWslLoginShellCommandOutputAsync } from "../base";
import { startGoalItemEvents, updateGoalItemEvents } from "../goalRuntime";
import { newItemId } from "../contextUsage";
import type { ConfigGetOutput } from "./clientTypes";
import { parseOpenCode2JsonRecord, readOpenCode2Record } from "./readers";

const statuses = {
  active: "active",
  paused: "paused",
  budgetLimited: "budget_limited",
  usageLimited: "budget_limited",
  complete: "complete",
  unmet: "failed",
  cancelled: "cancelled",
} as const;

/** The goal plugin owns persistence; Poracode only projects its snapshots. */
export class OpenCode2Goals {
  revision = 0;
  commandName: string | undefined;
  private itemId: string | undefined;
  private fingerprint: string | undefined;
  private updatedAt = 0;

  constructor(private readonly threadId: string) {}

  map(raw: unknown, sessionID: string): RuntimeEvent[] {
    if (raw === undefined) return [];
    if (raw === null) {
      const itemId = this.itemId ?? newItemId("opencode2-goal");
      if (this.fingerprint === "cleared") return [];
      const events = this.itemId
        ? updateGoalItemEvents(this.threadId, itemId, { action: "cleared" })
        : startGoalItemEvents(this.threadId, itemId, { action: "cleared" });
      this.itemId = undefined;
      this.fingerprint = "cleared";
      this.updatedAt = 0;
      this.revision += 1;
      return events;
    }
    const goal = readOpenCode2Record(raw);
    if (
      !goal ||
      typeof goal.objective !== "string" ||
      !goal.objective.trim() ||
      typeof goal.status !== "string" ||
      !Object.hasOwn(statuses, goal.status) ||
      (goal.sessionID !== undefined && goal.sessionID !== sessionID)
    )
      return [];
    const status = statuses[goal.status as keyof typeof statuses];
    const number = (key: string) => {
      const value = goal[key];
      return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
    };
    const updatedAt = number("updatedAt");
    if (updatedAt !== undefined && updatedAt < this.updatedAt) return [];
    const goalId =
      typeof goal.id === "string" && goal.id
        ? goal.id
        : number("createdAt") !== undefined
          ? `legacy:${sessionID}:${goal.createdAt}`
          : undefined;
    if (!goalId) return [];
    const itemId = `opencode2-goal-${this.threadId}-${goalId}`;
    const starts = this.itemId !== itemId;
    const terminal = status === "complete" || status === "failed" || status === "cancelled";
    const payload: GoalItemPayload = {
      action: starts ? "set" : "updated",
      objective: goal.objective,
      status,
      providerThreadId: sessionID,
      availableActions: !this.commandName
        ? []
        : terminal
          ? ["clear"]
          : ["edit", status === "active" ? "pause" : "resume", "clear"],
      ...(goal.tokenBudget === null || number("tokenBudget") !== undefined
        ? { tokenBudget: goal.tokenBudget as number | null }
        : {}),
      ...(number("tokensUsed") !== undefined ? { tokensUsed: number("tokensUsed")! } : {}),
      ...(number("timeUsedSeconds") !== undefined
        ? { timeUsedSeconds: number("timeUsedSeconds")! }
        : {}),
      ...(Number.isInteger(number("autoTurns")) ? { iterations: number("autoTurns")! } : {}),
      ...(updatedAt !== undefined
        ? { updatedAt: number("sampledAt") ?? number("lastAccountedAt") ?? updatedAt }
        : {}),
      ...(typeof goal.stopReason === "string" && goal.stopReason
        ? { lastReason: goal.stopReason }
        : typeof goal.blocker === "string" && goal.blocker
          ? { lastReason: goal.blocker }
          : { lastReason: "" }),
    };
    const fingerprint = JSON.stringify({ ...payload, action: undefined });
    if (!starts && this.fingerprint === fingerprint) return [];
    this.fingerprint = fingerprint;
    this.itemId = itemId;
    this.updatedAt = updatedAt ?? this.updatedAt;
    this.revision += 1;
    if (!starts) return updateGoalItemEvents(this.threadId, itemId, payload);
    // A resumed session may already have this stable item in Poracode's DB.
    // Duplicate starts are ignored, so completion also carries the snapshot.
    return startGoalItemEvents(this.threadId, itemId, payload).map((event) =>
      event.type === "item.completed" ? { ...event, payload } : event,
    );
  }

  toolResult(name: string, result: unknown, sessionID: string): RuntimeEvent[] {
    if (
      !/^(get_goal|create_goal|set_goal|update_goal|update_goal_plan|update_goal_status|update_goal_objective|stop_goal|replace_goal|clear_goal)$/.test(
        name,
      )
    )
      return [];
    const record = typeof result === "string" ? parseOpenCode2JsonRecord(result) : undefined;
    return this.map(record?.goal, sessionID);
  }
}

export function openCode2GoalCommand(
  config: ConfigGetOutput,
  commands: readonly { name: string }[],
): string | undefined {
  let name = "goal";
  for (const entry of config) {
    if (entry.type !== "document") continue;
    for (const plugin of entry.info.plugins ?? []) {
      if (
        typeof plugin === "string" ||
        !/(@prevalentware\/opencode-goal-plugin|prevalentWare\/opencode-goal-plugin)/i.test(
          plugin.package,
        )
      )
        continue;
      if (plugin.options?.register_command === false) return undefined;
      const configuredName = plugin.options?.command_name;
      if (
        typeof configuredName === "string" &&
        /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(configuredName.trim()) &&
        !/^(pause_goal|resume_goal)$/i.test(configuredName.trim())
      )
        name = configuredName.trim();
    }
  }
  return commands.some((command) => command.name === name) ? name : undefined;
}

export async function resolveOpenCode2GoalStatePath(
  location: ProjectLocation,
): Promise<string | undefined> {
  if (location.kind === "wsl") {
    const result = await readWslLoginShellCommandOutputAsync(
      location.distro,
      location.linuxPath,
      "sh",
      [
        "-c",
        'printf "%s" "${OPENCODE_GOAL_STATE_PATH:-${XDG_DATA_HOME:-$HOME/.local/share}/opencode-goal-plugin/goals.json}"',
      ],
    );
    return result.ok && result.stdout.trim() ? result.stdout.trim() : undefined;
  }
  return (
    process.env.OPENCODE_GOAL_STATE_PATH ||
    join(
      process.env.XDG_DATA_HOME ||
        (process.platform === "win32" ? process.env.APPDATA : undefined) ||
        join(homedir(), ".local", "share"),
      "opencode-goal-plugin",
      "goals.json",
    )
  );
}

export async function readOpenCode2GoalState(
  location: ProjectLocation,
  path: string,
  sessionID: string,
): Promise<unknown> {
  const text = await readSessionFileText(location, path);
  if (text === undefined) return undefined;
  const state = parseOpenCode2JsonRecord(text);
  // The plugin's released v1-v3 stores remain readable. Future formats are
  // ignored without modifying their bytes; canonical goal/wire schemas stay unchanged.
  if (!state || ![1, 2, 3].includes(state.version as number)) return undefined;
  const goals = readOpenCode2Record(state.goals);
  return goals ? (Object.hasOwn(goals, sessionID) ? goals[sessionID] : null) : undefined;
}
