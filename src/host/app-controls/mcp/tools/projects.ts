import { z } from "zod";
import { cloneRepoSourceSchema, nonEmptyPluginOverrides } from "@/shared/contracts";
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
import { remoteProjectUpdatePatchSchema } from "@/shared/remote/protocol";
import { applyProjectPatch } from "@/host/remote/projectCommands";
import { inheritCallerWorkspaceId, requireWorkspace } from "./workspaceLookup";
import { publicProjectDraftConfigSchema } from "@/shared/contracts/appCatalogOrder";
import { defineAppControlTool } from "../defineTools";
import { catalogPageFields, pageCatalog } from "./catalogPage";

const projectIdArgsSchema = z.object({ projectId: z.string().min(1) });
const createArgsSchema = z.object({
  path: z.string().trim().min(1),
  name: z.string().trim().min(1).max(120).optional(),
  workspaceId: z.string().trim().min(1).optional(),
});
const createDirectoryArgs = z.strictObject({
  parentPath: z.string().trim().min(1),
  name: z.string().trim().min(1).max(120),
});
const cloneArgs = createDirectoryArgs.extend({ source: cloneRepoSourceSchema });
const relocateArgs = z.strictObject({
  projectId: z.string().min(1),
  path: z.string().trim().min(1),
});
const removeArgs = z.strictObject({
  projectId: z.string().min(1),
  confirmProjectName: z.string().min(1),
});

const projectPreferencesSchema = remoteProjectUpdatePatchSchema
  .omit({ mcpServers: true, pluginOverrides: true })
  .strict();
const updateArgsSchema = z.object({
  projectId: z.string().min(1),
  name: z.string().trim().min(1).max(120).optional(),
  workspaceId: z.union([z.string().trim().min(1), z.null()]).optional(),
  plugins: z.record(z.string().min(1), z.union([z.boolean(), z.null()])).optional(),
  patch: projectPreferencesSchema.optional(),
});

const listProjectsTool = defineAppControlTool({
  name: "list_projects",
  description:
    "List projects with ID, name, absolute path, runtime kind, workspace ID and thread counts. Set limit for a page and pass nextOffset as offset to continue. count is the total number of projects.",
  input: z.strictObject(catalogPageFields),
  run: ({ offset, limit }, ctx) => {
    const { rows, ...page } = pageCatalog(ctx.getProjects(), offset, limit);
    const threadsByProject = Map.groupBy(ctx.getThreads(), ({ projectId }) => projectId);
    return {
      ...page,
      projects: rows.map((project) => projectView(project, threadsByProject.get(project.id) ?? [])),
    };
  },
});

export const projectTools: ToolDomain = {
  specs: [
    listProjectsTool.spec,
    {
      name: "get_project",
      description:
        "Full detail for one project: its row, its per-project plugin switches (pluginOverrides; absent plugins follow the global state), a summary of its threads, and note counts. Use get_project_notes for the document and to-dos, and list_mcp_servers for server definitions.",
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
        "Update project metadata, including icon, project scripts, search settings, worktree preferences, GitHub account, pinned branches, or disabled state via patch. Rename, file it into a workspace, or switch Agent Plugins with the existing flat inputs. workspaceId accepts an id or unique name from list_workspaces; null unfiles the project so it is visible in every workspace. The Home project cannot be filed. plugins maps installed plugin manifest names from list_plugins to true/false for this project, or null to follow the global state again; a thread's own plugin choices still win, and running threads apply the change on their next launch. Always-on and built-in tool plugins (browser, chrome, computer use, crossagents) are not switched per project. Confirm plugin changes with the user first.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["projectId"],
        properties: {
          projectId: projectIdProp,
          name: { type: "string", minLength: 1, maxLength: 120 },
          workspaceId: { type: ["string", "null"], minLength: 1 },
          patch: z.toJSONSchema(projectPreferencesSchema, { io: "input" }),
          plugins: {
            type: "object",
            additionalProperties: { type: ["boolean", "null"] },
          },
        },
      },
    },
    {
      name: "create_project_directory",
      description:
        "Create an empty directory with the given name under an existing absolute parentPath on the host, then register it as a project. Use create_project to register an existing directory.",
      inputSchema: z.toJSONSchema(createDirectoryArgs, { io: "input" }),
    },
    {
      name: "clone_project",
      description:
        "Clone a Git repository into parentPath/name and register the checkout as a Poracode project. Pass a source using kind url or a configured GitHub account and repository.",
      inputSchema: z.toJSONSchema(cloneArgs, { io: "input" }),
    },
    {
      name: "relocate_project",
      description:
        "Point an existing project at a folder that already exists at path. The host validates the replacement checkout and refuses relocation while project threads are running.",
      inputSchema: z.toJSONSchema(relocateArgs, { io: "input" }),
    },
    {
      name: "remove_project",
      description:
        "Remove a project and its saved threads, project notes and managed experiments. The main checkout stays on disk. Requires explicit user authorization and the current exact project name from get_project. Call from Home or a different project.",
      inputSchema: z.toJSONSchema(removeArgs, { io: "input" }),
    },
  ],
  handlers: {
    [listProjectsTool.spec.name]: listProjectsTool.handler,
    get_project: (args, ctx) => {
      const { projectId } = projectIdArgsSchema.parse(args);
      const project = requireProject(ctx, projectId);
      const threads = ctx.getThreads().filter((thread) => thread.projectId === projectId);
      const notes = ctx.getProjectNotes(projectId);
      return {
        ...projectView(project, threads),
        createdAt: project.createdAt,
        lastDraftConfig:
          publicProjectDraftConfigSchema.strip().safeParse(project.lastDraftConfig).data ?? null,
        settings: projectPreferencesSchema.strip().parse(project),
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
    create_project_directory: async (args, ctx) => {
      const { project, created } = await ctx.applyProjectCommand({
        kind: "create",
        ...createDirectoryArgs.parse(args),
      });
      return { created: created ?? true, project: project ? projectView(project, []) : null };
    },
    clone_project: async (args, ctx) => {
      const { project, created } = await ctx.applyProjectCommand({
        kind: "clone",
        ...cloneArgs.parse(args),
      });
      return { created: created ?? true, project: project ? projectView(project, []) : null };
    },
    relocate_project: async (args, ctx) => {
      const { projectId, path } = relocateArgs.parse(args);
      if (isHomeProjectId(projectId)) throw new Error("The Home project cannot be relocated.");
      if (!ctx.directoryExists(path)) throw new Error(`Directory does not exist on disk: ${path}`);
      const { project } = await ctx.applyProjectCommand({ kind: "relocate", projectId, path });
      if (!project) throw new Error("Project relocation returned no project.");
      return { project: projectView(project, ctx.getThreads()) };
    },
    remove_project: async (args, ctx) => {
      const { projectId, confirmProjectName } = removeArgs.parse(args);
      if (isHomeProjectId(projectId)) throw new Error("The Home project cannot be removed.");
      if (ctx.identity.threadId && ctx.getThread(ctx.identity.threadId)?.projectId === projectId)
        throw new Error(
          "Remove this project from Home or another project to avoid closing the calling thread.",
        );
      const project = requireProject(ctx, projectId);
      if (project.name !== confirmProjectName)
        throw new Error("Project name does not match. Verify the target with get_project.");
      await ctx.applyProjectCommand({ kind: "remove", projectId });
      return { removed: true, projectId };
    },
    update_project: async (args, ctx) => {
      const { projectId, name, workspaceId, plugins, patch } = updateArgsSchema.parse(args);
      const project = requireProject(ctx, projectId);
      if (
        name === undefined &&
        workspaceId === undefined &&
        plugins === undefined &&
        !Object.keys(patch ?? {}).length
      ) {
        throw new Error(
          "Provide at least one field to update (name, workspaceId, plugins, or patch).",
        );
      }
      if (workspaceId !== undefined && isHomeProjectId(project.id)) {
        throw new Error(
          "The Home project belongs to every workspace. File Home threads with update_thread instead.",
        );
      }
      if (plugins !== undefined && isHomeProjectId(project.id)) {
        throw new Error(
          "The Home project has no plugin switches; use configure_plugin for the global state.",
        );
      }
      if (name !== undefined && patch?.name !== undefined)
        throw new Error("Pass the project name as either name or patch.name.");
      if (plugins !== undefined) await assertSwitchablePlugins(ctx, project, plugins);
      const current = requireProject(ctx, projectId);
      let next: Project = patch ? applyProjectPatch(current, patch) : current;
      if (name !== undefined) next = { ...next, name };
      if (workspaceId !== undefined) {
        const { workspaceId: _dropped, ...rest } = next;
        next =
          workspaceId === null
            ? rest
            : { ...rest, workspaceId: requireWorkspace(ctx, workspaceId).id };
      }
      if (plugins !== undefined) next = withPluginOverrides(next, plugins);
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
      throw new Error(`Plugin is not installed: ${name}. Call list_plugins for installed names.`);
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

function projectView(project: Project, projectThreads: readonly Thread[]) {
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
