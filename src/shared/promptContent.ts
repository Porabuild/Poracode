import type { AgentSlashCommand, CanonicalContentBlock, PromptSegment } from "./contracts";

export const IMAGE_EXTENSIONS = [
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "svg",
  "bmp",
  "ico",
  "avif",
] as const;

const IMAGE_EXTENSION_SET = new Set<string>(IMAGE_EXTENSIONS);

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
  "markdown",
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

const MIME_BY_EXT: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  bmp: "image/bmp",
  ico: "image/x-icon",
  avif: "image/avif",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  m4a: "audio/mp4",
  ogg: "audio/ogg",
  oga: "audio/ogg",
  flac: "audio/flac",
  aac: "audio/aac",
  opus: "audio/opus",
  pdf: "application/pdf",
  txt: "text/plain",
  json: "application/json",
  md: "text/markdown",
};

function getExtension(path: string): string {
  const name = fileNameFromPath(path);
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : "";
}

export function fileNameFromPath(path: string): string {
  const sep = path.lastIndexOf("/");
  const bsep = path.lastIndexOf("\\");
  const lastSep = Math.max(sep, bsep);
  return lastSep >= 0 ? path.slice(lastSep + 1) : path;
}

export type DiffCommentSegment = Extract<PromptSegment, { kind: "diff_comment" }>;

export function diffCommentTarget(
  comment: Pick<DiffCommentSegment, "lineNumber" | "path" | "side">,
  compact = false,
): string {
  const path = compact ? fileNameFromPath(comment.path) : comment.path;
  return `${path}:${comment.side === "old" ? "-" : "+"}${comment.lineNumber}`;
}

export function formatDiffCommentPrompt(comment: DiffCommentSegment): string {
  const state = comment.staged ? "staged" : "unstaged";
  return `Review comment on ${diffCommentTarget(comment)} (${state}):\n${comment.body.trim()}`;
}

export function isImagePath(path: string, mimeType?: string): boolean {
  return mimeType?.startsWith("image/") === true || IMAGE_EXTENSION_SET.has(getExtension(path));
}

export function isAudioPath(path: string, mimeType?: string): boolean {
  return (
    mimeType?.startsWith("audio/") === true || mimeForPath(path)?.startsWith("audio/") === true
  );
}

export function isTextFilePath(path: string): boolean {
  return TEXT_FILE_EXTENSIONS.has(getExtension(path));
}

export function mimeForPath(path: string): string | undefined {
  return MIME_BY_EXT[getExtension(path)] ?? (isTextFilePath(path) ? "text/plain" : undefined);
}

/** The image MIME type implied by a path's extension, when it is a known one. */
export function mimeForImagePath(path: string): string | undefined {
  const mimeType = mimeForPath(path);
  return mimeType?.startsWith("image/") ? mimeType : undefined;
}

export function isPdfPath(path: string, mimeType?: string): boolean {
  return mimeType === "application/pdf" || getExtension(path) === "pdf";
}

/**
 * Encode an absolute filesystem path for use in a URL path (file:// or
 * poracode-local://). Segments are percent-encoded so spaces and literal `%`
 * in folder names survive `decodeURIComponent`. Windows drive letters stay
 * unencoded (`/C:/Users/…`).
 */
function encodeAbsolutePathForUrl(absolutePath: string): string {
  const normalized = absolutePath.replaceAll("\\", "/");
  const path = normalized.startsWith("/") ? normalized : `/${normalized}`;
  return path
    .split("/")
    .map((segment, index) => {
      if (segment.length === 0) return segment;
      // Leave `C:` unencoded so pathname stays `/C:/Users/…`.
      if (index === 1 && /^[A-Za-z]:$/.test(segment)) return segment;
      return encodeURIComponent(segment);
    })
    .join("/");
}

/**
 * Build a `file://` URL for an absolute filesystem path.
 *
 * Used when Chromium's built-in PDF viewer should load a local PDF (in-app
 * browser tabs). Handles Windows drive paths, POSIX paths, and UNC paths
 * (including `\\wsl.localhost\…`).
 */
export function toFileUrl(absolutePath: string): string {
  const normalized = absolutePath.replaceAll("\\", "/");
  // UNC: //server/share/path → file://server/share/path
  if (normalized.startsWith("//")) {
    const parts = normalized.slice(2).split("/");
    const host = parts[0] ?? "";
    const rest = parts
      .slice(1)
      .map((segment) => (segment.length === 0 ? segment : encodeURIComponent(segment)))
      .join("/");
    return rest.length > 0 ? `file://${host}/${rest}` : `file://${host}`;
  }
  return `file://${encodeAbsolutePathForUrl(absolutePath)}`;
}

/**
 * Build a `poracode-local://` URL for an absolute filesystem path.
 *
 * Anchors the path under a constant `local` host so standard-scheme parsing
 * does not eat `/Users` or the Windows drive letter as the host (see
 * `localFiles.ts`). Segments are percent-encoded so literal `%` in folder
 * names (e.g. Grok session dirs `E%3A%5Cwork…`) survives `decodeURIComponent`.
 */
export function toLocalFileUrl(absolutePath: string): string {
  return `poracode-local://local${encodeAbsolutePathForUrl(absolutePath)}`;
}

/** Inverse of {@link toLocalFileUrl} — same rules as the main-process protocol handler. */
export function resolveLocalFileUrlPath(
  url: string,
  platform: NodeJS.Platform = process.platform,
): string {
  const raw = decodeURIComponent(new URL(url).pathname);
  return platform === "win32" && /^\/[A-Za-z]:/.test(raw) ? raw.slice(1) : raw;
}

/** Display label for a thread mention: its title, falling back to the id. */
export function threadMentionLabel(mention: { threadId: string; title: string }): string {
  return mention.title || mention.threadId;
}

/**
 * Inline text form of a non-attachment prompt segment for a single-line prompt
 * or thread title: `@path` for file mentions, `@title` for thread mentions,
 * the invocation for skills, and the raw text otherwise. Callers handle
 * attachments separately (dropping them or shortening their paths) and filter
 * them out before mapping, so the `attachment` case here is only a
 * total-function fallback.
 */
export function inlinePromptSegmentText(segment: PromptSegment): string {
  switch (segment.kind) {
    case "file":
    case "attachment":
      return `@${segment.path}`;
    case "skill":
      return segment.invocation;
    case "diff_comment":
      return formatDiffCommentPrompt(segment);
    case "mcp":
      return `@${segment.name}`;
    case "thread":
      return `@${threadMentionLabel(segment)}`;
    case "text":
      return segment.content;
  }
}

export function skillSegmentFromSlashCommand(
  command: AgentSlashCommand | undefined,
): Extract<PromptSegment, { kind: "skill" }> | undefined {
  // `skillPath` is intentionally not required: provider-native skills (resolved
  // by the agent from its own catalog) have no SKILL.md the app can point at.
  if (
    !command?.skillName ||
    !command.skillInvocation ||
    !command.skillProvider ||
    !command.skillScope
  ) {
    return undefined;
  }
  return {
    kind: "skill",
    name: command.skillName,
    ...(command.skillPath ? { path: command.skillPath } : {}),
    invocation: command.skillInvocation,
    provider: command.skillProvider,
    scope: command.skillScope,
    ...(command.pluginId ? { pluginId: command.pluginId } : {}),
    ...(command.pluginName ? { pluginName: command.pluginName } : {}),
  };
}

export function buildPromptContentBlocks(
  prompt: string,
  segments?: PromptSegment[],
): CanonicalContentBlock[] {
  if (!segments || segments.length === 0) {
    return prompt.trim().length > 0 ? [{ kind: "text", text: prompt }] : [];
  }

  const content: CanonicalContentBlock[] = [];
  for (const segment of segments) {
    if (segment.kind === "text") {
      if (segment.content.length > 0) {
        content.push({ kind: "text", text: segment.content });
      }
      continue;
    }

    if (segment.kind === "skill") {
      content.push({
        kind: "skill",
        name: segment.name,
        invocation: segment.invocation,
        ...(segment.pluginId ? { pluginId: segment.pluginId } : {}),
        ...(segment.pluginName ? { pluginName: segment.pluginName } : {}),
      });
      continue;
    }

    if (segment.kind === "diff_comment") {
      content.push({ ...segment });
      continue;
    }

    if (segment.kind === "mcp") {
      content.push({ kind: "mcp", name: segment.name });
      continue;
    }

    if (segment.kind === "thread") {
      content.push({ kind: "thread", threadId: segment.threadId, title: segment.title });
      continue;
    }

    const name = fileNameFromPath(segment.path);
    if (segment.kind === "attachment") {
      if (isImagePath(segment.path, segment.mimeType)) {
        content.push({
          kind: "image",
          mimeType: segment.mimeType ?? MIME_BY_EXT[getExtension(segment.path)] ?? "image/*",
          dataUrl: toLocalFileUrl(segment.path),
          path: segment.path,
          name,
          source: "attachment",
        });
      } else {
        content.push({
          kind: "file",
          path: segment.path,
          name,
          source: "attachment",
          ...(segment.mimeType ? { mimeType: segment.mimeType } : {}),
        });
      }
      continue;
    }

    content.push({ kind: "file", path: segment.path, name, source: "mention" });
  }

  return content.length > 0
    ? content
    : prompt.trim().length > 0
      ? [{ kind: "text", text: prompt }]
      : [];
}
