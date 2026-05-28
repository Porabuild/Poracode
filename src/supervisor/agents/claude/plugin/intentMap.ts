import type { AgentEventIntent } from "@/shared/contracts";

/**
 * Translate a Claude Code hook event name + raw payload into the universal
 * Lightcode `intent` vocabulary. Any event we don't care about returns
 * `undefined` and the forwarder simply exits 0 without POSTing.
 *
 * This file is the only Claude-specific surface in the plugin pipeline:
 * the supervisor-side handler is provider-agnostic, and `forward.mjs` only
 * formats the universal envelope.
 *
 * Kept dependency-free so the same source can be transpiled to ESM and
 * re-exported as `intentMap.mjs` next to `forward.mjs` at install time.
 */
export function claudeIntentFor(
  eventName: string,
  payload:
    | {
        hook_event_name?: string;
        matcher?: string;
        action?: string;
        is_interrupt?: boolean;
      }
    | undefined,
): AgentEventIntent | undefined {
  switch (eventName) {
    case "SessionStart":
      return "session.started";
    case "UserPromptSubmit":
      return "session.turn_started";
    case "PermissionRequest":
      return "session.needs_approval";
    case "PermissionDenied":
      return "session.turn_started";
    case "PostToolUse":
      return "session.turn_started";
    // `is_interrupt: true` means the user interrupted the tool — `Stop` will
    // NOT fire afterwards (per Claude docs), so this event is the actual
    // turn end. Otherwise Claude recovers and `Stop` will close the turn.
    case "PostToolUseFailure":
      return payload?.is_interrupt === true ? "session.turn_finished" : "session.turn_started";
    case "ElicitationResult": {
      const a = payload?.action;
      if (a === "cancel" || a === "decline") {
        return "session.turn_finished";
      }
      return undefined;
    }
    case "Notification": {
      const matcher = payload?.matcher;
      // Claude's `Notification` fires for several reasons; only `idle_prompt`
      // (assistant is idle waiting on the human) maps to `needs_reply`.
      if (matcher === "idle_prompt") {
        return "session.needs_reply";
      }
      return undefined;
    }
    case "TaskCreated":
      return "session.turn_started";
    case "TaskCompleted":
      return "session.turn_finished";
    case "Stop":
      return "session.turn_finished";
    case "StopFailure":
      return "session.turn_errored";
    default:
      return undefined;
  }
}
