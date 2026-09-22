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

/** Whether a submitted prompt is the bare `/compact` gesture. */
export function isMuseCompactCommand(prompt: string): boolean {
  return prompt.trim().toLowerCase() === "/compact";
}

/**
 * A `/goal` submission parsed into its TUI verb. Mirrors the documented
 * gestures (`/goal`, `/goal <objective>`, `/goal edit <objective>`,
 * `/goal pause|resume|clear`): bare verbs match exactly (an objective that
 * merely starts with one, e.g. "pause for thought", still sets), and
 * anything else non-empty sets the whole remainder as the objective.
 * `view` needs no RPC — the goal dock already shows the current goal — and
 * a bare `/goal edit` is its own kind so the session can nudge toward the
 * usage instead of setting the word "edit" as an objective.
 */
export type MuseGoalCommand =
  | { kind: "set"; objective: string }
  | { kind: "edit"; objective: string }
  | { kind: "view" }
  | { kind: "editUsage" }
  | { kind: "pause" }
  | { kind: "resume" }
  | { kind: "clear" };

export function parseMuseGoalCommand(prompt: string): MuseGoalCommand | undefined {
  const match = /^\/goal(?:\s+([\s\S]*))?$/iu.exec(prompt.trim());
  if (!match) return undefined;
  const rawArgs = match[1]?.trim() ?? "";
  if (rawArgs.length === 0) return { kind: "view" };
  if (/^(clear|reset|off|none)$/iu.test(rawArgs)) return { kind: "clear" };
  if (/^pause$/iu.test(rawArgs)) return { kind: "pause" };
  if (/^resume$/iu.test(rawArgs)) return { kind: "resume" };
  const edit = /^edit(?:\s+([\s\S]*))?$/iu.exec(rawArgs);
  if (edit) {
    const objective = edit[1]?.trim() ?? "";
    if (objective.length === 0) return { kind: "editUsage" };
    return { kind: "edit", objective };
  }
  return { kind: "set", objective: rawArgs };
}

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
