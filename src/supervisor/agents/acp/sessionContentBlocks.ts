/**
 * Convert Poracode `PromptSegment[]` + prompt text into ACP `ContentBlock[]`.
 */
import { open } from "node:fs/promises";
import type { ContentBlock, PromptCapabilities } from "@agentclientprotocol/sdk";
import type { ProjectLocation, PromptSegment } from "@/shared/contracts";
import { isAudioPath, isImagePath } from "@/shared/promptContent";
import {
  basenameForProjectPath,
  guessMimeType,
  isWindowsAbsolutePath,
  resolveAcpHostFsPath,
  resolveAcpResourcePath,
  toAcpResourceUri,
} from "./sessionPaths";

export const ACP_INLINE_CONTENT_MAX_BYTES = 20 * 1024 * 1024;

function isTextMimeType(mimeType: string): boolean {
  return (
    mimeType.startsWith("text/") ||
    /^(?:application\/(?:json|javascript|toml|xml|yaml)|[^/]+\/[^/]+\+(?:json|xml))$/u.test(
      mimeType,
    )
  );
}

function resolveReadablePromptPath(
  location: ProjectLocation,
  segment: Extract<PromptSegment, { kind: "attachment" | "file" }>,
): string {
  if (segment.kind === "file") return resolveAcpHostFsPath(location, segment.path);
  const resourcePath = resolveAcpResourcePath(location, segment.path);
  if (location.kind !== "wsl" || isWindowsAbsolutePath(resourcePath)) return resourcePath;
  return resolveAcpHostFsPath(location, segment.path);
}

async function readInlineContent(path: string, maxBytes: number): Promise<Buffer | undefined> {
  if (maxBytes <= 0) return undefined;
  const file = await open(path, "r");
  try {
    const info = await file.stat();
    if (!info.isFile() || info.size > maxBytes) return undefined;
    const data = Buffer.allocUnsafe(info.size);
    let offset = 0;
    while (offset < data.length) {
      const { bytesRead } = await file.read(data, offset, data.length - offset, offset);
      if (bytesRead === 0) break;
      offset += bytesRead;
    }
    return offset === data.length ? data : data.subarray(0, offset);
  } finally {
    await file.close();
  }
}

function resourceLink(location: ProjectLocation, path: string, mimeType?: string): ContentBlock {
  const resourcePath = resolveAcpResourcePath(location, path);
  return {
    type: "resource_link",
    uri: toAcpResourceUri(location, path),
    name: basenameForProjectPath(location, resourcePath),
    ...(mimeType ? { mimeType } : {}),
  };
}

export async function segmentsToContentBlocks(
  prompt: string,
  location: ProjectLocation,
  segments?: PromptSegment[],
  promptCapabilities?: PromptCapabilities,
): Promise<ContentBlock[]> {
  const blocks: ContentBlock[] = [];
  let remainingInlineBytes = ACP_INLINE_CONTENT_MAX_BYTES;

  for (const seg of segments ?? []) {
    if (seg.kind === "attachment" || seg.kind === "file") {
      const mimeType =
        seg.kind === "attachment"
          ? seg.mimeType && seg.mimeType !== "application/octet-stream"
            ? seg.mimeType
            : guessMimeType(seg.path)
          : guessMimeType(seg.path);
      try {
        const readSegment = async () => {
          const data = await readInlineContent(
            resolveReadablePromptPath(location, seg),
            remainingInlineBytes,
          );
          if (data) remainingInlineBytes -= data.byteLength;
          return data;
        };
        if (isImagePath(seg.path, mimeType)) {
          if (promptCapabilities?.image) {
            const imageMimeType = mimeType.startsWith("image/")
              ? mimeType
              : guessMimeType(seg.path);
            const data = await readSegment();
            if (data) {
              blocks.push({
                type: "image",
                data: data.toString("base64"),
                mimeType: imageMimeType,
              });
              continue;
            }
          }
          blocks.push(resourceLink(location, seg.path, mimeType));
          continue;
        }

        if (isAudioPath(seg.path, mimeType)) {
          if (promptCapabilities?.audio) {
            const audioMimeType = mimeType.startsWith("audio/")
              ? mimeType
              : guessMimeType(seg.path);
            const data = await readSegment();
            if (data) {
              blocks.push({
                type: "audio",
                data: data.toString("base64"),
                mimeType: audioMimeType,
              });
              continue;
            }
            blocks.push(resourceLink(location, seg.path, audioMimeType));
          } else {
            blocks.push(resourceLink(location, seg.path, mimeType));
          }
          continue;
        }

        if (promptCapabilities?.embeddedContext) {
          const data = await readSegment();
          if (data) {
            const uri = toAcpResourceUri(location, seg.path);
            blocks.push({
              type: "resource",
              resource: isTextMimeType(mimeType)
                ? { uri, mimeType, text: data.toString("utf8") }
                : { uri, mimeType, blob: data.toString("base64") },
            });
            continue;
          }
        }
      } catch {
        // An unreadable media or embedded resource remains available as a URI.
      }

      blocks.push(resourceLink(location, seg.path, mimeType));
    }
  }

  if (prompt.trim().length > 0) {
    blocks.push({ type: "text", text: prompt });
  }

  return blocks;
}
