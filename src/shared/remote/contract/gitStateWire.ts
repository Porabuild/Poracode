import { z } from "zod";
import {
  gitBranchListResultSchema,
  gitStatusResultSchema,
  gitWorktreeInfoSchema,
  prDataSchema,
  prDetailsSchema,
  prFileSchema,
  prReviewThreadSchema,
} from "../../contracts";

const safeNonNegInt = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);

export const gitProjectRefSchema = z.object({
  hostId: z.string(),
  projectId: z.string(),
});

export const gitTargetRefSchema = z.object({
  hostId: z.string(),
  projectId: z.string(),
  worktreePath: z.string().optional(),
});

export const pullRequestRefSchema = z.object({
  hostId: z.string(),
  projectId: z.string(),
  prNumber: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
});

export const gitTargetSourceInfoSchema = z.object({
  sourceBranch: z.string().nullable(),
  commitsAhead: z.number().int(),
  sourceAhead: z.number().int(),
});

export const gitProjectStateSchema = z.object({
  ref: gitProjectRefSchema,
  status: gitStatusResultSchema.optional(),
  branches: gitBranchListResultSchema.optional(),
  worktrees: z.array(gitWorktreeInfoSchema).optional(),
  ghAvailable: z.boolean().optional(),
  refreshedAt: z.string(),
});

export const gitTargetStateSchema = z.object({
  ref: gitTargetRefSchema,
  status: gitStatusResultSchema.optional(),
  sourceInfo: gitTargetSourceInfoSchema.optional(),
  pullRequestKey: z.string().nullable().optional(),
  refreshedAt: z.string(),
});

export const pullRequestResourceFreshnessSchema = z.object({
  core: z.string().optional(),
  details: z.string().optional(),
  files: z.string().optional(),
  diff: z.string().optional(),
  reviewThreads: z.string().optional(),
});

export const pullRequestStateSchema = z.object({
  ref: pullRequestRefSchema,
  data: prDataSchema,
  details: prDetailsSchema.optional(),
  files: z.array(prFileSchema).optional(),
  diff: z.string().optional(),
  reviewThreads: z.array(prReviewThreadSchema).optional(),
  freshness: pullRequestResourceFreshnessSchema,
});

export const projectPullRequestListStateSchema = z.object({
  project: gitProjectRefSchema,
  pullRequestKeys: z.array(z.string()),
  viewerLogin: z.string().optional(),
  refreshedAt: z.string(),
});

/** JSON-schema-capable encoding of {@link GitStateSnapshot}. */
export const gitStateSnapshotWireSchema = z.object({
  revision: safeNonNegInt,
  projects: z.record(z.string(), gitProjectStateSchema),
  targets: z.record(z.string(), gitTargetStateSchema),
  pullRequests: z.record(z.string(), pullRequestStateSchema),
  pullRequestKeyByBranch: z.record(z.string(), z.string()),
  projectPullRequestLists: z.record(z.string(), projectPullRequestListStateSchema),
});
