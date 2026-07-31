import type { AgentEventIntent } from "@/shared/contracts";

/**
 * Translate a Qoder CLI hook event name + raw payload into the universal
 * Poracode `intent` vocabulary. Any event we don't care about returns
 * `undefined` and the forwarder simply exits 0 without POSTing.
 *
 * This file is the only Qoder-specific surface in the plugin pipeline:
 * the supervisor-side handler is provider-agnostic, and `forward.mjs` only
 * formats the universal envelope.
 *
 * Kept dependency-free so the same source can be transpiled to ESM and
 * re-exported as `intentMap.mjs` next to `forward.mjs` at install time.
 */
export function qoderIntentFor(
  eventName: string,
  payload:
    | {
        hook_event_name?: string;
        notification_type?: string;
        action?: string;
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
    // Tool finished (approve path) — exit `needs_approval`, still mid-turn.
    case "PostToolUse":
      return "session.turn_started";
    // Tool execution failed; Qoder recovers and `Stop` will close the turn.
    case "PostToolUseFailure":
      return "session.turn_started";
    case "ElicitationResult": {
      const a = payload?.action;
      if (a === "cancel" || a === "decline") {
        return "session.turn_finished";
      }
      return undefined;
    }
    case "Notification": {
      // Qoder's `Notification` fires for permission prompts, auth, and
      // elicitation too; only `idle_prompt` (assistant idle waiting on the
      // human) maps to `needs_reply`.
      if (payload?.notification_type === "idle_prompt") {
        return "session.needs_reply";
      }
      return undefined;
    }
    case "Stop":
      return "session.turn_finished";
    case "StopFailure":
      return "session.turn_errored";
    default:
      return undefined;
  }
}
