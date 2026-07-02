import type { AgentEventIntent } from "@/shared/contracts";

/**
 * NOTE: `forward.mjs` has its own copy of `cursorIntentFor` because it ships
 * as a standalone ESM file inside `~/.poracode/agent-plugins/cursor/` and
 * cannot import from a `.ts` file. Keep the two in sync.
 */
export interface CursorHookPayload {
  hook_event_name?: string;
  conversation_id?: string;
  generation_id?: string;
  status?: string;
  loop_count?: number;
  tool_name?: string;
  agent_message?: string;
  cursor_version?: string;
  model?: string;
}

export function cursorIntentFor(
  eventName: string,
  payload: CursorHookPayload | undefined,
): AgentEventIntent | undefined {
  const name = payload?.hook_event_name ?? eventName;
  switch (name) {
    case "sessionStart":
      return "session.started";
    case "beforeSubmitPrompt":
    case "preToolUse":
    case "postToolUse":
      return "session.turn_started";
    case "stop": {
      const status = `${payload?.status ?? ""}`.toLowerCase();
      if (status === "error" || status === "aborted") return "session.turn_errored";
      return "session.turn_finished";
    }
    default:
      return undefined;
  }
}
