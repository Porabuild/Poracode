import { z } from "zod";
import { projectLocationSchema } from "./common";

/**
 * Skills domain (shared contracts).
 *
 * A "skill" is a directory containing a `SKILL.md` file (YAML frontmatter with
 * `name`/`description`/`metadata`, followed by markdown). Skills live in
 * "scopes" — the cross product of a *level* (global ~ vs project repo root) and
 * a *root* (a provider-specific folder convention such as `.claude/skills` or
 * the shared `.agents/skills`). See `src/shared/skills.ts` for the root table
 * and the marketplace catalog; this file only declares payloads/results.
 */

export const skillScopeLevelSchema = z.enum(["global", "project"]);
export type SkillScopeLevel = z.infer<typeof skillScopeLevelSchema>;

/** A resolved place where skills can live, e.g. "Claude (global)". */
export interface SkillScope {
  /** Stable id, `${level}:${rootId}` (e.g. "project:claude"). */
  id: string;
  level: SkillScopeLevel;
  /** Root id from SKILL_ROOTS (e.g. "claude", "agents"). */
  rootId: string;
  /** Human label, e.g. "Claude" / "Shared agents". */
  rootLabel: string;
  /** Which agents read this root, for display ("Copilot, Codex, …"). */
  consumerLabel: string;
  /** The relative directory convention, e.g. ".claude/skills". */
  dirName: string;
  /** Absolute on-disk path to this scope's skills directory. */
  absolutePath: string;
  /** Whether the directory currently exists on disk. */
  exists: boolean;
}

/** A single discovered skill (one folder containing a SKILL.md). */
export interface SkillSummary {
  /** Stable id, `${scopeId}/${folderName}`. */
  id: string;
  scopeId: string;
  level: SkillScopeLevel;
  rootId: string;
  /** Directory name of the skill folder. */
  folderName: string;
  absolutePath: string;
  /** From frontmatter `name`, falling back to the folder name. */
  name: string;
  /** From frontmatter `description` (may be empty). */
  description: string;
  /** Number of files in the skill folder (incl. SKILL.md). */
  fileCount: number;
  /** False when the folder has no SKILL.md (malformed skill). */
  hasSkillFile: boolean;
  /** `metadata.source` from the frontmatter — the marketplace id it was installed from, if any. */
  source?: string;
}

export interface SkillScan {
  scopes: SkillScope[];
  skills: SkillSummary[];
  /**
   * Scopes that could not be scanned (e.g. WSL project roots, unreadable
   * dirs). Surfaced so the UI can explain partial results instead of silently
   * dropping them.
   */
  unavailable: { scopeId: string; reason: string }[];
}

export interface SkillFileInfo {
  /** Path relative to the skill folder. */
  path: string;
  sizeBytes: number;
}

export interface SkillDetail {
  absolutePath: string;
  folderName: string;
  name: string;
  description: string;
  /** Full raw SKILL.md text (frontmatter + body), for editing. */
  content: string;
  files: SkillFileInfo[];
}

export const scanSkillsPayloadSchema = z.object({
  projectLocation: projectLocationSchema.optional(),
});
export type ScanSkillsPayload = z.infer<typeof scanSkillsPayloadSchema>;

const skillOperationContextSchema = z.object({
  projectLocation: projectLocationSchema.optional(),
});
export type SkillOperationContext = z.infer<typeof skillOperationContextSchema>;

export const readSkillPayloadSchema = z.object({
  ...skillOperationContextSchema.shape,
  absolutePath: z.string().min(1),
});
export type ReadSkillPayload = z.infer<typeof readSkillPayloadSchema>;

export const writeSkillPayloadSchema = z.object({
  ...skillOperationContextSchema.shape,
  absolutePath: z.string().min(1),
  content: z.string(),
});
export type WriteSkillPayload = z.infer<typeof writeSkillPayloadSchema>;

export const createSkillPayloadSchema = z.object({
  ...skillOperationContextSchema.shape,
  /** Absolute path to the destination scope's skills directory. */
  scopeDir: z.string().min(1),
  folderName: z.string().min(1),
  name: z.string().min(1),
  description: z.string().default(""),
  /** Optional markdown body (after the frontmatter). */
  body: z.string().optional(),
});
export type CreateSkillPayload = z.infer<typeof createSkillPayloadSchema>;

export const deleteSkillPayloadSchema = z.object({
  ...skillOperationContextSchema.shape,
  absolutePath: z.string().min(1),
});
export type DeleteSkillPayload = z.infer<typeof deleteSkillPayloadSchema>;

export const renameSkillPayloadSchema = z.object({
  ...skillOperationContextSchema.shape,
  absolutePath: z.string().min(1),
  nextFolderName: z.string().min(1),
});
export type RenameSkillPayload = z.infer<typeof renameSkillPayloadSchema>;

export const transferSkillPayloadSchema = z.object({
  ...skillOperationContextSchema.shape,
  /** Absolute path to the skill folder to copy/move. */
  fromPath: z.string().min(1),
  /** Absolute path to the destination scope's skills directory. */
  toScopeDir: z.string().min(1),
  /** When true the source folder is removed after a successful copy. */
  move: z.boolean().default(false),
  /** When true an existing destination folder is overwritten. */
  overwrite: z.boolean().default(false),
});
export type TransferSkillPayload = z.infer<typeof transferSkillPayloadSchema>;

export interface TransferSkillResult {
  absolutePath: string;
}

export const optimizeSkillsPayloadSchema = z.object({
  projectLocation: projectLocationSchema.optional(),
  level: skillScopeLevelSchema,
  /**
   * When false, returns the planned operations without writing anything
   * (used to preview the optimizer before the user confirms).
   */
  apply: z.boolean().default(false),
});
export type OptimizeSkillsPayload = z.infer<typeof optimizeSkillsPayloadSchema>;

export interface SkillSyncOp {
  folderName: string;
  skillName: string;
  fromScopeId: string;
  toScopeId: string;
  /** Absolute destination path the skill was (or would be) copied to. */
  toPath: string;
  /**
   * `create` — the destination root has no copy at all.
   * `update` — a copy exists but its contents differ from the (newest) source,
   * so it would be overwritten to bring the providers back in sync.
   */
  kind: "create" | "update";
}

export interface OptimizeSkillsResult {
  applied: boolean;
  ops: SkillSyncOp[];
}

export const installMarketplaceSkillPayloadSchema = z.object({
  ...skillOperationContextSchema.shape,
  catalogId: z.string().min(1),
  /** Absolute path to the destination scope's skills directory. */
  targetScopeDir: z.string().min(1),
  /** Optional override for the installed folder name. */
  folderName: z.string().optional(),
});
export type InstallMarketplaceSkillPayload = z.infer<typeof installMarketplaceSkillPayloadSchema>;

export interface InstallMarketplaceSkillResult {
  absolutePath: string;
  folderName: string;
}

export const installSkillFromGitPayloadSchema = z.object({
  ...skillOperationContextSchema.shape,
  /** A git clone URL, e.g. https://github.com/owner/repo. */
  repoUrl: z.string().min(1),
  /** Optional path within the repo to the skill folder (defaults to repo root). */
  sourcePath: z.string().optional(),
  /** Absolute path to the destination scope's skills directory. */
  targetScopeDir: z.string().min(1),
  /** Optional override for the installed folder name. */
  folderName: z.string().optional(),
});
export type InstallSkillFromGitPayload = z.infer<typeof installSkillFromGitPayloadSchema>;

export const revealSkillPayloadSchema = z.object({
  ...skillOperationContextSchema.shape,
  absolutePath: z.string().min(1),
});
export type RevealSkillPayload = z.infer<typeof revealSkillPayloadSchema>;
