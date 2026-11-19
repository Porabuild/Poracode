import { stat } from "node:fs/promises";
import { isAbsolute } from "node:path";
import type { PromptSegment } from "@/shared/contracts";
import { mimeForPath } from "@/shared/promptContent";

/** Resolve host-local attachment references before a non-UI submission effects a turn. */
export async function resolveThreadInputSegments(
  input: readonly PromptSegment[],
  prompt: string,
): Promise<PromptSegment[]> {
  const segments: PromptSegment[] = [];
  for (const segment of input) {
    if (segment.kind !== "attachment") {
      segments.push(segment);
      continue;
    }
    if (!isAbsolute(segment.path) || !(await stat(segment.path)).isFile()) {
      throw new Error(
        `Attachment must be an absolute path to a file on this host: ${segment.path}`,
      );
    }
    const mimeType = segment.mimeType ?? mimeForPath(segment.path);
    segments.push({ ...segment, ...(mimeType ? { mimeType } : {}) });
  }
  // The runtime uses the segments as the message when they are present.
  if (
    segments.length > 0 &&
    prompt.trim() &&
    !segments.some((segment) => segment.kind === "text" && segment.content.trim())
  ) {
    segments.push({ kind: "text", content: prompt });
  }
  return segments;
}
