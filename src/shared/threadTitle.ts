import type { PromptSegment } from "./contracts";
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
