import { z } from "zod";
import type { Project, ProjectLocation, Thread } from "@/shared/contracts";
import { projectIdProp, requireProject, type ToolDomain } from "./types";

const projectIdArgsSchema = z.object({ projectId: z.string().min(1) });
const createArgsSchema = z.object({
  path: z.string().trim().min(1),
  name: z.string().trim().min(1).max(120).optional(),
});
const updateArgsSchema = z.object({
  projectId: z.string().min(1),
  name: z.string().trim().min(1).max(120).optional(),
});

export const projectTools: ToolDomain = {
  specs: [
    {
      name: "list_projects",
      description:
        "List all of the user's projects with id, name, absolute path, runtime kind (windows/wsl/posix), and open/total thread counts.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
    },
    {
      name: "get_project",
      description:
        "Full detail for one project: its row, a summary of its threads, and any project notes (doc + todos).",
      inputSchema: projectIdJsonSchema(),
    },
    {
      name: "create_project",
      description:
        "Register an existing folder on this device as a Poracode project. The directory must already exist; the path must be absolute.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["path"],
        properties: {
          path: { type: "string", minLength: 1 },
          name: { type: "string", minLength: 1, maxLength: 120 },
        },
      },
    },
    {
      name: "update_project",
      description: "Update an existing project's editable metadata (currently: rename).",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["projectId"],
        properties: {
          projectId: projectIdProp,
          name: { type: "string", minLength: 1, maxLength: 120 },
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
      const { path, name } = createArgsSchema.parse(args);
      if (!ctx.directoryExists(path)) {
        throw new Error(`Directory does not exist on disk: ${path}`);
      }
      const result = await ctx.applyProjectCommand({
        kind: "add-existing",
        path,
        ...(name ? { name } : {}),
      });
      return { created: true, project: result.project ?? null };
    },
    update_project: (args, ctx) => {
      const { projectId, name } = updateArgsSchema.parse(args);
      const project = requireProject(ctx, projectId);
      if (name === undefined) {
        throw new Error("Provide at least one field to update (name).");
      }
      const next: Project = { ...project, name };
      ctx.updateProject(next);
      return { updated: true, project: { id: next.id, name: next.name } };
    },
  },
};

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
