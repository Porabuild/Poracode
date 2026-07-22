import { z } from "zod";
import type {
  AgentKind,
  Project,
  RemoteThreadCommand,
  StartThreadPayload,
  Thread,
  ThreadRuntimeSnapshot,
  ThreadStatus,
} from "@/shared/contracts";
import {
  agentKindSchema,
  DEFAULT_TERMINAL_SIZE,
  resolveMcpLaunchSnapshot,
} from "@/shared/contracts";
import { buildWorktreeLocation } from "@/shared/worktree";
import { dbGetThreadRuntimeItemsPage } from "../../../db";
import {
  assertNotSelf,
  projectIdProp,
  requireThread,
  threadIdProp,
  type AppControlsToolContext,
  type ToolDomain,
} from "./types";

/** Statuses `wait_for_thread` treats as settled (turn finished or needs the caller). */
const SETTLED_STATUSES: ReadonlySet<ThreadStatus> = new Set<ThreadStatus>([
  "idle",
  "finished",
  "needs_approval",
  "needs_reply",
  "error",
  "inactive",
]);

/** Default / hard-capped `wait_for_thread` budget (seconds). */
const WAIT_DEFAULT_SECONDS = 600;
const WAIT_MAX_SECONDS = 1_800;

/** Default / capped transcript page size for `read_thread`. */
const READ_DEFAULT_LIMIT = 30;
const READ_MAX_LIMIT = 100;
/** Per-item text cap so a transcript can't blow up the caller's context. */
const ITEM_TEXT_MAX_CHARS = 2_000;
/** Trailing slice of terminal scrollback returned by `read_terminal`. */
const TERMINAL_SCROLLBACK_MAX_CHARS = 50_000;
/** Hard cap on how many turns `rollback_thread` will discard in one call. */
const ROLLBACK_MAX_TURNS = 20;

const listArgsSchema = z.object({
  projectId: z.string().min(1).optional(),
  status: z.string().min(1).optional(),
});
const threadIdArgsSchema = z.object({ threadId: z.string().min(1) });
const readArgsSchema = z.object({
  threadId: z.string().min(1),
  limit: z.number().int().min(1).max(READ_MAX_LIMIT).optional(),
  before: z.number().int().nonnegative().optional(),
});
const createArgsSchema = z.object({
  projectId: z.string().min(1),
  prompt: z.string().trim().min(1).max(50_000),
  agentKind: agentKindSchema.optional(),
  model: z.string().min(1).optional(),
  effort: z.string().min(1).optional(),
  title: z.string().trim().min(1).max(200).optional(),
  worktree: z
    .object({ enabled: z.boolean(), branch: z.string().trim().min(1).max(255).optional() })
    .optional(),
});
const sendArgsSchema = z.object({
  threadId: z.string().min(1),
  message: z.string().trim().min(1).max(50_000),
  interruptFirst: z.boolean().optional(),
});
const waitArgsSchema = z.object({
  threadIds: z.array(z.string().min(1)).min(1).max(8),
  timeoutSeconds: z.number().int().min(1).max(WAIT_MAX_SECONDS).optional(),
});
const steerArgsSchema = z.object({
  threadId: z.string().min(1),
  prompt: z.string().trim().min(1).max(50_000).optional(),
  clear: z.boolean().optional(),
});
const stageArgsSchema = z.object({
  threadId: z.string().min(1),
  prompt: z.string().trim().min(1).max(50_000),
});
const rollbackArgsSchema = z.object({
  threadId: z.string().min(1),
  numTurns: z.number().int().min(1).max(ROLLBACK_MAX_TURNS),
});
const updateArgsSchema = z.object({
  threadId: z.string().min(1),
  rename: z.string().trim().min(1).max(200).optional(),
  group: z.string().trim().min(1).max(200).optional(),
  done: z.boolean().optional(),
  starred: z.boolean().optional(),
  archived: z.boolean().optional(),
  acknowledge: z.boolean().optional(),
});

export const threadTools: ToolDomain = {
  specs: [
    {
      name: "list_threads",
      description:
        "List all app threads (across projects) with their live status, attention, project, agent, model, and worktree. Optionally filter by projectId or status.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        properties: {
          projectId: projectIdProp,
          status: { type: "string" },
        },
      },
    },
    {
      name: "get_thread",
      description:
        "Full detail for one thread: persisted row, live runtime status/config, pending steer (staged message), and turn timing.",
      inputSchema: threadIdJsonSchema(),
    },
    {
      name: "read_thread",
      description:
        "Read a thread's recorded transcript (most recent first-page by default). Works even when the thread's session is inactive; returns a note when nothing has been recorded yet.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["threadId"],
        properties: {
          threadId: threadIdProp,
          limit: { type: "integer", minimum: 1, maximum: READ_MAX_LIMIT },
          before: { type: "integer", minimum: 0 },
        },
      },
    },
    {
      name: "create_thread",
      description:
        "Create and launch a new app thread in a project (visible in the user's sidebar). The calling thread's agent and model are used unless overridden. Optionally run it in a fresh git worktree.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["projectId", "prompt"],
        properties: {
          projectId: projectIdProp,
          prompt: { type: "string", minLength: 1, maxLength: 50000 },
          agentKind: { type: "string", minLength: 1 },
          model: { type: "string", minLength: 1 },
          effort: { type: "string", minLength: 1 },
          title: { type: "string", minLength: 1, maxLength: 200 },
          worktree: {
            type: "object",
            additionalProperties: false,
            required: ["enabled"],
            properties: {
              enabled: { type: "boolean" },
              branch: { type: "string", minLength: 1, maxLength: 255 },
            },
          },
        },
      },
    },
    {
      name: "send_to_thread",
      description:
        "Send a message to another thread. If the thread has no live session (it was stopped, unloaded, or the app restarted), it is resumed from its persisted config and session reference and the message is delivered as the first input of the resumed session. A thread with no resumable session cannot receive messages — use create_thread instead. Set interruptFirst to interrupt a working turn before sending (ignored when resuming, since nothing is running).",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["threadId", "message"],
        properties: {
          threadId: threadIdProp,
          message: { type: "string", minLength: 1, maxLength: 50000 },
          interruptFirst: { type: "boolean" },
        },
      },
    },
    {
      name: "interrupt_thread",
      description:
        "Interrupt another thread's current turn. The thread stays open and addressable.",
      inputSchema: threadIdJsonSchema(),
    },
    {
      name: "stop_thread",
      description:
        "Stop another thread's runtime session (frees resources). The thread row and its transcript remain in the app.",
      inputSchema: threadIdJsonSchema(),
    },
    {
      name: "wait_for_thread",
      description:
        "Block until one of the listed threads leaves its working state or needs attention (idle, finished, needs_approval, needs_reply, error, or inactive), or the timeout elapses. Event-driven; returns each thread's final status.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["threadIds"],
        properties: {
          threadIds: { type: "array", minItems: 1, maxItems: 8, items: { type: "string" } },
          timeoutSeconds: { type: "integer", minimum: 1, maximum: WAIT_MAX_SECONDS },
        },
      },
    },
    {
      name: "update_thread",
      description:
        "Update a thread's metadata: rename, assign a sidebar group, mark done/not-done, star/unstar, archive/unarchive, or acknowledge a finished thread.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["threadId"],
        properties: {
          threadId: threadIdProp,
          rename: { type: "string", minLength: 1, maxLength: 200 },
          group: { type: "string", minLength: 1, maxLength: 200 },
          done: { type: "boolean" },
          starred: { type: "boolean" },
          archived: { type: "boolean" },
          acknowledge: { type: "boolean" },
        },
      },
    },
    {
      name: "open_thread",
      description: "Open and focus a thread in the Poracode UI for the user.",
      inputSchema: threadIdJsonSchema(),
    },
    {
      name: "read_terminal",
      description:
        "Read the PTY scrollback of a terminal-presentation thread (the raw terminal output the user sees). Returns a note when the thread has no live terminal session (e.g. a structured/GUI thread, or its session isn't running). Only the last 50000 characters are returned; the response flags truncation.",
      inputSchema: threadIdJsonSchema(),
    },
    {
      name: "steer_thread",
      description:
        "Queue guidance for another thread that is injected when its running agent next yields, without interrupting the current turn. Reuses the thread's persisted config. Pass a prompt to queue guidance, or clear:true to clear the queued steer. You cannot steer your own thread.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["threadId"],
        properties: {
          threadId: threadIdProp,
          prompt: { type: "string", minLength: 1, maxLength: 50000 },
          clear: { type: "boolean" },
        },
      },
    },
    {
      name: "stage_thread_input",
      description:
        "Type text into a thread's composer WITHOUT submitting it, so the user can review and send it themselves. Only supported for terminal-presentation threads (structured/GUI threads and not-yet-ready sessions are rejected); newlines are collapsed to a single line so the text can't accidentally submit.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["threadId", "prompt"],
        properties: {
          threadId: threadIdProp,
          prompt: { type: "string", minLength: 1, maxLength: 50000 },
        },
      },
    },
    {
      name: "rollback_thread",
      description:
        "DESTRUCTIVE: permanently discard the last N turns of another thread's conversation (the provider's checkpoint rollback). This cannot be undone — always confirm the exact thread and turn count with the user before calling. Fails while the agent is working or when the provider does not support rollback. You cannot roll back your own thread. numTurns must be between 1 and 20.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["threadId", "numTurns"],
        properties: {
          threadId: threadIdProp,
          numTurns: { type: "integer", minimum: 1, maximum: ROLLBACK_MAX_TURNS },
        },
      },
    },
  ],
  handlers: {
    list_threads: async (args, ctx) => {
      const { projectId, status } = listArgsSchema.parse(args);
      const projectsById = new Map(ctx.getProjects().map((project) => [project.id, project]));
      const snapshots = await snapshotMap(ctx);
      const threads = ctx
        .getThreads()
        .filter((thread) => (projectId ? thread.projectId === projectId : true))
        .map((thread) =>
          threadView(thread, projectsById.get(thread.projectId), snapshots.get(thread.id)),
        )
        .filter((view) => (status ? view.status === status : true));
      return { count: threads.length, threads };
    },
    get_thread: async (args, ctx) => {
      const { threadId } = threadIdArgsSchema.parse(args);
      const thread = requireThread(ctx, threadId);
      const project = ctx.getProject(thread.projectId) ?? undefined;
      const snapshots = await snapshotMap(ctx);
      const pendingSteer = ctx.threadStates.getPendingSteer(threadId);
      return {
        ...threadView(thread, project, snapshots.get(threadId)),
        pendingSteer: pendingSteer
          ? {
              id: pendingSteer.id,
              prompt: truncate(pendingSteer.prompt, ITEM_TEXT_MAX_CHARS),
              stagedAt: new Date(pendingSteer.stagedAt).toISOString(),
            }
          : null,
      };
    },
    read_thread: (args, ctx) => {
      const { threadId, limit, before } = readArgsSchema.parse(args);
      requireThread(ctx, threadId);
      const page = dbGetThreadRuntimeItemsPage(threadId, before, limit ?? READ_DEFAULT_LIMIT);
      if (page.items.length === 0) {
        return {
          threadId,
          messageCount: 0,
          note: "No transcript has been recorded for this thread yet.",
        };
      }
      return {
        threadId,
        messageCount: page.items.length,
        ...(page.nextCursor != null ? { nextCursor: page.nextCursor } : {}),
        items: page.items.map((item) => ({
          type: item.type,
          state: item.state,
          ...(itemText(item) ? { text: truncate(itemText(item), ITEM_TEXT_MAX_CHARS) } : {}),
        })),
      };
    },
    create_thread: async (args, ctx) => {
      const parsed = createArgsSchema.parse(args);
      const sourceThread = ctx.identity.threadId ? ctx.getThread(ctx.identity.threadId) : null;
      const agentKind: AgentKind | undefined = parsed.agentKind ?? sourceThread?.agentKind;
      const model = parsed.model ?? sourceThread?.config.model;
      if (!agentKind || !model) {
        throw new Error(
          "agentKind and model are required when they can't be inherited from the calling thread.",
        );
      }
      const effort = parsed.effort ?? sourceThread?.config.effort;
      return ctx.createThread({
        projectId: parsed.projectId,
        prompt: parsed.prompt,
        agentKind,
        model,
        ...(effort ? { effort } : {}),
        ...(sourceThread?.config.fast !== undefined ? { fast: sourceThread.config.fast } : {}),
        ...(parsed.title ? { title: parsed.title } : {}),
        ...(parsed.worktree?.enabled
          ? { worktree: parsed.worktree.branch ? { branch: parsed.worktree.branch } : {} }
          : {}),
      });
    },
    send_to_thread: async (args, ctx) => {
      const { threadId, message, interruptFirst } = sendArgsSchema.parse(args);
      const thread = requireThread(ctx, threadId);
      if (interruptFirst) assertNotSelf(ctx, threadId, "interrupt");
      // Fast path: the thread has a live runtime session, so deliver directly.
      // If the session is gone (stopped/unloaded/supervisor restart) the
      // supervisor throws `Unknown thread session`; fall through to resume.
      try {
        if (interruptFirst) await ctx.supervisor.interruptThread({ threadId });
        await ctx.supervisor.sendThreadInput({ threadId, prompt: message, config: thread.config });
        return { threadId, delivered: true, interruptedFirst: interruptFirst === true };
      } catch (error) {
        if (!isUnknownSessionError(error)) throw error;
      }
      // No live session — resume the thread the same way the app revives an
      // inactive thread (startThread with the persisted config + sessionRef),
      // delivering the message as the resumed session's first input.
      if (!thread.sessionRef && !thread.canResumeWithConfig) {
        throw new Error(
          `Thread ${threadId} has no live or resumable session, so it cannot receive a message. ` +
            "Use create_thread to start a new thread instead.",
        );
      }
      await ctx.supervisor.startThread(buildResumeStartPayload(ctx, thread, message));
      return { threadId, delivered: true, resumed: true, interruptedFirst: false };
    },
    interrupt_thread: async (args, ctx) => {
      const { threadId } = threadIdArgsSchema.parse(args);
      requireThread(ctx, threadId);
      assertNotSelf(ctx, threadId, "interrupt");
      await ctx.supervisor.interruptThread({ threadId });
      return { threadId, interrupted: true };
    },
    stop_thread: async (args, ctx) => {
      const { threadId } = threadIdArgsSchema.parse(args);
      requireThread(ctx, threadId);
      assertNotSelf(ctx, threadId, "stop");
      await ctx.supervisor.closeThread({ threadId });
      return { threadId, stopped: true };
    },
    wait_for_thread: async (args, ctx) => {
      const { threadIds, timeoutSeconds } = waitArgsSchema.parse(args);
      for (const threadId of threadIds) {
        requireThread(ctx, threadId);
        assertNotSelf(ctx, threadId, "wait on");
      }
      const timeoutMs = (timeoutSeconds ?? WAIT_DEFAULT_SECONDS) * 1_000;
      const poll = () => {
        const snap = waitSnapshot(ctx, threadIds);
        return snap.settled.length > 0 ? snap : undefined;
      };
      const settled = await ctx.threadStates.waitUntil(threadIds, timeoutMs, poll, 1_000);
      if (settled) return { timedOut: false, ...settled };
      return { timedOut: true, ...waitSnapshot(ctx, threadIds) };
    },
    update_thread: (args, ctx) => {
      const parsed = updateArgsSchema.parse(args);
      requireThread(ctx, parsed.threadId);
      const applied: string[] = [];
      // Persist every mutation before mirroring it to the renderer. The
      // renderer periodically writes a complete dbSyncAll snapshot, so a stale
      // renderer must not be the only owner of an MCP-issued update.
      const rowMutations: Array<(thread: Thread) => Thread> = [];
      let deliveredToRenderer = true;
      const threadId = parsed.threadId;
      const stamp = (): string => new Date().toISOString();
      // Apply one optional metadata field: mirror it to the renderer and queue
      // the matching row mutation. Skipped when the field was not provided.
      const applyField = <T>(
        value: T | undefined,
        label: string,
        build: (value: T) => { command: RemoteThreadCommand; mutate: (thread: Thread) => Thread },
      ): void => {
        if (value === undefined) return;
        const { command, mutate } = build(value);
        if (!ctx.emitRemoteThreadCommand(command)) deliveredToRenderer = false;
        rowMutations.push(mutate);
        applied.push(label);
      };

      // Ordered so `applied` preserves rename→group→done→starred→archived.
      applyField(parsed.rename, "rename", (title) => ({
        command: { kind: "rename", threadId, title },
        mutate: (thread) => ({ ...thread, title, updatedAt: stamp() }),
      }));
      applyField(parsed.group, "group", (group) => ({
        command: { kind: "set-group", threadId, groupId: group, groupName: group },
        mutate: (thread) => ({ ...thread, groupId: group, groupName: group }),
      }));
      applyField(parsed.done, "done", (done) => ({
        command: { kind: "set-done", threadId, done },
        mutate: (thread) =>
          done
            ? { ...thread, done: true, doneAt: stamp(), starred: false }
            : { ...thread, done: false, doneAt: undefined },
      }));
      applyField(parsed.starred, "starred", (starred) => ({
        command: { kind: "set-starred", threadId, starred },
        mutate: (thread) => ({ ...thread, starred }),
      }));
      applyField(parsed.archived, "archived", (archived) => ({
        command: { kind: archived ? "archive" : "unarchive", threadId },
        mutate: (thread) => ({ ...thread, archived, updatedAt: stamp() }),
      }));
      if (parsed.acknowledge) {
        const command: RemoteThreadCommand = { kind: "acknowledge", threadId };
        if (!ctx.emitRemoteThreadCommand(command)) deliveredToRenderer = false;
        // Mirror the renderer/remote-server semantics: acknowledging only clears
        // a finished thread's completion marker (status finished → idle).
        rowMutations.push((thread) =>
          thread.status === "finished" ? { ...thread, status: "idle" } : thread,
        );
        applied.push("acknowledge");
      }
      if (applied.length === 0) {
        throw new Error("Provide at least one field to update.");
      }
      ctx.updateThreadRow(parsed.threadId, (thread) =>
        rowMutations.reduce((next, mutate) => mutate(next), thread),
      );
      if (deliveredToRenderer) return { threadId: parsed.threadId, applied };
      return {
        threadId: parsed.threadId,
        applied,
        note: "No Poracode UI is connected; the update was applied directly to the stored thread row.",
      };
    },
    open_thread: (args, ctx) => {
      const { threadId } = threadIdArgsSchema.parse(args);
      requireThread(ctx, threadId);
      if (ctx.openThreadInUi(threadId)) return { threadId, opened: true };
      return {
        threadId,
        opened: false,
        note: "No Poracode UI is connected, so the thread could not be opened.",
      };
    },
    read_terminal: async (args, ctx) => {
      const { threadId } = threadIdArgsSchema.parse(args);
      requireThread(ctx, threadId);
      const scrollback = await ctx.supervisor.readTerminalScrollback({ threadId });
      if (!scrollback) {
        return {
          threadId,
          note: "This thread has no live terminal session (it is a structured/GUI thread, or its terminal session is not running), so there is no scrollback to read.",
        };
      }
      const truncated = scrollback.length > TERMINAL_SCROLLBACK_MAX_CHARS;
      const text = truncated ? scrollback.slice(-TERMINAL_SCROLLBACK_MAX_CHARS) : scrollback;
      return {
        threadId,
        length: text.length,
        ...(truncated
          ? {
              truncated: true,
              note: `Showing the last ${TERMINAL_SCROLLBACK_MAX_CHARS} characters of the scrollback.`,
            }
          : {}),
        text,
      };
    },
    steer_thread: async (args, ctx) => {
      const { threadId, prompt, clear } = steerArgsSchema.parse(args);
      const thread = requireThread(ctx, threadId);
      assertNotSelf(ctx, threadId, "steer");
      if (clear) {
        await ctx.supervisor.clearPendingSteer({ threadId });
        return { threadId, cleared: true };
      }
      if (!prompt) {
        throw new Error("Provide a prompt to queue, or set clear:true to clear the pending steer.");
      }
      await ctx.supervisor.setPendingSteer({ threadId, prompt, config: thread.config });
      return { threadId, steered: true };
    },
    stage_thread_input: async (args, ctx) => {
      const { threadId, prompt } = stageArgsSchema.parse(args);
      requireThread(ctx, threadId);
      await ctx.supervisor.stageThreadInput({ threadId, prompt });
      return {
        threadId,
        staged: true,
        note: "Text was typed into the thread's composer for the user to review and submit.",
      };
    },
    rollback_thread: async (args, ctx) => {
      const { threadId, numTurns } = rollbackArgsSchema.parse(args);
      const thread = requireThread(ctx, threadId);
      assertNotSelf(ctx, threadId, "roll back");
      await ctx.supervisor.rollbackThreadConversation({
        threadId,
        numTurns,
        config: thread.config,
      });
      return { threadId, rolledBack: true, numTurns };
    },
  },
};

/** True when the supervisor rejected a call because the thread has no live session. */
function isUnknownSessionError(error: unknown): boolean {
  return error instanceof Error && /unknown thread session/i.test(error.message);
}

/**
 * Build the `startThread` payload that resumes an inactive thread, mirroring the
 * app's own resume path (`performInitialThreadLaunch` / `createAppThread`): the
 * persisted config + sessionRef are reused and the message becomes the resumed
 * session's first prompt. The MCP launch snapshot is re-resolved from current
 * settings + the project's overrides, exactly like a fresh launch.
 */
function buildResumeStartPayload(
  ctx: AppControlsToolContext,
  thread: Thread,
  prompt: string,
): StartThreadPayload {
  const project = ctx.getProject(thread.projectId);
  if (!project) {
    throw new Error(
      `Cannot resume thread ${thread.id}: its project ${thread.projectId} no longer exists.`,
    );
  }
  const projectLocation = thread.worktreePath
    ? buildWorktreeLocation(project.location, thread.worktreePath)
    : project.location;
  return {
    threadId: thread.id,
    projectLocation,
    agentKind: thread.agentKind,
    ...(thread.agentInstanceId ? { agentInstanceId: thread.agentInstanceId } : {}),
    config: thread.config,
    prompt,
    initialSize: DEFAULT_TERMINAL_SIZE,
    ...(thread.sessionRef ? { sessionRef: thread.sessionRef } : {}),
    ...(thread.presentationMode ? { presentationMode: thread.presentationMode } : {}),
    ...resolveMcpLaunchSnapshot(ctx.settings.read(), project.mcpServers ?? []),
  };
}

/** Fetch the live runtime snapshots and index them by thread id. */
async function snapshotMap(
  ctx: AppControlsToolContext,
): Promise<Map<string, ThreadRuntimeSnapshot>> {
  try {
    const snapshots = await ctx.supervisor.getThreadSnapshots();
    return new Map(snapshots.map((snapshot) => [snapshot.threadId, snapshot]));
  } catch {
    // A supervisor round-trip failure degrades to DB-only status.
    return new Map();
  }
}

/** Merge a persisted thread row with its live runtime snapshot into a flat view. */
function threadView(
  thread: Thread,
  project: Project | undefined,
  snapshot: ThreadRuntimeSnapshot | undefined,
) {
  const status = snapshot?.status ?? thread.status;
  const attention = snapshot?.attention ?? thread.attention;
  return {
    threadId: thread.id,
    title: thread.title,
    projectId: thread.projectId,
    ...(project ? { projectName: project.name } : {}),
    agentKind: thread.agentKind,
    model: thread.config.model,
    ...(thread.config.effort ? { effort: thread.config.effort } : {}),
    status,
    attention,
    presentationMode: thread.presentationMode ?? "terminal",
    archived: thread.archived,
    done: thread.done,
    starred: thread.starred,
    ...(thread.groupName ? { group: thread.groupName } : {}),
    ...(thread.worktreePath ? { worktreePath: thread.worktreePath } : {}),
    ...(thread.worktreeBranch ? { worktreeBranch: thread.worktreeBranch } : {}),
    ...((snapshot?.errorMessage ?? thread.errorMessage)
      ? { errorMessage: snapshot?.errorMessage ?? thread.errorMessage }
      : {}),
    ...(thread.activeTurnStartedAt ? { activeTurnStartedAt: thread.activeTurnStartedAt } : {}),
    ...(thread.lastTurnStartedAt ? { lastTurnStartedAt: thread.lastTurnStartedAt } : {}),
    ...(thread.lastTurnEndedAt ? { lastTurnEndedAt: thread.lastTurnEndedAt } : {}),
    createdAt: thread.createdAt,
    updatedAt: thread.updatedAt,
  };
}

/** Current status/settled snapshot for a set of thread ids (used by wait_for_thread). */
function waitSnapshot(
  ctx: AppControlsToolContext,
  threadIds: string[],
): { statuses: Record<string, { status: ThreadStatus; attention: string }>; settled: string[] } {
  const statuses: Record<string, { status: ThreadStatus; attention: string }> = {};
  const settled: string[] = [];
  for (const threadId of threadIds) {
    // The live cache reflects the freshest `thread-state`; DB is the fallback
    // for threads that have emitted nothing this session.
    const live = ctx.threadStates.getLiveState(threadId);
    const thread = ctx.getThread(threadId);
    const status = live?.status ?? thread?.status ?? "inactive";
    const attention = live?.attention ?? thread?.attention ?? "none";
    statuses[threadId] = { status, attention };
    if (SETTLED_STATUSES.has(status)) settled.push(threadId);
  }
  return { statuses, settled };
}

/** Best-effort plain-text projection of a persisted runtime item's streams. */
function itemText(item: { streams: Record<string, string> }): string {
  return Object.values(item.streams).join("").trim();
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function threadIdJsonSchema(): Record<string, unknown> {
  return {
    type: "object",
    additionalProperties: false,
    required: ["threadId"],
    properties: { threadId: threadIdProp },
  };
}
