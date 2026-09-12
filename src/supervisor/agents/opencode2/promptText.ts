/**
 * Prompt composition for the OpenCode 2 structured surface.
 *
 * V2's `session.prompt` takes a single `text` plus optional `files` (URI
 * references the server reads itself) — a different shape from OpenCode 1's
 * part array, so the composition is provider-owned rather than shared. The
 * mime gate mirrors OpenCode 1's: attachments the server is unlikely to
 * decode (unknown binary types) degrade to `@<path>` text mentions instead of
 * risking a rejected turn.
 */

import { posix, win32 } from "node:path";
import { pathToFileURL } from "node:url";
import type { ProjectLocation, PromptSegment } from "@/shared/contracts";
import { formatDiffCommentPrompt, isTextFilePath } from "@/shared/promptContent";

export interface OpenCode2PromptPayload {
  text: string;
  skills?: Array<{ id: string }>;
  /** Attachment references for `session.prompt.files`. */
  files: Array<{ uri: string; name?: string }>;
}

function resolveAbsolutePath(location: ProjectLocation, segmentPath: string): string {
  if (location.kind === "wsl") {
    // Segments arrive as host (Windows) UNC paths or already-Linux paths.
    // OpenCode runs inside the distro, so we must hand it a Linux path.
    if (/^\/\//.test(segmentPath) || /^\\\\/.test(segmentPath)) {
      const unc = segmentPath.replace(/\\/g, "/");
      const match = unc.match(/^\/\/wsl(?:\$|\.localhost)\/[^/]+(\/.*)$/i);
      if (match?.[1]) return match[1];
    }
    return posix.isAbsolute(segmentPath)
      ? segmentPath
      : posix.join(location.linuxPath, segmentPath);
  }
  if (location.kind === "windows") {
    return win32.isAbsolute(segmentPath) ? segmentPath : win32.join(location.path, segmentPath);
  }
  if (!posix.isAbsolute(segmentPath)) return posix.join(location.path, segmentPath);
  return segmentPath;
}

function fileUrlForPath(location: ProjectLocation, path: string): string {
  if (location.kind === "windows") return pathToFileURL(path).href;
  return `file://${path.split("/").map(encodeURIComponent).join("/")}`;
}

/**
 * Coarse sendability gate: image / text / pdf / audio attachments ride the
 * `files` field; anything the server can't type (octet-stream-ish) falls back
 * to a text mention.
 */
function shouldSendAsFileReference(segment: PromptSegment, absolutePath: string): boolean {
  const mime = segment.kind === "attachment" ? segment.mimeType : undefined;
  if (mime && mime !== "application/octet-stream") {
    return (
      mime.startsWith("image/") ||
      mime.startsWith("text/") ||
      mime.startsWith("audio/") ||
      mime === "application/json" ||
      mime === "application/pdf"
    );
  }
  return (
    isTextFilePath(absolutePath) ||
    /\.(png|jpe?g|gif|webp|svg|pdf|mp3|wav|m4a)$/i.test(absolutePath)
  );
}

export function buildOpenCode2PromptPayload(
  prompt: string,
  segments: PromptSegment[] | undefined,
  location: ProjectLocation,
  inlineInstructions?: string,
): OpenCode2PromptPayload {
  const payload: OpenCode2PromptPayload = { text: "", files: [] };
  const textPieces: string[] = [];

  if (!segments || segments.length === 0) {
    if (prompt.trim().length > 0) textPieces.push(prompt);
  } else {
    for (const segment of segments) {
      if (segment.kind === "text") {
        if (segment.content.length > 0) textPieces.push(segment.content);
        continue;
      }
      if (segment.kind === "diff_comment") {
        textPieces.push(formatDiffCommentPrompt(segment));
        continue;
      }
      if (segment.kind === "mcp") {
        // MCP mentions are a plain-text directive for the turn, not a file ref.
        textPieces.push(`@${segment.name}`);
        continue;
      }
      if (segment.kind === "thread") {
        // Thread mentions have no path — keep the mention label as text.
        textPieces.push(`@${segment.title || segment.threadId}`);
        continue;
      }
      if (segment.kind === "skill") {
        if (segment.provider === "opencode2") {
          (payload.skills ??= []).push({ id: segment.name });
          textPieces.push(segment.name);
        } else {
          textPieces.push(segment.invocation);
        }
        continue;
      }
      if (!("path" in segment) || segment.path === undefined) continue;
      const absolute = resolveAbsolutePath(location, segment.path);
      if (!shouldSendAsFileReference(segment, absolute)) {
        textPieces.push(`@${absolute}`);
        continue;
      }
      const filename = absolute.split(/[\\/]/).pop();
      payload.files.push({
        uri: fileUrlForPath(location, absolute),
        ...(filename ? { name: filename } : {}),
      });
    }
  }

  // Portable-skills fallback: appended to the provider payload only, never to
  // the painted user_message (see StartTurnOptions.inlineInstructions).
  if (inlineInstructions) textPieces.push(inlineInstructions);

  payload.text = textPieces.join("\n\n");
  return payload;
}
