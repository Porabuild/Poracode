import { z } from "zod";
import { projectLocationSchema } from "./common";

export type PrState = "open" | "draft" | "merged" | "closed";
export type PrMergeMethod = "merge" | "squash" | "rebase";

export interface PrData {
  number: number;
  state: PrState;
  title: string;
  url: string;
  baseBranch: string;
  isDraft: boolean;
  reviewDecision?: string;
  checksStatus?: string;
  mergeable?: "MERGEABLE" | "CONFLICTING" | "UNKNOWN";
  mergeStateStatus?:
    | "BEHIND"
    | "BLOCKED"
    | "CLEAN"
    | "DIRTY"
    | "DRAFT"
    | "HAS_HOOKS"
    | "UNKNOWN"
    | "UNSTABLE";
  /** True when the authenticated `gh` user authored this PR (can't review own PR). */
  viewerDidAuthor?: boolean;
  updatedAt: string;
}

export interface PrCheck {
  name: string;
  state: string;
  conclusion: string;
  url?: string;
  workflowName?: string;
  startedAt?: string;
  completedAt?: string;
}

export const PR_CHECK_FAILURE_CONCLUSIONS: ReadonlySet<string> = new Set([
  "FAILURE",
  "TIMED_OUT",
  "CANCELLED",
  "ACTION_REQUIRED",
  "STARTUP_FAILURE",
]);

export interface PrFile {
  path: string;
  additions: number;
  deletions: number;
}

export type PrReviewDecision = "approve" | "request-changes" | "comment";

export interface PrAuthor {
  login: string;
  avatarUrl?: string;
}

export interface PrCommitSummary {
  oid: string;
  abbreviatedOid: string;
  messageHeadline: string;
  messageBody?: string;
  authoredDate: string;
  author?: PrAuthor;
  url?: string;
}

export interface PrComment {
  id: string;
  author: PrAuthor;
  body: string;
  createdAt: string;
  url?: string;
}

export type PrReviewState =
  | "APPROVED"
  | "CHANGES_REQUESTED"
  | "COMMENTED"
  | "DISMISSED"
  | "PENDING";

export interface PrReviewSummary {
  id: string;
  author: PrAuthor;
  state: PrReviewState;
  body: string;
  submittedAt?: string;
  url?: string;
}

export interface PrDetails {
  number: number;
  title: string;
  body: string;
  author?: PrAuthor;
  baseBranch: string;
  headBranch: string;
  additions: number;
  deletions: number;
  changedFiles: number;
  createdAt?: string;
  mergedAt?: string | null;
  mergedBy?: PrAuthor | null;
  closedAt?: string | null;
  commits: PrCommitSummary[];
  comments: PrComment[];
  reviews: PrReviewSummary[];
  checks: PrCheck[];
}

export interface GhCheckAvailableResult {
  available: boolean;
}

export const ghCreatePrPayloadSchema = z.object({
  projectLocation: projectLocationSchema,
  branch: z.string().min(1),
  baseBranch: z.string().min(1),
  title: z.string().min(1),
  body: z.string().default(""),
  isDraft: z.boolean().default(false),
});
export type GhCreatePrPayload = z.infer<typeof ghCreatePrPayloadSchema>;

export const ghGetPrForBranchPayloadSchema = z.object({
  projectLocation: projectLocationSchema,
  branch: z.string().min(1),
});
export type GhGetPrForBranchPayload = z.infer<typeof ghGetPrForBranchPayloadSchema>;

export const ghListPrsPayloadSchema = z.object({
  projectLocation: projectLocationSchema,
});
export type GhListPrsPayload = z.infer<typeof ghListPrsPayloadSchema>;

export interface GhListPrsResult {
  /** Latest PR per head branch, keyed by head branch name. */
  prs: Record<string, PrData>;
}

export interface PullRequestSummary {
  /** Overlay-ready PR data for this row. */
  pr: PrData;
  headBranch: string;
  author?: PrAuthor;
  additions: number;
  deletions: number;
  /** "owner/repository", derived from the canonical PR URL. */
  repository: string;
  /** True when the authenticated viewer is currently requested to review. */
  reviewRequested: boolean;
}

export const ghListPullRequestsPayloadSchema = z.object({
  projectLocation: projectLocationSchema,
});
export type GhListPullRequestsPayload = z.infer<typeof ghListPullRequestsPayloadSchema>;

export interface GhListPullRequestsResult {
  pullRequests: PullRequestSummary[];
  /** The account active in this project's native or WSL runtime. */
  viewerLogin?: string;
}

export interface GitHubActionsWorkflow {
  id: number;
  name: string;
  path: string;
  state: string;
}

export type GitHubActionsWorkflowInputType =
  | "boolean"
  | "choice"
  | "environment"
  | "number"
  | "string";

export interface GitHubActionsWorkflowInput {
  name: string;
  description: string;
  required: boolean;
  type: GitHubActionsWorkflowInputType;
  defaultValue?: string | number | boolean;
  options: string[];
}

export interface GitHubActionsWorkflowDefinition {
  workflowId: number;
  ref: string;
  defaultBranch: string;
  dispatchable: boolean;
  triggers: string[];
  inputs: GitHubActionsWorkflowInput[];
}

export interface GitHubActionsStep {
  number: number;
  name: string;
  status: string;
  conclusion: string;
  startedAt?: string;
  completedAt?: string;
}

export interface GitHubActionsJob {
  id: number;
  name: string;
  status: string;
  conclusion: string;
  startedAt?: string;
  completedAt?: string;
  url?: string;
  steps: GitHubActionsStep[];
}

export interface GitHubActionsRun {
  id: number;
  workflowId: number;
  workflowName: string;
  name: string;
  number: number;
  attempt: number;
  title: string;
  event: string;
  headBranch: string;
  headSha: string;
  status: string;
  conclusion: string;
  createdAt: string;
  startedAt: string;
  updatedAt: string;
  url: string;
  jobs: GitHubActionsJob[];
}

export const ghListWorkflowsPayloadSchema = z.object({
  projectLocation: projectLocationSchema,
});
export type GhListWorkflowsPayload = z.infer<typeof ghListWorkflowsPayloadSchema>;

export interface GhListWorkflowsResult {
  workflows: GitHubActionsWorkflow[];
}

export const ghListWorkflowRunsPayloadSchema = z.object({
  projectLocation: projectLocationSchema,
  workflowId: z.number().int().min(1).optional(),
});
export type GhListWorkflowRunsPayload = z.infer<typeof ghListWorkflowRunsPayloadSchema>;

export interface GhListWorkflowRunsResult {
  runs: GitHubActionsRun[];
}

export const ghGetWorkflowDefinitionPayloadSchema = z.object({
  projectLocation: projectLocationSchema,
  workflowId: z.number().int().min(1),
  ref: z.string().min(1).optional(),
});
export type GhGetWorkflowDefinitionPayload = z.infer<typeof ghGetWorkflowDefinitionPayloadSchema>;

export interface GhGetWorkflowDefinitionResult {
  definition: GitHubActionsWorkflowDefinition;
}

export const ghGetWorkflowRunPayloadSchema = z.object({
  projectLocation: projectLocationSchema,
  runId: z.number().int().min(1),
});
export type GhGetWorkflowRunPayload = z.infer<typeof ghGetWorkflowRunPayloadSchema>;

export interface GhGetWorkflowRunResult {
  run: GitHubActionsRun;
}

export const ghDispatchWorkflowPayloadSchema = z.object({
  projectLocation: projectLocationSchema,
  workflowId: z.number().int().min(1),
  ref: z.string().min(1).optional(),
  inputs: z.record(z.string().min(1), z.string()).default({}),
});
export type GhDispatchWorkflowPayload = z.infer<typeof ghDispatchWorkflowPayloadSchema>;

export const ghRerunWorkflowRunPayloadSchema = z.object({
  projectLocation: projectLocationSchema,
  runId: z.number().int().min(1),
  failedOnly: z.boolean().default(false),
});
export type GhRerunWorkflowRunPayload = z.infer<typeof ghRerunWorkflowRunPayloadSchema>;

export const ghDeleteWorkflowRunPayloadSchema = z.object({
  projectLocation: projectLocationSchema,
  runId: z.number().int().min(1),
});
export type GhDeleteWorkflowRunPayload = z.infer<typeof ghDeleteWorkflowRunPayloadSchema>;

export const ghMergePrPayloadSchema = z.object({
  projectLocation: projectLocationSchema,
  prNumber: z.number().int().min(1),
  method: z.enum(["merge", "squash", "rebase"]).default("merge"),
  admin: z.boolean().default(false),
});
export type GhMergePrPayload = z.infer<typeof ghMergePrPayloadSchema>;

export const ghClosePrPayloadSchema = z.object({
  projectLocation: projectLocationSchema,
  prNumber: z.number().int().min(1),
});
export type GhClosePrPayload = z.infer<typeof ghClosePrPayloadSchema>;

export const ghReopenPrPayloadSchema = z.object({
  projectLocation: projectLocationSchema,
  prNumber: z.number().int().min(1),
});
export type GhReopenPrPayload = z.infer<typeof ghReopenPrPayloadSchema>;

export const ghMarkPrReadyPayloadSchema = z.object({
  projectLocation: projectLocationSchema,
  prNumber: z.number().int().min(1),
});
export type GhMarkPrReadyPayload = z.infer<typeof ghMarkPrReadyPayloadSchema>;

export const ghUpdatePrBranchPayloadSchema = z.object({
  projectLocation: projectLocationSchema,
  prNumber: z.number().int().min(1),
  rebase: z.boolean().default(false),
});
export type GhUpdatePrBranchPayload = z.infer<typeof ghUpdatePrBranchPayloadSchema>;

export const ghGetPrChecksPayloadSchema = z.object({
  projectLocation: projectLocationSchema,
  branch: z.string().min(1),
});
export type GhGetPrChecksPayload = z.infer<typeof ghGetPrChecksPayloadSchema>;

export interface GhGetPrChecksResult {
  checks: PrCheck[];
}

export const ghGetPrFilesPayloadSchema = z.object({
  projectLocation: projectLocationSchema,
  prNumber: z.number().int().min(1),
});
export type GhGetPrFilesPayload = z.infer<typeof ghGetPrFilesPayloadSchema>;

export interface GhGetPrFilesResult {
  files: PrFile[];
}

export const ghGetPrDiffPayloadSchema = z.object({
  projectLocation: projectLocationSchema,
  prNumber: z.number().int().min(1),
});
export type GhGetPrDiffPayload = z.infer<typeof ghGetPrDiffPayloadSchema>;

export interface GhGetPrDiffResult {
  diff: string;
}

export const ghSubmitPrReviewPayloadSchema = z.object({
  projectLocation: projectLocationSchema,
  prNumber: z.number().int().min(1),
  decision: z.enum(["approve", "request-changes", "comment"]),
  body: z.string().default(""),
});
export type GhSubmitPrReviewPayload = z.infer<typeof ghSubmitPrReviewPayloadSchema>;

export const ghGetPrDetailsPayloadSchema = z.object({
  projectLocation: projectLocationSchema,
  prNumber: z.number().int().min(1),
});
export type GhGetPrDetailsPayload = z.infer<typeof ghGetPrDetailsPayloadSchema>;

export interface GhGetPrDetailsResult {
  details: PrDetails;
}

export interface GhGetPrReviewCommentsResult {
  comments: PrComment[];
}

export const ghPostPrCommentPayloadSchema = z.object({
  projectLocation: projectLocationSchema,
  prNumber: z.number().int().min(1),
  body: z.string().min(1),
});
export type GhPostPrCommentPayload = z.infer<typeof ghPostPrCommentPayloadSchema>;

// --- Clone a repository ---------------------------------------------------
// "Add project → Clone a repository" browses the GitHub CLI's signed-in
// accounts and the repositories each can reach, then clones into a local
// folder. Listing and cloning run wherever `gh`/`git` live for the chosen
// runtime, so every payload carries a `ProjectLocation` to anchor the cwd and
// (for WSL) the bridge.

/** One account the GitHub CLI is signed in to (from `gh auth status`). */
export interface GitHubAccount {
  host: string;
  login: string;
  /** The host's currently active account — used as the default selection. */
  active: boolean;
}

export interface GhListAccountsResult {
  accounts: GitHubAccount[];
}

/** A repository the selected account can clone, shaped for the picker. */
export interface GitHubRepoSummary {
  /** "owner/name". */
  nameWithOwner: string;
  owner: string;
  name: string;
  description: string;
  isPrivate: boolean;
  isFork: boolean;
  sshUrl: string;
  httpsUrl: string;
  /** ISO timestamp of the last push; the list is sorted by this descending. */
  pushedAt: string;
}

export interface GhListReposResult {
  repos: GitHubRepoSummary[];
}

export interface CloneRepoResult {
  /** Absolute path of the freshly cloned project folder. */
  path: string;
}

/** Identifies a signed-in account so the supervisor can scope `gh` to it. */
const gitHubAccountRefSchema = z.object({
  host: z.string().min(1),
  login: z.string().min(1),
});
export type GitHubAccountRef = z.infer<typeof gitHubAccountRefSchema>;

export const ghListAccountsPayloadSchema = z.object({
  /** Runtime context (cwd / WSL distro) the `gh` CLI should run in. */
  runtime: projectLocationSchema,
});
export type GhListAccountsPayload = z.infer<typeof ghListAccountsPayloadSchema>;

export const ghListReposPayloadSchema = z.object({
  runtime: projectLocationSchema,
  account: gitHubAccountRefSchema,
});
export type GhListReposPayload = z.infer<typeof ghListReposPayloadSchema>;

export const cloneRepoSourceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("url"), url: z.string().min(1) }),
  z.object({
    kind: z.literal("github"),
    nameWithOwner: z.string().min(1),
    account: gitHubAccountRefSchema,
  }),
]);
export type CloneRepoSource = z.infer<typeof cloneRepoSourceSchema>;

export const cloneRepoPayloadSchema = z.object({
  /** The existing parent folder to clone into; its kind drives the runtime. */
  parentLocation: projectLocationSchema,
  /** New folder name for the clone (already validated by the renderer). */
  name: z.string().min(1),
  source: cloneRepoSourceSchema,
});
export type CloneRepoPayload = z.infer<typeof cloneRepoPayloadSchema>;
