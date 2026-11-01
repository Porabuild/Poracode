import { isImagePath, toLocalFileUrl } from "./promptContent";
import { chatVideoFilePath, isChatVideoSource, isVideoPath } from "./chatVideo";
import { chatFileLocalPath, isChatDownloadPath, isChatFileSource } from "./chatFile";

export interface MarkdownLocalImageOptions {
  /** Project / worktree filesystem root for project-relative image paths. */
  projectRoot?: string;
  /**
   * Additional roots for relative image paths (e.g. an agent session media
   * directory). Paths under `images/` or `videos/` try these before projectRoot.
   */
  extraRoots?: readonly string[];
}

/**
 * Rewrite local filesystem image targets to `poracode-local://` before markdown
 * parse. Required because CommonMark treats `\.` as an escape (mangling Windows
 * paths like `C:\Users\me\.grok\…`), and relative image paths would otherwise
 * 404 against the app origin.
 */
export function rewriteMarkdownLocalImageUrls(
  text: string,
  options?: MarkdownLocalImageOptions,
): string {
  text = rewriteMarkdownLocalResourceUrls(text, options);
  if (!text.includes("![")) return text;
  // Only complete `![…](…)` forms — incomplete streaming tails stay untouched.
  return text.replace(
    /!\[([^\]]*)\]\((?:<([^>\n]+)>|([^)\n]+))\)/g,
    (full, alt: string, angleUrl: string | undefined, bareUrl: string | undefined) => {
      const rawUrl = (angleUrl ?? bareUrl ?? "").trim();
      if (!rawUrl) return full;
      // Videos already passed through code-aware rewriting above.
      if (isVideoPath(rawUrl)) return full;
      const rewritten = resolveMarkdownImageUrl(rawUrl, options);
      if (!rewritten) return full;
      // Angle brackets keep the URL opaque to markdown's backslash escapes.
      return `![${alt}](<${rewritten}>)`;
    },
  );
}

/**
 * Preserve Windows video and downloadable-artifact destinations before
 * CommonMark consumes backslashes, rewriting them to opaque canonical local
 * URLs. Eligible plain `[…](…)` artifact links become chat file cards;
 * images (`![…](…)`) keep their existing image/video handling, and fenced or
 * indented code is skipped.
 */
export function rewriteMarkdownLocalResourceUrls(
  text: string,
  options?: MarkdownLocalImageOptions,
): string {
  if (!text.includes("](")) return text;
  let fence: { marker: string; length: number } | undefined;
  let prose = "";
  let result = "";
  for (const line of text.match(/[^\n]*(?:\n|$)/g) ?? []) {
    const match = /^ {0,3}(`{3,}|~{3,})(.*?)(?:\r?\n)?$/.exec(line);
    if (fence) {
      result += line;
      if (
        match &&
        match[1]![0] === fence.marker &&
        match[1]!.length >= fence.length &&
        !match[2]!.trim()
      )
        fence = undefined;
    } else if (match && !(match[1]![0] === "`" && match[2]!.includes("`"))) {
      result += rewriteLocalResourceProse(prose, options) + line;
      prose = "";
      fence = { marker: match[1]![0]!, length: match[1]!.length };
    } else if (/^(?: {4}|\t)/u.test(line)) {
      result += rewriteLocalResourceProse(prose, options) + line;
      prose = "";
    } else {
      prose += line;
    }
  }
  return result + rewriteLocalResourceProse(prose, options);
}

function rewriteLocalResourceProse(text: string, options?: MarkdownLocalImageOptions): string {
  return text.replace(
    /(`+)[\s\S]*?(?<!`)\1(?!`)|(!?\[[^\]]*\])\((?:<([^>\n]+)>|([^)\n]+))\)/g,
    (
      full,
      code: string | undefined,
      label: string | undefined,
      angleUrl: string | undefined,
      bareUrl: string | undefined,
    ) => {
      if (code || !label) return full;
      const url = (angleUrl ?? bareUrl ?? "").trim();
      if (isChatVideoSource(url)) {
        const path = chatVideoFilePath(url);
        const rewritten = path ? resolveMarkdownImageUrl(path, options) : null;
        return rewritten ? `${label}(<${rewritten}>)` : full;
      }
      // Downloadable artifact links only; image labels keep the image pipeline.
      if (label.startsWith("!")) return full;
      const rewritten = resolveMarkdownFileUrl(url, options);
      return rewritten ? `${label}(<${rewritten}>)` : full;
    },
  );
}

/**
 * Map a markdown image destination to a renderable local URL, or null when it
 * should be left unchanged (remote / data / already local).
 */
export function resolveMarkdownImageUrl(
  url: string,
  options?: MarkdownLocalImageOptions,
): string | null {
  const trimmed = url.trim();
  if (!trimmed) return null;

  if (
    trimmed.startsWith("poracode-local://") ||
    trimmed.startsWith("lightcode-local://") ||
    trimmed.startsWith("data:") ||
    trimmed.startsWith("blob:") ||
    /^https?:\/\//i.test(trimmed)
  ) {
    return null;
  }

  // Windows drive, UNC (`\\` / `//`), or POSIX absolute.
  if (/^[A-Za-z]:[\\/]/.test(trimmed) || trimmed.startsWith("\\\\") || trimmed.startsWith("/")) {
    return toLocalFileUrl(trimmed);
  }

  if ((!isImagePath(trimmed) && !isVideoPath(trimmed)) || trimmed.includes("://")) return null;

  const absolute = resolveRelativeImagePath(trimmed, options);
  return absolute ? toLocalFileUrl(absolute) : null;
}

/**
 * Map a plain markdown link destination to a canonical local URL for a
 * download card, or null when it is not a safe local artifact reference.
 * Already-canonical `poracode-local://` hrefs are left unchanged; `file://`
 * is re-canonicalized. Remote URLs and non-artifact extensions stay on the
 * external-link / path-chip routes.
 */
export function resolveMarkdownFileUrl(
  url: string,
  options?: MarkdownLocalImageOptions,
): string | null {
  const trimmed = url.trim();
  if (!trimmed || !isChatFileSource(trimmed)) return null;
  let path = chatFileLocalPath(trimmed);
  if (!path) return null;
  if (/^poracode-local:\/\//iu.test(trimmed)) return null;
  // Markdown link destinations are URLs: decode valid percent encoding once.
  // Typed canonical file paths never pass through here, so literal `%` in
  // on-disk names stays untouched outside this URL context.
  if (!/^file:\/\//iu.test(trimmed)) {
    try {
      path = decodeURIComponent(path);
    } catch {
      return null;
    }
  }
  if (!isChatDownloadPath(path)) return null;
  if (/^file:\/\//iu.test(trimmed)) return toLocalFileUrl(path);

  // Windows drive, UNC (`\\` / `//`), or POSIX absolute.
  if (/^[A-Za-z]:[\\/]/.test(path) || path.startsWith("\\\\") || path.startsWith("/")) {
    return toLocalFileUrl(path);
  }

  const absolute = resolveRelativeImagePath(path, options);
  return absolute ? toLocalFileUrl(absolute) : null;
}

/** Session-media style paths (e.g. Grok image_gen) prefer extraRoots over projectRoot. */
function prefersExtraRoots(relativePath: string): boolean {
  const normalized = relativePath.replaceAll("\\", "/").replace(/^\.\//, "");
  return /^(images|videos)\//i.test(normalized);
}

function resolveRelativeImagePath(
  relativePath: string,
  options?: MarkdownLocalImageOptions,
): string | null {
  const projectRoot = options?.projectRoot?.trim();
  const extraRoots = (options?.extraRoots ?? [])
    .map((root) => root.trim())
    .filter((root) => root.length > 0);
  const projectRoots = projectRoot ? [projectRoot] : [];
  const roots = prefersExtraRoots(relativePath)
    ? [...extraRoots, ...projectRoots]
    : [...projectRoots, ...extraRoots];

  for (const root of roots) {
    const absolute = joinRoot(root, relativePath);
    if (absolute) return absolute;
  }
  return null;
}

function joinRoot(rootPath: string, relativePath: string): string | null {
  const root = rootPath.replaceAll("\\", "/").replace(/\/+$/, "");
  const rel = relativePath.replaceAll("\\", "/").replace(/^\.\//, "").replace(/^\/+/, "");
  if (!root || !rel) return null;
  const parts = rel.split("/").filter((part) => part.length > 0 && part !== ".");
  if (parts.some((part) => part === "..")) return null;
  return `${root}/${parts.join("/")}`;
}
