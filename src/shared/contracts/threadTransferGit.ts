import { z } from "zod";
import {
  gitCommitShaSchema,
  THREAD_TRANSFER_HAVES_MAX,
  THREAD_TRANSFER_REPO_IDENTITIES_MAX,
  threadTransferIdSchema,
} from "../threadTransfer";
import { projectLocationSchema } from "./common";

/**
 * Supervisor-local Git steps of a thread transfer. The backend owns the
 * transfer and its files; Git runs where every other Git operation runs.
 * None of these names is in the remote procedure allowlist.
 */
const repoIdentitiesSchema = z.array(z.string().min(1)).max(THREAD_TRANSFER_REPO_IDENTITIES_MAX);
const shasSchema = z.array(gitCommitShaSchema).max(THREAD_TRANSFER_HAVES_MAX);

export const threadTransferInspectGitPayloadSchema = z.object({
  projectLocation: projectLocationSchema,
});
export type ThreadTransferInspectGitPayload = z.infer<typeof threadTransferInspectGitPayloadSchema>;

export const threadTransferInspectGitResultSchema = z.object({
  repository: z.boolean(),
  branch: z.string().min(1).optional(),
  head: gitCommitShaSchema.optional(),
  changedFiles: z.number().int().nonnegative(),
  repoIdentities: repoIdentitiesSchema,
});
export type ThreadTransferInspectGitResult = z.infer<typeof threadTransferInspectGitResultSchema>;

export const threadTransferRepoProbePayloadSchema = z.object({
  projectLocations: z.array(projectLocationSchema).max(500),
});
export type ThreadTransferRepoProbePayload = z.infer<typeof threadTransferRepoProbePayloadSchema>;

export const threadTransferRepoProbeResultSchema = z.object({
  /** One entry per requested location, in order. */
  repositories: z.array(
    z.object({ repository: z.boolean(), repoIdentities: repoIdentitiesSchema }),
  ),
});
export type ThreadTransferRepoProbeResult = z.infer<typeof threadTransferRepoProbeResultSchema>;

export const threadTransferGitHavesPayloadSchema = z.object({
  projectLocation: projectLocationSchema,
});
export type ThreadTransferGitHavesPayload = z.infer<typeof threadTransferGitHavesPayloadSchema>;

export const threadTransferGitHavesResultSchema = z.object({
  repository: z.boolean(),
  haves: shasSchema,
});
export type ThreadTransferGitHavesResult = z.infer<typeof threadTransferGitHavesResultSchema>;

/** The Git state a package carries, as recorded by the source and replayed by the target. */
export const threadTransferGitStateSchema = z.object({
  /** Absent for a detached HEAD. */
  branch: z.string().min(1).max(255).optional(),
  head: gitCommitShaSchema,
  /** Snapshot of the working tree (tracked and untracked, not ignored); absent when clean. */
  worktreeCommit: gitCommitShaSchema.optional(),
  /** Snapshot of the index; absent when it equals HEAD or could not be captured. */
  indexCommit: gitCommitShaSchema.optional(),
  /** The branch's recorded fork base (`branch.<name>.poracodeSource`), when set. */
  sourceBranch: z.string().min(1).max(255).optional(),
  /** Target commits the bundle was cut against. */
  basis: shasSchema,
  changedFiles: z.number().int().nonnegative(),
});
export type ThreadTransferGitState = z.infer<typeof threadTransferGitStateSchema>;

export const threadTransferExportGitPayloadSchema = z.object({
  projectLocation: projectLocationSchema,
  transferId: threadTransferIdSchema,
  haves: shasSchema,
  bundlePath: z.string().min(1),
});
export type ThreadTransferExportGitPayload = z.infer<typeof threadTransferExportGitPayloadSchema>;

export const threadTransferExportGitResultSchema = threadTransferGitStateSchema.extend({
  /** Zero when the target already has every commit: no bundle file was written. */
  bundleBytes: z.number().int().nonnegative(),
});
export type ThreadTransferExportGitResult = z.infer<typeof threadTransferExportGitResultSchema>;

export const threadTransferImportGitPayloadSchema = z.object({
  projectLocation: projectLocationSchema,
  transferId: threadTransferIdSchema,
  bundlePath: z.string().min(1).optional(),
  git: threadTransferGitStateSchema,
  worktreeRoot: z.string().min(1).optional(),
  worktreeOmitRepoDir: z.boolean().optional(),
});
export type ThreadTransferImportGitPayload = z.infer<typeof threadTransferImportGitPayloadSchema>;

export const threadTransferImportGitResultSchema = z.object({
  worktreePath: z.string().min(1),
  branch: z.string().min(1).optional(),
  branchRenamed: z.boolean(),
  /** True when the import created `branch`; a rollback deletes only a created branch. */
  branchCreated: z.boolean(),
});
export type ThreadTransferImportGitResult = z.infer<typeof threadTransferImportGitResultSchema>;
