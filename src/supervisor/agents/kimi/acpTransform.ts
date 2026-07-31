/**
 * Kimi-specific ACP `session/update` normalization.
 *
 * Kimi streams Agent tool input over several `tool_call_update`s. The initial
 * call is only `{ title: "Agent", rawInput: undefined }`; the descriptive
 * `Launching … agent` title and structured input arrive later. Canonical ACP
 * mapping classifies a tool when it starts, so this stateful normalizer marks
 * the initial call immediately and carries the eventual input across updates.
 *
 * Kimi does not stream a child agent's internal events over ACP. The canonical
 * `detached` nesting marker prevents parallel sibling launches from being
 * inferred as parent/child calls. Background Agent calls also report the
 * launch receipt as `status: completed` even though the detached task is still
 * running; those receipts stay `in_progress` until the Kimi session-file bridge
 * observes the automatic follow-up turn.
 */

import type { SessionNotification } from "@agentclientprotocol/sdk";
import {
  createAcpSubagentCoordinator,
  normalizeAcpSubagentToolCall,
  withAcpTopLevelToolCall,
  type AcpBackgroundSubagentLaunch,
  type AcpSubagentCoordinator,
} from "../acp/subagentCoordinator";

const KIMI_SUBAGENT_TITLE = /^Launching\s+(background\s+)?([\w-]+)\s+agent:\s*(.*)$/i;
const KIMI_AGENT_TITLE = /^Agent$/i;

export type KimiBackgroundLaunch = AcpBackgroundSubagentLaunch;

export interface KimiAcpTransformCallbacks {
  subagents?: AcpSubagentCoordinator;
  onBackgroundLaunch?(launch: KimiBackgroundLaunch): void;
}

export function createKimiAcpSessionUpdateTransform(
  callbacks: KimiAcpTransformCallbacks = {},
): (notification: SessionNotification) => SessionNotification {
  const subagents = callbacks.subagents ?? createAcpSubagentCoordinator();

  return (notification) => {
    const update = notification.update;
    if (update.sessionUpdate !== "tool_call" && update.sessionUpdate !== "tool_call_update") {
      return notification;
    }

    const tool = update as {
      toolCallId?: unknown;
      title?: unknown;
      status?: unknown;
      rawInput?: unknown;
      rawOutput?: unknown;
      content?: unknown;
      _meta?: unknown;
    };
    const toolCallId = typeof tool.toolCallId === "string" ? tool.toolCallId : "";
    if (!toolCallId) return notification;

    const title = typeof tool.title === "string" ? tool.title.trim() : "";
    const titleMatch = KIMI_SUBAGENT_TITLE.exec(title);
    const previous = subagents.getCall(toolCallId);
    const isInitialAgentCall = update.sessionUpdate === "tool_call" && KIMI_AGENT_TITLE.test(title);
    if (!previous && !isInitialAgentCall && !titleMatch) return notification;

    const parsedContentInput = parseKimiAgentInput(tool.content);
    const incomingInput = isPlainRecord(tool.rawInput) ? tool.rawInput : parsedContentInput;

    const titleType = titleMatch?.[2]?.toLowerCase();
    const titleDescription = titleMatch?.[3]?.trim();
    const descriptor = subagents.updateCall(toolCallId, {
      ...(incomingInput ? { rawInput: incomingInput } : {}),
      ...(titleType ? { subagentType: titleType } : {}),
      ...(titleDescription ? { description: titleDescription } : {}),
      ...(titleMatch?.[1] !== undefined || incomingInput?.run_in_background === true
        ? { background: true }
        : {}),
    });

    const terminal = tool.status === "completed" || tool.status === "failed";
    const normalizedInput = subagents.canonicalInput(toolCallId);

    const launch = descriptor.background
      ? parseBackgroundLaunch(tool.rawOutput, tool.content)
      : undefined;
    if (launch) {
      const registered = subagents.registerBackgroundLaunch({
        sessionId: notification.sessionId,
        toolCallId,
        taskId: launch.taskId,
        ...(launch.agentId ? { agentId: launch.agentId } : {}),
      });
      if (registered) callbacks.onBackgroundLaunch?.(registered);
    }

    const backgroundLaunchReceipt =
      descriptor.background && tool.status === "completed" && launch !== undefined;

    const hideInputStream = !terminal || backgroundLaunchReceipt;
    const normalizedOutput = normalizeKimiAgentOutput(tool.rawOutput);
    const normalized = normalizeAcpSubagentToolCall(notification, {
      rawInput: normalizedInput,
      detached: descriptor.background,
      keepOpen: backgroundLaunchReceipt,
      ...(hideInputStream ? { omitContent: true, omitRawOutput: true } : {}),
      ...(!hideInputStream && normalizedOutput !== undefined
        ? { rawOutput: normalizedOutput }
        : {}),
    });
    if (terminal && !backgroundLaunchReceipt) subagents.forgetCall(toolCallId);
    // Kimi only streams Agent calls from the main ACP session. Child-agent
    // internals stay in Kimi's session files, so concurrent Agent calls are
    // siblings even while an earlier foreground call is still active.
    return update.sessionUpdate === "tool_call" ? withAcpTopLevelToolCall(normalized) : normalized;
  };
}

function normalizeKimiAgentOutput(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const summary = /(?:^|\n)\[summary\]\s*\n([\s\S]*)$/i.exec(value)?.[1]?.trim();
  return summary || value;
}

/** Stateless convenience for callers/tests that normalize one complete update. */
export function transformKimiAcpSessionUpdate(
  notification: SessionNotification,
): SessionNotification {
  return createKimiAcpSessionUpdateTransform()(notification);
}

function parseKimiAgentInput(content: unknown): Record<string, unknown> | undefined {
  const text = extractContentText(content)?.trim();
  if (!text?.startsWith("{") || !text.endsWith("}")) return undefined;
  try {
    const parsed: unknown = JSON.parse(text);
    return isPlainRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function parseBackgroundLaunch(
  rawOutput: unknown,
  content: unknown,
): { taskId: string; agentId?: string } | undefined {
  const text =
    (typeof rawOutput === "string" && rawOutput.trim().length > 0
      ? rawOutput
      : extractContentText(content)) ?? "";
  if (!/\bstatus:\s*running\b/i.test(text) || !/\bautomatic_notification:\s*true\b/i.test(text)) {
    return undefined;
  }
  const taskId = /^task_id:\s*(\S+)/im.exec(text)?.[1];
  if (!taskId) return undefined;
  const agentId = /^agent_id:\s*(\S+)/im.exec(text)?.[1];
  return { taskId, ...(agentId ? { agentId } : {}) };
}

function extractContentText(content: unknown): string | undefined {
  if (!Array.isArray(content)) return undefined;
  const parts = content.flatMap((entry) => {
    if (!isPlainRecord(entry) || entry.type !== "content" || !isPlainRecord(entry.content)) {
      return [];
    }
    return entry.content.type === "text" && typeof entry.content.text === "string"
      ? [entry.content.text]
      : [];
  });
  return parts.length > 0 ? parts.join("\n") : undefined;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
