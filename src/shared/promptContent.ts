import type { CanonicalContentBlock, PromptSegment } from "./contracts";

const IMAGE_EXTENSIONS = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "svg",
  "bmp",
  "ico",
  "avif",
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

export function isImagePath(path: string, mimeType?: string): boolean {
  return mimeType?.startsWith("image/") === true || IMAGE_EXTENSIONS.has(getExtension(path));
}

export function toLocalFileUrl(absolutePath: string): string {
  const normalized = absolutePath.replaceAll("\\", "/");
  // The `lightcode-local` scheme is registered as `standard: true` (so cached
  // ACP registry icons can load as CSS mask-image sources). Standard/special
  // schemes parse with WHATWG "special authority ignore slashes": leading
  // slashes collapse and the first path segment becomes the host. Anchoring the
  // path to a constant `local` host keeps the real path intact in the URL's
  // `pathname` — without it, `/Users/…` (macOS) or the drive letter (Windows)
  // would be eaten as the host and the protocol handler would resolve the wrong
  // file. See src/main/attachments/localFiles.ts.
  const path = normalized.startsWith("/") ? normalized : `/${normalized}`;
  return `lightcode-local://local${path}`;
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
        content.push({ kind: "file", path: segment.path, name, source: "attachment" });
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
