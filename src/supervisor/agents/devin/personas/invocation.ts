import type { DevinPersonaDefinition } from "./definitions";

/**
 * Native invocation descriptors for personas.
 *
 * Custom personas are consumed by the native CLI's own machinery: the
 * `run_subagent` tool picks a profile by description, and a SKILL.md can pin
 * one through `agent: <profile>` (which beats `subagent: true`). There is NO
 * root-agent path: `devin acp --agent-type` is a closed `summarizer|review`
 * enum (live-verified), so a persona is never translated into that flag —
 * arbitrary custom root-agent selection is unsupported upstream.
 *
 * Proving a child actually ran with the persona is a live gate (Q33): child
 * update `_meta` carries `cognition.ai/subagent_started.profile`, which the
 * ACP transform layer (Lane E) consumes.
 */

export type DevinPersonaInvocationKind =
  /** SKILL.md `agent: <name>` — the persona's own model/tools apply. */
  | "skill-agent"
  /** SKILL.md `subagent: true` — the built-in `subagent_general` child. */
  | "skill-subagent"
  /** Ask the model to use a named persona via `run_subagent`. */
  | "native-child";

export interface DevinPersonaInvocation {
  kind: DevinPersonaInvocationKind;
  /** Skill frontmatter that selects this persona, for `agent:`/`subagent:` bridges. */
  skillFrontmatter: Record<string, string | boolean>;
  /** Prompt fragment that requests the persona through `run_subagent`. */
  promptText: string;
}

/** Preferred invocation for a definition (skill `agent:` beats `subagent:`). */
export function describeDevinPersonaInvocation(
  definition: Pick<DevinPersonaDefinition, "id">,
): DevinPersonaInvocation {
  return {
    kind: "skill-agent",
    skillFrontmatter: { agent: definition.id },
    promptText: `Use the ${definition.id} subagent for this task.`,
  };
}

/** Built-in general child selected by `subagent: true` (no custom persona). */
export function describeDevinSubagentSkillInvocation(): DevinPersonaInvocation {
  return {
    kind: "skill-subagent",
    skillFrontmatter: { subagent: true },
    promptText: "Run this with the built-in general subagent.",
  };
}

/**
 * Truthful availability: a custom persona can NEVER be a root agent type.
 * UI surfaces must not offer it there; `review`/`summarizer` are the only
 * root process variants and are separate supported values.
 */
export function devinPersonaRootAgentSupported(): false {
  return false;
}

/**
 * Skill-vs-profile precedence, from the native docs (encoded so callers do
 * not re-derive it): a skill's `model:` overrides the persona's model, but the
 * persona's `allowed-tools` win over the skill's — and subagent skills never
 * nest (they run inline inside the subagent).
 */
export const DEVIN_PERSONA_SKILL_PRECEDENCE = {
  modelWins: "skill",
  toolsWin: "persona",
  nesting: "subagent-skills-never-nest",
} as const;
