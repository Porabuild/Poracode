import { z } from "zod";

export const themeModeSchema = z.enum(["system", "light", "dark"]);
export type ThemeMode = z.infer<typeof themeModeSchema>;

export const environmentModeSchema = z.enum(["windows", "wsl"]);
export type EnvironmentMode = z.infer<typeof environmentModeSchema>;

export const agentKindSchema = z.enum(["codex", "claude"]);
export type AgentKind = z.infer<typeof agentKindSchema>;

export const liveInputModeSchema = z.enum(["terminal", "server"]);
export type LiveInputMode = z.infer<typeof liveInputModeSchema>;

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
]);
export type ProjectLocation = z.infer<typeof projectLocationSchema>;

export const getAgentStatusesPayloadSchema = z.object({
  environmentMode: environmentModeSchema,
});
export type GetAgentStatusesPayload = z.infer<typeof getAgentStatusesPayloadSchema>;

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

export const agentCapabilitySchema = z.object({
  models: z.array(z.string().min(1)).default([]),
  efforts: z.array(z.string().min(1)).default([]),
  defaultEffort: z.string().optional(),
  modelEfforts: z.record(z.string(), z.array(z.string().min(1))).default({}),
  modes: z.array(threadModeSchema).default([]),
  approvalPolicies: z.array(z.string().min(1)).default([]),
  sandboxModes: z.array(z.string().min(1)).default([]),
  supportsResume: z.boolean().default(false),
  supportsDirectInput: z.boolean().default(true),
  liveInputMode: liveInputModeSchema.default("terminal"),
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

export interface TerminalPromptOption {
  key: string;
  label: string;
  description?: string | undefined;
  isTextInput?: boolean | undefined;
}

export interface TerminalPrompt {
  title: string;
  options: TerminalPromptOption[];
}

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
  terminalPrompt: z.custom<TerminalPrompt>().optional(),
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
  terminalPrompt?: TerminalPrompt;
}

export interface ThreadHistorySnapshot {
  history: string;
  length: number;
}

export const startThreadPayloadSchema = z.object({
  threadId: z.string().min(1).optional(),
  projectLocation: projectLocationSchema,
  agentKind: agentKindSchema,
  config: threadConfigSchema,
  prompt: z.string().default(""),
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

export const resizeTerminalPayloadSchema = z.object({
  threadId: z.string().min(1),
  cols: z.number().int().min(20).max(400),
  rows: z.number().int().min(5).max(200),
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

export type AppView =
  | { kind: "home" }
  | { kind: "draft"; projectId: string }
  | { kind: "thread"; panes: [string, ...string[]] };
