/**
 * Kimi-specific ACP `session/update` normalization.
 *
 * Two wire shapes of the `Agent` tool must normalize into the shared
 * subagent shape — the v2 engine (0.33.0+, `kimi acp` default) and the
 * legacy engine (still selectable via `KIMI_CODE_LEGACY_FLAG=1`):
 *
 * Legacy engine: a bare `{ title: "Agent" }` CREATE first; the descriptive
 * `Launching … agent` title and structured input arrive on later
 * `tool_call_update`s.
 *
 * v2 engine: the first `tool.call.delta` lazily CREATEs the `tool_call`
 * with the raw tool name as title (`"Agent"` again), status `pending`, and
 * a PARTIAL args-text fragment as content. Later deltas send
 * `tool_call_update`s whose content is the CUMULATIVE (REPLACE) args text.
 * `tool.call.started` then finalizes the call with a `tool_call_update`
 * that rewrites the title to `Launching (background )?<profile> agent:
 * <description>` and carries kind/rawInput/locations. When the args were
 * never streamed, the started event emits a plain CREATE with status
 * `in_progress` + rawInput instead. `tool.progress` emits title-only
 * updates; `tool.result` emits the terminal completed/failed update.
 *
 * In both shapes the shared mapper must classify the call as a subagent
 * from its first notification, so this stateful normalizer marks the bare
 * initial call immediately and carries the eventual input across updates.
 * Kimi does not stream a child agent's internal events over ACP; the
 * canonical `detached` nesting marker prevents parallel sibling launches
 * from being inferred as parent/child calls.
 *
 * A detached launch reports `task_id: …\nstatus: running\n…
 * automatic_notification: true` as its tool result and keeps running even
 * though the tool call "completed". Such receipts stay `in_progress` until
 * the Kimi session-file bridge observes the task settle (the follow-up
 * notification turn is only ever visible on disk, never over ACP). Since
 * v2 can also detach a call mid-run that started in the foreground
 * (`waitForForegroundRelease` → `detached`), the receipt is recognized on
 * ANY terminal Agent update, not only ones already known to be background.
 */

import type { SessionNotification } from "@agentclientprotocol/sdk";
import { findThoughtLevelConfigOption } from "../acp/thoughtLevel";
import {
  createAcpSubagentCoordinator,
  normalizeAcpSubagentToolCall,
  withAcpTopLevelToolCall,
  type AcpBackgroundSubagentLaunch,
  type AcpSubagentCoordinator,
} from "../acp/subagentCoordinator";
import { normalizeKimiThoughtLevelOption } from "./thoughtLevels";

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
    if (update.sessionUpdate === "config_option_update") {
      return normalizeKimiConfigOptionUpdate(notification);
    }
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
    const terminal = tool.status === "completed" || tool.status === "failed";
    // The detached-launch receipt can arrive on a call never marked
    // background (v2 detaches foreground calls mid-run), so parse it on
    // every terminal update and let it flip the descriptor.
    const launch = terminal ? parseBackgroundLaunch(tool.rawOutput, tool.content) : undefined;

    const descriptor = subagents.updateCall(toolCallId, {
      ...(incomingInput ? { rawInput: incomingInput } : {}),
      ...(titleType ? { subagentType: titleType } : {}),
      ...(titleDescription ? { description: titleDescription } : {}),
      ...(titleMatch?.[1] !== undefined ||
      incomingInput?.run_in_background === true ||
      launch !== undefined
        ? { background: true }
        : {}),
    });

    const normalizedInput = subagents.canonicalInput(toolCallId);

    if (launch) {
      const registered = subagents.registerBackgroundLaunch({
        sessionId: notification.sessionId,
        toolCallId,
        taskId: launch.taskId,
        ...(launch.agentId ? { agentId: launch.agentId } : {}),
      });
      if (registered) callbacks.onBackgroundLaunch?.(registered);
    }

    const backgroundLaunchReceipt = launch !== undefined && tool.status === "completed";

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

/**
 * Strip the untiered `on` thought level out of a live `config_option_update`.
 *
 * The session's config sync adopts the thought-level `currentValue` verbatim as
 * the thread's effort, and Kimi reports `on` even for the tiered K3 models —
 * which the capability probe deliberately does not surface as a tier. Without
 * this, a K3 thread's reasoning would read `On` while its picker offers only
 * `Low`/`High`/`Max`.
 */
function normalizeKimiConfigOptionUpdate(notification: SessionNotification): SessionNotification {
  const update = notification.update as { configOptions?: unknown };
  if (!Array.isArray(update.configOptions)) return notification;
  const thoughtLevel = findThoughtLevelConfigOption(update.configOptions);
  if (!thoughtLevel) return notification;
  const normalized = normalizeKimiThoughtLevelOption(thoughtLevel);
  if (normalized === thoughtLevel) return notification;
  return {
    ...notification,
    update: {
      ...notification.update,
      configOptions: update.configOptions.map((option) =>
        option === thoughtLevel ? normalized : option,
      ),
    } as SessionNotification["update"],
  };
}

/**
 * Parse the cumulative args text Kimi streams as tool-call content. Legacy
 * deltas stream the same JSON text; v2 starts from a partial fragment, so
 * incomplete JSON simply yields `undefined` until the args assemble.
 */
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
