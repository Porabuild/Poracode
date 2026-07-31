import { z } from "zod";
import type { ProjectFileReadStatus } from "@/shared/contracts";
import {
  projectIdProp,
  requireProject,
  resolveLocation,
  worktreePathProp,
  type ToolDomain,
} from "./types";

/** Cap on file content returned by `read_project_file`. */
const READ_FILE_MAX_CHARS = 100_000;
/** Default / max results for `find_files`. */
const FIND_DEFAULT_LIMIT = 30;
const FIND_MAX_LIMIT = 100;

const listArgsSchema = z.object({
  projectId: z.string().min(1),
  directoryPath: z.string().optional(),
});
const readArgsSchema = z.object({
  projectId: z.string().min(1),
  path: z.string().min(1),
  worktreePath: z.string().min(1).optional(),
});
const findArgsSchema = z.object({
  projectId: z.string().min(1),
  query: z.string().trim().min(1).max(500),
  limit: z.number().int().min(1).max(FIND_MAX_LIMIT).optional(),
});

export const fileTools: ToolDomain = {
  specs: [
    {
      name: "list_project_files",
      description:
        "List one directory level of a project's file tree (directories first). Omit directoryPath to list the project root; pass a project-relative path to list a subdirectory. Read-only.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["projectId"],
        properties: {
          projectId: projectIdProp,
          directoryPath: { type: "string" },
        },
      },
    },
    {
      name: "read_project_file",
      description:
        "Read a text file in a project by its project-relative path. Pass worktreePath to read the file from one of the project's git worktrees instead of the main checkout. Only the first 100000 characters are returned (truncation is flagged); binary, too-large, or missing files return a status note instead of content.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["projectId", "path"],
        properties: {
          projectId: projectIdProp,
          path: { type: "string", minLength: 1 },
          worktreePath: worktreePathProp,
        },
      },
    },
    {
      name: "find_files",
      description:
        "Fuzzy filename search within a project (matches paths/names, not file contents). Returns up to `limit` matches (default 30, max 100). Read-only.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["projectId", "query"],
        properties: {
          projectId: projectIdProp,
          query: { type: "string", minLength: 1, maxLength: 500 },
          limit: { type: "integer", minimum: 1, maximum: FIND_MAX_LIMIT },
        },
      },
    },
  ],
  handlers: {
    list_project_files: async (args, ctx) => {
      const { projectId, directoryPath } = listArgsSchema.parse(args);
      const project = requireProject(ctx, projectId);
      const result = await ctx.supervisor.listProjectTree({
        projectLocation: project.location,
        directoryPath: directoryPath ?? "",
      });
      return {
        projectId,
        directoryPath: result.directoryPath,
        count: result.entries.length,
        entries: result.entries.map((entry) => ({
          path: entry.path,
          name: entry.name,
          type: entry.type,
        })),
      };
    },
    read_project_file: async (args, ctx) => {
      const { projectId, path, worktreePath } = readArgsSchema.parse(args);
      // Validates worktreePath against the project's worktree set before use.
      const projectLocation = await resolveLocation(ctx, projectId, worktreePath);
      const result = await ctx.supervisor.readProjectFile({ projectLocation, path });
      if (result.status !== "ready" || result.content === undefined) {
        return { projectId, path, status: result.status, note: statusNote(result.status) };
      }
      const truncated = result.content.length > READ_FILE_MAX_CHARS;
      const content = truncated ? result.content.slice(0, READ_FILE_MAX_CHARS) : result.content;
      return {
        projectId,
        path,
        status: result.status,
        ...(truncated
          ? { truncated: true, note: `Showing the first ${READ_FILE_MAX_CHARS} characters.` }
          : {}),
        content,
      };
    },
    find_files: async (args, ctx) => {
      const { projectId, query, limit } = findArgsSchema.parse(args);
      const project = requireProject(ctx, projectId);
      const result = await ctx.supervisor.searchProjectTree({
        projectLocation: project.location,
        query,
        limit: limit ?? FIND_DEFAULT_LIMIT,
      });
      return {
        projectId,
        query,
        count: result.entries.length,
        entries: result.entries.map((entry) => ({
          path: entry.path,
          name: entry.name,
          type: entry.type,
        })),
      };
    },
  },
};

/** Human-readable explanation for a non-`ready` file read result. */
function statusNote(status: ProjectFileReadStatus): string {
  switch (status) {
    case "binary":
      return "This is a binary file, so its contents cannot be returned as text.";
    case "too_large":
      return "This file is too large to read.";
    case "unsupported":
      return "This file uses an unsupported text encoding.";
    default:
      return "The file could not be read as text.";
  }
}
