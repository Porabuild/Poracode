import { z } from "zod";
import { fileMtimeMsSchema, getGitFileContentPayloadSchema } from "@/shared/contracts";
import type { ProjectFileReadStatus } from "@/shared/contracts";
import { appControlToolDomain, defineAppControlTool } from "../defineTools";
import { requireAppRuntime, resolveLocation } from "./types";
import { catalogPageFields, pageCatalog } from "./catalogPage";

const READ_FILE_MAX_CHARS = 100_000;
const GIT_SIDE_DEFAULT_CHARS = 8_000;
/** Default / max results for `find_files`. */
const FIND_DEFAULT_LIMIT = 30;
const FIND_MAX_LIMIT = 100;

const fileScope = {
  projectId: z.string().min(1),
  worktreePath: z.string().min(1).optional(),
};
const maxPageChars = z.number().int().min(2).max(READ_FILE_MAX_CHARS);
const pageFields = {
  offset: z.number().int().nonnegative().default(0),
  maxChars: maxPageChars.default(READ_FILE_MAX_CHARS),
};
const readFileTool = defineAppControlTool({
  name: "read_project_file",
  description:
    "Read text from a project-relative path in the project root or a registered worktree. Optionally select a 1-based inclusive line range with startLine and endLine. Continue with nextOffset and the same line range. Offsets count UTF-16 code units within the selected text. Pass expectedModifiedAtMs from the first page to detect a changed file during continuation. Binary, oversized, or missing files return a status note.",
  input: z.strictObject({
    ...fileScope,
    ...pageFields,
    path: z.string().min(1),
    startLine: z.number().int().positive().optional(),
    endLine: z.number().int().positive().optional(),
    expectedModifiedAtMs: fileMtimeMsSchema.optional(),
  }),
  run: async (args, ctx) => {
    const {
      projectId,
      path,
      worktreePath,
      offset,
      maxChars,
      startLine,
      endLine,
      expectedModifiedAtMs,
    } = args;
    if (endLine !== undefined && endLine < (startLine ?? 1)) {
      throw new Error("endLine must be at least startLine.");
    }
    const projectLocation = await resolveLocation(ctx, projectId, worktreePath);
    const result = await ctx.supervisor.readProjectFile({ projectLocation, path });
    if (expectedModifiedAtMs !== undefined && result.modifiedAtMs !== expectedModifiedAtMs) {
      throw new Error(
        "The file modification time changed. Read the range again from the beginning.",
      );
    }
    if (result.status !== "ready" || result.content === undefined) {
      return { projectId, path, status: result.status, note: statusNote(result.status) };
    }
    return {
      projectId,
      path,
      status: result.status,
      modifiedAtMs: result.modifiedAtMs,
      ...(startLine !== undefined ? { startLine } : {}),
      ...(endLine !== undefined ? { endLine } : {}),
      ...pageText(selectLines(result.content, startLine, endLine), offset, maxChars),
    };
  },
});

const gitFileTool = defineAppControlTool({
  name: "git_file_content",
  description:
    "Read both text sides of the app’s Git file comparison in a project or registered worktree. staged:true compares HEAD with the index. staged:false compares the index with the working tree. maxChars applies to each side. Pass each side's nextOffset as oldOffset or newOffset to continue.",
  input: getGitFileContentPayloadSchema
    .omit({ projectLocation: true })
    .extend({
      ...fileScope,
      oldOffset: pageFields.offset,
      newOffset: pageFields.offset,
      maxChars: maxPageChars.default(GIT_SIDE_DEFAULT_CHARS),
    })
    .strict(),
  run: async (
    { projectId, worktreePath, filePath, staged, oldOffset, newOffset, maxChars },
    ctx,
  ) => {
    const projectLocation = await resolveLocation(ctx, projectId, worktreePath);
    const { oldContent, newContent } = await requireAppRuntime(ctx).call("getGitFileContent", {
      projectLocation,
      filePath,
      staged,
    });
    return {
      projectId,
      filePath,
      staged,
      old: pageText(oldContent, oldOffset, maxChars),
      new: pageText(newContent, newOffset, maxChars),
    };
  },
});

function selectLines(text: string, startLine = 1, endLine?: number): string {
  if (startLine === 1 && endLine === undefined) return text;
  let line = 1;
  let start = 0;
  for (const newline of text.matchAll(/\r\n|[\r\n]/gu)) {
    const offset = newline.index + newline[0].length;
    if (line === endLine) return text.slice(start, offset);
    if (++line === startLine) start = offset;
  }
  return line < startLine ? "" : text.slice(start);
}

function pageText(text: string, offset: number, maxChars: number) {
  let end = Math.min(offset + maxChars, text.length);
  if (
    end < text.length &&
    /[\uD800-\uDBFF]/u.test(text.charAt(end - 1)) &&
    /[\uDC00-\uDFFF]/u.test(text.charAt(end))
  )
    end -= 1;
  return {
    ...(offset > 0 ? { offset } : {}),
    ...(end < text.length
      ? { truncated: true, nextOffset: end, note: "Use nextOffset for the next page." }
      : {}),
    content: text.slice(offset, end),
  };
}
const listFilesTool = defineAppControlTool({
  name: "list_project_files",
  description:
    "List one directory level, directories first. Omit directoryPath for the project root or pass a project-relative directory. Set limit to page large directories and pass nextOffset as offset with the same scope. count is the total number of entries.",
  input: z.strictObject({
    ...fileScope,
    ...catalogPageFields,
    directoryPath: z.string().default(""),
  }),
  run: async ({ projectId, directoryPath, worktreePath, offset, limit }, ctx) => {
    const projectLocation = await resolveLocation(ctx, projectId, worktreePath);
    const result = await ctx.supervisor.listProjectTree({ projectLocation, directoryPath });
    const { rows, ...page } = pageCatalog(result.entries, offset, limit);
    return {
      projectId,
      directoryPath: result.directoryPath,
      ...page,
      entries: rows.map(({ path, name, type }) => ({ path, name, type })),
    };
  },
});

const findFilesTool = defineAppControlTool({
  name: "find_files",
  description: "Fuzzy-search project file paths and names. Use limit to cap the number of matches.",
  input: z.strictObject({
    ...fileScope,
    query: z.string().trim().min(1).max(500),
    limit: z.number().int().min(1).max(FIND_MAX_LIMIT).default(FIND_DEFAULT_LIMIT),
  }),
  run: async ({ projectId, query, limit, worktreePath }, ctx) => {
    const projectLocation = await resolveLocation(ctx, projectId, worktreePath);
    const result = await ctx.supervisor.searchProjectTree({ projectLocation, query, limit });
    return {
      projectId,
      query,
      count: result.entries.length,
      entries: result.entries.map(({ path, name, type }) => ({ path, name, type })),
    };
  },
});

export const fileTools = appControlToolDomain(
  listFilesTool,
  readFileTool,
  gitFileTool,
  findFilesTool,
);

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
