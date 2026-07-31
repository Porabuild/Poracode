import type { ProjectLocation } from "./contracts";

/**
 * Absolute path of `~/.grok/sessions/<encoded-cwd>/<sessionId>` for a native
 * (Windows/POSIX) project. Returns null for WSL (session files live inside the
 * distro; local `poracode-local://` cannot reach them without a UNC home) or
 * when inputs are incomplete.
 *
 * Grok image_gen writes `images/<n>.ext` under this directory; chat markdown
 * resolves those relative paths through `extraRoots` on the local-image rewriter.
 */
export function resolveGrokSessionDir(options: {
  projectLocation: ProjectLocation;
  sessionId: string;
  /** Native host home directory (bridge `homeDir`). */
  homeDir: string;
  /** Optional `GROK_HOME` override (native only). */
  grokHome?: string;
}): string | null {
  const sessionId = options.sessionId.trim();
  const homeDir = options.homeDir.trim();
  if (!sessionId || !homeDir) return null;
  if (options.projectLocation.kind === "wsl") return null;

  const cwd = options.projectLocation.path.trim();
  if (!cwd) return null;

  const grokHome = options.grokHome?.trim();
  const grokRoot = grokHome && grokHome.length > 0 ? grokHome : joinPath(homeDir, ".grok");
  return joinPath(grokRoot, "sessions", encodeURIComponent(cwd), sessionId);
}

/** Join path segments, preserving the separator style of the first segment. */
function joinPath(...parts: string[]): string {
  const sep = parts[0]?.includes("\\") ? "\\" : "/";
  return parts
    .map((part, index) =>
      index === 0
        ? part.replace(/[\\/]+$/, "")
        : part.replace(/^[\\/]+/, "").replace(/[\\/]+$/, ""),
    )
    .filter((part) => part.length > 0)
    .join(sep);
}
