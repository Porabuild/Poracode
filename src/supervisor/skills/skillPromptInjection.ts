import type { PromptSegment } from "@/shared/contracts";

/**
 * Portable-skill prompt injection. Providers that natively read a skill's
 * folder (declared via `skillSupport.roots`) load the skill themselves; for
 * every other provider the skill's SKILL.md is inlined into the outgoing turn
 * so an invoked skill works on any agent — including agents with no skill
 * support at all. Pure helpers here; environment/root resolution lives in
 * `SkillsService.buildTurnSkillInjection`.
 */

export type SkillPromptSegment = Extract<PromptSegment, { kind: "skill" }>;

/** Per-skill cap keeps a single oversized SKILL.md from eating the turn budget. */
export const MAX_INLINE_SKILL_CONTENT_CHARS = 24_000;
/** Total cap across all inlined skills in one turn. */
export const MAX_INLINE_TOTAL_CHARS = 64_000;

const INLINE_SKILLS_HEADER =
  "The user invoked the following agent skill(s) for this request. Follow each " +
  "skill's instructions. File paths referenced inside a skill are relative to its " +
  '"dir" attribute.';

export interface InlineSkillSource {
  readonly name: string;
  /** Directory of the skill (display form), advertised as the `dir` attribute. */
  readonly directory: string;
  readonly content: string;
}

function normalizeForPrefix(path: string): string {
  return path.replace(/\\/gu, "/").replace(/\/+$/u, "").toLowerCase();
}

/** Whether `path` sits at or below any of the given root paths (separator- and case-insensitive). */
export function isPathUnderAny(path: string, rootPaths: readonly string[]): boolean {
  const normalized = normalizeForPrefix(path);
  return rootPaths.some((root) => {
    const prefix = normalizeForPrefix(root);
    return prefix.length > 0 && (normalized === prefix || normalized.startsWith(`${prefix}/`));
  });
}

/**
 * Skill segments the active provider cannot load natively: their SKILL.md
 * lives outside every root the provider reads by itself (canonical
 * `.agents/skills`, app-bundled skills, another provider's folder).
 * Duplicate invocations of the same skill are collapsed to one.
 */
export function selectSkillSegmentsForInjection(
  segments: readonly PromptSegment[],
  nativeRootPaths: readonly string[],
): SkillPromptSegment[] {
  const seen = new Set<string>();
  return segments.filter((segment): segment is SkillPromptSegment => {
    if (segment.kind !== "skill" || isPathUnderAny(segment.path, nativeRootPaths)) return false;
    const key = normalizeForPrefix(segment.path);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Terminal-thread fallback: a short, typed-into-the-TUI sentence pointing the
 * agent at a readable SKILL.md instead of pasting the whole body (multi-KB
 * pastes break TUI composers). Used for skills the agent's CLI doesn't load
 * natively — the model reads the file itself.
 */
export function buildSkillPathHintText(name: string, skillFilePath: string): string {
  return `Use the "${name}" agent skill: read ${skillFilePath} and follow its instructions.`;
}

/**
 * Render the inline `<skill>` blocks appended to the provider payload. Skills
 * that would overflow `maxChars` are dropped (keeping what already fits)
 * rather than overflowing the provider turn budget.
 */
export function buildInlineSkillInstructions(
  skills: readonly InlineSkillSource[],
  maxChars = MAX_INLINE_TOTAL_CHARS,
): string {
  if (skills.length === 0 || maxChars <= 0) return "";
  let text = "";
  for (const skill of skills) {
    let trimmed = skill.content.trim();
    if (trimmed.length === 0) continue;
    if (trimmed.length > MAX_INLINE_SKILL_CONTENT_CHARS) {
      trimmed = `${trimmed.slice(0, MAX_INLINE_SKILL_CONTENT_CHARS)}\n[skill content truncated]`;
    }
    const block = `<skill name=${JSON.stringify(skill.name)} dir=${JSON.stringify(skill.directory)}>\n${trimmed}\n</skill>`;
    const candidate =
      text.length === 0 ? `${INLINE_SKILLS_HEADER}\n\n${block}` : `${text}\n\n${block}`;
    if (candidate.length > maxChars) break;
    text = candidate;
  }
  return text;
}
