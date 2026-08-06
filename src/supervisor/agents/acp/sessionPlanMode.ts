/**
 * Infer agent-initiated plan-mode transitions from the `session/update` stream.
 *
 * ACP's own signal for this is the `current_mode_update` notification: the spec
 * says an agent "can also change its own mode and let the Client know by
 * sending the `current_mode_update` session notification" — expected practice,
 * not a `MUST`, and there is no way for a client to read the current mode
 * mid-session (no `session/get_mode`; `SessionModeState.currentModeId` only
 * comes back from `session/new` / `session/load` / `session/resume`).
 *
 * Kimi Code exercises exactly that gap: its `EnterPlanMode` / `ExitPlanMode`
 * tools move the session in and out of plan mode without emitting the
 * notification, so the composer kept showing the stale mode. This tracker
 * watches the tool-call stream instead. It is a local inference only — nothing
 * is sent to the agent.
 *
 * Transitions have to be correlated by tool call id rather than matched on a
 * single update: a real Kimi sequence renames the call and drops the title on
 * the way to `completed`, e.g.
 *   `tool_call        { toolCallId: "0:tool_x", title: "EnterPlanMode", status: "pending" }`
 *   `tool_call_update { toolCallId: "0:tool_x", status: "in_progress" }`
 *   `tool_call_update { toolCallId: "0:tool_x", title: "Requesting to enter plan mode" }`
 *   `tool_call_update { toolCallId: "0:tool_x", status: "completed" }`   ← no title
 * so the id is remembered when the tool is first announced and resolved when
 * that id reports a terminal status.
 */
import type { SessionUpdate } from "@agentclientprotocol/sdk";
import {
  extractToolCallContentText,
  isAcpEnterPlanModeTool,
  isAcpExitPlanModeTool,
} from "./canonicalMapping/contentExtraction";

export type AcpPlanModeTransition = "entered" | "exited";

/** Terminal tool-call statuses that mean the call did not run to completion. */
const UNSUCCESSFUL_STATUSES = new Set(["failed", "cancelled", "canceled"]);

/**
 * A plan review can end in several ways, and an agent may report the ones that
 * decline the plan as a *failed* tool call even when plan mode did end. Kimi's
 * `ExitPlanMode` results are explicit about which happened — "Plan mode
 * deactivated." for approve/auto-approve and "Reject and Exit", "Plan mode
 * remains active." for Revise, dismiss, and a plain reject — so the result text
 * decides when the status alone is ambiguous.
 */
const PLAN_MODE_STILL_ACTIVE_PATTERN = /plan mode\s+(?:remains|is still)\s+active/i;
const PLAN_MODE_ENDED_PATTERN = /(?:exited plan mode|plan mode\s+(?:deactivated|exited))/i;

function readString(update: SessionUpdate, key: string): string | undefined {
  if (!(key in update)) return undefined;
  const value = (update as unknown as Record<string, unknown>)[key];
  return typeof value === "string" ? value : undefined;
}

function readContent(update: SessionUpdate): unknown {
  return "content" in update ? (update as unknown as Record<string, unknown>).content : undefined;
}

export class AcpPlanModeToolTracker {
  private readonly enterToolCallIds = new Set<string>();
  private readonly exitToolCallIds = new Set<string>();

  /**
   * Feed a `tool_call` / `tool_call_update` notification.
   *
   * Returns the transition a tracked plan-mode tool call just completed, or
   * `undefined` when the update says nothing about the mode. Conservative on
   * both sides: a failed `EnterPlanMode` never enters, and an `ExitPlanMode`
   * whose outcome is unclear is treated as still planning.
   */
  observe(update: SessionUpdate): AcpPlanModeTransition | undefined {
    if (update.sessionUpdate !== "tool_call" && update.sessionUpdate !== "tool_call_update") {
      return undefined;
    }
    const toolCallId = readString(update, "toolCallId");
    if (!toolCallId) return undefined;

    const title = readString(update, "title");
    const kind = readString(update, "kind");
    if (isAcpEnterPlanModeTool(title, kind)) this.enterToolCallIds.add(toolCallId);
    if (isAcpExitPlanModeTool(title, kind)) this.exitToolCallIds.add(toolCallId);

    const status = readString(update, "status");
    if (!status) return undefined;

    if (this.enterToolCallIds.has(toolCallId)) {
      if (status === "completed") {
        this.enterToolCallIds.delete(toolCallId);
        return "entered";
      }
      if (UNSUCCESSFUL_STATUSES.has(status)) {
        // A failed EnterPlanMode leaves the agent where it was — this is the
        // shape the `Tool "EnterPlanMode" failed: Internal error` regression
        // produced, and it must not move the client's mode.
        this.enterToolCallIds.delete(toolCallId);
      }
      return undefined;
    }

    if (this.exitToolCallIds.has(toolCallId)) {
      if (status !== "completed" && !UNSUCCESSFUL_STATUSES.has(status)) return undefined;
      this.exitToolCallIds.delete(toolCallId);
      const text = extractToolCallContentText(readContent(update));
      if (text && PLAN_MODE_STILL_ACTIVE_PATTERN.test(text)) return undefined;
      if (status === "completed") return "exited";
      return text && PLAN_MODE_ENDED_PATTERN.test(text) ? "exited" : undefined;
    }

    return undefined;
  }

  /** Drop correlations across session open/replay boundaries. */
  reset(): void {
    this.enterToolCallIds.clear();
    this.exitToolCallIds.clear();
  }
}
