import type { AgentSlashCommand } from "@/shared/contracts";

/** Match quality, best first. Ranking keeps provider order within a tier. */
export type SlashCommandMatchTier = "prefix" | "wordStart" | "substring";

export interface SlashCommandMatch {
  tier: SlashCommandMatchTier;
  /**
   * Matched span of the displayed name, or null when only the wire id matched
   * (e.g. typing `skill:s` for a skill shown as `simplify`).
   */
  highlight: { start: number; end: number } | null;
}

const WORD_SEPARATORS = new Set(["-", "_", ":", ".", "/"]);

export function isSkillCommand(command: AgentSlashCommand): boolean {
  return command.section === "skills";
}

export function slashCommandDisplayId(command: AgentSlashCommand): string {
  return isSkillCommand(command) ? (command.skillName ?? command.id) : command.id;
}

function wordStartIndex(name: string, query: string): number {
  let index = name.indexOf(query, 1);
  while (index !== -1) {
    if (WORD_SEPARATORS.has(name[index - 1]!)) return index;
    index = name.indexOf(query, index + 1);
  }
  return -1;
}

function matchName(
  name: string,
  query: string,
): { tier: SlashCommandMatchTier; start: number } | null {
  if (name.startsWith(query)) return { tier: "prefix", start: 0 };
  const wordStart = wordStartIndex(name, query);
  if (wordStart !== -1) return { tier: "wordStart", start: wordStart };
  const start = name.indexOf(query);
  return start === -1 ? null : { tier: "substring", start };
}

/**
 * Matches a slash query against a command's displayed name first, then its
 * wire id, so the tier (and highlight) reflects what the user sees.
 */
export function slashCommandMatch(
  command: AgentSlashCommand,
  query: string,
): SlashCommandMatch | null {
  const normalizedQuery = query.toLowerCase();
  const display = matchName(slashCommandDisplayId(command).toLowerCase(), normalizedQuery);
  if (display) {
    return {
      tier: display.tier,
      highlight: { start: display.start, end: display.start + normalizedQuery.length },
    };
  }
  const wire = matchName(command.id.toLowerCase(), normalizedQuery);
  return wire ? { tier: wire.tier, highlight: null } : null;
}
