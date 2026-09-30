import { z } from "zod";
import { gitSafeIntSchema, gitSafeNonNegIntSchema } from "./gitResults";

const safeInt = gitSafeIntSchema;
const safeNonNegInt = gitSafeNonNegIntSchema;
const safePosInt = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);

export const prStateSchema = z.enum(["open", "draft", "merged", "closed"]);
export const prMergeableSchema = z.enum(["MERGEABLE", "CONFLICTING", "UNKNOWN"]);
export const prMergeStateStatusSchema = z.enum([
  "BEHIND",
  "BLOCKED",
  "CLEAN",
  "DIRTY",
  "DRAFT",
  "HAS_HOOKS",
  "UNKNOWN",
  "UNSTABLE",
]);
export const prReviewStateSchema = z.enum([
  "APPROVED",
  "CHANGES_REQUESTED",
  "COMMENTED",
  "DISMISSED",
  "PENDING",
]);
export const githubActionsWorkflowInputTypeSchema = z.enum([
  "boolean",
  "choice",
  "environment",
  "number",
  "string",
]);

export const prAuthorSchema = z.object({
  login: z.string(),
  avatarUrl: z.string().optional(),
});

export const prDataSchema = z.object({
  number: safePosInt,
  state: prStateSchema,
  headSha: z.string().optional(),
  title: z.string(),
  url: z.string(),
  baseBranch: z.string(),
  isDraft: z.boolean(),
  reviewDecision: z.string().optional(),
  checksStatus: z.string().optional(),
  mergeable: prMergeableSchema.optional(),
  mergeStateStatus: prMergeStateStatusSchema.optional(),
  viewerDidAuthor: z.boolean().optional(),
  updatedAt: z.string(),
});

export const prCheckSchema = z.object({
  name: z.string(),
  state: z.string(),
  conclusion: z.string(),
  url: z.string().optional(),
  workflowName: z.string().optional(),
  startedAt: z.string().optional(),
  completedAt: z.string().optional(),
});

export const prFileSchema = z.object({
  path: z.string(),
  additions: safeInt,
  deletions: safeInt,
});

export const prCommitSummarySchema = z.object({
  oid: z.string(),
  abbreviatedOid: z.string(),
  messageHeadline: z.string(),
  messageBody: z.string().optional(),
  authoredDate: z.string(),
  author: prAuthorSchema.optional(),
  url: z.string().optional(),
});

export const prCommentSchema = z.object({
  id: z.string(),
  author: prAuthorSchema,
  body: z.string(),
  createdAt: z.string(),
  url: z.string().optional(),
});

export const prReviewThreadSchema = z.object({
  id: z.string(),
  isResolved: z.boolean(),
  isOutdated: z.boolean(),
  path: z.string().optional(),
  line: safeInt.optional(),
  comments: z.array(prCommentSchema),
});

export const prReviewSummarySchema = z.object({
  id: z.string(),
  author: prAuthorSchema,
  state: prReviewStateSchema,
  body: z.string(),
  submittedAt: z.string().optional(),
  url: z.string().optional(),
});

export const prDetailsSchema = z.object({
  number: safePosInt,
  title: z.string(),
  body: z.string(),
  author: prAuthorSchema.optional(),
  baseBranch: z.string(),
  headBranch: z.string(),
  additions: safeInt,
  deletions: safeInt,
  changedFiles: safeInt,
  createdAt: z.string().optional(),
  mergedAt: z.string().nullable().optional(),
  mergedBy: prAuthorSchema.nullable().optional(),
  closedAt: z.string().nullable().optional(),
  commits: z.array(prCommitSummarySchema),
  comments: z.array(prCommentSchema),
  reviews: z.array(prReviewSummarySchema),
  checks: z.array(prCheckSchema),
});

export const ghCheckAvailableResultSchema = z.object({
  available: z.boolean(),
});

export const ghListPrsResultSchema = z.object({
  prs: z.record(z.string(), prDataSchema),
});

export const pullRequestSummarySchema = z.object({
  pr: prDataSchema,
  headBranch: z.string(),
  author: prAuthorSchema.optional(),
  additions: safeInt,
  deletions: safeInt,
  repository: z.string(),
  reviewRequested: z.boolean(),
});

export const ghListPullRequestsResultSchema = z.object({
  pullRequests: z.array(pullRequestSummarySchema),
  viewerLogin: z.string().optional(),
});

export const githubActionsWorkflowSchema = z.object({
  id: safeInt,
  name: z.string(),
  path: z.string(),
  state: z.string(),
});

export const githubActionsWorkflowInputSchema = z.object({
  name: z.string(),
  description: z.string(),
  required: z.boolean(),
  type: githubActionsWorkflowInputTypeSchema,
  defaultValue: z.union([z.string(), z.number(), z.boolean()]).optional(),
  options: z.array(z.string()),
});

export const githubActionsWorkflowDefinitionSchema = z.object({
  workflowId: safeInt,
  ref: z.string(),
  defaultBranch: z.string(),
  dispatchable: z.boolean(),
  triggers: z.array(z.string()),
  inputs: z.array(githubActionsWorkflowInputSchema),
});

export const githubActionsStepSchema = z.object({
  number: safeInt,
  name: z.string(),
  status: z.string(),
  conclusion: z.string(),
  startedAt: z.string().optional(),
  completedAt: z.string().optional(),
});

export const githubActionsJobSchema = z.object({
  id: safeInt,
  name: z.string(),
  status: z.string(),
  conclusion: z.string(),
  startedAt: z.string().optional(),
  completedAt: z.string().optional(),
  url: z.string().optional(),
  steps: z.array(githubActionsStepSchema),
});

export const githubActionsRunSchema = z.object({
  id: safeInt,
  workflowId: safeInt,
  workflowName: z.string(),
  name: z.string(),
  number: safeInt,
  attempt: safeInt,
  title: z.string(),
  event: z.string(),
  headBranch: z.string(),
  headSha: z.string(),
  status: z.string(),
  conclusion: z.string(),
  createdAt: z.string(),
  startedAt: z.string(),
  updatedAt: z.string(),
  url: z.string(),
  jobs: z.array(githubActionsJobSchema),
});

export const ghListWorkflowsResultSchema = z.object({
  workflows: z.array(githubActionsWorkflowSchema),
});

export const ghListWorkflowRunsResultSchema = z.object({
  runs: z.array(githubActionsRunSchema),
});

export const ghGetWorkflowDefinitionResultSchema = z.object({
  definition: githubActionsWorkflowDefinitionSchema,
});

export const ghGetWorkflowRunResultSchema = z.object({
  run: githubActionsRunSchema,
});

export const ghGetPrChecksResultSchema = z.object({
  checks: z.array(prCheckSchema),
});

export const ghGetPrFilesResultSchema = z.object({
  files: z.array(prFileSchema),
});

export const ghGetPrDiffResultSchema = z.object({
  diff: z.string(),
});

export const ghGetPrDetailsResultSchema = z.object({
  details: prDetailsSchema,
});

export const ghGetPrReviewThreadsResultSchema = z.object({
  comments: z.array(prCommentSchema),
  threads: z.array(prReviewThreadSchema),
});

export const githubAccountSchema = z.object({
  host: z.string(),
  login: z.string(),
  active: z.boolean(),
});

export const ghListAccountsResultSchema = z.object({
  accounts: z.array(githubAccountSchema),
});

export const githubRepoSummarySchema = z.object({
  nameWithOwner: z.string(),
  owner: z.string(),
  name: z.string(),
  description: z.string(),
  isPrivate: z.boolean(),
  isFork: z.boolean(),
  sshUrl: z.string(),
  httpsUrl: z.string(),
  pushedAt: z.string(),
});

export const ghListReposResultSchema = z.object({
  repos: z.array(githubRepoSummarySchema),
});

export const ghGetPrForBranchResultSchema = prDataSchema.nullable();
export const ghCreatePrResultSchema = prDataSchema;
export const ghPostPrCommentResultSchema = prCommentSchema;

export { safeNonNegInt as githubSafeNonNegIntSchema };
