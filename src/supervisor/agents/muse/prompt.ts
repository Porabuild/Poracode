import type { PromptSegment } from "@/shared/contracts";
import { inlinePromptSegmentText } from "@/shared/promptContent";

/**
 * Format prompt segments for Muse's interactive path.
 * Attachments become trailing `@path` tokens (space-joined) after a blank line.
 */
export function formatMusePromptSegments(segments: PromptSegment[]): string {
  const attachments = segments.filter((s) => s.kind === "attachment");
  const rest = segments.filter((s) => s.kind !== "attachment");
  const attachmentLines = attachments.map((s) => `@${s.path}`).join(" ");
  const restStr = rest.map(inlinePromptSegmentText).join("");
  return attachmentLines ? `${restStr}\n\n${attachmentLines} ` : restStr;
}
