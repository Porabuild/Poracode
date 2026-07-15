import { isImagePath, toLocalFileUrl } from "./promptContent";

/**
 * Rewrite local filesystem image targets to `poracode-local://` before markdown
 * parse. Required because CommonMark treats `\.` as an escape (mangling Windows
 * paths like `C:\Users\me\.grok\…`), and relative image paths would otherwise
 * 404 against the app origin.
 */
export function rewriteMarkdownLocalImageUrls(
  text: string,
  options?: { projectRoot?: string },
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
  options?: { projectRoot?: string },
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

  const projectRoot = options?.projectRoot?.trim();
  if (!projectRoot || !isImagePath(trimmed) || trimmed.includes("://")) return null;

  const absolute = joinProjectRoot(projectRoot, trimmed);
  return absolute ? toLocalFileUrl(absolute) : null;
}

function joinProjectRoot(projectRoot: string, relativePath: string): string | null {
  const root = projectRoot.replaceAll("\\", "/").replace(/\/+$/, "");
  const rel = relativePath.replaceAll("\\", "/").replace(/^\.\//, "").replace(/^\/+/, "");
  if (!root || !rel) return null;
  const parts = rel.split("/").filter((part) => part.length > 0 && part !== ".");
  if (parts.some((part) => part === "..")) return null;
  return `${root}/${parts.join("/")}`;
}
