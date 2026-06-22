import type { AgentEventIntent } from "@/shared/contracts";

/**
 * Map a Command Code hook event name to a Lightcode universal intent.
 *
 * Command Code exposes a Claude-Code-compatible hook system, but only THREE
 * events are validated by the CLI: `PreToolUse`, `PostToolUse`, `Stop`. There
 * is no turn-start (`UserPromptSubmit`) or `Notification` event, so:
 *
 *   - `Stop` is the authoritative turn-finished edge → `idle`. Unlike Copilot
 *     (which has no finish event and must run `partialL1`), this lets Command
 *     Code be a FULL L1 agent: L1 owns the working→idle transition.
 *   - `PreToolUse` / `PostToolUse` corroborate `working` while a tool runs.
 *   - Working-start for a pure-text turn has no hook; the runtime sets it
 *     optimistically on submit (initial turn) and the L2 terminal-text fallback
 *     (`detectCommandCodeTerminalStatus`, allowed via
 *     `shouldApplyTerminalStatusWhileHookActive`) covers follow-up text turns.
 *   - `needs_approval` / `needs_reply` are not hook events; they stay on L2
 *     terminal-text detection.
 *
 * NOTE: `forward.mjs` ships as a standalone ESM file and cannot import this
 * `.ts` module, so it carries its own copy of this switch. Keep the two in
 * sync (guarded by `intentMap.test.ts`).
 */
export function commandCodeIntentFor(
  eventName: string,
  payload?: { hook_event_name?: unknown } | undefined,
): AgentEventIntent | undefined {
  const name = typeof payload?.hook_event_name === "string" ? payload.hook_event_name : eventName;
  switch (name) {
    case "PreToolUse":
    case "PostToolUse":
      return "session.turn_started";
    case "Stop":
      return "session.turn_finished";
    default:
      return undefined;
  }
}
