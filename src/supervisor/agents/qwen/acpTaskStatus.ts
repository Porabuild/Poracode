import type { SessionNotification } from "@agentclientprotocol/sdk";
import {
  PORACODE_ACP_DETACHED_SUBAGENT_ACTIVITY_META_KEY,
  PORACODE_ACP_SUBAGENT_PROGRESS_META_KEY,
} from "../acp/canonicalMapping";
import type {
  AcpSubagentCompletionInput,
  AcpSubagentCoordinator,
} from "../acp/subagentCoordinator";
import type { AcpExtensionSessionUpdateTransform } from "../base/types";

const QWEN_ACTIVE_WORK_NOTIFICATION_METHOD = "qwen/notify/channel/active-work";
const QWEN_SESSION_TASKS_METHOD = "qwen/status/session/tasks";
const QWEN_TASK_TERMINAL_GRACE_MS = 10_000;

type ExtensionRequestContext = NonNullable<Parameters<AcpExtensionSessionUpdateTransform>[2]>;

export interface QwenAcpTaskStatusTracker {
  initializeMeta: Record<string, unknown>;
  handleNotification(
    method: string,
    params: Record<string, unknown>,
    ctx?: ExtensionRequestContext,
  ): ReturnType<AcpExtensionSessionUpdateTransform>;
}

interface QwenAcpTaskStatusOptions {
  completeTask: (
    input: AcpSubagentCompletionInput & { toolCallId: string },
  ) => SessionNotification | undefined;
}

interface QwenActiveWorkSession {
  sessionId: string;
  agentTaskIds: Set<string>;
  notificationTaskIds: Set<string>;
}

interface QwenTaskSnapshotResult {
  notifications: SessionNotification[];
  needsFollowup: boolean;
}

export function createQwenAcpTaskStatusTracker(
  subagents: AcpSubagentCoordinator,
  options: QwenAcpTaskStatusOptions,
): QwenAcpTaskStatusTracker {
  const terminalObservedAtByTaskId = new Map<string, number>();
  const snapshotRequests = new Set<string>();
  const reconcilingSessions = new Set<string>();
  return {
    initializeMeta: {
      "qwen.daemon.activeWorkHeartbeat": {
        v: 1,
        intervalMs: 5_000,
        categories: ["agent", "notification"],
      },
    },
    handleNotification(method, params, ctx) {
      if (method !== QWEN_ACTIVE_WORK_NOTIFICATION_METHOD) return undefined;
      const sessions = readQwenActiveWorkSessions(params);
      if (!ctx || sessions.length === 0) return [];
      return Promise.all(
        sessions.map(async (session) => {
          const { sessionId } = session;
          const hasActiveHolds =
            session.agentTaskIds.size > 0 || session.notificationTaskIds.size > 0;
          if (hasActiveHolds || subagents.hasBackgroundTasks()) {
            reconcilingSessions.add(sessionId);
          }
          if (!hasActiveHolds && !reconcilingSessions.has(sessionId)) return [];
          if (snapshotRequests.has(sessionId)) return [];
          snapshotRequests.add(sessionId);
          try {
            const snapshot = await ctx.request(QWEN_SESSION_TASKS_METHOD, { sessionId });
            const result = qwenTaskSnapshotNotifications(
              sessionId,
              snapshot,
              session.notificationTaskIds,
              subagents,
              terminalObservedAtByTaskId,
              options.completeTask,
            );
            if (result.needsFollowup) reconcilingSessions.add(sessionId);
            else if (!hasActiveHolds) reconcilingSessions.delete(sessionId);
            return result.notifications;
          } finally {
            snapshotRequests.delete(sessionId);
          }
        }),
      ).then((groups) => groups.flat());
    },
  };
}

function readQwenActiveWorkSessions(params: Record<string, unknown>): QwenActiveWorkSession[] {
  if (params.v !== 1 || !Array.isArray(params.sessions)) return [];
  const sessions = new Map<string, QwenActiveWorkSession>();
  for (const entry of params.sessions) {
    const record = plainRecord(entry);
    const sessionId = readString(record, "sessionId")?.trim();
    if (!sessionId || sessions.has(sessionId)) continue;
    const session: QwenActiveWorkSession = {
      sessionId,
      agentTaskIds: new Set(),
      notificationTaskIds: new Set(),
    };
    if (Array.isArray(record.holds)) {
      for (const holdValue of record.holds) {
        const hold = plainRecord(holdValue);
        const id = readString(hold, "id")?.trim();
        const category = readString(hold, "category");
        if (!id) continue;
        if (category === "agent") session.agentTaskIds.add(id);
        else if (category === "notification") session.notificationTaskIds.add(id);
      }
    }
    sessions.set(sessionId, session);
  }
  return [...sessions.values()];
}

function qwenTaskSnapshotNotifications(
  sessionId: string,
  snapshot: Record<string, unknown>,
  notificationTaskIds: ReadonlySet<string>,
  subagents: AcpSubagentCoordinator,
  terminalObservedAtByTaskId: Map<string, number>,
  completeTask: QwenAcpTaskStatusOptions["completeTask"],
): QwenTaskSnapshotResult {
  if (snapshot.v !== 1 || snapshot.sessionId !== sessionId || !Array.isArray(snapshot.tasks)) {
    return { notifications: [], needsFollowup: false };
  }
  const notifications: SessionNotification[] = [];
  let needsFollowup = false;
  const now = Date.now();

  for (const value of snapshot.tasks) {
    const task = plainRecord(value);
    if (readString(task, "kind") !== "agent") continue;
    const taskId = readString(task, "id")?.trim();
    if (!taskId) continue;
    const toolUseId = readString(task, "toolUseId")?.trim();
    const toolCallId =
      subagents.resolveBackgroundToolCallId(taskId) ??
      (toolUseId && subagents.getCall(toolUseId) ? toolUseId : undefined);
    if (!toolCallId) {
      terminalObservedAtByTaskId.delete(taskId);
      continue;
    }

    const status = readString(task, "status")?.toLowerCase();
    if (!isQwenTaskStatus(status)) continue;
    const progress = qwenTaskProgress(task);
    if (status === "running" || status === "pending") {
      terminalObservedAtByTaskId.delete(taskId);
      needsFollowup = true;
      notifications.push(qwenTaskProgressNotification(sessionId, toolCallId, progress, subagents));
      continue;
    }

    notifications.push(qwenTaskProgressNotification(sessionId, toolCallId, progress, subagents));
    if (status === "paused") {
      terminalObservedAtByTaskId.delete(taskId);
      const reason = readString(task, "resumeBlockedReason")?.trim();
      const completed = completeTask({
        sessionId,
        toolCallId,
        status: "paused",
        ...(reason ? { result: reason } : {}),
        terminalMeta: { [PORACODE_ACP_SUBAGENT_PROGRESS_META_KEY]: progress },
      });
      if (completed) notifications.push(completed);
      continue;
    }

    if (notificationTaskIds.has(taskId)) {
      terminalObservedAtByTaskId.delete(taskId);
      needsFollowup = true;
      continue;
    }

    const observedAt = terminalObservedAtByTaskId.get(taskId);
    if (observedAt === undefined) {
      terminalObservedAtByTaskId.set(taskId, now);
      needsFollowup = true;
      continue;
    }
    if (now - observedAt < QWEN_TASK_TERMINAL_GRACE_MS) {
      needsFollowup = true;
      continue;
    }

    terminalObservedAtByTaskId.delete(taskId);
    const error =
      readString(task, "error")?.trim() ?? readString(task, "resumeBlockedReason")?.trim();
    const completed = completeTask({
      sessionId,
      toolCallId,
      status:
        status === "completed" ? "completed" : status === "cancelled" ? "cancelled" : "failed",
      ...(error ? { result: error } : {}),
      terminalMeta: { [PORACODE_ACP_SUBAGENT_PROGRESS_META_KEY]: progress },
    });
    if (completed) notifications.push(completed);
  }

  return { notifications, needsFollowup };
}

function qwenTaskProgressNotification(
  sessionId: string,
  toolCallId: string,
  progress: Record<string, unknown>,
  subagents: AcpSubagentCoordinator,
): SessionNotification {
  return {
    sessionId,
    update: {
      sessionUpdate: "tool_call_update",
      toolCallId,
      status: "in_progress",
      rawInput: subagents.canonicalInput(toolCallId),
      _meta: {
        [PORACODE_ACP_DETACHED_SUBAGENT_ACTIVITY_META_KEY]: toolCallId,
        [PORACODE_ACP_SUBAGENT_PROGRESS_META_KEY]: progress,
      },
    },
  };
}

function isQwenTaskStatus(
  status: string | undefined,
): status is "pending" | "running" | "paused" | "completed" | "failed" | "cancelled" {
  return (
    status === "pending" ||
    status === "running" ||
    status === "paused" ||
    status === "completed" ||
    status === "failed" ||
    status === "cancelled"
  );
}

function qwenTaskProgress(task: Record<string, unknown>): Record<string, unknown> {
  const stats = plainRecord(task.stats);
  const activities = Array.isArray(task.recentActivities)
    ? task.recentActivities.map(plainRecord)
    : [];
  const latest = activities.at(-1);
  const description =
    (latest ? readString(latest, "description")?.trim() : undefined) ??
    readString(task, "description")?.trim();
  const lastToolName = latest ? readString(latest, "name")?.trim() : undefined;
  const summary = readString(task, "label")?.trim();
  const tokens = readNonNegativeInteger(stats, "totalTokens");
  const toolUses = readNonNegativeInteger(stats, "toolUses");
  const durationMs = readNonNegativeNumber(task, "runtimeMs");
  const stepCount = toolUses ?? (activities.length > 0 ? activities.length : undefined);
  return {
    ...(description ? { description } : {}),
    ...(lastToolName ? { lastToolName } : {}),
    ...(summary ? { summary } : {}),
    ...(tokens !== undefined ? { tokens } : {}),
    ...(toolUses !== undefined ? { toolUses } : {}),
    ...(durationMs !== undefined ? { durationMs: Math.trunc(durationMs) } : {}),
    ...(stepCount !== undefined ? { stepCount } : {}),
  };
}

function plainRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" ? value : undefined;
}

function readNonNegativeNumber(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function readNonNegativeInteger(record: Record<string, unknown>, key: string): number | undefined {
  const value = readNonNegativeNumber(record, key);
  return value !== undefined && Number.isInteger(value) ? value : undefined;
}
