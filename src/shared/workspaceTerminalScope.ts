import type { ProjectLocation } from "./contracts";
import { normalizeWorktreePathForComparison } from "./worktree";
import { getProjectPosixPath } from "./wsl";

interface WorkspaceTerminalScope {
  projectLocation: ProjectLocation;
  worktreePath?: string | undefined;
}

// Android's project terminal predates the prefixed handle used by the
// other clients. Its UUID shell carries the effective cwd without a worktree tag.
const androidShellId = /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/iu;

export function matchesWorkspaceTerminal(
  terminal: WorkspaceTerminalScope & { terminalId: string },
  scope: WorkspaceTerminalScope,
): boolean {
  const android = androidShellId.test(terminal.terminalId);
  if (!android && !terminal.terminalId.startsWith("shell:")) return false;
  const left = terminal.projectLocation;
  const right = scope.projectLocation;
  if (left.kind !== right.kind || left.remoteServerId !== right.remoteServerId) return false;
  if (
    left.kind === "wsl" &&
    right.kind === "wsl" &&
    left.distro.toLowerCase() !== right.distro.toLowerCase()
  ) {
    return false;
  }
  const pathKey = (path: string) =>
    normalizeWorktreePathForComparison(path, right.kind === "windows");
  if (pathKey(getProjectPosixPath(left)) !== pathKey(getProjectPosixPath(right))) return false;
  if (android && terminal.worktreePath === undefined) return true;
  return (
    (terminal.worktreePath === undefined ? undefined : pathKey(terminal.worktreePath)) ===
    (scope.worktreePath === undefined ? undefined : pathKey(scope.worktreePath))
  );
}
