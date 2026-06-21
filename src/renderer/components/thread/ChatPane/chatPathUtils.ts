import type { ProjectLocation } from "@/shared/contracts";

/** Normalize model / markdown paths to a project-relative POSIX path for the file editor. */
export function normalizeChatRelativePath(raw: string): string {
  return normalizeChatPath(raw, { preserveAbsolute: false });
}

function normalizeChatPath(raw: string, options: { preserveAbsolute: boolean }): string {
  let s = raw.trim();
  if (!s) return s;
  if (s.startsWith("file://")) {
    try {
      const u = new URL(s);
      s = u.pathname;
      if (s.startsWith("/") && /^\/[A-Za-z]:/.test(s)) s = s.slice(1);
      else if (!options.preserveAbsolute) s = s.replace(/^\//, "");
    } catch {
      /* keep */
    }
  }
  s = s.replace(/^\.\//, "").replace(/\\/g, "/");
  const collapsed = s.replace(/\/+/g, "/");
  return options.preserveAbsolute ? collapsed : collapsed.replace(/^\/+/, "");
}

export function normalizeChatProjectPath(raw: string, projectLocation: ProjectLocation): string {
  const { normalized, relative } = relativizeAgainstProjectRoots(raw, projectLocation);
  return relative ?? normalized;
}

/**
 * Display helper for chat tool-call rows: render a path relative to the agent's
 * working directory (the project / worktree root) when it lives inside it, and
 * the original absolute path otherwise. Unlike {@link normalizeChatProjectPath},
 * out-of-root paths are returned untouched (original separators preserved) so an
 * external file still reads as a plain `C:\…` / `/…` absolute path.
 */
export function toProjectRelativeDisplayPath(
  raw: string,
  projectLocation: ProjectLocation,
): string {
  const { relative } = relativizeAgainstProjectRoots(raw, projectLocation);
  if (relative === null) return raw;
  // A path that *is* the root (e.g. an action targeting the working dir itself)
  // collapses to an empty remainder — show "." so the row never renders blank.
  return relative.length > 0 ? relative : ".";
}

function relativizeAgainstProjectRoots(
  raw: string,
  projectLocation: ProjectLocation,
): { normalized: string; relative: string | null } {
  const normalized = normalizeChatPath(raw, { preserveAbsolute: true });
  const projectRoots = getProjectRoots(projectLocation).map((root) =>
    normalizeChatPath(root, { preserveAbsolute: true }),
  );
  const root = projectRoots.find((candidate) => pathStartsWithRoot(normalized, candidate));
  if (!root) return { normalized, relative: null };
  return { normalized, relative: normalized.slice(root.length).replace(/^\/+/, "") };
}

function getProjectRoots(projectLocation: ProjectLocation): string[] {
  switch (projectLocation.kind) {
    case "windows":
      return [projectLocation.path];
    case "wsl":
      return [projectLocation.linuxPath, projectLocation.uncPath];
    case "posix":
      return [projectLocation.path];
  }
}

function pathStartsWithRoot(path: string, root: string): boolean {
  const normalizedRoot = root.replace(/\/+$/, "");
  if (!normalizedRoot) return false;
  const lcPath = path.toLowerCase();
  const lcRoot = normalizedRoot.toLowerCase();
  if (path.length === normalizedRoot.length) return lcPath === lcRoot;
  return lcPath.startsWith(`${lcRoot}/`) || path.startsWith(`${normalizedRoot}/`);
}
