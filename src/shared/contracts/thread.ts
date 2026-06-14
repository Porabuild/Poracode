import { z } from "zod";
import { agentSlashCommandSchema } from "./agent";
import { agentInstanceIdSchema } from "./agentInstance";
import {
  agentKindSchema,
  projectLocationSchema,
  sessionRefSchema,
  threadAttentionSchema,
  threadPresentationModeSchema,
  threadStatusSchema,
} from "./common";
import { threadConfigSchema } from "./config";

/** How thread status/attention is derived for terminal agents (supervisor → renderer). */
export const threadStatusSourceSchema = z.enum(["cli_hook", "terminal_parse", "server"]);
export type ThreadStatusSource = z.infer<typeof threadStatusSourceSchema>;

export const threadSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  title: z.string().min(1),
  agentKind: agentKindSchema,
  /** Optional reference to a user-registered ACP instance (Phase 7). */
  agentInstanceId: agentInstanceIdSchema.optional(),
  config: threadConfigSchema,
  status: threadStatusSchema,
  attention: threadAttentionSchema,
  canResumeWithConfig: z.boolean().default(false),
  sessionRef: sessionRefSchema.optional(),
  worktreePath: z.string().optional(),
  worktreeBranch: z.string().optional(),
  prNumber: z.number().optional(),
  groupId: z.string().optional(),
  groupName: z.string().optional(),
  archived: z.boolean().default(false),
  done: z.boolean().default(false),
  doneAt: z.string().min(1).optional(),
  starred: z.boolean().default(false),
  /** "terminal" → xterm-backed PTY (current default); "gui" → renderer-native chat. */
  presentationMode: threadPresentationModeSchema.optional(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
  /** Start time of the currently live run window, if the thread is actively working. */
  activeTurnStartedAt: z.string().min(1).optional(),
  /** Start time of the most recently completed run window, if known. */
  lastTurnStartedAt: z.string().min(1).optional(),
  /** End time of the most recently completed run window, if known. */
  lastTurnEndedAt: z.string().min(1).optional(),
  /** Set by supervisor `thread-state`; not user-editable. */
  threadStatusSource: threadStatusSourceSchema.optional(),
  /** Latest error reason from the runtime, present when `status === "error"`. */
  errorMessage: z.string().optional(),
  slashCommands: z.array(agentSlashCommandSchema).optional(),
});
export type Thread = z.infer<typeof threadSchema>;

export interface ThreadRuntimeSnapshot {
  threadId: string;
  status: z.infer<typeof threadStatusSchema>;
  attention: z.infer<typeof threadAttentionSchema>;
  config?: z.infer<typeof threadConfigSchema>;
  sessionRef?: z.infer<typeof sessionRefSchema>;
  canResumeWithConfig: boolean;
  errorMessage?: string;
  threadStatusSource?: ThreadStatusSource;
  slashCommands?: z.infer<typeof agentSlashCommandSchema>[];
}

export const terminalSizeSchema = z.object({
  cols: z.number().int().min(20).max(400),
  rows: z.number().int().min(5).max(200),
});
export type TerminalSize = z.infer<typeof terminalSizeSchema>;

export const promptSegmentSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("text"), content: z.string() }),
  z.object({ kind: z.literal("file"), path: z.string() }),
  z.object({ kind: z.literal("attachment"), path: z.string(), mimeType: z.string().optional() }),
]);
export type PromptSegment = z.infer<typeof promptSegmentSchema>;

export const startThreadPayloadSchema = z.object({
  threadId: z.string().min(1).optional(),
  projectLocation: projectLocationSchema,
  agentKind: agentKindSchema,
  agentInstanceId: agentInstanceIdSchema.optional(),
  config: threadConfigSchema,
  prompt: z.string().default(""),
  segments: z.array(promptSegmentSchema).optional(),
  initialSize: terminalSizeSchema,
  sessionRef: sessionRefSchema.optional(),
  presentationMode: threadPresentationModeSchema.optional(),
  /**
   * Renderer-allocated id for the user_message item the chat pane has already
   * painted optimistically. The supervisor reuses this id when emitting its
   * own canonical user_message events, so the renderer's per-id dedupe drops
   * the duplicate. Only set for GUI threads with a fresh prompt.
   */
  userMessageItemId: z.string().min(1).optional(),
});
export type StartThreadPayload = z.infer<typeof startThreadPayloadSchema>;

export interface StartThreadResult {
  threadId: string;
}

export const sendThreadInputPayloadSchema = z.object({
  threadId: z.string().min(1),
  prompt: z.string().min(1),
  segments: z.array(promptSegmentSchema).optional(),
  config: threadConfigSchema,
  /** See {@link startThreadPayloadSchema.userMessageItemId}. */
  userMessageItemId: z.string().min(1).optional(),
});
export type SendThreadInputPayload = z.infer<typeof sendThreadInputPayloadSchema>;

export const interruptThreadPayloadSchema = z.object({
  threadId: z.string().min(1),
});
export type InterruptThreadPayload = z.infer<typeof interruptThreadPayloadSchema>;

export const rollbackThreadConversationPayloadSchema = z.object({
  threadId: z.string().min(1),
  numTurns: z.number().int().min(0),
});
export type RollbackThreadConversationPayload = z.infer<
  typeof rollbackThreadConversationPayloadSchema
>;

export const setPendingSteerPayloadSchema = z.object({
  threadId: z.string().min(1),
  prompt: z.string().min(1),
  segments: z.array(promptSegmentSchema).optional(),
  config: threadConfigSchema,
});
export type SetPendingSteerPayload = z.infer<typeof setPendingSteerPayloadSchema>;

export const clearPendingSteerPayloadSchema = z.object({
  threadId: z.string().min(1),
});
export type ClearPendingSteerPayload = z.infer<typeof clearPendingSteerPayloadSchema>;

/**
 * Renderer-visible representation of the single staged steer message that
 * sits in the supervisor between user submit-while-working and the agent
 * acknowledging the cancel. `null` (in IPC) clears the slot.
 */
export interface PendingSteerState {
  /** Stable id allocated by the supervisor at stage time. */
  id: string;
  /** Plaintext preview shown in the composer strip. */
  prompt: string;
  /** Optional structured segments (attachments, files, mentions). */
  segments?: PromptSegment[];
  /** Wall-clock timestamp the slot was staged or last edited. */
  stagedAt: number;
}

export const writeTerminalPayloadSchema = z.object({
  threadId: z.string().min(1),
  data: z.string().min(1),
});
export type WriteTerminalPayload = z.infer<typeof writeTerminalPayloadSchema>;

/**
 * Type text into a terminal-native thread's PTY input line WITHOUT submitting
 * it (no trailing carriage return). Used to route a browser element-picker
 * selection straight into a CLI agent's input so the user can review/extend it
 * before pressing Enter. `segments` is formatted through the adapter (so image
 * attachments become `@path` references and WSL paths are rewritten) and then
 * collapsed to a single line to avoid an accidental newline submit.
 */
export const stageThreadInputPayloadSchema = z.object({
  threadId: z.string().min(1),
  prompt: z.string(),
  segments: z.array(promptSegmentSchema).optional(),
});
export type StageThreadInputPayload = z.infer<typeof stageThreadInputPayloadSchema>;

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
  worktreePath: z.string().min(1).optional(),
  initialSize: terminalSizeSchema.optional(),
  /**
   * Start the shell in the user's home directory instead of the project path.
   * Used by one-shot installers that shouldn't run inside a (possibly
   * ephemeral) worktree.
   */
  startInHome: z.boolean().optional(),
});
export type StartShellPayload = z.infer<typeof startShellPayloadSchema>;
