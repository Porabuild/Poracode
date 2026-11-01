import { deriveLocationFromPath } from "@/shared/createProject";
import { isHomeProjectId } from "@/shared/homeScope";
import { projectLocationKey } from "@/shared/projectIdentity";
import type { RemoteDesktopClient } from "@/shared/remote/client";
import type { RemoteProject } from "@/shared/remote";
import { locationDirectory, pathContains, samePath } from "./paths";

export type LaunchProject = {
  project: RemoteProject;
  /** The TUI's default location: the project root, or a worktree of it. */
  directory: string;
  /** Bound to the host's Home project because the folder belongs to none. */
  home: boolean;
};

/** Git roots of a local folder: its worktree root and the main checkout. */
export type GitRoots = { toplevel: string; mainRoot: string };

/**
 * Binds the TUI to a host project once it is connected.
 *
 * A local launch folder maps to the project registered at it, a worktree of
 * one, or the project folder it sits under. A git repository the host does not
 * know yet is registered, as the desktop's "open folder" does. Any other
 * folder, and every launch against a remote host (whose filesystem this
 * folder is not on), binds to the host's Home project instead of registering
 * a stray project.
 */
export async function resolveLaunchProject(input: {
  client: Pick<
    RemoteDesktopClient,
    "boundedProjectListPage" | "boundedThreadListPage" | "projectCommand"
  >;
  directory: string;
  projectId?: string;
  local: boolean;
  platform: NodeJS.Platform;
  gitRoots?: (directory: string) => GitRoots | undefined;
}): Promise<LaunchProject> {
  const { client, directory, local } = input;
  const projects = (await client.boundedProjectListPage({ mode: "inventory", projectLimit: 100 }))
    .projects;
  const bind = (project: RemoteProject, at = locationDirectory(project.location)) => ({
    project,
    directory: at,
    home: isHomeProjectId(project.id),
  });
  const root = (project: RemoteProject) => locationDirectory(project.location);
  const register = async (path: string) =>
    (await client.projectCommand({ kind: "add-existing", path })).project ??
    (await client.boundedProjectListPage({ mode: "inventory", projectLimit: 100 })).projects.find(
      (value) => samePath(root(value), path),
    );
  const folders = projects.filter((project) => !isHomeProjectId(project.id));

  const requested = input.projectId
    ? projects.find((project) => project.id === input.projectId)
    : undefined;
  if (requested)
    return bind(
      requested,
      local && pathContains(root(requested), directory) ? directory : root(requested),
    );

  if (local) {
    // Home wins a tie: a stray project registered at the home folder by an
    // older TUI must not shadow it.
    const key = projectLocationKey(deriveLocationFromPath(directory, input.platform));
    const exact = projects
      .filter((project) => projectLocationKey(project.location) === key)
      .sort((left, right) => Number(isHomeProjectId(right.id)) - Number(isHomeProjectId(left.id)));
    if (exact[0]) return bind(exact[0]);

    const threads = (
      await client.boundedThreadListPage({ mode: "page", order: "updated", limit: 100 })
    ).page.threads;
    const worktree = threads.find(
      (thread) => thread.worktreePath && pathContains(thread.worktreePath, directory),
    );
    const worktreeProject = worktree
      ? projects.find((project) => project.id === worktree.projectId)
      : undefined;
    if (worktree?.worktreePath && worktreeProject)
      return bind(worktreeProject, worktree.worktreePath);

    // Every folder under the user's home is inside Home, so Home never claims
    // a folder by containment.
    const parent = folders
      .filter((project) => pathContains(root(project), directory))
      .sort((left, right) => root(right).length - root(left).length)[0];
    if (parent) return bind(parent);

    const git = input.gitRoots?.(directory);
    if (git) {
      const owner = folders.find((project) => samePath(root(project), git.mainRoot));
      if (owner) return bind(owner, git.toplevel);
      const project = await register(git.toplevel);
      if (project) return bind(project);
    }
  }

  const home = projects.find((project) => isHomeProjectId(project.id));
  if (home) return bind(home);
  // A host that predates the Home row: keep the old behavior for a local
  // folder, otherwise open the most recent project.
  if (local) {
    const project = await register(directory);
    if (project) return bind(project);
  }
  if (projects[0]) return bind(projects[0]);
  throw new Error("This Poracode host has no projects yet. Add one in the desktop app first.");
}

/** Local `git rev-parse`; undefined outside a repository or without git. */
export function readGitRoots(directory: string): GitRoots | undefined {
  try {
    const result = Bun.spawnSync(
      [
        "git",
        "-C",
        directory,
        "rev-parse",
        "--path-format=absolute",
        "--show-toplevel",
        "--git-common-dir",
      ],
      { stdout: "pipe", stderr: "ignore", windowsHide: true },
    );
    if (result.exitCode !== 0) return undefined;
    const [toplevel, commonDir] = result.stdout.toString("utf8").trim().split(/\r?\n/u);
    if (!toplevel || !commonDir) return undefined;
    // A linked worktree's common dir is `<main>/.git`; a bare-style layout
    // falls back to the worktree root itself.
    const mainRoot = /[\\/]\.git$/u.test(commonDir) ? commonDir.slice(0, -5) : toplevel;
    return { toplevel, mainRoot };
  } catch {
    return undefined;
  }
}
