export type ProjectPathRef =
  | { kind: "file"; path: string; line?: number; endLine?: number }
  | { kind: "folder"; path: string };

const PATH_EXTENSION_RE =
  /\.(tsx?|jsx?|mjs|cjs|json|mdx?|css|scss|rs|go|py|toml|yaml|yml|vue|svelte|html?|txt)$/i;

export const PROJECT_PATH_TOKEN_SOURCE = String.raw`(?<![A-Za-z0-9_:/@.\\-])(\/?(?:[A-Za-z0-9_@.][A-Za-z0-9_@.-]*(?:[\\/][A-Za-z0-9_@.-]+)+|[A-Za-z0-9_@-][A-Za-z0-9_@.-]*\.[A-Za-z][A-Za-z0-9-]*))(?::(\d+)(?:-\d+)?)?`;

interface ParseOptions {
  /**
   * Top-level entry names of the active project. When provided, the parser
   * requires the candidate's first segment to match one — this prevents false
   * positives like `@tanstack/react-virtual` (an npm package, not a folder) or
   * any other `foo/bar` token that happens to look path-shaped. Pass `undefined`
   * to skip this check (legacy callers, tests).
   */
  rootNames?: ReadonlySet<string> | undefined;
}

/**
 * Recognize a project path with an optional `:<line>` or `:<start>-<end>` suffix.
 * Distinguishes files (extension or `:line`) from folders (separator with a
 * non-extension last segment, or trailing slash). Returns null for plain
 * words, URLs, or `name:digits` shapes that don't look like file paths.
 *
 * When `rootNames` is supplied, the candidate's first path segment must be a
 * known top-level entry; otherwise the candidate is rejected. This prevents
 * non-path tokens like `@tanstack/react-virtual` from chipping.
 */
export function parseProjectPathRef(s: string, options: ParseOptions = {}): ProjectPathRef | null {
  const t = s.trim();
  if (t.length < 2 || /\s/.test(t)) return null;
  if (/^https?:\/\//i.test(t)) return null;

  const lineMatch = t.match(/^(.+):(\d+)(?:-(\d+))?$/);
  const candidate = lineMatch ? lineMatch[1]! : t;
  const hasSeparator = candidate.includes("/") || candidate.includes("\\");
  const hasExtension = PATH_EXTENSION_RE.test(candidate);
  const segments = candidate.split(/[\\/]/).filter(Boolean);
  const firstSegment = segments[0] ?? "";
  const lastSegment = segments[segments.length - 1] ?? "";
  const isDotfile = lastSegment.startsWith(".") && !lastSegment.includes("/");
  const trailingSeparator = /[\\/]$/.test(candidate);

  if (!hasSeparator && !hasExtension) return null;

  const isAbsolutePosix = candidate.startsWith("/");
  if (options.rootNames && hasSeparator && !isAbsolutePosix) {
    if (firstSegment === "" || !options.rootNames.has(firstSegment)) return null;
  }

  if (lineMatch && Number.isFinite(Number.parseInt(lineMatch[2]!, 10))) {
    const line = Number.parseInt(lineMatch[2]!, 10);
    const endLine = lineMatch[3] ? Number.parseInt(lineMatch[3], 10) : undefined;
    if (line > 0) {
      return endLine && endLine > line
        ? { kind: "file", path: candidate, line, endLine }
        : { kind: "file", path: candidate, line };
    }
  }

  if (trailingSeparator) {
    const cleaned = candidate.replace(/[\\/]+$/, "");
    return cleaned ? { kind: "folder", path: cleaned } : null;
  }
  if (hasExtension || isDotfile) {
    return { kind: "file", path: candidate };
  }
  // Folder fallback (no extension, no trailing slash). For non-absolute paths
  // the rootNames guard above already required the first segment to be a
  // real project entry. For absolute paths, apply the same check here so
  // slash commands like `/plan` (whose first segment isn't a project root)
  // don't get chipped as folders.
  if (isAbsolutePosix && options.rootNames && !options.rootNames.has(firstSegment)) {
    return null;
  }
  return { kind: "folder", path: candidate };
}
