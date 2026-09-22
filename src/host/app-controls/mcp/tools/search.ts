import { z } from "zod";
import { requireProject, type AppControlsToolContext, type ToolDomain } from "./types";
import { locationPath } from "./projects";

/** Hard cap on file-search results returned to the caller. */
const FILE_RESULTS_MAX = 50;

const searchArgsSchema = z.object({
  query: z.string().trim().min(1).max(500),
  scope: z.enum(["threads", "projects", "files", "all"]).optional(),
  projectId: z.string().min(1).optional(),
});

export const searchTools: ToolDomain = {
  specs: [
    {
      name: "search",
      description:
        "Search across the app. scope 'threads' matches thread titles; 'projects' matches project names/paths; 'files' matches file names in a project (requires projectId); 'all' (default) runs threads + projects, plus files when a projectId is given.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["query"],
        properties: {
          query: { type: "string", minLength: 1, maxLength: 500 },
          scope: { type: "string", enum: ["threads", "projects", "files", "all"] },
          projectId: { type: "string" },
        },
      },
    },
  ],
  handlers: {
    search: async (args, ctx) => {
      const { query, scope, projectId } = searchArgsSchema.parse(args);
      const effectiveScope = scope ?? "all";
      const needle = query.toLowerCase();
      const result: Record<string, unknown> = { query, scope: effectiveScope };

      if (effectiveScope === "threads" || effectiveScope === "all") {
        result.threads = ctx
          .getThreads()
          .filter((thread) => thread.title.toLowerCase().includes(needle))
          .map((thread) => ({
            threadId: thread.id,
            title: thread.title,
            projectId: thread.projectId,
            status: thread.status,
          }));
      }

      if (effectiveScope === "projects" || effectiveScope === "all") {
        result.projects = ctx
          .getProjects()
          .filter((project) => {
            const path = locationPath(project.location).toLowerCase();
            return project.name.toLowerCase().includes(needle) || path.includes(needle);
          })
          .map((project) => ({
            id: project.id,
            name: project.name,
            path: locationPath(project.location),
          }));
      }

      const wantsFiles = effectiveScope === "files" || (effectiveScope === "all" && projectId);
      if (effectiveScope === "files" && !projectId) {
        throw new Error("A projectId is required to search files.");
      }
      if (wantsFiles && projectId) {
        result.files = await searchFiles(ctx, projectId, query);
      }

      return result;
    },
  },
};

async function searchFiles(
  ctx: AppControlsToolContext,
  projectId: string,
  query: string,
): Promise<Record<string, unknown>> {
  const project = requireProject(ctx, projectId);
  const response = await ctx.supervisor.searchProjectFiles({
    projectLocation: project.location,
    query,
    limit: FILE_RESULTS_MAX,
  });
  const truncated = response.entries.length >= FILE_RESULTS_MAX;
  return {
    projectId,
    totalIndexed: response.totalIndexed,
    count: response.entries.length,
    ...(truncated ? { truncated: true, note: `Showing first ${FILE_RESULTS_MAX} matches.` } : {}),
    entries: response.entries.map((entry) => ({
      path: entry.path,
      name: entry.name,
      type: entry.type,
    })),
  };
}
