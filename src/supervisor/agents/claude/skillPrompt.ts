import type { PromptSegment } from "@/shared/contracts";

type SkillSegment = Extract<PromptSegment, { kind: "skill" }>;

/**
 * Index of the skill segment that opens the prompt, or -1 when the prompt
 * opens with anything else. Blank text and attachments are skipped, because
 * callers drop the former and move the latter away from the command text.
 */
export function leadingSkillIndex(segments: readonly PromptSegment[]): number {
  const index = segments.findIndex(
    (segment) =>
      segment.kind !== "attachment" &&
      (segment.kind !== "text" || segment.content.trim().length > 0),
  );
  return index >= 0 && segments[index]!.kind === "skill" ? index : -1;
}

/**
 * The CLI expands `/name` only at the very start of a prompt. A skill placed
 * later in the text asks the model to use it instead. That works for skills
 * the model may invoke, and a mid-text `/name` would reach the model as plain
 * text anyway.
 */
export function claudeSkillText(segment: SkillSegment, leading: boolean): string {
  return leading ? segment.invocation : `Use the ${segment.name} skill.`;
}
