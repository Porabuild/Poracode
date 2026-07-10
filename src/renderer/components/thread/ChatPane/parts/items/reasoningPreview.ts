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
    // Fences must be stripped over the full text (an early fence can swallow
    // kilobytes); afterwards only a bounded prefix can survive truncation, so
    // cap the remaining passes instead of scanning the whole block.
    .replace(/```[\s\S]*?(?:```|$)/g, " ")
    .slice(0, maxLength * 8)
    .replace(/^[\s>#+*-]+/gm, "")
    .replace(/[*_`]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (flattened.length <= maxLength) return flattened;
  return `${flattened.slice(0, maxLength - 1).trimEnd()}…`;
}
