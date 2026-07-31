import { readFile } from "node:fs/promises";
import { posix, win32 } from "node:path";
import type { ProjectLocation, PromptSegment } from "@/shared/contracts";
import { mimeForImagePath } from "@/shared/promptContent";
import { parseWslUncPath } from "@/shared/wsl";

export interface CursorSdkImage {
  data: string;
  mimeType: string;
}

export interface CursorSdkUserMessage {
  text: string;
  images?: CursorSdkImage[];
}

/**
 * Raster formats the SDK's inline image slot accepts. Deliberately narrower
 * than the shared `isImagePath`, which also matches svg/bmp/ico/avif because it
 * additionally drives renderer previews; those would be rejected as inline
 * image input, so they stay `@path` mentions instead.
 */
const SDK_IMAGE_EXTENSIONS = /\.(?:png|jpe?g|gif|webp)$/i;

function isImage(
  segment: PromptSegment,
): segment is Extract<PromptSegment, { kind: "attachment" }> {
  if (segment.kind !== "attachment") return false;
  return segment.mimeType?.startsWith("image/") === true
    ? true
    : SDK_IMAGE_EXTENSIONS.test(segment.path);
}

/**
 * Translate a host-visible prompt path into the path the local SDK loop sees.
 * Attachments for WSL projects commonly arrive as `\\wsl.localhost\Distro\…`
 * paths because the supervisor reads their bytes on Windows; non-image file
 * mentions still need the corresponding Linux path in the SDK prompt.
 */
export function cursorSdkPromptPath(location: ProjectLocation, segmentPath: string): string {
  if (location.kind === "wsl") {
    const unc = parseWslUncPath(segmentPath);
    if (unc) {
      // A worker inside one distro cannot safely reinterpret another
      // distro's UNC path as its own absolute Linux path.
      return unc.distro.toLowerCase() === location.distro.toLowerCase()
        ? unc.linuxPath
        : segmentPath;
    }
    return posix.isAbsolute(segmentPath)
      ? segmentPath
      : posix.join(location.linuxPath, segmentPath);
  }
  if (location.kind === "windows") {
    return win32.isAbsolute(segmentPath) ? segmentPath : win32.join(location.path, segmentPath);
  }
  return posix.isAbsolute(segmentPath) ? segmentPath : posix.join(location.path, segmentPath);
}

/**
 * Build the public Cursor SDK user-message shape. The SDK has a first-class
 * image input but no generic file/PDF block, so those remain explicit
 * workspace path mentions for the agent to read with its normal tools.
 */
export async function buildCursorSdkUserMessage(
  prompt: string,
  segments: readonly PromptSegment[] | undefined,
  location: ProjectLocation,
  inlineInstructions?: string,
): Promise<string | CursorSdkUserMessage> {
  if ((!segments || segments.length === 0) && !inlineInstructions) return prompt;

  const text: string[] = [];
  const images: CursorSdkImage[] = [];

  if (segments && segments.length > 0) {
    for (const segment of segments) {
      if (segment.kind === "text") {
        text.push(segment.content);
        continue;
      }
      if (segment.kind === "mcp") {
        text.push(`@${segment.name}`);
        continue;
      }
      if (segment.kind === "skill") {
        text.push(segment.invocation);
        continue;
      }
      if (isImage(segment)) {
        const bytes = await readFile(segment.path);
        images.push({
          data: bytes.toString("base64"),
          mimeType: segment.mimeType ?? mimeForImagePath(segment.path) ?? "image/png",
        });
        continue;
      }
      text.push(`@${cursorSdkPromptPath(location, segment.path)}`);
    }
  } else {
    text.push(prompt);
  }

  if (inlineInstructions) {
    if (text.length > 0 && !text.at(-1)?.endsWith("\n")) text.push("\n\n");
    text.push(inlineInstructions);
  }

  const message: CursorSdkUserMessage = {
    text: text.join(""),
    ...(images.length > 0 ? { images } : {}),
  };
  return images.length === 0 ? message.text : message;
}
