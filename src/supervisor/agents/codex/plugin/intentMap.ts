import type { AgentEventIntent } from "@/shared/contracts";

/**
 * Map Codex `hook_event_name` + stdin payload to Poracode intents.
 * PreToolUse / PostToolUse are omitted unless debug (see forward.mjs).
 */
export function codexIntentFor(
  eventName: string,
  payload: { hook_event_name?: string } | undefined,
  hookDebug: boolean,
): AgentEventIntent | undefined {
  const name = payload?.hook_event_name ?? eventName;
  switch (name) {
    case "SessionStart":
      return "session.started";
    case "UserPromptSubmit":
      return "session.turn_started";
    case "PermissionRequest":
      return "session.needs_approval";
    case "Stop":
      return "session.turn_finished";
    case "PreToolUse":
    case "PostToolUse":
      return hookDebug ? "session.turn_started" : undefined;
    default:
      return undefined;
  }
}
