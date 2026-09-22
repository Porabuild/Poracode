/**
 * Muse `/goal` gesture grammar. Shared so the supervisor's MSP session (which
 * dispatches the `goal/*` verbs) and the Muse capability declaration (which
 * titles a new thread from its goal objective) parse the same submission the same way.
 */

import type { ThreadTitleCommand } from "@/shared/contracts";

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

const MUSE_GOAL_CLEAR_ARGUMENTS: readonly string[] = ["clear", "reset", "off", "none"];

/**
 * The `/goal` grammar as a declarative thread-title rule: `/goal <objective>`
 * and `/goal edit <objective>` title a new thread from the objective, while
 * the bare control verbs keep the typed prompt. Derived from the same verb
 * lists the parser below uses, so the two cannot drift.
 */
export const MUSE_GOAL_THREAD_TITLE_COMMAND = {
  command: "goal",
  argumentSubcommands: ["edit"],
  controlArguments: [...MUSE_GOAL_CLEAR_ARGUMENTS, "pause", "resume"],
} as const satisfies ThreadTitleCommand;

export function parseMuseGoalCommand(prompt: string): MuseGoalCommand | undefined {
  const match = /^\/goal(?:\s+([\s\S]*))?$/iu.exec(prompt.trim());
  if (!match) return undefined;
  const rawArgs = match[1]?.trim() ?? "";
  if (rawArgs.length === 0) return { kind: "view" };
  const verb = rawArgs.toLowerCase();
  if (MUSE_GOAL_CLEAR_ARGUMENTS.includes(verb)) return { kind: "clear" };
  if (verb === "pause") return { kind: "pause" };
  if (verb === "resume") return { kind: "resume" };
  const edit = /^edit(?:\s+([\s\S]*))?$/iu.exec(rawArgs);
  if (edit) {
    const objective = edit[1]?.trim() ?? "";
    if (objective.length === 0) return { kind: "editUsage" };
    return { kind: "edit", objective };
  }
  return { kind: "set", objective: rawArgs };
}
