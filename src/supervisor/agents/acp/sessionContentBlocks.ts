/**
 * Convert Poracode `PromptSegment[]` + prompt text into ACP `ContentBlock[]`.
 */
import { readFile } from "node:fs/promises";
import type { ContentBlock, PromptCapabilities } from "@agentclientprotocol/sdk";
import type { ProjectLocation, PromptSegment } from "@/shared/contracts";
import {
  basenameForProjectPath,
  guessMimeType,
  resolveAcpResourcePath,
  toAcpResourceUri,
} from "./sessionPaths";

export async function segmentsToContentBlocks(
  prompt: string,
  location: ProjectLocation,
  segments?: PromptSegment[],
  promptCapabilities?: PromptCapabilities,
): Promise<ContentBlock[]> {
  void promptCapabilities;
  const blocks: ContentBlock[] = [];

  for (const seg of segments ?? []) {
    if (seg.kind === "attachment") {
      const resourcePath = resolveAcpResourcePath(location, seg.path);
      const isImage = /\.(png|jpe?g|gif|webp|svg|bmp|ico|avif)$/i.test(seg.path);
      if (isImage) {
        try {
          const data = await readFile(resourcePath);
          const mimeType = seg.mimeType ?? guessMimeType(seg.path);
          blocks.push({ type: "image", data: data.toString("base64"), mimeType });
        } catch {
          // Fall back to resource link if the image bytes can't be read
          // (permission / size / missing). Capability-gating is intentionally
          // skipped; ACP agents that don't accept images
          // should reject the prompt rather than silently dropping content.
          blocks.push({
            type: "resource_link",
            uri: toAcpResourceUri(location, seg.path),
            name: basenameForProjectPath(location, resourcePath),
            ...(seg.mimeType ? { mimeType: seg.mimeType } : {}),
          });
        }
      } else {
        blocks.push({
          type: "resource_link",
          uri: toAcpResourceUri(location, seg.path),
          name: basenameForProjectPath(location, resourcePath),
          ...(seg.mimeType ? { mimeType: seg.mimeType } : {}),
        });
      }
    } else if (seg.kind === "file") {
      const resourcePath = resolveAcpResourcePath(location, seg.path);
      blocks.push({
        type: "resource_link",
        uri: toAcpResourceUri(location, seg.path),
        name: basenameForProjectPath(location, resourcePath),
      });
    }
  }

  if (prompt.trim().length > 0) {
    blocks.push({ type: "text", text: prompt });
  }

  return blocks;
}
