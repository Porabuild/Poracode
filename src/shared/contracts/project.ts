import { z } from "zod";
import { projectLocationSchema } from "./common";
import { projectDraftConfigSchema } from "./config";
import { mcpServerListSchema } from "./mcpServer";

export const projectActionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  command: z.string().min(1),
  icon: z.string().optional(),
});
export type ProjectAction = z.infer<typeof projectActionSchema>;

export const projectScriptsSchema = z.object({
  setupScript: z.string().optional(),
  cleanupScript: z.string().optional(),
  /** Gitignore-style patterns for ignored files to copy into new worktrees (e.g. `.env.*`). */
  worktreeCopyPatterns: z.array(z.string()).optional(),
  actions: z.array(projectActionSchema).default([]),
});
export type ProjectScripts = z.infer<typeof projectScriptsSchema>;

/**
 * Where git worktrees are created. `global` places them under a global root
 * (built-in default or a user-configured base); `project-relative` nests them
 * inside the project at `<project>/.poracode/worktrees`.
 */
export const worktreeStorageModeSchema = z.enum(["global", "project-relative"]);
export type WorktreeStorageMode = z.infer<typeof worktreeStorageModeSchema>;

/**
 * Per-project worktree-location override (mirrors {@link projectSearchSettingsSchema}).
 * Absent = inherit the global settings.
 */
export const projectWorktreeLocationSchema = z.object({
  /** Overrides the global worktree storage mode for this project. */
  mode: worktreeStorageModeSchema.optional(),
  /**
   * Custom worktree root for this project: a native path on native projects, a
   * Linux path on WSL projects. Only meaningful in `global` mode; ignored for
   * `project-relative`.
   */
  basePath: z.string().optional(),
});
export type ProjectWorktreeLocation = z.infer<typeof projectWorktreeLocationSchema>;

export const projectSearchSettingsSchema = z.object({
  /** When set, overrides the global `searchUseIgnoreFiles` for this project. */
  useIgnoreFiles: z.boolean().optional(),
  /**
   * Per-project glob overrides. A key with `true` adds an exclusion on top
   * of the global list; `false` disables an inherited default for this
   * project only.
   */
  exclude: z.record(z.string(), z.boolean()).optional(),
});
export type ProjectSearchSettings = z.infer<typeof projectSearchSettingsSchema>;

export const projectSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  location: projectLocationSchema,
  lastDraftConfig: projectDraftConfigSchema.optional(),
  scripts: projectScriptsSchema.optional(),
  searchSettings: projectSearchSettingsSchema.optional(),
  worktreeLocation: projectWorktreeLocationSchema.optional(),
  /** Project MCP entries override global entries by name (case-insensitive). */
  mcpServers: mcpServerListSchema.optional(),
  disabled: z.boolean().optional(),
  createdAt: z.string().min(1),
});
export type Project = z.infer<typeof projectSchema>;
