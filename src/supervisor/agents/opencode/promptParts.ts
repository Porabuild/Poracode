import { readFile } from "node:fs/promises";
import { posix, win32 } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { ProjectLocation, PromptSegment } from "@/shared/contracts";
import { readOpenCodeErrorText } from "./opencodeErrors";

export type OpenCodePromptPart =
  | { type: "text"; text: string }
  | { type: "file"; mime: string; filename?: string; url: string };

const OCTET_STREAM_MIME = "application/octet-stream";
const FALLBACK_TEXT_FILE_MAX_BYTES = 128 * 1024;

const TEXT_FILE_EXTENSIONS = new Set([
  "bash",
  "c",
  "cc",
  "conf",
  "cpp",
  "cs",
  "css",
  "csv",
  "cxx",
  "diff",
  "env",
  "go",
  "graphql",
  "h",
  "hpp",
  "html",
  "java",
  "js",
  "jsx",
  "kt",
  "log",
  "lua",
  "mjs",
  "patch",
  "php",
  "ps1",
  "py",
  "rb",
  "rs",
  "scss",
  "sh",
  "sql",
  "svelte",
  "swift",
  "toml",
  "ts",
  "tsx",
  "txt",
  "vue",
  "xml",
  "yaml",
  "yml",
  "zsh",
]);

function encodePosixFileUrl(path: string): string {
  return `file://${path.split("/").map(encodeURIComponent).join("/")}`;
}

function resolveAbsolutePath(location: ProjectLocation, segmentPath: string): string {
  if (location.kind === "wsl") {
    // Segments arrive as host (Windows) UNC paths or already-Linux paths.
    // OpenCode runs inside the distro, so we must hand it a Linux path.
    if (/^\/\//.test(segmentPath) || /^\\\\/.test(segmentPath)) {
      // UNC share like \\wsl$\Ubuntu\home\... → strip the prefix.
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
  return encodePosixFileUrl(path);
}

function inferMimeFromPath(path: string): string {
  const ext = path
    .split(/[\\/.]/)
    .pop()
    ?.toLowerCase();
  switch (ext) {
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "gif":
      return "image/gif";
    case "webp":
      return "image/webp";
    case "svg":
      return "image/svg+xml";
    case "pdf":
      return "application/pdf";
    case "md":
    case "markdown":
    case "json":
      return "text/plain";
    default:
      return ext && TEXT_FILE_EXTENSIONS.has(ext) ? "text/plain" : OCTET_STREAM_MIME;
  }
}

function mimeForSegment(segment: PromptSegment, absolutePath: string): string {
  const inferred = inferMimeFromPath(absolutePath);
  const mime =
    segment.kind === "attachment" && segment.mimeType && segment.mimeType !== OCTET_STREAM_MIME
      ? segment.mimeType
      : inferred;
  if (mime.startsWith("text/") || mime === "application/json") return "text/plain";
  return mime;
}

function shouldSendFilePart(mime: string): boolean {
  if (mime === OCTET_STREAM_MIME) return false;
  return (
    mime.startsWith("image/") ||
    mime.startsWith("text/") ||
    mime === "application/json" ||
    mime === "application/pdf"
  );
}

function hasFilePart(parts: OpenCodePromptPart[]): boolean {
  return parts.some((part) => part.type === "file");
}

export function shouldRetryOpenCodePromptWithTextFallback(
  cause: unknown,
  parts: OpenCodePromptPart[],
): boolean {
  if (!hasFilePart(parts)) return false;
  const text = readOpenCodeErrorText(cause);
  return /file part media type/.test(text) && /not supported|functionality/.test(text);
}

async function filePartToFallbackText(
  part: Extract<OpenCodePromptPart, { type: "file" }>,
): Promise<string> {
  const name = part.filename ?? part.url;
  if (!part.url.startsWith("file:")) return `Attached file could not be sent: ${name}`;

  try {
    let path: string;
    try {
      path = fileURLToPath(part.url);
    } catch {
      path = decodeURIComponent(new URL(part.url).pathname);
    }
    if (part.mime !== "text/plain") return `Attached file could not be sent: ${path}`;

    const data = await readFile(path);
    const truncated = data.byteLength > FALLBACK_TEXT_FILE_MAX_BYTES;
    const content = data.subarray(0, FALLBACK_TEXT_FILE_MAX_BYTES).toString("utf8");
    const suffix = truncated ? "\n\n[File truncated during attachment fallback.]" : "";
    return `Attached file: ${path}\n\n${content}${suffix}`;
  } catch {
    return `Attached file could not be read during fallback: ${name}`;
  }
}

export async function buildOpenCodeTextFallbackParts(
  parts: OpenCodePromptPart[],
): Promise<OpenCodePromptPart[]> {
  const fallback: OpenCodePromptPart[] = [];
  for (const part of parts) {
    if (part.type === "text") {
      fallback.push(part);
      continue;
    }
    fallback.push({ type: "text", text: await filePartToFallbackText(part) });
  }
  return fallback;
}

export function buildOpenCodePromptParts(
  prompt: string,
  segments: PromptSegment[] | undefined,
  location: ProjectLocation,
): OpenCodePromptPart[] {
  const parts: OpenCodePromptPart[] = [];

  if (segments && segments.length > 0) {
    for (const segment of segments) {
      if (segment.kind === "text") {
        if (segment.content.length > 0) parts.push({ type: "text", text: segment.content });
        continue;
      }
      if (segment.kind === "mcp") {
        // MCP mentions are a plain-text directive for the turn, not a file ref.
        parts.push({ type: "text", text: `@${segment.name}` });
        continue;
      }
      const absolute = resolveAbsolutePath(location, segment.path);
      const url = fileUrlForPath(location, absolute);
      const mime = mimeForSegment(segment, absolute);
      if (!shouldSendFilePart(mime)) {
        parts.push({ type: "text", text: `@${absolute}` });
        continue;
      }
      const filename = absolute.split(/[\\/]/).pop();
      parts.push({
        type: "file",
        mime,
        ...(filename ? { filename } : {}),
        url,
      });
    }
  } else if (prompt.trim().length > 0) {
    parts.push({ type: "text", text: prompt });
  }

  return parts;
}
