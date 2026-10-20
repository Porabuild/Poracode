import { z } from "zod";
import { requireProject, type AppControlsToolContext, type ToolDomain } from "./types";
import { locationPath } from "./projects";
import { dbSearchConversations } from "@/host/db/conversationSearch";

/** Hard cap on file-search results returned to the caller. */
const FILE_RESULTS_MAX = 50;

const searchArgsSchema = z.object({
  query: z.string().trim().min(1).max(500),
  scope: z.enum(["threads", "messages", "projects", "files", "all"]).optional(),
  projectId: z.string().min(1).optional(),
  cursor: z.string().max(1024).optional(),
  includeArchived: z.boolean().optional(),
});

export const searchTools: ToolDomain = {
  specs: [
    {
      name: "search",
      description:
        "Search across the app. 'threads' matches titles; 'messages' searches saved user text and final assistant replies, including archived and unopened chats (excludes delegated threads and subagent/tool/reasoning content). 'projects' matches names/paths; 'files' requires projectId. 'all' includes titles, messages, projects and optional files. Message pages contain excerpts and threadId/itemId, at most 50 hits; pass their nextCursor with the same query/filter and scope 'messages' or 'all'. A cursor returns only messages, without repeating other search results. indexing=true means saved text is still being indexed; repeat the first page to finish indexing.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["query"],
        properties: {
          query: { type: "string", minLength: 1, maxLength: 500 },
          scope: { type: "string", enum: ["threads", "messages", "projects", "files", "all"] },
          projectId: { type: "string" },
          cursor: { type: "string", maxLength: 1024 },
          includeArchived: { type: "boolean" },
        },
      },
    },
  ],
  handlers: {
    search: async (args, ctx) => {
      const { query, scope, projectId, cursor, includeArchived } = searchArgsSchema.parse(args);
      if (cursor && scope && scope !== "messages" && scope !== "all")
        throw new Error("Search cursors require scope 'messages' or 'all'.");
      const effectiveScope = cursor ? "messages" : (scope ?? "all");
      const needle = query.toLowerCase();
      const result: Record<string, unknown> = { query, scope: effectiveScope };

      if (effectiveScope === "messages" || effectiveScope === "all") {
        result.messages = await dbSearchConversations({
          version: "1",
          query,
          ...(projectId ? { projectId } : {}),
          ...(cursor ? { cursor } : {}),
          includeArchived: includeArchived === false ? "false" : "true",
        });
      }

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
