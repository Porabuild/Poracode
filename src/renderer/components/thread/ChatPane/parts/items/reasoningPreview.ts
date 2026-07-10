const REASONING_PREVIEW_MAX_LENGTH = 120;

/**
 * One-line sneak peek of a reasoning block for collapsed "Thought" rows.
 * Strips markdown structure (fences, list/heading markers, emphasis) so the
 * snippet reads as plain prose, then truncates on a single line.
 */
export function getReasoningPreview(
  text: string,
  maxLength: number = REASONING_PREVIEW_MAX_LENGTH,
): string {
  const flattened = text
    .replace(/```[\s\S]*?(?:```|$)/g, " ")
    .replace(/^[\s>#+*-]+/gm, "")
    .replace(/[*_`]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (flattened.length <= maxLength) return flattened;
  return `${flattened.slice(0, maxLength - 1).trimEnd()}…`;
}
