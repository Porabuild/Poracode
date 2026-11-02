import { AsyncLocalStorage } from "node:async_hooks";
import type { Thread } from "@/shared/contracts";
import { isHomeProjectId } from "@/shared/homeScope";
import type { RemoteProject } from "@/shared/remote";
import { parseSubSessionId, threadId } from "../ids";
import { locationDirectory, pathContains, samePath } from "../paths";
import type { RouterContext } from "./context";

const INVENTORY_TTL_MS = 30_000;

/**
 * Host projects for the router. The TUI launches bound to one project, but
 * any thread on the host can be opened, so each request runs scoped to the
 * project of the session or location it targets: `resolveProject()` answers
 * that project inside a request and the launch project elsewhere.
 */
export function createProjects(ctx: RouterContext) {
  const launchProject = ctx.resolveProject;
  const scope = new AsyncLocalStorage<() => Promise<RemoteProject>>();
  let inventory: { at: number; byId: Map<string, RemoteProject> } | undefined;

  const projectInventory = async (refresh = false) => {
    if (!refresh && inventory && Date.now() - inventory.at < INVENTORY_TTL_MS)
      return inventory.byId;
    const page = await ctx.input.client.boundedProjectListPage({
      mode: "inventory",
      projectLimit: 100,
    });
    inventory = {
      at: Date.now(),
      byId: new Map(page.projects.map((value) => [value.id, value] as const)),
    };
    return inventory.byId;
  };
  // A project registered after the last read is fetched once more on a miss.
  const projectById = async (id: string) =>
    (await projectInventory()).get(id) ?? (await projectInventory(true)).get(id);

  // A thread from another host project keeps its own project id and checkout.
  // Unknown projects fall back to the launch project.
  const threadProjects = async () => {
    const current = await launchProject();
    const byId = await projectInventory();
    return (value: Thread) =>
      value.projectId === current.id ? current : (byId.get(value.projectId) ?? current);
  };
  const projectOfThread = async (value: Thread) => {
    const current = await launchProject();
    if (value.projectId === current.id) return current;
    return (await projectById(value.projectId)) ?? current;
  };

  const projectForSession = async (session: string): Promise<RemoteProject> => {
    const local = ctx.sessions.get(session);
    if (local?.remoteStarted === false)
      return (await projectById(local.projectId)) ?? launchProject();
    // Cache only: every listed or opened thread is cached, and a miss must not
    // page the host on each request. A real thread id wins over a subagent
    // subsession, which resolves through its parent.
    const subSession = parseSubSessionId(session);
    const thread =
      ctx.threadCache.get(threadId(session)) ??
      (subSession ? ctx.threadCache.get(subSession.threadId) : undefined);
    return thread ? projectOfThread(thread) : launchProject();
  };

  // A directory belongs to the project registered at it, a known worktree of
  // a project, or the innermost project folder containing it. Home only
  // matches exactly: every folder under the user's home is inside it.
  const projectForDirectory = async (directory: string): Promise<RemoteProject> => {
    const current = await launchProject();
    if (samePath(locationDirectory(current.location), directory)) return current;
    const projects = [...(await projectInventory()).values()];
    const exact = projects.find((value) => samePath(locationDirectory(value.location), directory));
    if (exact) return exact;
    const worktree = [...ctx.threadCache.values()].find(
      (value) => value.worktreePath && pathContains(value.worktreePath, directory),
    );
    if (worktree) return projectOfThread(worktree);
    const parent = projects
      .filter(
        (value) =>
          !isHomeProjectId(value.id) && pathContains(locationDirectory(value.location), directory),
      )
      .sort(
        (left, right) =>
          locationDirectory(right.location).length - locationDirectory(left.location).length,
      )[0];
    return parent ?? current;
  };

  const resolveProject = () => scope.getStore()?.() ?? launchProject();

  const memo = (load: () => Promise<RemoteProject>) => {
    let value: Promise<RemoteProject> | undefined;
    return () => (value ??= load());
  };
  /** Runs `run` scoped to the project of the session or location `url` targets. */
  const runInRequestScope = <T>(url: URL, run: () => Promise<T>) => {
    const session = url.pathname.match(/^\/api\/(?:experimental\/)?session\/([^/]+)/u)?.[1];
    const shell = url.pathname.match(/^\/api\/shell\/([^/]+)/u)?.[1];
    const shellThread = shell
      ? ctx.parseShellId(decodeURIComponent(shell))?.rawThreadId
      : undefined;
    const directory =
      url.searchParams.get("location[directory]") ?? url.searchParams.get("location.directory");
    const load =
      session && session !== "active"
        ? () => projectForSession(decodeURIComponent(session))
        : shellThread
          ? () => projectForSession(shellThread)
          : directory
            ? () => projectForDirectory(directory)
            : undefined;
    return load ? scope.run(memo(load), run) : run();
  };
  /** Facade calls bypass `handle`; scope them to their session explicitly. */
  const runInSessionScope = <T>(session: string, run: () => Promise<T>) =>
    scope.run(
      memo(() => projectForSession(session)),
      run,
    );

  return {
    launchProject,
    resolveProject,
    projectInventory,
    projectById,
    threadProjects,
    projectOfThread,
    projectForSession,
    projectForDirectory,
    runInRequestScope,
    runInSessionScope,
  };
}
