import { homedir } from "node:os";
import { join } from "node:path";
import type { GoalItemPayload, ProjectLocation, RuntimeEvent } from "@/shared/contracts";
import { readSessionFileText, readWslLoginShellCommandOutputAsync } from "../base";
import { startGoalItemEvents, updateGoalItemEvents } from "../goalRuntime";
import { newItemId } from "../contextUsage";
import type { ConfigGetOutput, OpenCodeClient } from "./clientTypes";
import { parseOpenCodeJsonRecord, readOpenCodeRecord } from "./readers";

const statuses = {
  active: "active",
  paused: "paused",
  budgetLimited: "budget_limited",
  usageLimited: "budget_limited",
  complete: "complete",
  unmet: "failed",
  cancelled: "cancelled",
} as const;

type GoalSource = "plugin" | "native";

/**
 * Goal owners keep persistence; Poracode only projects their snapshots. Two
 * owners exist: the prevalentWare goal plugin (state file + tools) and
 * OpenCode 2.2.1+'s built-in `/goal` (RPC `opencode.goal` + change events).
 * A cleared report from one owner must never erase the other's live goal.
 */
export class OpenCodeGoals {
  revision = 0;
  commandName: string | undefined;
  private itemId: string | undefined;
  private fingerprint: string | undefined;
  private updatedAt = 0;
  private source: GoalSource | undefined;

  constructor(private readonly threadId: string) {}

  /** Which goal owner produced the currently projected goal, if any. */
  get currentSource(): GoalSource | undefined {
    return this.source;
  }

  map(raw: unknown, sessionID: string): RuntimeEvent[] {
    return this.apply(raw, sessionID, "plugin");
  }

  /**
   * Project a native goal state (`{id, objective, status, reason?, rounds,
   * maxRounds, updatedAt}`), normalized to the plugin snapshot shape. Native
   * timestamps are epoch milliseconds; canonical goal timestamps are seconds.
   */
  mapNative(raw: unknown, sessionID: string): RuntimeEvent[] {
    if (raw === undefined || raw === null) return this.apply(raw, sessionID, "native");
    const goal = readOpenCodeRecord(raw);
    if (!goal) return [];
    const updatedAt = goal.updatedAt;
    return this.apply(
      {
        ...goal,
        id: typeof goal.id === "string" && goal.id ? `native:${goal.id}` : goal.id,
        autoTurns: goal.rounds,
        stopReason: goal.reason,
        ...(typeof updatedAt === "number" && updatedAt > 1e11
          ? { updatedAt: updatedAt / 1000 }
          : {}),
      },
      sessionID,
      "native",
    );
  }

  private apply(raw: unknown, sessionID: string, source: GoalSource): RuntimeEvent[] {
    if (raw === undefined) return [];
    if (raw === null) {
      if (this.source !== undefined && this.source !== source) return [];
      const itemId = this.itemId ?? newItemId("opencode-goal");
      if (this.fingerprint === "cleared") return [];
      const events = this.itemId
        ? updateGoalItemEvents(this.threadId, itemId, { action: "cleared" })
        : startGoalItemEvents(this.threadId, itemId, { action: "cleared" });
      this.itemId = undefined;
      this.fingerprint = "cleared";
      this.updatedAt = 0;
      this.source = source;
      this.revision += 1;
      return events;
    }
    const goal = readOpenCodeRecord(raw);
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
    const itemId = `opencode-goal-${this.threadId}-${goalId}`;
    const starts = this.itemId !== itemId;
    const terminal = status === "complete" || status === "failed" || status === "cancelled";
    const payload: GoalItemPayload = {
      action: starts ? "set" : "updated",
      objective: goal.objective,
      status,
      providerThreadId: sessionID,
      // The plugin command also edits the objective; native /goal does not.
      availableActions: !this.commandName
        ? []
        : terminal
          ? ["clear"]
          : source === "native"
            ? [status === "active" ? "pause" : "resume", "clear"]
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
    this.source = source;
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
    const record = typeof result === "string" ? parseOpenCodeJsonRecord(result) : undefined;
    return this.map(record?.goal, sessionID);
  }
}

/** RPC id of OpenCode's built-in goal plugin (2.2.1+). */
export const OPENCODE_NATIVE_GOAL_RPC_ID = "opencode.goal";
/** SSE event type the built-in goal plugin publishes on every goal write. */
export const OPENCODE_NATIVE_GOAL_CHANGED_EVENT = "rpc.opencode.goal.changed";

/**
 * Read the session's native goal through the goal RPC. Returns the goal (or
 * null when none is set); `undefined` when the client has no RPC transport.
 * Servers without the native goal plugin reject the call — callers treat a
 * rejection as "unsupported" and stop asking.
 */
export async function readOpenCodeNativeGoal(
  client: OpenCodeClient,
  directory: string,
  sessionID: string,
): Promise<unknown> {
  if (typeof client.rpc?.call !== "function") return undefined;
  const result = await client.rpc.call(
    {
      rpcID: OPENCODE_NATIVE_GOAL_RPC_ID,
      method: "get",
      input: { sessionID },
      location: { directory },
    },
    { signal: AbortSignal.timeout(10_000) },
  );
  return result && typeof result === "object" && "output" in result ? result.output : undefined;
}

export function openCodeGoalCommand(
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

export async function resolveOpenCodeGoalStatePath(
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

export async function readOpenCodeGoalState(
  location: ProjectLocation,
  path: string,
  sessionID: string,
): Promise<unknown> {
  const text = await readSessionFileText(location, path);
  if (text === undefined) return undefined;
  const state = parseOpenCodeJsonRecord(text);
  // The plugin's released v1-v3 stores remain readable. Future formats are
  // ignored without modifying their bytes; canonical goal/wire schemas stay unchanged.
  if (!state || ![1, 2, 3].includes(state.version as number)) return undefined;
  const goals = readOpenCodeRecord(state.goals);
  return goals ? (Object.hasOwn(goals, sessionID) ? goals[sessionID] : null) : undefined;
}
