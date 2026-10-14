import type { PromptSegment, ThreadTitleCommand } from "./contracts";
import { inlinePromptSegmentText } from "./promptContent";

/**
 * Flatten a prompt's segments into the plain text used to derive a thread
 * title (`@path` for file mentions, raw text otherwise; attachments dropped).
 * Falls back to the raw prompt when there are no segments or they collapse to
 * nothing. Process-agnostic so the desktop renderer and the remote server
 * derive identical titles for the same start.
 */
export function titlePromptFromSegments(
  prompt: string,
  segments: readonly PromptSegment[] | undefined,
): string {
  return segments
    ? segments
        .filter((segment) => segment.kind !== "attachment")
        .map(inlinePromptSegmentText)
        .join("")
        .trim() || prompt
    : prompt;
}

/** Normalize whitespace and clamp a prompt to a single-line thread title. */
export function makeThreadTitle(prompt: string): string {
  const normalized = prompt.trim().replace(/\s+/g, " ");
  if (normalized.length <= 120) {
    return normalized;
  }
  return `${normalized.slice(0, 117)}...`;
}

/** Whether a prompt starts with a slash command (the only shape a title command can match). */
export function isSlashCommandPrompt(prompt: string): boolean {
  return /^\/\S/u.test(prompt.trim());
}

function matchWord(word: string, text: string): string | undefined {
  const head = text.slice(0, word.length);
  if (head.toLowerCase() !== word.toLowerCase()) return undefined;
  const rest = text.slice(word.length);
  if (rest.length > 0 && !/^\s/u.test(rest)) return undefined;
  return rest.trim();
}

/**
 * The text a new thread's title derives from. A first prompt that invokes one
 * of the provider's declared title commands (`/<command> <argument>`) titles
 * the thread from its argument; anything else — including bare control verbs
 * and commands the provider did not declare — keeps the prompt itself.
 * Provider-agnostic: providers declare the commands in their capabilities.
 */
export function resolveThreadTitlePrompt(
  prompt: string,
  commands: readonly ThreadTitleCommand[] | undefined,
): string {
  if (!commands?.length || !isSlashCommandPrompt(prompt)) return prompt;
  const body = prompt.trim().slice(1);
  for (const rule of commands) {
    let argument = matchWord(rule.command, body);
    if (argument === undefined) continue;
    const subcommand = rule.argumentSubcommands?.find(
      (verb) => matchWord(verb, argument!) !== undefined,
    );
    if (subcommand) argument = matchWord(subcommand, argument)!;
    if (!argument) return prompt;
    // Control verbs are only whole arguments of the command itself; after a
    // content subcommand (`/goal edit pause`) the word is the content.
    const normalized = argument.toLowerCase();
    if (!subcommand && rule.controlArguments?.some((verb) => verb.toLowerCase() === normalized)) {
      return prompt;
    }
    return argument;
  }
  return prompt;
}
