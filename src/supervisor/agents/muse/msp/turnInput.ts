import { readFile } from "node:fs/promises";
import type { PromptSegment } from "@/shared/contracts";
import { toWslUncPath } from "@/shared/wsl";
import type { CreateStructuredSessionInput } from "../../base";

function imagePathForNode(input: CreateStructuredSessionInput, path: string): string {
  if (input.projectLocation.kind === "wsl" && path.startsWith("/")) {
    return toWslUncPath(input.projectLocation.distro, path);
  }
  return path;
}

export async function buildMuseTurnInput(
  input: CreateStructuredSessionInput,
  prompt: string,
  segments: PromptSegment[] | undefined,
  inlineInstructions: string | undefined,
): Promise<Array<Record<string, unknown>>> {
  const text = inlineInstructions ? `${prompt}\n\n${inlineInstructions}` : prompt;
  const parts: Array<Record<string, unknown>> = [{ type: "text", text }];
  for (const segment of segments ?? []) {
    if (segment.kind !== "attachment" || !segment.mimeType?.startsWith("image/")) continue;
    const content = await readFile(imagePathForNode(input, segment.path));
    parts.push({
      type: "image",
      mediaType: segment.mimeType,
      base64Data: content.toString("base64"),
    });
  }
  return parts;
}
