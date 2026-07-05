import { homedir } from "node:os";
import type { ProjectLocation } from "@/shared/contracts";
import { getWslCommand } from "../../agents/base";
import type { WindowsShellPreference } from "../../shellPreference";

/**
 * Resolve the command/args (and cwd) that spawn a plain interactive shell for a
 * project. WSL projects land in the distro (home or worktree); native projects
 * use the configured Windows shell preference or the login shell on posix.
 * Extracted from `ThreadSessionManager`.
 */
export function buildShellCommand(
  location: ProjectLocation,
  windowsShell: WindowsShellPreference,
  options?: { startInHome?: boolean },
): {
  command: string;
  args: string[];
  cwd?: string;
} {
  const startInHome = options?.startInHome === true;
  if (location.kind === "wsl") {
    // `wsl --cd ~` lands in the distro's Linux home; otherwise the worktree.
    return {
      command: getWslCommand(),
      args: ["-d", location.distro, "--cd", startInHome ? "~" : location.linuxPath],
    };
  }

  if (process.platform === "win32") {
    return {
      command: windowsShell.shell,
      args: [...windowsShell.args],
      cwd: startInHome ? homedir() : location.path,
    };
  }

  const shell = process.env.SHELL || "/bin/bash";
  return {
    command: shell,
    args: ["-l"],
    cwd: startInHome ? homedir() : location.path,
  };
}
