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
  const normalized = normalizeChatPath(raw, { preserveAbsolute: true });
  const projectRoots = getProjectRoots(projectLocation).map((root) =>
    normalizeChatPath(root, { preserveAbsolute: true }),
  );
  const root = projectRoots.find((candidate) => pathStartsWithRoot(normalized, candidate));
  if (!root) return normalized;
  return normalized.slice(root.length).replace(/^\/+/, "");
}

function getProjectRoots(projectLocation: ProjectLocation): string[] {
  switch (projectLocation.kind) {
    case "windows":
      return [projectLocation.path];
    case "wsl":
      return [projectLocation.linuxPath, projectLocation.uncPath];
    case "ssh":
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
