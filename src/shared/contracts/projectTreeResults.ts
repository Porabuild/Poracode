import { z } from "zod";

const safeNonNegInt = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);

/** Node `fs.Stats.mtimeMs` is a finite nonnegative float, not an integer. */
export const fileMtimeMsSchema = z.number().finite().nonnegative();

export const fileEntryTypeSchema = z.enum(["file", "directory"]);
export const projectFileReadStatusSchema = z.enum(["ready", "binary", "too_large", "unsupported"]);
export const absoluteFileReadStatusSchema = z.enum([
  "ready",
  "binary",
  "too_large",
  "unsupported",
  "missing",
]);
export const lineEndingSchema = z.enum(["lf", "crlf"]);

export const fileEntrySchema = z.object({
  path: z.string(),
  name: z.string(),
  type: fileEntryTypeSchema,
});

export const projectTreeEntrySchema = z.object({
  path: z.string(),
  name: z.string(),
  type: fileEntryTypeSchema,
  hasChildren: z.boolean().optional(),
});

export const searchProjectFilesResultSchema = z.object({
  entries: z.array(fileEntrySchema),
  totalIndexed: safeNonNegInt,
});

export const listProjectTreeResultSchema = z.object({
  directoryPath: z.string(),
  entries: z.array(projectTreeEntrySchema),
});

export const hostDirectoryEntrySchema = z.object({
  name: z.string(),
  path: z.string(),
  type: fileEntryTypeSchema,
});

export const browseHostDirectoryResultSchema = z.object({
  path: z.string(),
  parentPath: z.string().nullable(),
  homePath: z.string(),
  entries: z.array(hostDirectoryEntrySchema),
  truncated: z.boolean(),
});

export const searchProjectTreeResultSchema = z.object({
  entries: z.array(projectTreeEntrySchema),
});

export const readProjectFileResultSchema = z.object({
  path: z.string(),
  status: projectFileReadStatusSchema,
  modifiedAtMs: fileMtimeMsSchema,
  content: z.string().optional(),
  contentBase64: z.string().optional(),
  lineEnding: lineEndingSchema.optional(),
  hasBom: z.boolean().optional(),
});

export const readAbsoluteFileResultSchema = z.object({
  status: absoluteFileReadStatusSchema,
  modifiedAtMs: fileMtimeMsSchema.optional(),
  content: z.string().optional(),
});

export const readExternalFileResultSchema = z.object({
  path: z.string(),
  status: z.enum(["ready", "binary", "too_large", "unsupported", "missing"]),
  modifiedAtMs: fileMtimeMsSchema,
  content: z.string().optional(),
  contentBase64: z.string().optional(),
  lineEnding: lineEndingSchema.optional(),
  hasBom: z.boolean().optional(),
});

export const writeProjectFileResultSchema = z.object({
  modifiedAtMs: fileMtimeMsSchema,
});

export const writeExternalFileResultSchema = z.object({
  modifiedAtMs: fileMtimeMsSchema,
});

export const detectSetupScriptResultSchema = z.object({
  setupScript: z.string().optional(),
});
