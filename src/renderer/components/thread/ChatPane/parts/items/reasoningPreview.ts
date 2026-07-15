const REASONING_PREVIEW_MAX_LENGTH = 120;

function stripMarkdownMarkers(text: string): string {
  return text
    .replace(/^[\s>#+*-]+/gm, "")
    .replace(/[*_]+/g, " ")
    .replace(/`+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function truncateOneLine(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1).trimEnd()}…`;
}

function formatReasoningPreview(text: string, maxLength: number, lineSeparator: string): string {
  const lines = text
    // Fences must be stripped over the full text (an early fence can swallow
    // kilobytes); afterwards only a bounded prefix can survive truncation, so
    // cap the remaining passes instead of scanning the whole block.
    .replace(/```[\s\S]*?(?:```|$)/g, " ")
    .slice(0, maxLength * 8)
    .split(/\r?\n/)
    .map(stripMarkdownMarkers)
    .filter(Boolean);
  return truncateOneLine(lines.join(lineSeparator), maxLength);
}

/**
 * One-line sneak peek of a reasoning block for collapsed "Thought" rows.
 * Strips markdown structure (fences, list/heading markers, emphasis) so the
 * snippet reads as plain prose, then truncates on a single line.
 */
export function getReasoningPreview(
  text: string,
  maxLength: number = REASONING_PREVIEW_MAX_LENGTH,
): string {
  return formatReasoningPreview(text, maxLength, " ");
}

/**
 * One-line preview for a Thought row inside a tool-call group. Keeps each
 * non-empty source line visually distinct with the same centered-dot language
 * used by the surrounding activity rows.
 */
export function getReasoningInlinePreview(
  text: string,
  maxLength: number = REASONING_PREVIEW_MAX_LENGTH,
): string {
  return formatReasoningPreview(text, maxLength, " · ");
}

/**
 * The last non-empty line of a still-streaming reasoning block, flattened to
 * plain prose and truncated. Feeds the live "Thinking …" row so the trailing
 * meta tracks the model's current line as text streams in, matching the
 * collapsed "Thought" preview it settles into on completion.
 */
export function getReasoningLastLine(
  text: string,
  maxLength: number = REASONING_PREVIEW_MAX_LENGTH,
): string {
  let lineEnd = text.length;
  while (lineEnd >= 0) {
    const newlineIndex = lineEnd > 0 ? text.lastIndexOf("\n", lineEnd - 1) : -1;
    const line = text.slice(newlineIndex + 1, lineEnd);
    // Skip fence delimiter lines; their content still surfaces line by line.
    if (!/^\s*```/.test(line)) {
      const flattened = stripMarkdownMarkers(line);
      if (flattened) return truncateOneLine(flattened, maxLength);
    }
    if (newlineIndex < 0) break;
    lineEnd = newlineIndex;
  }
  return "";
}
