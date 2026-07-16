import { isImagePath, toLocalFileUrl } from "./promptContent";

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
  if (!text.includes("![")) return text;
  // Only complete `![…](…)` forms — incomplete streaming tails stay untouched.
  return text.replace(
    /!\[([^\]]*)\]\((?:<([^>\n]+)>|([^)\n]+))\)/g,
    (full, alt: string, angleUrl: string | undefined, bareUrl: string | undefined) => {
      const rawUrl = (angleUrl ?? bareUrl ?? "").trim();
      if (!rawUrl) return full;
      const rewritten = resolveMarkdownImageUrl(rawUrl, options);
      if (!rewritten) return full;
      // Angle brackets keep the URL opaque to markdown's backslash escapes.
      return `![${alt}](<${rewritten}>)`;
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

  if (!isImagePath(trimmed) || trimmed.includes("://")) return null;

  const absolute = resolveRelativeImagePath(trimmed, options);
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
