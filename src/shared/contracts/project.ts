import { z } from "zod";
import { projectLocationSchema } from "./common";
import { projectDraftConfigSchema } from "./config";

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
  disabled: z.boolean().optional(),
  createdAt: z.string().min(1),
});
export type Project = z.infer<typeof projectSchema>;
