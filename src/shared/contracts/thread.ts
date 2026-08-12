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
import {
  BUILT_IN_MCP_SERVER_IDS,
  builtInMcpDisabledToolsSchema,
  mcpServerListSchema,
} from "./mcpServer";
import { goalControlActionSchema } from "./runtimeEvent";

/** How thread status/attention is derived for terminal agents (supervisor → renderer). */
export const threadStatusSourceSchema = z.enum(["cli_hook", "terminal_parse", "server"]);
export type ThreadStatusSource = z.infer<typeof threadStatusSourceSchema>;

export const threadSchema = z.object({
  id: z.string().min(1),
  /** Server-owned identity for a transient thread mirrored into a desktop client. */
  remoteServerId: z.string().min(1).optional(),
  remoteId: z.string().min(1).optional(),
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
  /**
   * Id of the thread that created this thread as a child (e.g. via the
   * `poracode` MCP `create_thread` tool). Persisted so child threads render
   * grouped with their parent in the sidebar; absent for user-created threads.
   */
  parentThreadId: z.string().min(1).optional(),
});
export type Thread = z.infer<typeof threadSchema>;

export interface ThreadRuntimeSnapshot {
  threadId: string;
  status: z.infer<typeof threadStatusSchema>;
  attention: z.infer<typeof threadAttentionSchema>;
  config?: z.infer<typeof threadConfigSchema>;
  /** Effective launch-time config after plugin and global MCP policy is applied. */
  launchConfig?: z.infer<typeof threadConfigSchema>;
  sessionRef?: z.infer<typeof sessionRefSchema>;
  canResumeWithConfig: boolean;
  errorMessage?: string;
  threadStatusSource?: ThreadStatusSource;
  slashCommands?: z.infer<typeof agentSlashCommandSchema>[];
}

export interface TerminalShellSnapshot {
  terminalId: string;
  projectLocation: z.infer<typeof projectLocationSchema>;
  worktreePath?: string;
  outputLength: number;
}

export const terminalSizeSchema = z.object({
  cols: z.number().int().min(20).max(400),
  rows: z.number().int().min(5).max(200),
});
export type TerminalSize = z.infer<typeof terminalSizeSchema>;

/** Fallback PTY geometry used when a terminal is launched before its surface has measured. */
export const DEFAULT_TERMINAL_SIZE: TerminalSize = { cols: 120, rows: 30 };

export const promptSegmentSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("text"), content: z.string() }),
  z.object({ kind: z.literal("file"), path: z.string() }),
  z.object({ kind: z.literal("attachment"), path: z.string(), mimeType: z.string().optional() }),
  z.object({
    kind: z.literal("diff_comment"),
    path: z.string().min(1),
    lineNumber: z.number().int().positive(),
    side: z.enum(["old", "new"]),
    staged: z.boolean(),
    body: z.string().min(1),
  }),
  z.object({
    kind: z.literal("skill"),
    name: z.string().min(1),
    path: z.string().min(1),
    invocation: z.string().min(1),
    provider: z.string().min(1),
    scope: z.enum(["global", "project"]),
    pluginId: z.string().min(1).optional(),
    pluginName: z.string().min(1).optional(),
  }),
  z.object({ kind: z.literal("mcp"), id: z.string().min(1), name: z.string().min(1) }),
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
  /** Enabled custom MCP servers resolved by the renderer at launch time. */
  mcpServers: mcpServerListSchema.optional(),
  /** Built-in MCP ids hard-disabled when this launch snapshot was created. */
  disabledBuiltInMcpServerIds: z.array(z.enum(BUILT_IN_MCP_SERVER_IDS)).optional(),
  /** Supervisor-owned restrictions that must survive every restart of this thread. */
  invariantDisabledBuiltInMcpServerIds: z.array(z.enum(BUILT_IN_MCP_SERVER_IDS)).optional(),
  disabledBuiltInMcpTools: builtInMcpDisabledToolsSchema.optional(),
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

export const MAX_GOAL_OBJECTIVE_LENGTH = 4000;

const goalObjectiveSchema = z.string().trim().min(1).max(MAX_GOAL_OBJECTIVE_LENGTH);

export const threadGoalControlSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("edit"), objective: goalObjectiveSchema }),
  z.object({ action: goalControlActionSchema.exclude(["edit"]) }),
]);
export type ThreadGoalControl = z.infer<typeof threadGoalControlSchema>;

export const controlThreadGoalPayloadSchema = threadGoalControlSchema.and(
  z.object({ threadId: z.string().min(1) }),
);
export type ControlThreadGoalPayload = z.infer<typeof controlThreadGoalPayloadSchema>;

export const rollbackThreadConversationPayloadSchema = z.object({
  threadId: z.string().min(1),
  numTurns: z.number().int().min(0),
  config: threadConfigSchema.optional(),
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

/**
 * Thread-metadata mutation issued by a paired browser client. Thread
 * metadata is owned by the desktop renderer's store (which persists it via
 * `dbSyncAll`), so these commands are forwarded main → renderer and applied
 * through the regular thread actions instead of writing to the DB directly.
 */
export const remoteThreadCommandSchema = z.discriminatedUnion("kind", [
  /**
   * Host lifecycle preflight for a freshly-created worktree. The paired
   * desktop enqueues setup before the host launches the thread. Keeping this
   * separate from `start` prevents the post-launch metadata mirror from
   * enqueueing setup a second time.
   */
  z.object({
    kind: z.literal("prepare-worktree"),
    threadId: z.string().min(1),
    projectId: z.string().min(1),
    worktreePath: z.string().min(1),
  }),
  z.object({
    kind: z.literal("start"),
    threadId: z.string().min(1),
    projectId: z.string().min(1),
    agentKind: agentKindSchema,
    agentInstanceId: agentInstanceIdSchema.optional(),
    config: threadConfigSchema,
    prompt: z.string(),
    /**
     * Explicit thread title (e.g. an orchestrator-provided ticket key). When
     * present the renderer uses it verbatim and skips AI title generation;
     * otherwise the title is derived from the prompt.
     */
    title: z.string().min(1).optional(),
    segments: z.array(promptSegmentSchema).optional(),
    presentationMode: threadPresentationModeSchema.optional(),
    userMessageItemId: z.string().min(1).optional(),
    worktreePath: z.string().min(1).optional(),
    worktreeBranch: z.string().optional(),
    prNumber: z.number().int().min(1).optional(),
    isNewWorktree: z.boolean().optional(),
    /**
     * Desktop-renderer hint. Remote clients send `start` to the HTTP server;
     * the server creates metadata and launches the supervisor directly, then
     * forwards the command with this set to false so the renderer mirrors the
     * row without launching the same session again.
     */
    launchRuntime: z.boolean().optional(),
    /**
     * Desktop-renderer hint. `false` mirrors the thread row without switching
     * the active view to it — used by orchestrator-created child threads so a
     * fan-out of `create_thread` calls doesn't steal the user's focus.
     * Omitted/`true` keeps the existing focus-switch behavior.
     */
    focus: z.boolean().optional(),
    /**
     * Id of the orchestrator thread that created this thread (see
     * {@link threadSchema}'s `parentThreadId`).
     */
    parentThreadId: z.string().min(1).optional(),
    /**
     * Sidebar group the new thread belongs to (orchestrator children join a
     * group shared with their parent so families render together).
     */
    groupId: z.string().min(1).optional(),
    groupName: z.string().min(1).optional(),
  }),
  // Assigns an existing thread to a sidebar group. Used to pull an
  // orchestrator parent into the group its children are created in; the
  // renderer owns thread metadata, so this routes through its store like the
  // other metadata commands instead of writing the DB directly.
  z.object({
    kind: z.literal("set-group"),
    threadId: z.string().min(1),
    groupId: z.string().min(1),
    groupName: z.string().min(1),
  }),
  z.object({ kind: z.literal("rename"), threadId: z.string().min(1), title: z.string().min(1) }),
  z.object({ kind: z.literal("acknowledge"), threadId: z.string().min(1) }),
  z.object({ kind: z.literal("set-done"), threadId: z.string().min(1), done: z.boolean() }),
  z.object({
    kind: z.literal("set-starred"),
    threadId: z.string().min(1),
    starred: z.boolean(),
  }),
  // Tags a remotely-started thread with its worktree so it groups under that
  // worktree. The supervisor launches in the dir (via projectLocation) but
  // never records this metadata; the desktop renderer owns it. `isNewWorktree`
  // means the remote client just created the worktree, so the desktop should
  // also prime its git state and run the project setup script (parity with a
  // local "new thread in worktree").
  z.object({
    kind: z.literal("set-worktree"),
    threadId: z.string().min(1),
    worktreePath: z.string().min(1),
    worktreeBranch: z.string().optional(),
    isNewWorktree: z.boolean().optional(),
  }),
  // Removes a worktree group from a remote client. The desktop renderer handles
  // this through its existing worktree cleanup path so scripts, terminals,
  // linked threads, git state, and persistence stay consistent with desktop.
  z.object({
    kind: z.literal("delete-worktree-group"),
    threadId: z.string().min(1),
    projectId: z.string().min(1),
    worktreePath: z.string().min(1),
    threadIds: z.array(z.string().min(1)).min(1),
  }),
  z.object({ kind: z.literal("archive"), threadId: z.string().min(1) }),
  z.object({ kind: z.literal("unarchive"), threadId: z.string().min(1) }),
  z.object({ kind: z.literal("delete"), threadId: z.string().min(1) }),
]);
export type RemoteThreadCommand = z.infer<typeof remoteThreadCommandSchema>;

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
