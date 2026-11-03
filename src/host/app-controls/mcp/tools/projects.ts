import { z } from "zod";
import { nonEmptyPluginOverrides } from "@/shared/contracts";
import {
  isAlwaysEnabledPlugin,
  isBuiltInToolPlugin,
  resolveInstalledPluginState,
} from "@/shared/plugins/catalog";
import type { Project, ProjectLocation, Thread } from "@/shared/contracts";
import { isHomeProjectId } from "@/shared/homeScope";
import {
  projectIdProp,
  requireProject,
  type AppControlsToolContext,
  type ToolDomain,
} from "./types";
import { inheritCallerWorkspaceId, requireWorkspace } from "./workspaceLookup";

const projectIdArgsSchema = z.object({ projectId: z.string().min(1) });
const createArgsSchema = z.object({
  path: z.string().trim().min(1),
  name: z.string().trim().min(1).max(120).optional(),
  workspaceId: z.string().trim().min(1).optional(),
});
const updateArgsSchema = z.object({
  projectId: z.string().min(1),
  name: z.string().trim().min(1).max(120).optional(),
  workspaceId: z.union([z.string().trim().min(1), z.null()]).optional(),
  plugins: z.record(z.string().min(1), z.union([z.boolean(), z.null()])).optional(),
});

export const projectTools: ToolDomain = {
  specs: [
    {
      name: "list_projects",
      description:
        "List all of the user's projects with id, name, absolute path, runtime kind (windows/wsl/posix), workspaceId when filed, and open/total thread counts.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
    },
    {
      name: "get_project",
      description:
        "Full detail for one project: its row, its per-project plugin switches (pluginOverrides; absent plugins follow the global state), a summary of its threads, and any project notes (doc + todos). Project MCP servers are listed by list_mcp_servers.",
      inputSchema: projectIdJsonSchema(),
    },
    {
      name: "create_project",
      description:
        "Register an existing folder on this device as a Poracode project. The directory must already exist; the path must be absolute. Optionally file it into a workspace (id or unique name from list_workspaces); omitted projects inherit the calling thread's workspace when possible.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["path"],
        properties: {
          path: { type: "string", minLength: 1 },
          name: { type: "string", minLength: 1, maxLength: 120 },
          workspaceId: { type: "string", minLength: 1 },
        },
      },
    },
    {
      name: "update_project",
      description:
        "Update an existing project's editable metadata: rename, file it into a workspace, or switch Agent Plugins for it. workspaceId accepts an id or unique name from list_workspaces; null unfiles the project so it is visible in every workspace. The Home project cannot be filed. plugins maps installed plugin manifest names (get_settings installedPlugins) to true/false for this project, or null to follow the global state again; a thread's own plugin choices still win, and running threads apply the change on their next launch. Always-on and built-in tool plugins (browser, chrome, computer use, crossagents) are not switched per project. Confirm plugin changes with the user first.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["projectId"],
        properties: {
          projectId: projectIdProp,
          name: { type: "string", minLength: 1, maxLength: 120 },
          workspaceId: { type: ["string", "null"], minLength: 1 },
          plugins: {
            type: "object",
            additionalProperties: { type: ["boolean", "null"] },
          },
        },
      },
    },
  ],
  handlers: {
    list_projects: (_args, ctx) => {
      const threads = ctx.getThreads();
      const projects = ctx.getProjects().map((project) => projectView(project, threads));
      return { count: projects.length, projects };
    },
    get_project: (args, ctx) => {
      const { projectId } = projectIdArgsSchema.parse(args);
      const project = requireProject(ctx, projectId);
      const allThreads = ctx.getThreads();
      const threads = allThreads.filter((thread) => thread.projectId === projectId);
      const notes = ctx.getProjectNotes(projectId);
      return {
        ...projectView(project, allThreads),
        createdAt: project.createdAt,
        ...(project.disabled ? { disabled: true } : {}),
        ...(project.pluginOverrides ? { pluginOverrides: project.pluginOverrides } : {}),
        threads: threads.map((thread) => ({
          threadId: thread.id,
          title: thread.title,
          status: thread.status,
          agentKind: thread.agentKind,
          archived: thread.archived,
          done: thread.done,
        })),
        notes: notes
          ? {
              todoCount: notes.todos.length,
              hasDoc: notes.doc != null,
              updatedAt: notes.updatedAt,
            }
          : null,
      };
    },
    create_project: async (args, ctx) => {
      const { path, name, workspaceId: requestedWorkspace } = createArgsSchema.parse(args);
      if (!ctx.directoryExists(path)) {
        throw new Error(`Directory does not exist on disk: ${path}`);
      }
      const workspaceId = requestedWorkspace
        ? requireWorkspace(ctx, requestedWorkspace).id
        : inheritCallerWorkspaceId(ctx);
      const result = await ctx.applyProjectCommand({
        kind: "add-existing",
        path,
        ...(name ? { name } : {}),
        ...(workspaceId ? { workspaceId } : {}),
      });
      return { created: result.created ?? true, project: result.project ?? null };
    },
    update_project: async (args, ctx) => {
      const { projectId, name, workspaceId, plugins } = updateArgsSchema.parse(args);
      const project = requireProject(ctx, projectId);
      if (name === undefined && workspaceId === undefined && plugins === undefined) {
        throw new Error("Provide at least one field to update (name, workspaceId, or plugins).");
      }
      if (workspaceId !== undefined && isHomeProjectId(project.id)) {
        throw new Error(
          "The Home project belongs to every workspace. File Home threads with update_thread instead.",
        );
      }
      if (plugins !== undefined && isHomeProjectId(project.id)) {
        throw new Error(
          "The Home project has no plugin switches; use update_settings installedPlugins for the global state.",
        );
      }
      let next: Project = name !== undefined ? { ...project, name } : project;
      if (workspaceId !== undefined) {
        const { workspaceId: _dropped, ...rest } = next;
        next =
          workspaceId === null
            ? rest
            : { ...rest, workspaceId: requireWorkspace(ctx, workspaceId).id };
      }
      if (plugins !== undefined) {
        await assertSwitchablePlugins(ctx, project, plugins);
        next = withPluginOverrides(next, plugins);
      }
      ctx.updateProject(next);
      return {
        updated: true,
        project: {
          id: next.id,
          name: next.name,
          ...(next.workspaceId ? { workspaceId: next.workspaceId } : {}),
          ...(next.pluginOverrides ? { pluginOverrides: next.pluginOverrides } : {}),
        },
      };
    },
  },
};

/** Apply per-plugin switches; `null` removes a switch so the plugin follows global state. */
function withPluginOverrides(project: Project, changes: Record<string, boolean | null>): Project {
  const overrides: Record<string, boolean> = { ...project.pluginOverrides };
  for (const [name, enabled] of Object.entries(changes)) {
    if (enabled === null) delete overrides[name];
    else overrides[name] = enabled;
  }
  const { pluginOverrides: _previous, ...rest } = project;
  const pluginOverrides = nonEmptyPluginOverrides(overrides);
  return pluginOverrides ? { ...rest, pluginOverrides } : rest;
}

/**
 * Only installed plugins with a per-project switch can be turned on or off;
 * clearing (`null`) is always allowed so a stale switch can be removed.
 */
async function assertSwitchablePlugins(
  ctx: AppControlsToolContext,
  project: Project,
  changes: Record<string, boolean | null>,
): Promise<void> {
  const names = Object.entries(changes)
    .filter(([, enabled]) => enabled !== null)
    .map(([name]) => name);
  if (names.length === 0) return;
  const { plugins } = await ctx.supervisor.listPlugins({ projectLocation: project.location });
  const installed = ctx.settings.read().installedPlugins;
  for (const name of names) {
    const plugin = plugins.find((entry) => entry.name === name);
    if (!plugin || !resolveInstalledPluginState(plugin, installed)) {
      throw new Error(
        `Plugin is not installed: ${name}. Call get_settings (section installedPlugins) for installed names.`,
      );
    }
    if (isAlwaysEnabledPlugin(plugin) || isBuiltInToolPlugin(plugin)) {
      throw new Error(
        `Plugin ${name} is not switched per project: it is always on or a built-in tool chosen per thread.`,
      );
    }
  }
}

/** Path string for a project location (linux path for WSL, plain path otherwise). */
export function locationPath(location: ProjectLocation): string {
  return location.kind === "wsl" ? location.linuxPath : location.path;
}

function projectView(project: Project, allThreads: readonly Thread[]) {
  const projectThreads = allThreads.filter((thread) => thread.projectId === project.id);
  const openThreads = projectThreads.filter((thread) => !thread.archived && !thread.done);
  return {
    id: project.id,
    name: project.name,
    path: locationPath(project.location),
    kind: project.location.kind,
    ...(project.location.kind === "wsl" ? { distro: project.location.distro } : {}),
    threadCount: projectThreads.length,
    openThreadCount: openThreads.length,
    ...(project.workspaceId ? { workspaceId: project.workspaceId } : {}),
  };
}

function projectIdJsonSchema(): Record<string, unknown> {
  return {
    type: "object",
    additionalProperties: false,
    required: ["projectId"],
    properties: { projectId: projectIdProp },
  };
}
