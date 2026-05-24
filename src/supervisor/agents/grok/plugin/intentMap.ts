import type { AgentEventIntent } from "@/shared/contracts";

export interface GrokHookPayload {
  hookEventName?: string;
  notificationType?: string;
  notification_type?: string;
  type?: string;
  message?: string;
}

function normalizeEventName(eventName: string, payload: GrokHookPayload | undefined): string {
  return payload?.hookEventName ?? eventName;
}

function notificationNeedsApproval(payload: GrokHookPayload | undefined): boolean {
  const notificationType = `${
    payload?.notificationType ?? payload?.notification_type ?? payload?.type ?? ""
  }`.toLowerCase();
  const message = `${payload?.message ?? ""}`.toLowerCase();
  return (
    notificationType.includes("permission") ||
    notificationType.includes("approval") ||
    message.includes("permission") ||
    message.includes("approval")
  );
}

/**
 * Mirror of the hook surface registered in `install.ts`. Grok's TUI fires
 * lifecycle events in PascalCase on `argv[2]` (the form we register in the
 * hooks JSON) and includes the snake_case `hookEventName` on the stdin
 * payload. We accept either casing.
 *
 *   - SessionStart    → `session.started`        (bookkeeping / install proof-of-life)
 *   - UserPromptSubmit → `session.turn_started`  (turn open)
 *   - Stop            → `session.turn_finished`  (turn close — redundant with OSC 9;4 but authoritative when present)
 *   - Notification    → `session.needs_approval` (only when payload indicates approval/permission)
 *
 * `PreToolUse` / `PostToolUse` are intentionally not registered: they all
 * converge on `session.turn_started`, and OSC parsing already provides a
 * working/idle edge from Grok's braille spinner + iTerm2 OSC 9;4 progress.
 */
export function grokIntentFor(
  eventName: string,
  payload: GrokHookPayload | undefined,
): AgentEventIntent | undefined {
  const name = normalizeEventName(eventName, payload).toLowerCase();
  switch (name) {
    case "sessionstart":
    case "session_start":
      return "session.started";
    case "userpromptsubmit":
    case "user_prompt_submit":
      return "session.turn_started";
    case "stop":
      return "session.turn_finished";
    case "notification":
      return notificationNeedsApproval(payload) ? "session.needs_approval" : undefined;
    default:
      return undefined;
  }
}
