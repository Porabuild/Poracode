import { z } from "zod";

export const themeModeSchema = z.enum(["system", "light", "dark"]);
export type ThemeMode = z.infer<typeof themeModeSchema>;

export const agentKindSchema = z.string().min(1);
export type AgentKind = z.infer<typeof agentKindSchema>;

export const liveInputModeSchema = z.enum(["terminal", "server"]);
export type LiveInputMode = z.infer<typeof liveInputModeSchema>;

export const threadPresentationModeSchema = z.enum(["terminal", "gui"]);
export type ThreadPresentationMode = z.infer<typeof threadPresentationModeSchema>;

export const threadModeSchema = z.enum(["agent", "plan"]);
export type ThreadMode = z.infer<typeof threadModeSchema>;

export const threadStatusSchema = z.enum([
  "inactive",
  "launching",
  "working",
  "idle",
  "needs_approval",
  "needs_reply",
  "error",
]);
export type ThreadStatus = z.infer<typeof threadStatusSchema>;

export const threadAttentionSchema = z.enum([
  "none",
  "working",
  "needs_approval",
  "needs_reply",
  "error",
]);
export type ThreadAttention = z.infer<typeof threadAttentionSchema>;

export const authStateSchema = z.enum(["authenticated", "missing", "unknown"]);
export type AuthState = z.infer<typeof authStateSchema>;

export const projectLocationSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("windows"),
    path: z.string().min(1),
  }),
  z.object({
    kind: z.literal("wsl"),
    distro: z.string().min(1),
    linuxPath: z.string().min(1),
    uncPath: z.string().min(1),
  }),
  z.object({
    kind: z.literal("posix"),
    path: z.string().min(1),
  }),
]);
export type ProjectLocation = z.infer<typeof projectLocationSchema>;

export const threadConfigSchema = z.object({
  model: z.string().min(1),
  effort: z.string().optional(),
  mode: threadModeSchema.optional(),
  approvalPolicy: z.string().optional(),
  sandboxMode: z.string().optional(),
});
export type ThreadConfig = z.infer<typeof threadConfigSchema>;

export const sessionRefSchema = z.object({
  providerSessionId: z.string().min(1),
  discoveredAt: z.string().min(1),
});
export type SessionRef = z.infer<typeof sessionRefSchema>;

export const labeledOptionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
});
export type LabeledOption = z.infer<typeof labeledOptionSchema>;

export const agentCapabilitySchema = z.object({
  models: z.array(labeledOptionSchema).default([]),
  efforts: z.array(z.string().min(1)).default([]),
  defaultEffort: z.string().optional(),
  modelEfforts: z.record(z.string(), z.array(z.string().min(1))).default({}),
  modes: z.array(threadModeSchema).default([]),
  approvalPolicies: z.array(labeledOptionSchema).default([]),
  sandboxModes: z.array(labeledOptionSchema).default([]),
  supportsResume: z.boolean().default(false),
  supportsDirectInput: z.boolean().default(true),
  liveInputMode: liveInputModeSchema.default("terminal"),
  presentationMode: threadPresentationModeSchema.default("terminal"),
});
export type AgentCapability = z.infer<typeof agentCapabilitySchema>;

export const agentStatusSchema = z.object({
  kind: agentKindSchema,
  label: z.string().min(1),
  installed: z.boolean(),
  executablePath: z.string().optional(),
  version: z.string().optional(),
  authState: authStateSchema,
  capabilities: agentCapabilitySchema,
  envKind: z.enum(["windows", "wsl", "posix"]).optional(),
  envDistro: z.string().optional(),
});
export type AgentStatus = z.infer<typeof agentStatusSchema>;

export const projectDraftConfigSchema = z.object({
  agentKind: agentKindSchema,
  model: z.string().min(1),
  effort: z.string().optional(),
  mode: threadModeSchema.optional(),
  approvalPolicy: z.string().optional(),
  sandboxMode: z.string().optional(),
});
export type ProjectDraftConfig = z.infer<typeof projectDraftConfigSchema>;

export const projectSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  location: projectLocationSchema,
  lastDraftConfig: projectDraftConfigSchema.optional(),
  createdAt: z.string().min(1),
});
export type Project = z.infer<typeof projectSchema>;

export const threadSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  title: z.string().min(1),
  agentKind: agentKindSchema,
  config: threadConfigSchema,
  status: threadStatusSchema,
  attention: threadAttentionSchema,
  canResumeWithConfig: z.boolean().default(false),
  sessionRef: sessionRefSchema.optional(),
  worktreePath: z.string().optional(),
  worktreeBranch: z.string().optional(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});
export type Thread = z.infer<typeof threadSchema>;

export interface ThreadRuntimeSnapshot {
  threadId: string;
  status: ThreadStatus;
  attention: ThreadAttention;
  config?: ThreadConfig;
  sessionRef?: SessionRef;
  canResumeWithConfig: boolean;
  errorMessage?: string;
}

export interface ThreadHistorySnapshot {
  history: string;
  length: number;
}

export const terminalSizeSchema = z.object({
  cols: z.number().int().min(20).max(400),
  rows: z.number().int().min(5).max(200),
});
export type TerminalSize = z.infer<typeof terminalSizeSchema>;

export const getAgentStatusesPayloadSchema = z.object({
  wslDistros: z.array(z.string().min(1)).default([]),
});
export type GetAgentStatusesPayload = z.infer<typeof getAgentStatusesPayloadSchema>;

export const startThreadPayloadSchema = z.object({
  threadId: z.string().min(1).optional(),
  projectLocation: projectLocationSchema,
  agentKind: agentKindSchema,
  config: threadConfigSchema,
  prompt: z.string().default(""),
  initialSize: terminalSizeSchema,
  sessionRef: sessionRefSchema.optional(),
});
export type StartThreadPayload = z.infer<typeof startThreadPayloadSchema>;

export interface StartThreadResult {
  threadId: string;
}

export const sendThreadInputPayloadSchema = z.object({
  threadId: z.string().min(1),
  prompt: z.string().min(1),
  config: threadConfigSchema,
});
export type SendThreadInputPayload = z.infer<typeof sendThreadInputPayloadSchema>;

export const writeTerminalPayloadSchema = z.object({
  threadId: z.string().min(1),
  data: z.string().min(1),
});
export type WriteTerminalPayload = z.infer<typeof writeTerminalPayloadSchema>;

export const resizeTerminalPayloadSchema = terminalSizeSchema.extend({
  threadId: z.string().min(1),
});
export type ResizeTerminalPayload = z.infer<typeof resizeTerminalPayloadSchema>;

export const closeThreadPayloadSchema = z.object({
  threadId: z.string().min(1),
});
export type CloseThreadPayload = z.infer<typeof closeThreadPayloadSchema>;

export const threadServerRequestIdSchema = z.union([z.string().min(1), z.number()]);
export type ThreadServerRequestId = z.infer<typeof threadServerRequestIdSchema>;

export const resolveThreadServerRequestPayloadSchema = z.object({
  threadId: z.string().min(1),
  requestId: threadServerRequestIdSchema,
  method: z.string().min(1),
  response: z.unknown(),
});
export type ResolveThreadServerRequestPayload = z.infer<
  typeof resolveThreadServerRequestPayloadSchema
>;

export const startShellPayloadSchema = z.object({
  shellId: z.string().min(1),
  projectLocation: projectLocationSchema,
});
export type StartShellPayload = z.infer<typeof startShellPayloadSchema>;

// --- Git types ---

export interface GitFileChange {
  path: string;
  oldPath?: string;
  status: string;
  staged: boolean;
  insertions: number;
  deletions: number;
}

export interface GitStatusResult {
  isRepo: boolean;
  branch: string;
  tracking: string;
  hasRemote: boolean;
  ahead: number;
  behind: number;
  staged: GitFileChange[];
  unstaged: GitFileChange[];
  totalInsertions: number;
  totalDeletions: number;
}

export interface GitDiffResult {
  diff: string;
}

export interface GitDiffBatchResult {
  staged: Record<string, string>;
  unstaged: Record<string, string>;
}

export const getGitStatusPayloadSchema = z.object({
  projectLocation: projectLocationSchema,
});
export type GetGitStatusPayload = z.infer<typeof getGitStatusPayloadSchema>;

export const getGitDiffPayloadSchema = z.object({
  projectLocation: projectLocationSchema,
  filePath: z.string().optional(),
  staged: z.boolean().default(false),
});
export type GetGitDiffPayload = z.infer<typeof getGitDiffPayloadSchema>;

export const getGitDiffBatchPayloadSchema = z.object({
  projectLocation: projectLocationSchema,
  untrackedPaths: z.array(z.string()).default([]),
});
export type GetGitDiffBatchPayload = z.infer<typeof getGitDiffBatchPayloadSchema>;

export const gitStagePayloadSchema = z.object({
  projectLocation: projectLocationSchema,
  filePath: z.string().min(1),
});
export type GitStagePayload = z.infer<typeof gitStagePayloadSchema>;

export const gitUnstagePayloadSchema = z.object({
  projectLocation: projectLocationSchema,
  filePath: z.string().min(1),
});
export type GitUnstagePayload = z.infer<typeof gitUnstagePayloadSchema>;

export const gitRevertPayloadSchema = z.object({
  projectLocation: projectLocationSchema,
  filePath: z.string().min(1),
});
export type GitRevertPayload = z.infer<typeof gitRevertPayloadSchema>;

export const gitStageAllPayloadSchema = z.object({
  projectLocation: projectLocationSchema,
});
export type GitStageAllPayload = z.infer<typeof gitStageAllPayloadSchema>;

export const gitUnstageAllPayloadSchema = z.object({
  projectLocation: projectLocationSchema,
});
export type GitUnstageAllPayload = z.infer<typeof gitUnstageAllPayloadSchema>;

export const gitRevertAllPayloadSchema = z.object({
  projectLocation: projectLocationSchema,
});
export type GitRevertAllPayload = z.infer<typeof gitRevertAllPayloadSchema>;

export const gitCommitPayloadSchema = z.object({
  projectLocation: projectLocationSchema,
  message: z.string().min(1),
  addAll: z.boolean().default(false),
});
export type GitCommitPayload = z.infer<typeof gitCommitPayloadSchema>;

export interface GitCommitResult {
  hash: string;
  message: string;
}

export const generateCommitMessagePayloadSchema = z.object({
  projectLocation: projectLocationSchema,
  agentKind: agentKindSchema,
  model: z.string().min(1).optional(),
  effort: z.string().min(1).optional(),
});
export type GenerateCommitMessagePayload = z.infer<typeof generateCommitMessagePayloadSchema>;

export interface GenerateCommitMessageResult {
  message: string;
}

// ── Branch & Worktree ───────────────────────────────────

export interface GitBranchInfo {
  name: string;
  current: boolean;
  commit: string;
  isRemote: boolean;
}

export interface GitBranchListResult {
  current: string;
  branches: GitBranchInfo[];
}

export interface GitWorktreeInfo {
  path: string;
  branch: string;
  commit: string;
  isMain: boolean;
}

export interface GitWorktreeListResult {
  worktrees: GitWorktreeInfo[];
}

export interface GitAddWorktreeResult {
  path: string;
}

export const getGitBranchesPayloadSchema = z.object({
  projectLocation: projectLocationSchema,
  includeRemote: z.boolean().default(true),
});
export type GetGitBranchesPayload = z.infer<typeof getGitBranchesPayloadSchema>;

export const gitFetchPayloadSchema = z.object({
  projectLocation: projectLocationSchema,
  remote: z.string().default("origin"),
  prune: z.boolean().default(false),
});
export type GitFetchPayload = z.infer<typeof gitFetchPayloadSchema>;

export const gitListWorktreesPayloadSchema = z.object({
  projectLocation: projectLocationSchema,
});
export type GitListWorktreesPayload = z.infer<typeof gitListWorktreesPayloadSchema>;

export const gitAddWorktreePayloadSchema = z.object({
  projectLocation: projectLocationSchema,
  path: z.string().min(1).optional(),
  branch: z.string().optional(),
  createBranch: z.boolean().default(false),
  startPoint: z.string().optional(),
});
export type GitAddWorktreePayload = z.infer<typeof gitAddWorktreePayloadSchema>;

export const gitRemoveWorktreePayloadSchema = z.object({
  projectLocation: projectLocationSchema,
  path: z.string().min(1),
  force: z.boolean().default(false),
});
export type GitRemoveWorktreePayload = z.infer<typeof gitRemoveWorktreePayloadSchema>;

export const gitDeleteBranchPayloadSchema = z.object({
  projectLocation: projectLocationSchema,
  branch: z.string().min(1),
  force: z.boolean().default(false),
});
export type GitDeleteBranchPayload = z.infer<typeof gitDeleteBranchPayloadSchema>;

export const gitPullPayloadSchema = z.object({
  projectLocation: projectLocationSchema,
  remote: z.string().optional().default("origin"),
});
export type GitPullPayload = z.input<typeof gitPullPayloadSchema>;

export const gitPushPayloadSchema = z.object({
  projectLocation: projectLocationSchema,
  remote: z.string().optional().default("origin"),
  branch: z.string().optional(),
  setUpstream: z.boolean().optional().default(false),
});
export type GitPushPayload = z.input<typeof gitPushPayloadSchema>;

export const gitSyncPayloadSchema = z.object({
  projectLocation: projectLocationSchema,
  remote: z.string().optional().default("origin"),
});
export type GitSyncPayload = z.input<typeof gitSyncPayloadSchema>;

export interface GitSyncResult {
  pulled: boolean;
  pushed: boolean;
}

export type AppView =
  | { kind: "home" }
  | { kind: "draft"; projectId: string }
  | { kind: "thread"; panes: [string, ...string[]] };
