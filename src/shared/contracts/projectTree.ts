import { z } from "zod";
import { projectLocationSchema } from "./common";

export interface FileEntry {
  path: string;
  name: string;
  type: "file" | "directory";
}

export interface SearchProjectFilesResult {
  entries: FileEntry[];
  totalIndexed: number;
}

export const searchConfigSchema = z.object({
  useIgnoreFiles: z.boolean(),
  excludePatterns: z.array(z.string()),
});
export type SearchConfigPayload = z.infer<typeof searchConfigSchema>;

export const searchProjectFilesPayloadSchema = z.object({
  projectLocation: projectLocationSchema,
  query: z.string().default(""),
  limit: z.number().int().min(1).max(200).default(50),
  /**
   * Effective search config (defaults + global + per-project) computed in
   * the renderer. Optional for backwards compatibility — when omitted the
   * supervisor falls back to legacy `--exclude-standard` behavior with no
   * extra glob filtering.
   */
  searchConfig: searchConfigSchema.optional(),
});
export type SearchProjectFilesPayload = z.infer<typeof searchProjectFilesPayloadSchema>;

export interface ProjectTreeEntry {
  path: string;
  name: string;
  type: "file" | "directory";
  hasChildren?: boolean;
}

export interface ListProjectTreeResult {
  directoryPath: string;
  entries: ProjectTreeEntry[];
}

export const listProjectTreePayloadSchema = z.object({
  projectLocation: projectLocationSchema,
  directoryPath: z.string().default(""),
});
export type ListProjectTreePayload = z.infer<typeof listProjectTreePayloadSchema>;

/** One entry in a host-filesystem directory listing (the folder picker). */
export interface HostDirectoryEntry {
  /** Base name of the entry. */
  name: string;
  /** Absolute path on the host. */
  path: string;
  type: "file" | "directory";
}

export interface BrowseHostDirectoryResult {
  /** The absolute directory that was listed (resolved home when none given). */
  path: string;
  /** Parent directory absolute path, or null at a filesystem root. */
  parentPath: string | null;
  /** The host user's home directory absolute path (for a "Home" shortcut). */
  homePath: string;
  /** Directory contents, directories first. */
  entries: HostDirectoryEntry[];
  /** True when the listing was capped and some entries were omitted. */
  truncated: boolean;
}

/**
 * Browse the paired host's filesystem to pick a folder (add-existing / clone
 * parent). Unlike {@link listProjectTreePayloadSchema} this is not confined to a
 * project root — it lists an arbitrary absolute directory. Gated behind the
 * `projects:manage` scope, the same capability that can already add any path.
 */
export const browseHostDirectoryPayloadSchema = z.object({
  /** Absolute path to list; empty → the host user's home directory. */
  path: z.string().default(""),
});
export type BrowseHostDirectoryPayload = z.infer<typeof browseHostDirectoryPayloadSchema>;

export interface SearchProjectTreeResult {
  entries: ProjectTreeEntry[];
}

export const searchProjectTreePayloadSchema = z.object({
  projectLocation: projectLocationSchema,
  query: z.string().default(""),
  limit: z.number().int().min(1).max(200).default(50),
  searchConfig: searchConfigSchema.optional(),
});
export type SearchProjectTreePayload = z.infer<typeof searchProjectTreePayloadSchema>;

export type ProjectFileReadStatus = "ready" | "binary" | "too_large" | "unsupported";

export interface ReadProjectFileResult {
  path: string;
  status: ProjectFileReadStatus;
  modifiedAtMs: number;
  content?: string;
  lineEnding?: "lf" | "crlf";
  hasBom?: boolean;
}

export const readProjectFilePayloadSchema = z.object({
  projectLocation: projectLocationSchema,
  path: z.string().min(1),
});
export type ReadProjectFilePayload = z.infer<typeof readProjectFilePayloadSchema>;

export type AbsoluteFileReadStatus = ProjectFileReadStatus | "missing";

export interface ReadAbsoluteFileResult {
  status: AbsoluteFileReadStatus;
  modifiedAtMs?: number;
  content?: string;
}

/**
 * Read a file through the project's location context (native FS for
 * Windows/POSIX projects; the WSL bridge for WSL projects).
 *
 * Used by the chat UI to surface a just-created file's content even when the
 * agent didn't stream it. Path resolution:
 * - WSL projects: pass an absolute Linux path (POSIX, starts with `/`).
 * - Windows projects: pass an absolute Windows path.
 * - POSIX projects: pass an absolute POSIX path.
 *
 * Relative paths are resolved against the project root for convenience.
 * Absolute paths are read as-is, including paths outside the project root
 * (e.g. a plan in a git worktree) — the editor must be able to open any file
 * the user or agent references.
 */
export const readAbsoluteFilePayloadSchema = z.object({
  projectLocation: projectLocationSchema,
  absolutePath: z.string().min(1),
});
export type ReadAbsoluteFilePayload = z.infer<typeof readAbsoluteFilePayloadSchema>;

/**
 * Read or write a file at an absolute path that is NOT required to live
 * inside the project root. Used by the in-app editor when the user opens
 * an out-of-project absolute path from chat. The project location is still
 * required so the supervisor knows which file system (native vs. WSL) to
 * route the request through.
 */
export const readExternalFilePayloadSchema = z.object({
  projectLocation: projectLocationSchema,
  absolutePath: z.string().min(1),
});
export type ReadExternalFilePayload = z.infer<typeof readExternalFilePayloadSchema>;

export interface ReadExternalFileResult {
  path: string;
  status: ProjectFileReadStatus | "missing";
  modifiedAtMs: number;
  content?: string;
  lineEnding?: "lf" | "crlf";
  hasBom?: boolean;
}

export const writeExternalFilePayloadSchema = z.object({
  projectLocation: projectLocationSchema,
  absolutePath: z.string().min(1),
  content: z.string(),
  baseModifiedAtMs: z.number().nonnegative(),
});
export type WriteExternalFilePayload = z.infer<typeof writeExternalFilePayloadSchema>;

export interface WriteExternalFileResult {
  modifiedAtMs: number;
}

export interface WriteProjectFileResult {
  modifiedAtMs: number;
}

export const writeProjectFilePayloadSchema = z.object({
  projectLocation: projectLocationSchema,
  path: z.string().min(1),
  content: z.string(),
  baseModifiedAtMs: z.number().nonnegative(),
});
export type WriteProjectFilePayload = z.infer<typeof writeProjectFilePayloadSchema>;

export const createProjectEntryPayloadSchema = z.object({
  projectLocation: projectLocationSchema,
  path: z.string().min(1),
  type: z.enum(["file", "directory"]),
});
export type CreateProjectEntryPayload = z.infer<typeof createProjectEntryPayloadSchema>;

export const renameProjectEntryPayloadSchema = z.object({
  projectLocation: projectLocationSchema,
  path: z.string().min(1),
  nextName: z.string().min(1),
});
export type RenameProjectEntryPayload = z.infer<typeof renameProjectEntryPayloadSchema>;

export const moveProjectEntryPayloadSchema = z.object({
  projectLocation: projectLocationSchema,
  path: z.string().min(1),
  nextParentPath: z.string().default(""),
});
export type MoveProjectEntryPayload = z.infer<typeof moveProjectEntryPayloadSchema>;

export const deleteProjectEntryPayloadSchema = z.object({
  projectLocation: projectLocationSchema,
  path: z.string().min(1),
});
export type DeleteProjectEntryPayload = z.infer<typeof deleteProjectEntryPayloadSchema>;

export const revealProjectEntryPayloadSchema = z.object({
  projectLocation: projectLocationSchema,
  path: z.string().default(""),
});
export type RevealProjectEntryPayload = z.infer<typeof revealProjectEntryPayloadSchema>;

export const detectSetupScriptPayloadSchema = z.object({
  projectLocation: projectLocationSchema,
});
export type DetectSetupScriptPayload = z.infer<typeof detectSetupScriptPayloadSchema>;

export interface DetectSetupScriptResult {
  setupScript?: string;
}
