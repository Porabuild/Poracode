/**
 * Slash gestures the MSP host implements as session commands rather than as
 * turn input. `/compact` runs `session/compact`, and `/goal …` runs the
 * `goal/*` verbs (verified live against `muse` 1.3.0, whose schema added
 * goal control — the 1.0.x generation this file was written for had neither
 * a command-listing method nor a goal API). Every other TUI built-in stays
 * out of the GUI command list: MSP still exposes no command listing, so
 * there is nothing to discover.
 */

import type { ThreadGoalControl } from "@/shared/contracts";
import type { MuseGoalCommand } from "@/shared/agents/museGoalCommand";

/** Whether a submitted prompt is the bare `/compact` gesture. */
export function isMuseCompactCommand(prompt: string): boolean {
  return prompt.trim().toLowerCase() === "/compact";
}

export { parseMuseGoalCommand, type MuseGoalCommand } from "@/shared/agents/museGoalCommand";

export type MuseGoalRpcMethod =
  | "goal/clear"
  | "goal/edit"
  | "goal/pause"
  | "goal/resume"
  | "goal/set";

/** The `goal/*` RPC a parsed gesture or dock control runs, if any. */
export function museGoalCommandMethod(
  verb: MuseGoalCommand["kind"] | ThreadGoalControl["action"],
): MuseGoalRpcMethod | undefined {
  switch (verb) {
    case "set":
      return "goal/set";
    case "edit":
      return "goal/edit";
    case "pause":
      return "goal/pause";
    case "resume":
      return "goal/resume";
    case "clear":
      return "goal/clear";
    default:
      return undefined;
  }
}
