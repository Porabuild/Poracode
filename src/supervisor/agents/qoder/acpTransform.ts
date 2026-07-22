/**
 * Qoder-specific ACP normalization.
 *
 * Qoder 1.1.x projects its internal `UpdateGoal` tool as a synthetic file edit
 * (`title: "Edit file"`, `kind: "edit"`, location `file`). The shared mapper
 * cannot distinguish that from a real edit, so this provider boundary marks
 * the exact wire signature as a canonical goal update. The marker is consumed
 * by the provider-agnostic ACP mapper and never reaches the renderer.
 */

import type { SessionNotification } from "@agentclientprotocol/sdk";
import { ACP_CANONICAL_GOAL_INPUT_KEY } from "../acp/canonicalMapping/goal";

export function transformQoderAcpSessionUpdate(
  notification: SessionNotification,
): SessionNotification {
  const update = notification.update;
  if (update.sessionUpdate !== "tool_call") return notification;
  const tool = update as {
    title?: unknown;
    kind?: unknown;
    rawInput?: unknown;
    locations?: unknown;
  };
  if (tool.title !== "Edit file" || tool.kind !== "edit" || !isRecord(tool.rawInput)) {
    return notification;
  }
  const inputKeys = Object.keys(tool.rawInput);
  if (inputKeys.length !== 1 || inputKeys[0] !== "status") return notification;
  const status = normalizeGoalStatus(tool.rawInput.status);
  if (!status || !hasSyntheticGoalLocation(tool.locations)) return notification;
  return {
    ...notification,
    update: {
      ...update,
      rawInput: {
        ...tool.rawInput,
        [ACP_CANONICAL_GOAL_INPUT_KEY]: { action: "updated", status },
      },
    } as SessionNotification["update"],
  };
}

function normalizeGoalStatus(
  value: unknown,
): "active" | "paused" | "budget_limited" | "complete" | undefined {
  if (
    value === "active" ||
    value === "paused" ||
    value === "budget_limited" ||
    value === "complete"
  ) {
    return value;
  }
  return undefined;
}

function hasSyntheticGoalLocation(value: unknown): boolean {
  return (
    Array.isArray(value) && value.some((location) => isRecord(location) && location.path === "file")
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
