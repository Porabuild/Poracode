import { z } from "zod";
import type {
  GitBranchListResult,
  GitStatusResult,
  GitWorktreeInfo,
  PrData,
  PrDetails,
  PrFile,
  PrReviewThread,
} from "./contracts";

const KEY_SEPARATOR = "\u0000";

export interface GitProjectRef {
  readonly hostId: string;
  readonly projectId: string;
}

export interface GitTargetRef extends GitProjectRef {
  readonly worktreePath?: string | undefined;
}

export interface PullRequestRef extends GitProjectRef {
  readonly prNumber: number;
}

export interface GitTargetSourceInfo {
  readonly sourceBranch: string | null;
  readonly commitsAhead: number;
  readonly sourceAhead: number;
}

export interface GitProjectState {
  readonly ref: GitProjectRef;
  readonly status?: GitStatusResult | undefined;
  readonly branches?: GitBranchListResult | undefined;
  readonly worktrees?: readonly GitWorktreeInfo[] | undefined;
  readonly ghAvailable?: boolean | undefined;
  readonly refreshedAt: string;
}

export interface GitTargetState {
  readonly ref: GitTargetRef;
  readonly status?: GitStatusResult | undefined;
  readonly sourceInfo?: GitTargetSourceInfo | undefined;
  readonly pullRequestKey?: string | null | undefined;
  readonly refreshedAt: string;
}

export interface PullRequestResourceFreshness {
  readonly core?: string | undefined;
  readonly details?: string | undefined;
  readonly files?: string | undefined;
  readonly diff?: string | undefined;
  readonly reviewThreads?: string | undefined;
}

export interface PullRequestState {
  readonly ref: PullRequestRef;
  readonly data: PrData;
  readonly details?: PrDetails | undefined;
  readonly files?: readonly PrFile[] | undefined;
  readonly diff?: string | undefined;
  readonly reviewThreads?: readonly PrReviewThread[] | undefined;
  readonly freshness: PullRequestResourceFreshness;
}

export interface ProjectPullRequestListState {
  readonly project: GitProjectRef;
  readonly pullRequestKeys: readonly string[];
  readonly viewerLogin?: string | undefined;
  readonly refreshedAt: string;
}

export interface GitStateSnapshot {
  readonly revision: number;
  readonly projects: Readonly<Record<string, GitProjectState>>;
  readonly targets: Readonly<Record<string, GitTargetState>>;
  readonly pullRequests: Readonly<Record<string, PullRequestState>>;
  readonly pullRequestKeyByBranch: Readonly<Record<string, string>>;
  readonly projectPullRequestLists: Readonly<Record<string, ProjectPullRequestListState>>;
}

export interface GitStatePatch {
  readonly revision: number;
  readonly projects?: Readonly<Record<string, GitProjectState>> | undefined;
  readonly targets?: Readonly<Record<string, GitTargetState>> | undefined;
  readonly pullRequests?: Readonly<Record<string, PullRequestState>> | undefined;
  readonly pullRequestKeyByBranch?: Readonly<Record<string, string | null>> | undefined;
  readonly projectPullRequestLists?:
    | Readonly<Record<string, ProjectPullRequestListState>>
    | undefined;
  readonly removeProjects?: readonly string[] | undefined;
  readonly removeTargets?: readonly string[] | undefined;
  readonly removePullRequests?: readonly string[] | undefined;
  readonly removeProjectPullRequestLists?: readonly string[] | undefined;
}

export type GitStateInterest =
  | {
      readonly kind: "target";
      readonly projectId: string;
      readonly worktreePath?: string | undefined;
      readonly branch?: string | undefined;
      readonly includePrDetails?: boolean | undefined;
    }
  | {
      readonly kind: "pull-request";
      readonly projectId: string;
      readonly prNumber: number;
      readonly branch?: string | undefined;
      readonly includeReviewBundle?: boolean | undefined;
    }
  | {
      readonly kind: "project-pull-requests";
      readonly projectId: string;
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export const gitStateSnapshotSchema = z.custom<GitStateSnapshot>(
  (value) =>
    isRecord(value) &&
    Number.isSafeInteger(value.revision) &&
    Number(value.revision) >= 0 &&
    isRecord(value.projects) &&
    isRecord(value.targets) &&
    isRecord(value.pullRequests) &&
    isRecord(value.pullRequestKeyByBranch) &&
    isRecord(value.projectPullRequestLists),
  "Invalid Git state snapshot.",
);

export const gitStatePatchSchema = z.custom<GitStatePatch>(
  (value) =>
    isRecord(value) &&
    Number.isSafeInteger(value.revision) &&
    Number(value.revision) > 0 &&
    (value.projects === undefined || isRecord(value.projects)) &&
    (value.targets === undefined || isRecord(value.targets)) &&
    (value.pullRequests === undefined || isRecord(value.pullRequests)) &&
    (value.pullRequestKeyByBranch === undefined || isRecord(value.pullRequestKeyByBranch)) &&
    (value.projectPullRequestLists === undefined || isRecord(value.projectPullRequestLists)),
  "Invalid Git state patch.",
);

export const gitStateInterestSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("target"),
    projectId: z.string().min(1),
    worktreePath: z.string().min(1).optional(),
    branch: z.string().min(1).optional(),
    includePrDetails: z.boolean().optional(),
  }),
  z.object({
    kind: z.literal("pull-request"),
    projectId: z.string().min(1),
    prNumber: z.number().int().positive(),
    branch: z.string().min(1).optional(),
    includeReviewBundle: z.boolean().optional(),
  }),
  z.object({
    kind: z.literal("project-pull-requests"),
    projectId: z.string().min(1),
  }),
]);

function encodeKeyPart(value: string): string {
  return `${value.length}:${value}`;
}

function joinKey(kind: string, parts: readonly string[]): string {
  return [kind, ...parts.map(encodeKeyPart)].join(KEY_SEPARATOR);
}

export function gitProjectKey(ref: GitProjectRef): string {
  return joinKey("project", [ref.hostId, ref.projectId]);
}

export function gitTargetKey(ref: GitTargetRef): string {
  return joinKey("target", [ref.hostId, ref.projectId, ref.worktreePath ?? ""]);
}

export function pullRequestKey(ref: PullRequestRef): string {
  return joinKey("pr", [ref.hostId, ref.projectId, String(ref.prNumber)]);
}

export function pullRequestBranchKey(ref: GitProjectRef, branch: string): string {
  return joinKey("pr-branch", [ref.hostId, ref.projectId, branch]);
}

function omitKeys<T>(
  source: Readonly<Record<string, T>>,
  keys: readonly string[] | undefined,
): Readonly<Record<string, T>> {
  if (!keys || keys.length === 0) return source;
  const removed = new Set(keys);
  let changed = false;
  const next: Record<string, T> = {};
  for (const [key, value] of Object.entries(source)) {
    if (removed.has(key)) {
      changed = true;
      continue;
    }
    next[key] = value;
  }
  return changed ? next : source;
}

function mergeRecords<T>(
  current: Readonly<Record<string, T>>,
  patch: Readonly<Record<string, T>> | undefined,
): Readonly<Record<string, T>> {
  if (!patch || Object.keys(patch).length === 0) return current;
  return { ...current, ...patch };
}

function mergeNullableRecords(
  current: Readonly<Record<string, string>>,
  patch: Readonly<Record<string, string | null>> | undefined,
): Readonly<Record<string, string>> {
  if (!patch || Object.keys(patch).length === 0) return current;
  const next = { ...current };
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) delete next[key];
    else next[key] = value;
  }
  return next;
}

export function applyGitStatePatch(
  current: GitStateSnapshot,
  patch: GitStatePatch,
): GitStateSnapshot {
  if (patch.revision <= current.revision) return current;
  return {
    revision: patch.revision,
    projects: mergeRecords(omitKeys(current.projects, patch.removeProjects), patch.projects),
    targets: mergeRecords(omitKeys(current.targets, patch.removeTargets), patch.targets),
    pullRequests: mergeRecords(
      omitKeys(current.pullRequests, patch.removePullRequests),
      patch.pullRequests,
    ),
    pullRequestKeyByBranch: mergeNullableRecords(
      current.pullRequestKeyByBranch,
      patch.pullRequestKeyByBranch,
    ),
    projectPullRequestLists: mergeRecords(
      omitKeys(current.projectPullRequestLists, patch.removeProjectPullRequestLists),
      patch.projectPullRequestLists,
    ),
  };
}

export function emptyGitStateSnapshot(): GitStateSnapshot {
  return {
    revision: 0,
    projects: {},
    targets: {},
    pullRequests: {},
    pullRequestKeyByBranch: {},
    projectPullRequestLists: {},
  };
}
