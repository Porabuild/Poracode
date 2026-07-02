import type { AgentEventIntent } from "@/shared/contracts";

/**
 * Map GitHub Copilot CLI hook event name to a Poracode universal intent.
 *
 * Copilot CLI exposes 6 hook events: sessionStart, sessionEnd,
 * userPromptSubmitted, preToolUse, postToolUse, errorOccurred. There is no
 * `agentStop` / "turn finished" event for the CLI (cloud agent has those, the
 * CLI does not), so the adapter sets `partialL1: true` and L2 OSC parsing
 * keeps running to detect the working->idle edge.
 *
 * NOTE: `forward.mjs` has its own copy of this switch because it ships as a
 * standalone ESM file inside `~/.poracode/agent-plugins/copilot/` and cannot
 * import from a `.ts` file. Keep the two in sync.
 */
export function copilotIntentFor(eventName: string): AgentEventIntent | undefined {
  switch (eventName) {
    case "sessionStart":
      return "session.started";
    case "userPromptSubmitted":
    case "preToolUse":
    case "postToolUse":
      return "session.turn_started";
    case "errorOccurred":
      return "session.turn_errored";
    case "sessionEnd":
      return "session.turn_finished";
    default:
      return undefined;
  }
}
