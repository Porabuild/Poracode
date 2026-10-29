import type { IncomingMessage } from "node:http";
import type { IpcProcedurePayload, SupervisorProcedureName } from "@/shared/ipc";
import { projectLocationKey } from "@/shared/projectIdentity";
import { dbGetProject } from "@/host/db";
import { RemoteHttpError } from "../auth";
import type { RemoteServerContext } from "./context";

export type ProjectWatchProcedureName =
  | "gitWatchProject"
  | "gitWatchWorktrees"
  | "gitUnwatchProject";

const PROJECT_WATCH_PROCEDURES: ReadonlySet<string> = new Set<ProjectWatchProcedureName>([
  "gitWatchProject",
  "gitWatchWorktrees",
  "gitUnwatchProject",
]);

/**
 * Every managed desktop window shares one watch owner. Its memory-only session
 * changes on reload, intake re-bootstrap and server replacement, while the
 * main window's registrations stay mounted and are never re-sent.
 */
export const MANAGED_RENDERER_WATCH_OWNER = "managed-renderer";

/** Ephemeral sessions are minted only for managed desktop windows. */
export function projectWatchOwnerForSession(session: {
  readonly sessionId: string;
  readonly ephemeral?: true;
}): string {
  return session.ephemeral ? MANAGED_RENDERER_WATCH_OWNER : `session:${session.sessionId}`;
}

export function isProjectWatchProcedure(
  name: SupervisorProcedureName,
): name is ProjectWatchProcedureName {
  return PROJECT_WATCH_PROCEDURES.has(name);
}

/**
 * Runs one shared-watcher procedure. The owner comes from the bearer session:
 * the payload schemas carry none, so a caller can neither name nor release
 * another client's interest. `payload` has already passed scope checks and
 * `authorizeProjectProcedurePayload`.
 */
export async function runProjectWatchProcedure(
  ctx: RemoteServerContext,
  req: IncomingMessage,
  name: ProjectWatchProcedureName,
  payload: unknown,
): Promise<void> {
  const leases = ctx.options.projectWatches;
  const owner = projectWatchOwnerForSession(ctx.security.requireBearerSession(req, []).session);
  switch (name) {
    case "gitWatchProject": {
      const watch = payload as IpcProcedurePayload<"gitWatchProject">;
      // The location was matched against EVERY registered location, including
      // other projects and thread worktrees; bind it to this project's root.
      const project = dbGetProject(watch.projectId);
      if (
        !project ||
        projectLocationKey(project.location) !== projectLocationKey(watch.projectLocation)
      ) {
        throw new RemoteHttpError(
          "project_location_not_registered",
          "Project location is not registered for this project.",
          403,
        );
      }
      if (!leases) {
        await ctx.options.callSupervisor("gitWatchProject", watch);
        return;
      }
      await leases.watchProject(owner, watch.projectId);
      return;
    }
    case "gitWatchWorktrees": {
      const worktrees = payload as IpcProcedurePayload<"gitWatchWorktrees">;
      if (worktrees.worktreePaths.length > 0 && !dbGetProject(worktrees.projectId)) {
        throw new RemoteHttpError("project_not_found", "Project not found.", 404);
      }
      if (!leases) {
        await ctx.options.callSupervisor("gitWatchWorktrees", worktrees);
        return;
      }
      await leases.setWorktrees(owner, worktrees.projectId, worktrees.worktreePaths);
      return;
    }
    case "gitUnwatchProject": {
      const unwatch = payload as IpcProcedurePayload<"gitUnwatchProject">;
      if (!leases) {
        await ctx.options.callSupervisor("gitUnwatchProject", unwatch);
        return;
      }
      await leases.unwatchProject(owner, unwatch.projectId, unwatch.releaseWslDistro);
      return;
    }
  }
}
