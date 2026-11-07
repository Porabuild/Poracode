import type { McpServer, ProjectLocation } from "@/shared/contracts";
import { isHomeProjectId } from "@/shared/homeScope";
import type { SharedSettings } from "@/shared/settings";
import { mergeManagedSharedSettings } from "../../../sharedSettingsFile";
import { requireProject, type AppControlsToolContext } from "./types";

/**
 * Custom MCP servers live in two stores: the global list in shared settings and
 * each project's own list (`Project.mcpServers`). Project entries override
 * global entries with the same name when an agent starts in that project.
 */
type ProjectScope = { kind: "project"; projectId: string; projectName: string };
export type McpScope = { kind: "global" } | ProjectScope;

/**
 * Explicit scope from `scope`/`projectId`, or `null` when neither was given.
 * `projectId` implies project scope; project scope without one targets the
 * calling thread's project.
 */
export function resolveScope(
  ctx: AppControlsToolContext,
  args: { scope?: "global" | "project" | undefined; projectId?: string | undefined },
): McpScope | null {
  if (args.scope === "global") {
    if (args.projectId !== undefined) {
      throw new Error("projectId applies only to scope=project; omit it for global servers.");
    }
    return { kind: "global" };
  }
  if (args.projectId !== undefined) return requireProjectScope(ctx, args.projectId);
  if (args.scope === "project") return callingProjectScope(ctx, { required: true });
  return null;
}

export function requireProjectScope(ctx: AppControlsToolContext, projectId: string): ProjectScope {
  if (isHomeProjectId(projectId)) {
    throw new Error(
      "The Home project has no project MCP servers; use scope=global or a project from list_projects.",
    );
  }
  const project = requireProject(ctx, projectId);
  return { kind: "project", projectId: project.id, projectName: project.name };
}

export function callingProjectScope(
  ctx: AppControlsToolContext,
  options: { required: true },
): ProjectScope;
export function callingProjectScope(
  ctx: AppControlsToolContext,
  options: { required: false },
): ProjectScope | null;
export function callingProjectScope(
  ctx: AppControlsToolContext,
  options: { required: boolean },
): ProjectScope | null {
  const thread = ctx.identity.threadId ? ctx.getThread(ctx.identity.threadId) : null;
  const project =
    thread && !isHomeProjectId(thread.projectId) ? ctx.getProject(thread.projectId) : null;
  if (project) return { kind: "project", projectId: project.id, projectName: project.name };
  if (options.required) {
    throw new Error(
      "scope=project needs a projectId: the calling thread is not in a project. Call list_projects to find one.",
    );
  }
  return null;
}

/**
 * Find a server by id. With an explicit scope only that scope is searched;
 * otherwise global settings first, then the calling thread's project.
 */
export function locateServer(
  ctx: AppControlsToolContext,
  id: string,
  args: { scope?: "global" | "project" | undefined; projectId?: string | undefined },
): { server: McpServer; scope: McpScope } {
  const explicit = resolveScope(ctx, args);
  const calling = explicit ? null : callingProjectScope(ctx, { required: false });
  const candidates: McpScope[] = explicit
    ? [explicit]
    : [{ kind: "global" }, ...(calling ? [calling] : [])];
  const matches = candidates.flatMap((scope) => {
    const server = readScope(ctx, scope).find((entry) => entry.id === id);
    return server ? [{ server, scope }] : [];
  });
  if (matches.length > 1) {
    throw new Error(
      `MCP server id ${id} exists both globally and in ${label(matches[1]!.scope)}; pass scope to choose one.`,
    );
  }
  if (matches[0]) return matches[0];
  throw new Error(
    `Unknown MCP server id: ${id}${explicit ? ` in ${label(explicit)}` : ""}. Call list_mcp_servers (with projectId for another project) to see valid ids.`,
  );
}

export function readScope(ctx: AppControlsToolContext, scope: McpScope): McpServer[] {
  if (scope.kind === "global") return ctx.settings.read().mcpServers;
  return requireProject(ctx, scope.projectId).mcpServers ?? [];
}

export function writeScope(
  ctx: AppControlsToolContext,
  scope: McpScope,
  servers: McpServer[],
): void {
  if (scope.kind === "global") {
    writeMcpServers(ctx, ctx.settings.read(), servers);
    return;
  }
  // Re-read the row so only `mcpServers` changes on top of the freshest state.
  const project = requireProject(ctx, scope.projectId);
  ctx.updateProject({ ...project, mcpServers: servers });
}

export function scopeLocation(ctx: AppControlsToolContext, scope: McpScope) {
  return scope.kind === "project" ? requireProject(ctx, scope.projectId).location : undefined;
}

/** OAuth/probe owner for a scope: a project's runtime, or the host for global servers. */
export function scopeOwner(
  ctx: AppControlsToolContext,
  scope: McpScope,
): { projectLocation?: ProjectLocation } {
  const projectLocation = scopeLocation(ctx, scope);
  return projectLocation ? { projectLocation } : {};
}

export function sameScope(left: McpScope, right: McpScope): boolean {
  return left.kind === "global"
    ? right.kind === "global"
    : right.kind === "project" && left.projectId === right.projectId;
}

export function label(scope: McpScope): string {
  return scope.kind === "global" ? "global settings" : `project "${scope.projectName}"`;
}

export function scopeView(scope: McpScope): Record<string, unknown> {
  return scope.kind === "global"
    ? { scope: "global" }
    : { scope: "project", projectId: scope.projectId, projectName: scope.projectName };
}

/** Persist a new global server list through the guarded settings write gateway. */
function writeMcpServers(
  ctx: AppControlsToolContext,
  onDisk: SharedSettings,
  mcpServers: McpServer[],
): void {
  // Defense in depth: re-pin supervisor-managed fields exactly like update_settings.
  const merged = mergeManagedSharedSettings(onDisk, { ...onDisk, mcpServers });
  ctx.settings.write(merged);
}
