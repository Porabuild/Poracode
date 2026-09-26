import type { PromptSegment } from "@/shared/contracts";

type SkillSegment = Extract<PromptSegment, { kind: "skill" }>;

/**
 * The skill segment that opens the prompt, if any. Blank text and attachments
 * before it are skipped, because callers drop the former and move the latter
 * away from the command text.
 */
export function leadingSkill(segments: readonly PromptSegment[]): SkillSegment | undefined {
  const first = segments.find(
    (segment) =>
      segment.kind !== "attachment" &&
      (segment.kind !== "text" || segment.content.trim().length > 0),
  );
  return first?.kind === "skill" ? first : undefined;
}

/**
 * The CLI expands `/name` only at the very start of a prompt. Any other skill
 * asks the model to use it instead. That works for skills the model may
 * invoke, and a mid-text `/name` would reach the model as plain text anyway.
 */
export function claudeSkillText(segment: SkillSegment, lead: SkillSegment | undefined): string {
  return segment === lead ? segment.invocation : `Use the ${segment.name} skill.`;
}
