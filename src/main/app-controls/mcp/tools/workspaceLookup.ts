import { randomUUID } from "node:crypto";
import { nextWorkspaceIconId, type Workspace, type WorkspaceIconId } from "@/shared/contracts";
import { isHomeProjectId } from "@/shared/homeScope";
import { normalizeSharedSettings } from "@/shared/settings";
import { mergeManagedSharedSettings } from "../../../sharedSettingsFile";
import type { AppControlsToolContext } from "./types";

/** Workspaces currently persisted in shared settings. */
export function getWorkspaces(ctx: AppControlsToolContext): Workspace[] {
  return ctx.settings.read().workspaces;
}

/**
 * Resolve a workspace by id, or by a unique case-insensitive name. Name
 * collisions must be disambiguated with an id from `list_workspaces`.
 */
export function requireWorkspace(ctx: AppControlsToolContext, idOrName: string): Workspace {
  const workspaces = getWorkspaces(ctx);
  const byId = workspaces.find((workspace) => workspace.id === idOrName);
  if (byId) return byId;
  const needle = idOrName.trim().toLowerCase();
  const byName = workspaces.filter((workspace) => workspace.name.toLowerCase() === needle);
  if (byName.length === 1) return byName[0]!;
  if (byName.length > 1) {
    throw new Error(
      `Multiple workspaces are named "${idOrName}". Pass a workspace id from list_workspaces.`,
    );
  }
  throw new Error(
    `Workspace not found: ${idOrName}. Call list_workspaces to see valid workspace ids and names.`,
  );
}

/** Persist a replacement workspace list through the same guarded settings write as update_settings. */
export function persistWorkspaces(
  ctx: AppControlsToolContext,
  workspaces: Workspace[],
): Workspace[] {
  const onDisk = ctx.settings.read();
  const normalized = normalizeSharedSettings({ ...onDisk, workspaces });
  const merged = mergeManagedSharedSettings(onDisk, normalized);
  ctx.settings.write(merged);
  return merged.workspaces;
}

export function createWorkspaceRecord(
  workspaces: readonly Workspace[],
  name: string,
  icon?: WorkspaceIconId,
): Workspace {
  return {
    id: randomUUID(),
    name,
    createdAt: new Date().toISOString(),
    icon: icon ?? nextWorkspaceIconId(workspaces),
  };
}

/**
 * Workspace the calling thread already lives in, when that id still exists.
 * Home threads carry their own tag; project threads inherit the project's.
 */
export function inheritCallerWorkspaceId(ctx: AppControlsToolContext): string | undefined {
  const callerId = ctx.identity.threadId;
  if (!callerId) return undefined;
  const caller = ctx.getThread(callerId);
  if (!caller) return undefined;
  const raw = isHomeProjectId(caller.projectId)
    ? caller.workspaceId
    : ctx.getProject(caller.projectId)?.workspaceId;
  if (!raw) return undefined;
  return getWorkspaces(ctx).some((workspace) => workspace.id === raw) ? raw : undefined;
}

export function workspaceView(workspace: Workspace, ctx: AppControlsToolContext) {
  const projectCount = ctx
    .getProjects()
    .filter(
      (project) => !isHomeProjectId(project.id) && project.workspaceId === workspace.id,
    ).length;
  const homeThreadCount = ctx
    .getThreads()
    .filter(
      (thread) => isHomeProjectId(thread.projectId) && thread.workspaceId === workspace.id,
    ).length;
  return {
    id: workspace.id,
    name: workspace.name,
    icon: workspace.icon,
    createdAt: workspace.createdAt,
    projectCount,
    homeThreadCount,
  };
}
