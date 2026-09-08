export const EXTENSION_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/bmp": "bmp",
  "image/svg+xml": "svg",
  "image/avif": "avif",
};

const MIME_BY_EXTENSION: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  bmp: "image/bmp",
  svg: "image/svg+xml",
  avif: "image/avif",
};

/** Metadata for an already-resolved display URL, independent of its transcript source. */
export function imageUrlMetadata(src: string, alt: string = "") {
  const mime = readMarkdownImageMime(src);
  const extension = EXTENSION_BY_MIME[mime] ?? readMarkdownImageExtension(src) ?? "png";
  const fileName = readMarkdownImageFileName(src, extension) ?? buildFileName(alt, extension);
  return { mime, extension, fileName };
}

function readMarkdownImageMime(src: string): string {
  const dataMime = /^data:([^;,]+)/i.exec(src)?.[1]?.toLowerCase();
  if (dataMime?.startsWith("image/")) return dataMime;
  const extension = readMarkdownImageExtension(src);
  return extension ? (MIME_BY_EXTENSION[extension] ?? "image/*") : "image/*";
}

function readMarkdownImageExtension(src: string): string | undefined {
  const path = stripUrlSuffix(src);
  const match = /\.([a-z0-9]+)$/i.exec(path);
  if (!match) return undefined;
  const extension = match[1]!.toLowerCase();
  if (!(extension in MIME_BY_EXTENSION)) return undefined;
  return extension === "jpeg" ? "jpg" : extension;
}

function readMarkdownImageFileName(src: string, extension: string): string | undefined {
  if (/^(?:data|blob):/i.test(src)) return undefined;
  const path = decodeUrlPath(stripUrlSuffix(src));
  const candidate = path.split(/[\\/]/).at(-1)?.trim();
  if (!candidate) return undefined;
  const invalidFileNameCharacters = '<>:"/\\|?*';
  const safeName = Array.from(candidate)
    .map((character) =>
      character.charCodeAt(0) < 32 || invalidFileNameCharacters.includes(character)
        ? "-"
        : character,
    )
    .join("");
  return safeName.includes(".") ? safeName : `${safeName}.${extension}`;
}

function stripUrlSuffix(src: string): string {
  return src.split(/[?#]/, 1)[0] ?? src;
}

function decodeUrlPath(path: string): string {
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
}

export function buildFileName(alt: string, extension: string): string {
  const slug = alt
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  const base = slug.length > 0 ? slug : "generated-image";
  return `${base}.${extension}`;
}
