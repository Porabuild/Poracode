import { mkdir } from "node:fs/promises";
import { Buffer } from "node:buffer";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  AgentInfo,
  SessionInboxUser,
  AgentListOutput,
  CommandListOutput,
  ConfigGetOutput,
  FileListOutput,
  FormDetail,
  FormInfo,
  FormListOutput,
  ExperimentalPersistentPtyListOutput,
  IntegrationInfo,
  IntegrationListOutput,
  LocationGetOutput,
  McpListOutput,
  MigrationV1StatusOutput,
  ModelDefaultOutput,
  ModelInfo,
  ModelListOutput,
  OpenCodeEvent,
  PermissionListOutput,
  PermissionReply,
  ProviderInfo,
  ProviderListOutput,
  ProjectListOutput,
  SessionCreateOutput,
  SessionActiveOutput,
  SessionGetOutput,
  SessionInfo,
  SessionInboxListOutput,
  SessionListOutput,
  SessionPromptOutput,
  ServerInfoOutput,
  VcsBaseOutput,
  VcsBranchListOutput,
  VcsDiffOutput,
  VcsGetOutput,
  VcsStatusOutput,
} from "@opencode/client";
import {
  DEFAULT_TERMINAL_SIZE,
  RUNTIME_REQUEST_ITEM_TYPE,
  agentStatusSchema,
  canonicalRequestTypeSchema,
  isThreadTurnActive,
  pendingSteerStateSchema,
  type PendingSteerState,
  goalItemPayloadSchema,
  type GoalItemPayload,
  listProjectTreeResultSchema,
  requestPayloadSchema,
  threadConfigSchema,
  threadStatusSchema,
  type AgentStatus,
  type ProjectLocation,
  type ThreadStatus,
  type Thread,
  type ThreadConfig,
  type RequestPayload,
} from "@/shared/contracts";
import { deriveLocationFromPath } from "@/shared/createProject";
import {
  findCheckpointBeforeUserMessage,
  mintCheckpointOperationKey,
} from "@/shared/checkpointRevert";
import {
  handoffContextInstruction,
  readThreadToolEnabled,
  resolveProviderHandoffStrategy,
  targetGuaranteesReadThreadTool,
} from "@/shared/providerHandoff";
import { resolveComposerMcpScope } from "@/shared/contracts/agent";
import { isHomeProjectId } from "@/shared/homeScope";
import { stripAnsiPreservingLayout } from "@/shared/ansi";
import { assistantDisplayText } from "@/shared/assistantMessageText";
import { hostSupportsThreadLaunchMetadata } from "@/shared/remote/protocol/threadLaunchMetadata";
import { sideChatLaunchInput } from "@/shared/sideChatLaunchInput";
import { projectIdentityKey } from "@/shared/projectIdentity";
import { resolveProjectLocation } from "@/shared/worktree";
import {
  gitBranchListResultSchema,
  gitDiffResultSchema,
  gitProjectSnapshotResultSchema,
  gitStatusResultSchema,
} from "@/shared/contracts/gitResults";
import { readProjectFileResultSchema } from "@/shared/contracts/projectTreeResults";
import type { RemoteAgentStatuses, RemoteProject } from "@/shared/remote";
import { RemoteClientError, type RemoteDesktopClient } from "@/shared/remote/client";
import { remoteThreadsChangedEventSchema } from "@/shared/remote/protocol/resources";
import { isThreadSessionAbsenceRefusal } from "@/shared/threadSessionRefusal";
import { canForkThread } from "@/shared/threadFork";
import { hostSupportsCatalogMutations } from "@/shared/remote/protocol/catalogMutations";
import { getMiniModelId, resolveUtilityTaskConfig } from "@/shared/utilityTaskConfig";
import { resolveUtilitySelection } from "@/shared/utilitySelection";
import type { ModelSelection } from "@/shared/selectionBinding.schemas";
import { resolveNewThreadMcpConfig } from "@/shared/contracts/mcpServer";
import { toolCallPayloadSchema } from "@/shared/contracts/runtimeEvent";
import type { PersistedRuntimeItem } from "@/shared/ipc/schemas";
import {
  TUI_LAST_MODEL_FILE_NAME,
  TUI_LAST_MODEL_VERSION,
  tuiLastModelSchema,
} from "@/shared/tuiBootstrap";
import type { TuiBootstrap } from "../bootstrap";
import { historyMessagePage, historyMessages } from "./history";
import {
  itemId,
  messageId,
  parseSubSessionId,
  permissionId,
  permissionRequestId,
  requestIdFromFormId,
  sessionId,
  subSessionId,
  threadId,
} from "./ids";
import {
  DEFAULT_PERMISSION_OPTIONS,
  selectPermissionOption,
  type PermissionOption,
} from "./permissions";
import {
  ELICITATION_PERMISSION_OPTIONS,
  elicitationReply,
  emptyFormElicitationPayload,
  formAnswerSchema,
  formDismissalForRequest,
  formInfoForRequest,
  formResponseForRequest,
} from "./forms";
import { EventStreamHub, openCodeEvent, type ThreadEventContext } from "./events";
import { z } from "zod";
import { logAdapterDebug, logAdapterError, summarizeAdapterInput } from "./diagnostics";

// Version 1 stays additive; unknown future versions must not be overwritten.
export const LAST_MODEL_VERSION = TUI_LAST_MODEL_VERSION;
const recordSchema = z.record(z.string(), z.unknown());

export function createRouter(input: {
  bootstrap: TuiBootstrap;
  client: RemoteDesktopClient;
  events: EventStreamHub;
  setThreadInterests: (ids: readonly string[]) => void | Promise<void>;
  watchTerminal?: (id: string, onOutput: (data: string) => void) => void;
  unwatchTerminal?: (id: string) => void;
  translate: (event: unknown) => OpenCodeEvent[];
  recordPermissionReply: (threadId: string, requestId: string, reply: PermissionReply) => void;
  recordFormRequest: (threadId: string, requestId: string) => string;
  forgetFormRequest: (threadId: string, requestId: string) => void;
  resetThread: (threadId: string) => void;
  hasActiveRun: (sessionID: string) => boolean;
  registerThreadContext: (threadId: string, context: ThreadEventContext) => void;
}) {
  const sessions = new Map<
    string,
    {
      threadId: string;
      projectId: string;
      agentID?: string;
      providerID?: string;
      model?: string;
      effort?: string;
      fast?: boolean;
      thinking?: boolean;
      contextSize?: string;
      approvalPolicy?: string;
      sandboxMode?: string;
      worktreePath?: string;
      worktreeBranch?: string;
      createdAt?: number;
      remoteStarted?: boolean;
    }
  >();
  const states = new Map<string, ThreadStatus>();
  const pending = new Map<
    string,
    {
      requestId: string;
      threadId: string;
      requestType: z.infer<typeof canonicalRequestTypeSchema>;
      payload: RequestPayload;
      options: PermissionOption[];
      elicitation?: boolean;
    }
  >();
  const pendingRequestKey = (rawThreadId: string, requestId: string) =>
    JSON.stringify([rawThreadId, requestId]);

  // Inbox cache: the host owns one pending-steer slot plus an ordered
  // follow-up queue per thread; we mirror them so the vendored inbox list,
  // cancel, and delivery-change routes can answer without inventing state.
  type InboxState = {
    steer: PendingSteerState | null;
    queue: PendingSteerState[];
    paused: boolean;
    seeded: boolean;
  };
  const inbox = new Map<string, InboxState>();
  // Items we cancelled locally so the host's next drop is reported as
  // cancelled, not delivered.
  const cancelledInboxIds = new Set<string>();
  const inboxKey = (rawThreadId: string, id: string) => `${rawThreadId}${id}`;
  const inboxEntry = (rawThreadId: string) => {
    let entry = inbox.get(rawThreadId);
    if (!entry) {
      entry = { steer: null, queue: [], paused: false, seeded: false };
      inbox.set(rawThreadId, entry);
    }
    return entry;
  };
  const inboxUserItem = (
    rawThreadId: string,
    value: PendingSteerState,
    delivery: "steer" | "queue",
  ): SessionInboxUser => ({
    id: value.id,
    sessionID: sessionId(rawThreadId),
    time: { created: value.stagedAt },
    type: "user",
    payload: {
      text: value.prompt,
      ...(value.segments?.length
        ? {
            files: value.segments
              .filter((segment) => segment.kind === "attachment" || segment.kind === "file")
              .map((segment) => ({
                data: "",
                mime:
                  "mimeType" in segment && segment.mimeType
                    ? segment.mimeType
                    : "application/octet-stream",
                source: { type: "uri" as const, uri: segment.path },
              })),
          }
        : {}),
    },
    delivery,
  });
  const emitInboxEvent = (
    rawThreadId: string,
    type: "session.inbox.enqueued" | "session.inbox.delivered" | "session.inbox.cancelled",
    value: PendingSteerState,
    delivery: "steer" | "queue",
  ) => {
    const sessionID = sessionId(rawThreadId);
    const item = inboxUserItem(rawThreadId, value, delivery);
    const durable = {
      aggregateID: sessionID,
      seq: input.events.nextDurableSequence(sessionID),
      version: 1 as const,
    };
    if (type === "session.inbox.enqueued") {
      input.events.emit(
        openCodeEvent(
          type,
          { sessionID, inboxID: value.id, item },
          { durable, location: { directory: input.bootstrap.directory } },
        ),
      );
      return;
    }
    input.events.emit(
      openCodeEvent(
        type,
        { sessionID, inboxID: value.id },
        { durable, location: { directory: input.bootstrap.directory } },
      ),
    );
  };
  const dropInboxItem = (
    rawThreadId: string,
    value: PendingSteerState,
    delivery: "steer" | "queue",
  ) => {
    const key = inboxKey(rawThreadId, value.id);
    emitInboxEvent(
      rawThreadId,
      cancelledInboxIds.delete(key) ? "session.inbox.cancelled" : "session.inbox.delivered",
      value,
      delivery,
    );
  };
  const updateInboxSteer = (rawThreadId: string, value: unknown) => {
    const entry = inboxEntry(rawThreadId);
    const next = pendingSteerStateSchema.safeParse(value).data ?? null;
    const prev = entry.steer;
    if (prev && (!next || next.id !== prev.id)) dropInboxItem(rawThreadId, prev, "steer");
    if (next && (!prev || prev.id !== next.id)) {
      entry.steer = next;
      emitInboxEvent(rawThreadId, "session.inbox.enqueued", next, "steer");
      return;
    }
    entry.steer = next;
  };
  const updateInboxQueue = (rawThreadId: string, value: unknown) => {
    const entry = inboxEntry(rawThreadId);
    const parsed = z
      .object({ items: z.array(pendingSteerStateSchema), paused: z.boolean().default(false) })
      .safeParse(value);
    const next = parsed.success ? parsed.data.items : [];
    const nextIds = new Set(next.map((item) => item.id));
    const previous = entry.queue.filter((item) => !nextIds.has(item.id));
    for (const item of previous) dropInboxItem(rawThreadId, item, "queue");
    const previousIds = new Set(entry.queue.map((item) => item.id));
    for (const item of next)
      if (!previousIds.has(item.id))
        emitInboxEvent(rawThreadId, "session.inbox.enqueued", item, "queue");
    entry.queue = next;
    if (parsed.success) entry.paused = parsed.data.paused;
  };
  // Seed the queue once per thread on session load; a host that predates the
  // follow-up procedures answers with an error, which stays an empty queue.
  const seedInbox = async (rawThreadId: string) => {
    const entry = inboxEntry(rawThreadId);
    if (entry.seeded) return;
    entry.seeded = true;
    try {
      const queue = await input.client.callRemoteProcedure("getThreadFollowUpQueue", {
        threadId: rawThreadId,
      });
      updateInboxQueue(rawThreadId, queue);
    } catch {
      /* old host without follow-up procedures */
    }
  };

  // Goal state: the host owns it; we mirror the latest goal item per thread
  // for the plugin's status line and palette commands.
  const goals = new Map<string, GoalItemPayload>();
  const goalListeners = new Set<(rawThreadId: string) => void>();
  const recordGoal = (rawThreadId: string, payload: unknown) => {
    const parsed = goalItemPayloadSchema.safeParse(payload);
    if (!parsed.success) return;
    const goal = parsed.data;
    if (goal.action === "cleared" || goal.status === "cancelled") goals.delete(rawThreadId);
    else goals.set(rawThreadId, goal);
    for (const listener of goalListeners) listener(rawThreadId);
  };
  const seedBackgroundTasks = async (rawThreadId: string) => {
    if (backgroundTasks.has(rawThreadId)) return;
    let result: unknown = null;
    try {
      result = await input.client.callRemoteProcedure("readThreadBackgroundTasks", {
        threadId: rawThreadId,
      });
    } catch {
      // Old hosts answer an empty task list.
    }
    const tasks = record(result).tasks;
    backgroundTasks.set(rawThreadId, Array.isArray(tasks) ? tasks.map(record) : []);
  };

  const seedGoal = async (rawThreadId: string) => {
    try {
      const item = await input.client.latestThreadGoalItem(rawThreadId);
      if (item) recordGoal(rawThreadId, item.payload);
    } catch {
      /* older hosts without goal support */
    }
  };
  const goalState = async (session: string) => {
    const goal = goals.get(threadId(session));
    if (!goal || !goal.objective) return undefined;
    return {
      objective: goal.objective,
      status: goal.status ?? "active",
      availableActions: goal.availableActions ?? [],
      ...(goal.tokensUsed !== undefined ? { tokensUsed: goal.tokensUsed } : {}),
      ...(goal.tokenBudget !== undefined ? { tokenBudget: goal.tokenBudget } : {}),
      ...(goal.timeUsedSeconds !== undefined ? { timeUsedSeconds: goal.timeUsedSeconds } : {}),
      ...(goal.lastReason ? { lastReason: goal.lastReason } : {}),
    };
  };
  const controlGoal = async (
    session: string,
    control: { action: "pause" | "resume" | "clear" | "edit"; objective?: string },
  ) => {
    const rawId = threadId(session);
    const goal = goals.get(rawId);
    if (!goal) return { error: "This thread has no goal." };
    if (!goal.availableActions?.includes(control.action))
      return { error: `The current goal can't be ${control.action} right now.` };
    if (control.action === "edit") {
      const objective = control.objective?.trim() ?? "";
      if (objective.length === 0 || objective.length > 4000)
        return { error: "Goal objective must be 1-4000 characters." };
      await input.client.controlThreadGoal({ threadId: rawId, action: "edit", objective });
      return { ok: true as const };
    }
    await input.client.controlThreadGoal({ threadId: rawId, action: control.action });
    return { ok: true as const };
  };
  const subscribeGoal = (listener: (rawThreadId: string) => void) => {
    goalListeners.add(listener);
    return () => {
      goalListeners.delete(listener);
    };
  };
  const goalSupported = async (session: string) => {
    const remote = await cachedThreadById(threadId(session));
    if (!remote) return false;
    try {
      const commands = await input.client.agentSlashCommands(remote.agentKind);
      return commands.commands.some((command) => command.id === "goal");
    } catch {
      return false;
    }
  };
  // Subagent subscriptions: the host buffers a subagent's child events until
  // its task item completes unless a client subscribes. We subscribe while a
  // running subagent's virtual session is open, unsubscribe on completion and
  // on adapter shutdown; failures are debug-log noise only.
  // Worktrees created through this adapter — the first thread to use one
  // sends isNewWorktree so the host runs prepare-worktree setup.
  const createdWorktrees = new Map<string, string>();

  // Pending in-place provider switches per session: picking another provider's
  // model in an existing session stages the switch; the next prompt launches
  // the thread under the target provider through startThread + providerSwitch.
  const pendingSwitches = new Map<string, { providerID: string; modelID: string }>();
  // The latest thread-state's threadMentionToolsAvailable per thread — whether
  // the thread's last session actually resolved the built-in read_thread tool.
  const threadMentionTools = new Map<string, boolean>();

  // User-message item ids for which the adapter captured a file checkpoint,
  // per thread. checkpointRevert's files phase only restores turns whose base
  // user message has one — send paths create it pre-dispatch, turn.completed
  // finalizes against the turn's anchor.
  const capturedCheckpoints = new Map<string, Set<string>>();
  const finalizedAnchors = new Set<string>();
  const captureFileCheckpoint = async (
    rawThreadId: string,
    checkpointItemId: string | undefined,
    projectLocation: unknown,
  ) => {
    if (!checkpointItemId) return;
    const currentProject = await resolveProject();
    if (isHomeProjectId(currentProject.id)) return;
    try {
      await input.client.callRemoteProcedure("createFileCheckpoint", {
        threadId: rawThreadId,
        checkpointItemId,
        projectLocation,
      });
      let captured = capturedCheckpoints.get(rawThreadId);
      if (!captured) {
        captured = new Set();
        capturedCheckpoints.set(rawThreadId, captured);
      }
      captured.add(checkpointItemId);
      if (debug)
        void logAdapterDebug(input.bootstrap.home, {
          source: "checkpoint.create",
          threadId: rawThreadId,
          checkpointItemId,
        });
    } catch (error) {
      if (debug)
        void logAdapterDebug(input.bootstrap.home, {
          source: "file-checkpoint.create",
          threadId: rawThreadId,
          checkpointItemId,
          error: error instanceof Error ? error.message : String(error),
        });
    }
  };
  const reconciling = new Set<string>();
  // `!command` shells: exit resolvers keyed by shellId and the one-shot
  // context stash keyed by session id (cap 3).
  const pendingShellExits = new Map<string, () => void>();
  const pendingShellTimeouts = new Set<string>();
  const shellStash = new Map<string, { command: string; output: string }[]>();
  // Per-session MCP toggles — applied to the next thread launch, never a live
  // restart. Custom MCP definitions and installed plugins are not
  // remote-readable, so only the built-in flags surface here.
  const sessionMcpPending = new Map<string, Map<string, boolean>>();
  // The session the vendored UI is currently on — last viewed or loaded —
  // the implicit target for its session-scoped actions (MCP toggles).
  let currentSession: string | undefined;
  // Desktop parity: after any turn completes, finalize every completed turn
  // whose anchor lacks a checkpoint — hydrating from the host's checkpoint
  // list, not just what this adapter captured in-session.
  const reconcileCheckpoints = async (rawThreadId: string): Promise<number> => {
    if (reconciling.has(rawThreadId)) return 0;
    reconciling.add(rawThreadId);
    try {
      const currentProject = await resolveProject();
      if (isHomeProjectId(currentProject.id)) return 0;
      const remoteThread = await cachedThreadById(rawThreadId);
      const projectLocation = resolveProjectLocation(
        currentProject.location,
        remoteThread?.worktreePath,
      );
      const [listed, completedTurns, items] = await Promise.all([
        input.client.callRemoteProcedure("listFileCheckpoints", {
          threadId: rawThreadId,
          projectLocation,
        }),
        input.client.threadCompletedTurns(rawThreadId),
        listThreadItems(rawThreadId),
      ]);
      const listedRecords = record(listed);
      const checkpointRows = Array.isArray(listedRecords.checkpoints)
        ? listedRecords.checkpoints
        : [];
      const turnRows = Array.isArray(listedRecords.turns) ? listedRecords.turns : [];
      const capturedBases = new Set(
        checkpointRows.map((value) => String(record(value).checkpointItemId ?? "")),
      );
      const finalizedAnchorsHost = new Set(
        turnRows.map((value) => String(record(value).checkpointItemId ?? "")),
      );
      const itemIndex = new Map(items.map((item, index) => [item.id, index]));
      let finalized = 0;
      for (const turn of completedTurns) {
        const anchor = (turn as { anchorItemId?: string | null }).anchorItemId;
        if (typeof anchor !== "string") continue;
        const key = `${rawThreadId}\0${anchor}`;
        if (finalizedAnchors.has(key) || finalizedAnchorsHost.has(anchor)) continue;
        // Base = the nearest user_message at or before the anchor.
        const anchorIndex = itemIndex.get(anchor);
        if (anchorIndex === undefined) continue;
        const base = items
          .slice(0, anchorIndex + 1)
          .findLast((item) => item.type === "user_message")?.id;
        if (!base || !capturedBases.has(base)) continue;
        finalizedAnchors.add(key);
        try {
          await input.client.callRemoteProcedure("finalizeFileCheckpoint", {
            threadId: rawThreadId,
            checkpointItemId: anchor,
            baseCheckpointItemId: base,
            projectLocation,
          });
          finalized += 1;
          if (debug)
            void logAdapterDebug(input.bootstrap.home, {
              source: "checkpoint.finalize",
              threadId: rawThreadId,
              anchorItemId: anchor,
              baseCheckpointItemId: base,
            });
        } catch (error) {
          finalizedAnchors.delete(key);
          if (debug)
            void logAdapterDebug(input.bootstrap.home, {
              source: "checkpoint.finalize",
              threadId: rawThreadId,
              error: error instanceof Error ? error.message : String(error),
            });
        }
      }
      return finalized;
    } catch (error) {
      if (debug)
        void logAdapterDebug(input.bootstrap.home, {
          source: "checkpoint.reconcile",
          threadId: rawThreadId,
          error: error instanceof Error ? error.message : String(error),
        });
      return 0;
    } finally {
      reconciling.delete(rawThreadId);
    }
  };
  // completedTurns lags turn.completed — retry briefly until the new anchor
  // shows up (or nothing needs finalizing).
  const scheduleCheckpointReconcile = (rawThreadId: string) => {
    void (async () => {
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const finalized = await reconcileCheckpoints(rawThreadId);
        if (finalized > 0) return;
        await new Promise((resolve) => setTimeout(resolve, 400));
      }
    })();
  };

  // Agent background tasks per thread, surfaced to the vendored TUI as shells.
  // background_tasks.changed replaces the full list; the store seeds on session
  // load via readThreadBackgroundTasks.
  const backgroundTasks = new Map<string, Record<string, unknown>[]>();
  const shellIdFor = (rawThreadId: string, taskId: string) =>
    `sh_bgt_${rawThreadId.replace(/[^A-Za-z0-9_-]/gu, "_")}__${taskId.replace(/[^A-Za-z0-9_-]/gu, "_")}`;
  const parseShellId = (id: string) => {
    if (!id.startsWith("sh_bgt_")) return undefined;
    const rest = id.slice(7);
    const sep = rest.indexOf("__");
    if (sep <= 0 || sep >= rest.length - 2) return undefined;
    return { rawThreadId: rest.slice(0, sep), taskId: rest.slice(sep + 2) };
  };
  const taskFor = (id: string) => {
    const parsed = parseShellId(id);
    if (!parsed) return undefined;
    const task = (backgroundTasks.get(parsed.rawThreadId) ?? []).find(
      (value) => String(value.taskId ?? "") === parsed.taskId,
    );
    return task ? { task, rawThreadId: parsed.rawThreadId } : undefined;
  };
  const shellInfoFor = (rawThreadId: string, task: Record<string, unknown>, cwd: string) => ({
    id: shellIdFor(rawThreadId, String(task.taskId ?? "")),
    status: "running" as const,
    command: String(task.description ?? ""),
    cwd,
    shell: "",
    file: "",
    metadata: {},
    time: {
      started:
        typeof task.startedAt === "number"
          ? task.startedAt
          : Date.parse(String(task.startedAt ?? "")) || Date.now(),
    },
  });
  const applyBackgroundTasks = (
    rawThreadId: string,
    tasks: Record<string, unknown>[],
    cwd: string,
  ) => {
    const previous = backgroundTasks.get(rawThreadId) ?? [];
    const previousIds = new Set(previous.map((value) => String(value.taskId ?? "")));
    const nextIds = new Set(tasks.map((value) => String(value.taskId ?? "")));
    backgroundTasks.set(rawThreadId, tasks);
    for (const task of tasks) {
      const taskId = String(task.taskId ?? "");
      if (!previousIds.has(taskId))
        input.events.emit(
          openCodeEvent(
            "shell.created",
            { info: shellInfoFor(rawThreadId, task, cwd) } as never,
            {},
          ),
        );
    }
    for (const oldId of previousIds)
      if (!nextIds.has(oldId))
        input.events.emit(
          openCodeEvent("shell.deleted", { id: shellIdFor(rawThreadId, oldId) }, {}),
        );
  };

  const subagentSubscriptions = new Set<string>();
  const subagentKey = (rawThreadId: string, taskItemId: string) => `${rawThreadId}${taskItemId}`;
  const subscribeSubagent = (rawThreadId: string, taskItemId: string) => {
    const key = subagentKey(rawThreadId, taskItemId);
    if (subagentSubscriptions.has(key)) return;
    subagentSubscriptions.add(key);
    void input.client
      .callRemoteProcedure("subagentSubscribe", {
        threadId: rawThreadId,
        parentItemId: taskItemId,
      })
      .catch(async (error) => {
        subagentSubscriptions.delete(key);
        if (debug)
          await logAdapterDebug(input.bootstrap.home, {
            source: "subagent.subscribe",
            error: error instanceof Error ? error.message : String(error),
          });
      });
  };
  const unsubscribeSubagent = (rawThreadId: string, taskItemId: string) => {
    const key = subagentKey(rawThreadId, taskItemId);
    if (!subagentSubscriptions.delete(key)) return;
    void input.client
      .callRemoteProcedure("subagentUnsubscribe", {
        threadId: rawThreadId,
        parentItemId: taskItemId,
      })
      .catch(async (error) => {
        if (debug)
          await logAdapterDebug(input.bootstrap.home, {
            source: "subagent.unsubscribe",
            error: error instanceof Error ? error.message : String(error),
          });
      });
  };
  const disposeSubagentSubscriptions = () => {
    for (const key of [...subagentSubscriptions]) {
      const [rawThreadId, taskItemId] = key.split("");
      if (rawThreadId && taskItemId) unsubscribeSubagent(rawThreadId, taskItemId);
    }
  };

  const goalLine = (session: string) => {
    const goal = goals.get(threadId(session));
    if (!goal?.objective) return undefined;
    const objective =
      goal.objective.length > 60 ? `${goal.objective.slice(0, 57)}...` : goal.objective;
    const tokens =
      goal.tokensUsed !== undefined
        ? ` · ${goal.tokensUsed}${goal.tokenBudget ? `/${goal.tokenBudget}` : ""} tokens`
        : "";
    return `Goal · ${goal.status ?? "active"} · ${objective}${tokens}`;
  };

  // followUpBehavior is a remote setting; fetch once, default steer.
  let followUpBehavior: "steer" | "queue" | undefined;
  const followUpDelivery = async () => {
    if (followUpBehavior) return followUpBehavior;
    try {
      const settings = await input.client.settings();
      followUpBehavior = settings.followUpBehavior === "queue" ? "queue" : "steer";
    } catch {
      followUpBehavior = "steer";
    }
    return followUpBehavior;
  };

  // AI titles: desktop owners title forwarded starts themselves, so the TUI
  // only generates on hosts without a browser panel — plus explicit /rename.
  let hostDescription: { browserPanel?: boolean } | undefined;
  const hostOwnsTitles = async () => {
    if (hostDescription === undefined) {
      hostDescription =
        typeof input.client.describeHost === "function"
          ? await input.client.describeHost().catch(() => ({}))
          : {};
    }
    return hostDescription.browserPanel === true;
  };
  let cachedSettings: Record<string, unknown> | undefined;
  const remoteSettings = async () => {
    if (!cachedSettings) {
      try {
        cachedSettings = record(await input.client.settings());
      } catch {
        cachedSettings = {};
      }
    }
    return cachedSettings;
  };
  const titleGenChoice = async (thread: Thread, location: ProjectLocation) => {
    const settings = await remoteSettings();
    const wsl = location.kind === "wsl";
    const provider = String(settings[wsl ? "wslTitleGenProvider" : "titleGenProvider"] ?? "auto");
    if (provider === "disabled") return { error: "Title generation is disabled in settings." };
    const statuses = await agentStatuses();
    const specific = statuses.find(
      (value) => value.kind === provider && hasGuiAuthentication(value),
    );
    const candidate =
      provider === "auto" || !specific
        ? statuses.find((value) => value.kind === thread.agentKind)
        : specific;
    // The host refuses title generation without a concrete model/effort; the
    // desktop derives them through the shared utility-selection helpers.
    const config = resolveUtilityTaskConfig(candidate, "", "", () => undefined, {
      fallbackModelIds: (agent) => [getMiniModelId(agent)],
      fallbackEfforts: (_agent, _defaults, available) => ["low", available[0]],
    });
    const settingsSelection =
      provider !== "auto" && specific
        ? (settings[wsl ? "wslTitleGenSelection" : "titleGenSelection"] as
            | ModelSelection
            | undefined)
        : undefined;
    const selection = resolveUtilitySelection(
      settingsSelection,
      { model: "", effort: "", fast: false },
      () => ({ model: config.model, effort: config.effort, fast: false }),
    );
    return { agentKind: candidate?.kind ?? thread.agentKind, selection };
  };
  const generateTitle = async (thread: Thread, prompt: string, currentProject: RemoteProject) => {
    const location = resolveProjectLocation(currentProject.location, thread.worktreePath);
    const choice = await titleGenChoice(thread, location);
    if ("error" in choice) throw new Error(choice.error);
    const result = record(
      await input.client.callRemoteProcedure("generateTitle", {
        projectLocation: location,
        agentKind: choice.agentKind,
        prompt,
        selection: choice.selection,
      }),
    );
    const title = String(result.title ?? "");
    if (!title) throw new Error("Title generation returned no title");
    return title;
  };
  const firstPromptText = async (rawThreadId: string) => {
    try {
      const index = await input.client.threadPromptIndex(rawThreadId);
      // A truncated index is newest-first — its oldest listed prompt is not
      // the thread's first, so fall through to the history scan.
      if (!index.truncated) {
        const oldest = index.prompts.reduce((best, entry) =>
          entry.position < best.position ? entry : best,
        );
        if (oldest?.text) return oldest.text;
      }
    } catch {
      /* older hosts lack the prompt index route */
    }
    const items = await listThreadItems(rawThreadId);
    const first = items.find((item) => item.type === "user_message");
    const blocks = Array.isArray(record(first?.payload).content)
      ? (record(first?.payload).content as unknown[])
      : [];
    return blocks
      .flatMap((block) => (record(block).kind === "text" ? [String(record(block).text ?? "")] : []))
      .join("");
  };
  const renameThreadTo = async (rawThreadId: string, title: string) => {
    await input.client.sendThreadCommand({ kind: "rename", threadId: rawThreadId, title });
    const cached = threadCache.get(rawThreadId);
    if (cached) threadCache.set(rawThreadId, { ...cached, title });
  };
  // Auto title after a fresh start: background only, never delays the prompt.
  // Renames only while the title still equals the start-time fallback.
  const autoTitle = (rawThreadId: string, prompt: string, currentProject: RemoteProject) => {
    void (async () => {
      if (await hostOwnsTitles()) return;
      const started = (await listThreads()).find((value) => value.id === rawThreadId);
      if (!started) return;
      const title = await generateTitle(started, prompt, currentProject);
      const current = (await listThreads()).find((value) => value.id === rawThreadId);
      if (!current || current.title !== started.title) return;
      await renameThreadTo(rawThreadId, title);
    })().catch(async (error) => {
      if (debug)
        await logAdapterDebug(input.bootstrap.home, {
          source: "title.auto",
          error: error instanceof Error ? error.message : String(error),
        });
    });
  };
  const threadCache = new Map<string, Thread>();
  let project: RemoteProject | undefined;
  let statuses: RemoteAgentStatuses | undefined;
  let defaultModel: { providerID: string; model: string } | undefined;
  // The vendored client picks the default on first prompt; resolve it lazily
  // here so a fresh profile's first send binds a provider without needing a
  // /api/model/default round-trip first.
  const resolveDefaultModel = async () => {
    if (defaultModel) return defaultModel;
    const settings = await input.client.settings();
    defaultModel = (await agentStatuses()).filter(supportsGui).flatMap((status) => {
      const capabilities = status.capabilities.presentationCapabilities?.gui ?? status.capabilities;
      const models = capabilities.models ?? status.capabilities.models;
      if (models.length === 0) return [];
      return [
        {
          providerID: status.kind,
          model: String(record(settings.agentSettings[status.kind]).model ?? "") || models[0]!.id,
        },
      ];
    })[0];
    return defaultModel;
  };
  let activeProviderID: string | undefined;
  const debug = process.env.PORACODE_TUI_DEBUG === "1";
  const wslLocation =
    deriveLocationFromPath(input.bootstrap.directory, process.platform).kind === "wsl";

  const resolveProject = async () => {
    if (project) return project;
    const page = await input.client.boundedProjectListPage({
      mode: "inventory",
      projectLimit: 100,
    });
    const projects = page.projects;
    if (input.bootstrap.projectId)
      project = projects.find((value) => value.id === input.bootstrap.projectId);
    const location = deriveLocationFromPath(input.bootstrap.directory, process.platform);
    project ??= projects.find(
      (value) =>
        projectIdentityKey(value) ===
        projectIdentityKey({
          location: { ...location, remoteServerId: value.location.remoteServerId },
          remoteServerId: value.remoteServerId,
        }),
    );
    if (!project) {
      const added = await input.client.projectCommand({
        kind: "add-existing",
        path: input.bootstrap.directory,
      });
      project =
        added.project ??
        (await input.client.boundedProjectListPage({ mode: "inventory" })).projects.find(
          (value) => projectIdentityKey(value) === projectIdentityKey({ location }),
        );
    }
    if (!project) throw new Error("The current folder is not registered on the Poracode host");
    return project;
  };

  // The vendored data layer publishes every location-scoped catalog under
  // locationKey(response.location); echo the requested directory so a
  // worktree session finds lists answered for its own location.
  const requestLocation = (url: URL) => ({
    directory:
      url.searchParams.get("location[directory]") ??
      url.searchParams.get("location.directory") ??
      input.bootstrap.directory,
  });

  const agentStatuses = async () => {
    if (!statuses) {
      const fetched = await input.client.agentStatuses({ omitSlashCommands: true });
      statuses ??= fetched;
      if (debug)
        await logAdapterDebug(input.bootstrap.home, {
          source: "agent-statuses-http",
          windows: fetched.windows.map(summarizeAgentStatus),
          wsl: fetched.wsl.map(summarizeAgentStatus),
        });
    }
    const current = statuses;
    return [...current.windows, ...(wslLocation ? current.wsl : [])].filter(
      (status) => status.installed,
    );
  };
  const hasGuiAuthentication = (status: AgentStatus) =>
    (status.presentationAuthStates?.gui ?? status.authState) === "authenticated";

  const emptyStatuses = (): RemoteAgentStatuses => ({
    windows: [],
    wsl: [],
    updatedAt: new Date().toISOString(),
  });

  // A statuses change can unlock Plan and new models — emit the vendored
  // list-refresh events, never resync() (that tears down the event stream
  // and the composer stops submitting).
  const emitProviderRefresh = () => {
    for (const type of [
      "integration.updated",
      "provider.updated",
      "model.updated",
      "agent.updated",
    ] as const)
      input.events.emit(
        openCodeEvent(type, {}, { location: { directory: input.bootstrap.directory } }),
      );
  };
  const statusSignature = (list: AgentStatus[]) => JSON.stringify(list);
  const handleAgentStatusEvent = (value: Record<string, unknown>) => {
    if (value.type === "windows-agent-statuses" || value.type === "wsl-agent-statuses") {
      if (value.type === "wsl-agent-statuses" && !wslLocation) return false;
      const parsed = z.array(agentStatusSchema).safeParse(value.statuses);
      if (!parsed.success) return false;
      const current = statuses ?? emptyStatuses();
      const before = statusSignature(
        value.type === "windows-agent-statuses" ? current.windows : current.wsl,
      );
      statuses =
        value.type === "windows-agent-statuses"
          ? { ...current, windows: parsed.data, updatedAt: new Date().toISOString() }
          : { ...current, wsl: parsed.data, updatedAt: new Date().toISOString() };
      if (debug)
        void logAdapterDebug(input.bootstrap.home, {
          source: value.type,
          statuses: parsed.data.map(summarizeAgentStatus),
        });
      if (statusSignature(parsed.data) !== before) emitProviderRefresh();
      return true;
    }
    if (value.type !== "agent-status-updated") return false;
    const parsed = agentStatusSchema.safeParse(value.status);
    if (!parsed.success) return false;
    const status = parsed.data;
    const isWsl = status.envKind === "wsl";
    if (isWsl && !wslLocation) return false;
    const current = statuses ?? emptyStatuses();
    const field = isWsl ? "wsl" : "windows";
    const previous = current[field];
    const index = previous.findIndex((entry) => entry.kind === status.kind);
    const updated =
      index < 0
        ? [...previous, status]
        : previous.map((entry, currentIndex) => (currentIndex === index ? status : entry));
    const previousSignature = statusSignature(previous);
    statuses = { ...current, [field]: updated, updatedAt: new Date().toISOString() };
    if (debug)
      void logAdapterDebug(input.bootstrap.home, {
        source: value.type,
        statuses: [summarizeAgentStatus(status)],
      });
    if (statusSignature(current[field]) !== previousSignature) emitProviderRefresh();
    return true;
  };

  const projectLocation = (value: RemoteProject): ProjectLocation => value.location;
  const directoryOf = (value: ProjectLocation) =>
    value.kind === "wsl" ? value.uncPath : value.path;

  const toSession = (value: Thread, currentProject: RemoteProject): SessionInfo => {
    const sessionDirectory = value.worktreePath ?? directoryOf(currentProject.location);
    const output = {
      id: sessionId(value.id),
      projectID: currentProject.id,
      agent: value.config.mode === "plan" ? "plan" : "build",
      model: { id: value.config.model, providerID: value.agentKind },
      cost: 0,
      tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
      time: { created: Date.parse(value.createdAt), updated: Date.parse(value.updatedAt) },
      title: value.title,
      // poracode: child threads (isSubAgent) surface as subsessions.
      ...(value.parentThreadId ? { parentID: sessionId(value.parentThreadId) } : {}),
      location: { directory: sessionDirectory },
    } satisfies SessionInfo;
    return output;
  };

  // Virtual read-only subsessions for subagent task items: the canonical
  // tool_call payload carries no child-thread reference, so each subagent item
  // becomes a `ses_<thread>__<item>` session whose messages are the parent's
  // items nested under it via `parentItemId`.
  const listThreadItems = async (rawThreadId: string) => {
    // Pages arrive newest-first (each beforePosition step goes one page
    // older), so reverse page order to get a chronological array.
    const pages: PersistedRuntimeItem[][] = [];
    let beforePosition: number | undefined;
    for (;;) {
      const page = await input.client.threadRuntimeItemsPage({
        threadId: rawThreadId,
        ...(beforePosition !== undefined ? { beforePosition } : {}),
        limit: 500,
      });
      pages.push(page.items);
      if (page.nextCursor == null) break;
      beforePosition = page.nextCursor;
      if (pages.length >= 200) {
        if (debug)
          void logAdapterDebug(input.bootstrap.home, {
            source: "items.page-cap",
            threadId: rawThreadId,
            pages: pages.length,
          });
        break;
      }
    }
    return pages.reverse().flat();
  };

  const isSubAgentItem = (item: PersistedRuntimeItem) =>
    item.type === "tool_call" &&
    toolCallPayloadSchema.safeParse(item.payload).data?.isSubAgent === true;

  // A `ses_<thread>__<item>` id is a live subsession only when no real thread
  // resolves to the same id — real thread ids always win.
  // poracode: desktop terminal-mode threads are hidden in the TUI. A thread's
  // presentation resolves like the renderer model picker: the thread's own
  // field first, then its provider's capability, defaulting to "terminal".
  const presentationOf = (value: Thread, statusList: AgentStatus[]) =>
    value.presentationMode ??
    statusList.find((status) => status.kind === value.agentKind)?.capabilities.presentationMode ??
    "terminal";
  const isGuiThread = (value: Thread, statusList: AgentStatus[]) =>
    presentationOf(value, statusList) === "gui";
  const guiThreads = async () => {
    const threads = await listThreads();
    const statusList =
      typeof input.client.agentStatuses === "function" ? await agentStatuses() : [];
    return threads.filter((value) => isGuiThread(value, statusList));
  };
  // The visibility gates resolve the thread from the cache (kept current by
  // listThreads + refreshChangedThreads) and only fetch on a miss, so hot
  // routes (prompt/interrupt) do not add a host round-trip.
  const cachedThreadById = async (rawId: string) => {
    let hit = threadCache.get(rawId);
    if (!hit && typeof input.client.boundedThreadListPage === "function")
      hit = await findThreadById(rawId);
    return hit;
  };
  const statusListNow = async () =>
    typeof input.client.agentStatuses === "function" ? await agentStatuses() : [];
  const isHiddenThread = async (rawId: string) => {
    const hit = await cachedThreadById(rawId);
    return hit !== undefined && !isGuiThread(hit, await statusListNow());
  };
  const visibleThread = async (rawId: string) => {
    const hit = await cachedThreadById(rawId);
    return hit !== undefined && isGuiThread(hit, await statusListNow()) ? hit : undefined;
  };

  const isLiveSubSession = async (session: string) => {
    const parsed = parseSubSessionId(session);
    if (!parsed) return false;
    const threads = await guiThreads();
    if (threads.some((value) => value.id === threadId(session))) return false;
    const parent = threads.find((value) => value.id === parsed.threadId);
    if (!parent) return false;
    return (await listThreadItems(parent.id)).some(
      (value) => value.id === parsed.itemId && isSubAgentItem(value),
    );
  };

  const toSubSession = (
    parent: Thread,
    item: PersistedRuntimeItem,
    currentProject: RemoteProject,
  ): SessionInfo => {
    const payload = toolCallPayloadSchema.safeParse(item.payload);
    return {
      id: subSessionId(parent.id, item.id),
      projectID: currentProject.id,
      agent: parent.config.mode === "plan" ? "plan" : "build",
      model: { id: parent.config.model, providerID: parent.agentKind },
      cost: 0,
      tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
      time: { created: Date.parse(parent.createdAt), updated: Date.parse(parent.updatedAt) },
      title:
        (payload.success ? (payload.data.title ?? payload.data.name) : undefined) ??
        "Subagent session",
      parentID: sessionId(parent.id),
      location: { directory: directoryOf(currentProject.location) },
    } satisfies SessionInfo;
  };

  const collectThreads = (page: { threads: Thread[] }) => {
    for (const value of page.threads) {
      threadCache.set(value.id, value);
      input.registerThreadContext(value.id, {
        agent: value.config.mode === "plan" ? "plan" : "build",
        providerID: value.agentKind,
        model: value.config.model,
        location: { directory: input.bootstrap.directory },
      });
    }
  };
  const threadListPage = async (continuation?: {
    cursor: string;
    after: unknown;
  }): Promise<{ threads: Thread[]; next?: { cursor: string; after: unknown } }> => {
    const result = await input.client.boundedThreadListPage(
      continuation
        ? {
            mode: "page",
            order: "updated",
            limit: 100,
            cursor: continuation.cursor,
            after: continuation.after as never,
          }
        : { mode: "page", order: "updated", limit: 100 },
    );
    collectThreads(result.page);
    const nextCursor = record(result.page).nextCursor;
    const after = record(result).reads ?? record(result.page).proof;
    return {
      threads: result.page.threads,
      // Only page onward when the host gave a real proof — sending the whole
      // result as `after` breaks the continuation contract.
      ...(typeof nextCursor === "string" && nextCursor && after !== undefined
        ? { next: { cursor: nextCursor, after } }
        : {}),
    };
  };
  const listThreads = async () => (await threadListPage()).threads;
  // Older threads than the newest page are reachable: a cachedThreadById miss
  // pages onward (10 pages of 100) until it hits, so deep threads still open.
  const findThreadById = async (rawId: string) => {
    let continuation: { cursor: string; after: unknown } | undefined;
    for (let page = 0; page < 10; page += 1) {
      const result = await threadListPage(continuation);
      const hit = result.threads.find((value) => value.id === rawId);
      if (hit) return hit;
      continuation = result.next;
      if (!continuation) return undefined;
    }
    return undefined;
  };
  // Opaque vendored cursor: `tp1.` + base64({cursor, after}) — wraps the host's
  // continuation token + the page proof the continuation needs.
  const encodeThreadCursor = (next: { cursor: string; after: unknown }) =>
    `tp1.${Buffer.from(JSON.stringify(next), "utf8").toString("base64url")}`;
  const decodeThreadCursor = (value: string | null) => {
    if (!value?.startsWith("tp1.")) return undefined;
    try {
      return record(JSON.parse(Buffer.from(value.slice(4), "base64url").toString("utf8"))) as {
        cursor: string;
        after: unknown;
      };
    } catch {
      return undefined;
    }
  };

  const rememberPendingRequest = (
    rawThreadId: string,
    requestId: string,
    requestType: unknown,
    payload: unknown,
  ) => {
    const parsedType = canonicalRequestTypeSchema.safeParse(requestType);
    const parsedPayload = requestPayloadSchema.safeParse(payload);
    if (!parsedType.success || !parsedPayload.success) return undefined;
    const options =
      parsedType.data === "tool_user_input"
        ? (parsedPayload.data.options ?? []).map((option) => ({
            optionId: option.optionId,
            name: option.label,
          }))
        : parsedPayload.data.options?.length
          ? parsedPayload.data.options.map((option) => ({
              optionId: option.optionId,
              name: option.label,
            }))
          : DEFAULT_PERMISSION_OPTIONS;
    const saved = {
      requestId,
      threadId: rawThreadId,
      requestType: parsedType.data,
      payload: parsedPayload.data,
      options,
      ...(parsedType.data === "tool_user_input" && emptyFormElicitationPayload(parsedPayload.data)
        ? { elicitation: true as const }
        : {}),
    };
    pending.set(pendingRequestKey(rawThreadId, requestId), saved);
    return saved;
  };

  const permissionItemFor = (
    session: string,
    pendingRequest: Awaited<ReturnType<typeof pendingRequestsForSession>>[number],
  ): PermissionListOutput[number] => {
    const elicitation = pendingRequest.elicitation
      ? emptyFormElicitationPayload(pendingRequest.payload)
      : undefined;
    return {
      id: permissionId(pendingRequest.requestId) as PermissionListOutput[number]["id"],
      sessionID: session,
      action: elicitation ? "elicitation" : pendingRequest.requestType,
      resources: [],
      message: elicitation?.message || pendingRequest.payload.summary,
      metadata: {
        requestType: pendingRequest.requestType,
        options: elicitation
          ? [...ELICITATION_PERMISSION_OPTIONS]
          : pendingRequest.payload.options?.length
            ? pendingRequest.payload.options
            : DEFAULT_PERMISSION_OPTIONS.map(({ optionId, name }) => ({
                optionId,
                label: name,
              })),
      },
    };
  };
  const pendingRequestsForSession = async (session: string) => {
    const rawThreadId = threadId(session);
    if (sessions.get(session)?.remoteStarted === false) return [];
    const page = await input.client
      .threadRuntimeItemsPage({ threadId: rawThreadId, limit: 500 })
      .catch((error: unknown) => {
        if (
          error instanceof RemoteClientError &&
          error.status === 404 &&
          error.code === "thread_not_found"
        )
          return { items: [] };
        throw error;
      });
    const openRequestIds = new Set<string>();
    for (const item of page.items) {
      if (item.type !== RUNTIME_REQUEST_ITEM_TYPE || item.state !== "started") continue;
      const saved = record(item.payload);
      if (typeof saved.requestId !== "string") continue;
      openRequestIds.add(pendingRequestKey(rawThreadId, saved.requestId));
      const request = rememberPendingRequest(
        rawThreadId,
        saved.requestId,
        saved.requestType,
        saved.payload,
      );
      if (request?.requestType === "tool_user_input")
        input.recordFormRequest(rawThreadId, saved.requestId);
    }
    for (const [key, request] of pending) {
      if (request.threadId !== rawThreadId || openRequestIds.has(key)) continue;
      if (request.requestType === "tool_user_input")
        input.forgetFormRequest(rawThreadId, request.requestId);
      pending.delete(key);
    }
    return [...pending.entries()]
      .filter(([, request]) => request.threadId === rawThreadId)
      .map(([, request]) => request);
  };

  const pendingFormRequest = async (session: string, rawFormID: string) => {
    const rawThreadId = threadId(session);
    const requestId = requestIdFromFormId(rawFormID, rawThreadId);
    if (!requestId) return undefined;
    const key = pendingRequestKey(rawThreadId, requestId);
    let request = pending.get(key);
    if (!request) {
      await pendingRequestsForSession(session);
      request = pending.get(key);
    }
    if (!request || request.requestType !== "tool_user_input") return undefined;
    return request;
  };
  const formFromPending = (request: {
    requestId: string;
    threadId: string;
    requestType: z.infer<typeof canonicalRequestTypeSchema>;
    payload: RequestPayload;
  }) =>
    formInfoForRequest({
      type: "request.opened",
      threadId: request.threadId,
      requestId: request.requestId,
      requestType: request.requestType,
      payload: request.payload,
    });

  const sendPrompt = async (session: string, body: Record<string, unknown>) => {
    const currentProject = await resolveProject();
    const raw = sessions.get(session);
    const id = raw?.threadId ?? threadId(session);
    const model = record(body.model);
    const agentID = String(body.agent ?? raw?.agentID ?? "build");
    const providerID = String(
      model.providerID ?? raw?.providerID ?? (await resolveDefaultModel())?.providerID ?? "",
    );
    const selectedModel = String(
      model.id ?? raw?.model ?? body.modelID ?? (await resolveDefaultModel())?.model ?? "",
    );
    const effort = String(model.variant ?? raw?.effort ?? body.effort ?? "");
    const promptPartsSchema = z.array(z.record(z.string(), z.unknown()));
    const messageParts = promptPartsSchema.safeParse(record(body.message).parts);
    const bodyParts = promptPartsSchema.safeParse(body.parts);
    const promptParts = messageParts.success
      ? messageParts.data
      : bodyParts.success
        ? bodyParts.data
        : [];
    const text =
      typeof body.text === "string"
        ? body.text
        : promptParts
            .filter((part) => record(part).type === "text")
            .map((part) => String(record(part).text ?? ""))
            .join("");
    const message = record(body.message);
    const userMessageItemId = itemId(
      String(message.id ?? body.messageID ?? body.id ?? crypto.randomUUID()),
    );
    const selectedStatus = (await agentStatuses()).find((status) => status.kind === providerID);
    if (!selectedStatus || !selectedModel)
      throw new Error("Choose an installed provider and model");
    activeProviderID = providerID;
    const guiCapabilities =
      selectedStatus.capabilities.presentationCapabilities?.gui ?? selectedStatus.capabilities;
    // Files arrive as {uri} entries: `data:` URIs are pasted/inline files
    // uploaded to the host, `file:` URIs are @file mentions that become
    // project-relative file segments (desktop serializeMentions shape).
    const mentionSchema = z.object({
      start: z.number().int().nonnegative(),
      end: z.number().int().nonnegative(),
      text: z.string(),
    });
    const attachmentSchema = z.object({
      uri: z.string().min(1),
      name: z.string().optional(),
      description: z.string().optional(),
      mention: mentionSchema.optional(),
    });
    const attachments = z.array(attachmentSchema).safeParse(body.files ?? body.attachments);
    const MAX_ATTACHMENTS = 8;
    const MAX_ATTACHMENT_BYTES = 4 * 1024 * 1024;
    type FileSegment =
      | { kind: "attachment"; path: string; mimeType: string }
      | { kind: "file"; path: string };
    const parsedFiles: { segment: FileSegment; mention?: z.infer<typeof mentionSchema> }[] = [];
    // Prompt-attached skills — {id:"scope:name", mention:{start,end}} — become
    // skill segments at their mention offsets, removed from the flat prompt.
    const skillRefs = z
      .array(z.object({ id: z.string(), mention: mentionSchema.optional() }))
      .safeParse(body.skills);
    const parsedSkills: {
      segment: {
        kind: "skill";
        name: string;
        provider: string;
        scope: "global" | "project";
        invocation: string;
        path?: string;
        pluginId?: string;
      };
      mention?: z.infer<typeof mentionSchema>;
    }[] = [];
    if (skillRefs.success && skillRefs.data.length > 0) {
      const skillProject = await resolveProject();
      const scanned = await input.client
        .callRemoteProcedure("scanSkills", { projectLocation: skillProject.location })
        .catch(() => null);
      const skillRows = record(scanned).plugins;
      const available = (Array.isArray(skillRows) ? skillRows : []).map((value) => {
        const entry = record(value);
        const name = String(entry.name ?? "");
        const scope = String(entry.scope ?? "project");
        return {
          id: scope + ":" + name,
          name,
          provider: String(entry.provider ?? ""),
          scope,
          invocation: String(entry.invocation ?? entry.name ?? name),
          ...(typeof entry.path === "string" ? { path: entry.path } : {}),
          ...(typeof entry.pluginId === "string" ? { pluginId: entry.pluginId } : {}),
        };
      });
      for (const ref of skillRefs.data) {
        const skill = available.find((value) => value.id === ref.id);
        if (!skill)
          return {
            status: 400,
            error: { code: "invalid_request", message: "Unknown skill " + ref.id + "." },
          };
        parsedSkills.push({
          segment: {
            kind: "skill",
            name: skill.name,
            provider: skill.provider,
            scope: skill.scope === "global" ? "global" : "project",
            invocation: skill.invocation,
            ...(skill.path ? { path: skill.path } : {}),
            ...(skill.pluginId ? { pluginId: skill.pluginId } : {}),
          },
          ...(ref.mention ? { mention: ref.mention } : {}),
        });
      }
    }
    if (body.files !== undefined && !attachments.success)
      return { error: { code: "invalid_request", message: "Malformed files entry" }, status: 400 };
    if (attachments.success && attachments.data.length > 0) {
      if (attachments.data.length > MAX_ATTACHMENTS)
        return {
          error: {
            code: "invalid_request",
            message: `Too many attachments (max ${MAX_ATTACHMENTS})`,
          },
          status: 400,
        };
      const acceptsImages = selectedStatus.capabilities.readsImageAttachmentsFromHost !== false;
      const projectDir = directoryOf(currentProject.location);
      for (const file of attachments.data) {
        const uri = file.uri;
        if (uri.startsWith("data:")) {
          const match = /^data:([^;,]*)(;base64)?,([\s\S]*)$/u.exec(uri);
          if (!match)
            return {
              error: { code: "invalid_request", message: "Malformed data: attachment URI" },
              status: 400,
            };
          const mime = match[1] || "application/octet-stream";
          if (match[2] === undefined)
            return {
              error: {
                code: "invalid_request",
                message: "Only base64-encoded data: URIs are supported",
              },
              status: 400,
            };
          const bytes = Buffer.from(match[3] ?? "", "base64");
          if (bytes.length > MAX_ATTACHMENT_BYTES)
            return {
              error: {
                code: "invalid_request",
                message: `Attachment ${file.name ?? "file"} exceeds ${MAX_ATTACHMENT_BYTES / 1024 / 1024}MB`,
              },
              status: 400,
            };
          if (mime.startsWith("image/") && !acceptsImages)
            return {
              error: {
                code: "invalid_request",
                message: "This provider does not accept image attachments",
              },
              status: 400,
            };
          const uploaded = await input.client.uploadAttachment({
            threadId: id,
            fileName: file.name ?? (mime.startsWith("image/") ? "Image.png" : "file"),
            data: bytes,
          });
          parsedFiles.push({
            segment: { kind: "attachment", path: uploaded, mimeType: mime },
            ...(file.mention ? { mention: file.mention } : {}),
          });
          continue;
        }
        if (uri.startsWith("file:")) {
          let filePath: string;
          try {
            filePath = fileURLToPath(uri);
          } catch {
            return {
              error: { code: "invalid_request", message: `Malformed file: URI ${uri}` },
              status: 400,
            };
          }
          const relativePath = relative(projectDir, filePath).replaceAll("\\", "/");
          // Inside the project it becomes a file-mention segment; outside, the
          // mention text already in the prompt carries the reference.
          if (relativePath !== "" && !relativePath.startsWith("../") && relativePath !== "..")
            parsedFiles.push({
              segment: { kind: "file", path: relativePath },
              ...(file.mention ? { mention: file.mention } : {}),
            });
          continue;
        }
        return {
          error: {
            code: "invalid_request",
            message: `Unsupported attachment URI scheme: ${uri.split(":", 1)[0]}`,
          },
          status: 400,
        };
      }
    }
    // Ordered segments: the host consumes segments instead of the flat text
    // when any are present, so the text has to be woven back in around each
    // mention (desktop serializes chips in prompt order). Files without a
    // mention lead; empty text chunks are dropped. The flat prompt drops only
    // attachment-mention placeholders — @file mention text stays.
    const segments: Array<
      | FileSegment
      | { kind: "text"; content: string }
      | {
          kind: "skill";
          name: string;
          provider: string;
          scope: "global" | "project";
          invocation: string;
          path?: string;
          pluginId?: string;
        }
    > = [];
    let promptText = text;
    if (parsedFiles.length > 0 || parsedSkills.length > 0) {
      for (const file of parsedFiles.filter((entry) => !entry.mention)) segments.push(file.segment);
      for (const skill of parsedSkills.filter((entry) => !entry.mention))
        segments.push(skill.segment);
      const mentioned: {
        segment: FileSegment | (typeof parsedSkills)[number]["segment"];
        mention: z.infer<typeof mentionSchema>;
      }[] = [...parsedFiles, ...parsedSkills].filter(
        (entry): entry is typeof entry & { mention: z.infer<typeof mentionSchema> } =>
          entry.mention !== undefined,
      );
      mentioned.sort((left, right) => left.mention.start - right.mention.start);
      let cursor = 0;
      for (const entry of mentioned) {
        const before = text.slice(cursor, entry.mention.start);
        if (before.trim().length > 0) segments.push({ kind: "text", content: before });
        segments.push(entry.segment);
        cursor = entry.mention.end;
      }
      const tail = text.slice(cursor);
      if (tail.trim().length > 0) segments.push({ kind: "text", content: tail });
      promptText = mentioned
        .filter((entry) => entry.segment.kind === "attachment" || entry.segment.kind === "skill")
        .sort((left, right) => right.mention.start - left.mention.start)
        .reduce(
          (value, entry) => value.slice(0, entry.mention.start) + value.slice(entry.mention.end),
          text,
        )
        .replace(/\s+/g, " ")
        .trim();
    }
    // `!command` output becomes one-shot model context — prepended to the
    // final prompt and segments, once, AFTER the mention rewrite.
    const stashedShell = shellStash.get(session);
    if (stashedShell?.length) {
      const preamble = stashedShell
        .map(
          (entry) =>
            `Shell output the user ran before this message:\n$ ${entry.command}\n${entry.output}`,
        )
        .join("\n\n");
      segments.unshift({ kind: "text", content: `${preamble}\n\n` });
      promptText = `${preamble}\n\n${promptText}`;
      shellStash.delete(session);
    }
    const mode = agentID === "plan" ? "plan" : "agent";
    input.registerThreadContext(id, {
      agent: agentID,
      providerID,
      model: selectedModel,
      location: { directory: directoryOf(currentProject.location) },
    });
    await input.setThreadInterests([id]);
    // Cache-first: the route's visibility gate already refreshed the list
    // when this request needed it; only miss when nothing has listed yet.
    const remoteThread =
      threadCache.get(id) ?? (await listThreads()).find((value) => value.id === id);
    const savedConfigMatches = raw?.providerID === providerID && raw.model === selectedModel;
    const remoteConfigMatches =
      remoteThread?.agentKind === providerID && remoteThread.config.model === selectedModel;
    // Same-provider threads keep their host config (executionEnvironment,
    // MCP/tool overrides, reviewer, importedFrom) — only the fields the TUI
    // owns are overlaid. A model change drops the stale selectionBinding; a
    // different provider starts from an empty base.
    const sameProvider = remoteThread?.agentKind === providerID;
    const base: ThreadConfig | Record<string, never> =
      remoteThread && sameProvider ? remoteThread.config : {};
    const modelChanged = "model" in base && base.model !== selectedModel;
    const { selectionBinding: _droppedBinding, ...baseRest } = base as ThreadConfig;
    const config: ThreadConfig = {
      ...(modelChanged ? baseRest : base),
      model: selectedModel,
      ...(effort ? { effort } : {}),
      ...(savedConfigMatches && raw?.fast !== undefined ? { fast: raw.fast } : {}),
      ...(savedConfigMatches && raw?.thinking !== undefined ? { thinking: raw.thinking } : {}),
      ...(savedConfigMatches && raw?.contextSize ? { contextSize: raw.contextSize } : {}),
      mode,
      approvalPolicy:
        (savedConfigMatches ? raw.approvalPolicy : undefined) ??
        (remoteConfigMatches ? remoteThread?.config.approvalPolicy : undefined) ??
        guiCapabilities.defaultApprovalPolicy ??
        selectedStatus.capabilities.defaultApprovalPolicy,
      sandboxMode:
        (savedConfigMatches ? raw.sandboxMode : undefined) ??
        (remoteConfigMatches ? remoteThread?.config.sandboxMode : undefined) ??
        guiCapabilities.defaultSandboxMode ??
        selectedStatus.capabilities.defaultSandboxMode,
    };
    let switchedProvider = false;
    // Per-session MCP toggles apply at launch — overlay the pending flags
    // and clear them so they fire exactly once per thread start.
    const pendingMcp = sessionMcpPending.get(session) ?? sessionMcpPending.get("");
    if (pendingMcp) {
      const target = config as Record<string, unknown>;
      for (const [server, enabled] of pendingMcp) {
        const field =
          server === "crossagents"
            ? "crossagentMcp"
            : server === "browser"
              ? "browserMcp"
              : server === "chrome"
                ? "chromeMcp"
                : undefined;
        if (field) target[field] = enabled;
        else {
          const overrides = record(target.mcpServerOverrides);
          overrides[server] = enabled;
          target.mcpServerOverrides = overrides;
        }
      }
    }
    const pendingSwitch = pendingSwitches.get(session);
    if (pendingSwitch && remoteThread) {
      // In-place provider switch: relaunch this thread under the target
      // provider — no sessionRef, no ensureRunning.
      const targetStatus = (await agentStatuses()).find(
        (value) => value.kind === pendingSwitch.providerID,
      );
      if (!targetStatus)
        return {
          error: {
            code: "unsupported",
            message: `Provider ${pendingSwitch.providerID} is not installed.`,
          },
          status: 400,
        };
      const switchConfig: ThreadConfig = { ...config };
      const remoteConfig = record(remoteThread.config);
      if (resolveComposerMcpScope(targetStatus.capabilities.mcpScope, "gui") !== "none") {
        for (const key of [
          "crossagentMcp",
          "browserMcp",
          "chromeMcp",
          "mcpServerOverrides",
          "pluginOverrides",
        ])
          if (remoteConfig[key] !== undefined)
            (switchConfig as Record<string, unknown>)[key] = remoteConfig[key];
      }
      // Pending MCP toggles apply after the remote-config carry-over, or the
      // switch silently drops them.
      if (pendingMcp) {
        const target = switchConfig as Record<string, unknown>;
        for (const [server, enabled] of pendingMcp) {
          const field =
            server === "crossagents"
              ? "crossagentMcp"
              : server === "browser"
                ? "browserMcp"
                : server === "chrome"
                  ? "chromeMcp"
                  : undefined;
          if (field) target[field] = enabled;
          else {
            const overrides = record(target.mcpServerOverrides);
            overrides[server] = enabled;
            target.mcpServerOverrides = overrides;
          }
        }
      }
      const switchSettings = await remoteSettings();
      const switchContextStrategy = resolveProviderHandoffStrategy({
        sourcePresentationMode: "gui",
        targetPresentationMode: "gui",
        isMirroredThread: false,
        readThreadToolEnabled: readThreadToolEnabled({
          disabledBuiltInMcpServers: record(switchSettings.disabledBuiltInMcpServers) as never,
          disabledBuiltInMcpTools: record(switchSettings.disabledBuiltInMcpTools) as never,
        }),
        threadResolvedReadThreadTool: threadMentionTools.get(id) === true,
        targetReadThreadToolGuaranteed: targetGuaranteesReadThreadTool(
          targetStatus.capabilities,
          "gui",
        ),
      });
      let switchPrompt = promptText;
      let switchSegments = segments;
      if (switchContextStrategy === "context-file" && remoteThread.sessionRef) {
        const extracted = record(
          await input.client.callRemoteProcedure("extractContext", {
            threadId: id,
            agentKind: remoteThread.agentKind,
            sessionRef: remoteThread.sessionRef,
            projectLocation: resolveProjectLocation(
              currentProject.location,
              remoteThread.worktreePath,
            ),
            ...(remoteThread.worktreePath ? { worktreePath: remoteThread.worktreePath } : {}),
          }),
        );
        const instruction = handoffContextInstruction(
          extracted as unknown as Parameters<typeof handoffContextInstruction>[0],
        );
        const uploaded = await input.client.uploadAttachment({
          threadId: id,
          fileName: "handoff-context.md",
          data: new TextEncoder().encode(String(extracted.summary ?? "")),
        });
        switchPrompt = `${instruction}\n\n${promptText}`;
        switchSegments = [
          { kind: "text", content: `${instruction}\n\n` },
          { kind: "attachment", path: uploaded, mimeType: "text/markdown" },
          { kind: "text", content: "\n\n" },
          ...(segments.length > 0 ? segments : [{ kind: "text" as const, content: promptText }]),
        ];
      }
      const switchRequest = {
        threadId: id,
        projectLocation: resolveProjectLocation(currentProject.location, remoteThread.worktreePath),
        agentKind: pendingSwitch.providerID,
        config: switchConfig,
        prompt: switchPrompt,
        ...(switchSegments.length > 0 ? { segments: switchSegments } : {}),
        ...(userMessageItemId ? { userMessageItemId } : {}),
        initialSize: DEFAULT_TERMINAL_SIZE,
        providerSwitch: {
          fromAgentKind: remoteThread.agentKind,
          handoffItemId: `handoff-${crypto.randomUUID()}`,
          contextStrategy: switchContextStrategy,
        },
      } satisfies Parameters<RemoteDesktopClient["startThread"]>[0];
      try {
        await captureFileCheckpoint(id, userMessageItemId, switchRequest.projectLocation);
        await input.client.startThread(switchRequest);
        sessionMcpPending.delete(session);
        sessionMcpPending.delete("");
      } catch (error) {
        // The pending switch stays — the next prompt retries it.
        const status = (error as { status?: unknown }).status === 409 ? 409 : 500;
        return {
          error: {
            code: status === 409 ? "conflict" : "internal_error",
            message: error instanceof Error ? error.message : "The provider switch failed.",
          },
          status,
        };
      }
      pendingSwitches.delete(session);
      switchedProvider = true;
      input.registerThreadContext(id, {
        agent: config.mode === "plan" ? "plan" : "build",
        providerID: pendingSwitch.providerID,
        model: pendingSwitch.modelID,
        location: {
          directory: directoryOf(
            resolveProjectLocation(currentProject.location, remoteThread.worktreePath),
          ),
        },
      });
    }
    const status = states.get(id);
    if (!switchedProvider && status && isThreadTurnActive(status)) {
      // Delivery: the prompt body's explicit choice wins, then the remote
      // followUpBehavior setting, default steer.
      const delivery =
        body.delivery === "steer" || body.delivery === "queue"
          ? body.delivery
          : await followUpDelivery();
      if (delivery === "queue") {
        try {
          await input.client.callRemoteProcedure("queueThreadFollowUp", {
            threadId: id,
            prompt: promptText,
            config,
            ...(segments.length > 0 ? { segments } : {}),
          });
        } catch (error) {
          if (error instanceof RemoteClientError)
            return {
              error: {
                code: "unsupported",
                message: "This Poracode host can't queue follow-ups.",
              },
              status: 501,
            };
          throw error;
        }
      } else {
        // Desktop parity: decline an open approval before steering so the
        // agent is not left waiting on an answer it cannot get. Form and
        // elicitation requests are not approvals — leave them alone.
        for (const request of await pendingRequestsForSession(session)) {
          if (request.requestType === "tool_user_input") continue;
          const optionId = selectPermissionOption(request.options, "reject");
          if (!optionId) continue;
          try {
            await input.client.resolveRequest({
              threadId: id,
              requestId: request.requestId,
              method: "requestPermission",
              response: { optionId },
            });
          } catch {
            /* the approval may have resolved concurrently */
          }
          input.recordPermissionReply(id, request.requestId, "reject");
          pending.delete(pendingRequestKey(id, request.requestId));
        }
        await input.client.setPendingSteer({
          threadId: id,
          prompt: promptText,
          config,
          ...(segments.length > 0 ? { segments } : {}),
        });
      }
    } else if (remoteThread && !switchedProvider) {
      const sendRequest = {
        threadId: id,
        prompt: promptText,
        config,
        userMessageItemId,
        ...(segments.length > 0 ? { segments } : {}),
      };
      try {
        // File checkpoints are captured by the sending client — checkpointRevert's
        // files phase needs one per turn's base user message.
        await captureFileCheckpoint(
          id,
          userMessageItemId,
          resolveProjectLocation(currentProject.location, remoteThread.worktreePath),
        );
        await input.client.sendThreadInput(sendRequest);
        sessionMcpPending.delete(session);
        sessionMcpPending.delete("");
      } catch (error) {
        await logAdapterError({
          home: input.bootstrap.home,
          method: "POST",
          route: `/api/session/${session}/prompt`,
          input: { hostRequest: sendRequest },
          error,
        });
        if (
          !(error instanceof RemoteClientError) ||
          error.status !== 422 ||
          error.requestMayHaveCommitted !== false ||
          !isThreadSessionAbsenceRefusal(error)
        )
          throw error;
        const latestThread = (await listThreads()).find((value) => value.id === id);
        if (!latestThread)
          throw new Error(
            "This thread can no longer be resumed because it no longer exists on the host.",
            { cause: error },
          );
        if (!latestThread.sessionRef && !latestThread.canResumeWithConfig)
          throw new Error(
            "This thread cannot be resumed because the host has no session reference or resumable configuration.",
            { cause: error },
          );
        const resumeProject =
          latestThread.projectId === currentProject.id
            ? currentProject
            : (
                await input.client.boundedProjectListPage({ mode: "inventory", projectLimit: 100 })
              ).projects.find((value) => value.id === latestThread.projectId);
        if (!resumeProject)
          throw new Error(
            "This thread cannot be resumed because its project location is unavailable.",
            { cause: error },
          );
        const resumeLocation = resolveProjectLocation(
          resumeProject.location,
          latestThread.worktreePath,
        );
        input.registerThreadContext(id, {
          agent: latestThread.config.mode === "plan" ? "plan" : "build",
          providerID: latestThread.agentKind,
          model: latestThread.config.model,
          location: { directory: directoryOf(resumeLocation) },
        });
        const resumeRequest = {
          threadId: id,
          projectLocation: resumeLocation,
          agentKind: latestThread.agentKind,
          ...(latestThread.agentInstanceId
            ? { agentInstanceId: latestThread.agentInstanceId }
            : {}),
          config: latestThread.config,
          prompt: promptText,
          ...(userMessageItemId ? { userMessageItemId } : {}),
          initialSize: DEFAULT_TERMINAL_SIZE,
          ...(latestThread.sessionRef ? { sessionRef: latestThread.sessionRef } : {}),
          ...(latestThread.presentationMode
            ? { presentationMode: latestThread.presentationMode }
            : {}),
        } satisfies Parameters<RemoteDesktopClient["startThread"]>[0];
        try {
          await captureFileCheckpoint(id, userMessageItemId, resumeRequest.projectLocation);
          await input.client.startThread(resumeRequest);
          sessionMcpPending.delete(session);
          sessionMcpPending.delete("");
        } catch (resumeError) {
          await logAdapterError({
            home: input.bootstrap.home,
            method: "POST",
            route: `/api/session/${session}/prompt`,
            input: { hostRequest: resumeRequest, operation: "resume" },
            error: resumeError,
          });
          throw resumeError;
        }
      }
    } else if (!switchedProvider) {
      // Fresh threads get the desktop's standing MCP defaults (Crossagents on
      // by default). No mentions and no implicit client tools.
      const startConfig: ThreadConfig = { ...config };
      const startSettings = await remoteSettings();
      const mcpSettings = record(startSettings.enabledMcpServers);
      const disabledBuiltIn = record(startSettings.disabledBuiltInMcpServers);
      if (Object.keys(mcpSettings).length > 0 || Object.keys(disabledBuiltIn).length > 0) {
        Object.assign(
          startConfig,
          resolveNewThreadMcpConfig(
            {
              enabledMcpServers: mcpSettings as Record<string, boolean>,
              disabledBuiltInMcpServers: disabledBuiltIn as never,
            },
            selectedStatus.capabilities,
            "gui",
            currentProject.location,
          ),
        );
      }
      const startWorktreePath = raw?.worktreePath;
      const startIsNewWorktree = startWorktreePath
        ? createdWorktrees.delete(startWorktreePath)
        : undefined;
      const startRequest = {
        threadId: id,
        projectId: currentProject.id,
        agentKind: providerID,
        config: startConfig,
        prompt: promptText,
        userMessageItemId,
        presentationMode: "gui",
        ...(startWorktreePath ? { worktreePath: startWorktreePath } : {}),
        ...(raw?.worktreeBranch ? { worktreeBranch: raw.worktreeBranch } : {}),
        ...(startIsNewWorktree ? { isNewWorktree: true } : {}),
      } satisfies Parameters<RemoteDesktopClient["startNewThread"]>[0];
      try {
        await captureFileCheckpoint(
          id,
          userMessageItemId,
          resolveProjectLocation(currentProject.location, startRequest.worktreePath),
        );
        await input.client.startNewThread(startRequest);
        sessionMcpPending.delete(session);
        sessionMcpPending.delete("");
        autoTitle(id, text, currentProject);
      } catch (error) {
        await logAdapterError({
          home: input.bootstrap.home,
          method: "POST",
          route: `/api/session/${session}/prompt`,
          input: { hostRequest: startRequest },
          error,
        });
        throw error;
      }
    }
    sessions.set(session, {
      ...raw,
      threadId: id,
      projectId: currentProject.id,
      createdAt: raw?.createdAt ?? Date.now(),
      remoteStarted: true,
      ...(config.approvalPolicy ? { approvalPolicy: config.approvalPolicy } : {}),
      ...(config.sandboxMode ? { sandboxMode: config.sandboxMode } : {}),
    });
    const home = process.env.PORACODE_TUI_HOME;
    if (home) {
      await mkdir(home, { recursive: true });
      const preferencePath = join(home, TUI_LAST_MODEL_FILE_NAME);
      const existingPreference = await Bun.file(preferencePath)
        .json()
        .catch(() => undefined);
      const previous = record(existingPreference);
      if (previous.version === undefined || previous.version === LAST_MODEL_VERSION) {
        await Bun.write(
          preferencePath,
          JSON.stringify(
            tuiLastModelSchema.parse({
              ...previous,
              version: LAST_MODEL_VERSION,
              provider: providerID,
              model: selectedModel,
              ...(config.effort ? { effort: config.effort } : {}),
              ...(config.approvalPolicy ? { approvalPolicy: config.approvalPolicy } : {}),
              ...(config.sandboxMode ? { sandboxMode: config.sandboxMode } : {}),
              updatedAt: new Date().toISOString(),
            }),
          ) + "\n",
        );
      } else if (debug) {
        await logAdapterDebug(home, {
          source: "last-model.write-skipped",
          version: previous.version,
        });
      }
    }
    const output: SessionPromptOutput = {
      id: messageId(userMessageItemId),
      sessionID: session,
      time: { created: Date.now() },
      type: "user",
      payload: { text, files: [], skills: [] },
      delivery: "steer",
    };
    return { data: output };
  };

  const handleRequest = async (request: Request): Promise<Response> => {
    const url = new URL(request.url);
    const method = request.method;
    const path = url.pathname;
    let inputSummary: unknown = {
      queryKeys: [...url.searchParams.keys()],
      contentType: request.headers.get("content-type"),
      contentLength: request.headers.get("content-length"),
      hasBody: request.body !== null,
    };
    const readRequestBody = async () => {
      const body = record(await request.json());
      inputSummary = summarizeAdapterInput(body);
      return body;
    };
    try {
      if (method === "GET" && path === "/api/event") return input.events.subscribe();
      if ((path === "/api/info" || path === "/api/global/health") && method === "GET") {
        const output: ServerInfoOutput = {
          version: input.bootstrap.appVersion,
          pid: process.pid,
          urls: [],
          paths: { tmp: input.bootstrap.home },
        };
        return json(output);
      }
      if (path === "/api/location" && method === "GET") {
        const current = await resolveProject();
        const projectDirectory = directoryOf(projectLocation(current));
        const directory = requestLocation(url).directory;
        const output: LocationGetOutput = {
          directory,
          project: { id: current.id, directory: projectDirectory, canonical: projectDirectory },
        };
        return json(output);
      }
      if (path === "/api/location/reload" && method === "POST") {
        // A location reload refreshes location data only; resyncing the event
        // stream here reconnects the vendored UI mid-session and drops input.
        await resolveProject();
        return new Response(null, { status: 204 });
      }
      if (path === "/api/agent" && method === "GET") {
        await resolveProject();
        const guiStatuses = (await agentStatuses()).filter(supportsGui);
        const buildAgent: AgentInfo = {
          id: "build",
          name: "Build",
          request: { settings: {}, headers: {}, body: {} },
          mode: "primary",
          hidden: false,
          permissions: [],
        };
        const planAgent: AgentInfo = {
          id: "plan",
          name: "Plan",
          request: { settings: {}, headers: {}, body: {} },
          mode: "primary",
          hidden: false,
          permissions: [],
        };
        const data = [
          buildAgent,
          ...(guiStatuses.some((status) => supportsMode(status, "plan")) ? [planAgent] : []),
        ];
        const output: AgentListOutput = {
          location: requestLocation(url),
          data,
        };
        return json(output);
      }
      if (path === "/api/project" && method === "GET") {
        const current = await resolveProject();
        const time = Date.parse(current.createdAt);
        const output: ProjectListOutput = [
          {
            id: current.id,
            canonical: directoryOf(current.location),
            ...(current.name ? { name: current.name } : {}),
            time: { created: time, updated: time, active: time },
            sandboxes: [],
          },
        ];
        return json(output);
      }
      if (path === "/api/provider" && method === "GET") {
        const data: ProviderInfo[] = (await agentStatuses())
          .filter(supportsGui)
          .map((status: AgentStatus) => ({
            id: status.kind,
            ...(hasGuiAuthentication(status) ? { integrationID: status.kind } : {}),
            name: status.label,
            activation: hasGuiAuthentication(status) ? "enabled" : "disabled",
            package: "poracode",
          }));
        const output: ProviderListOutput = {
          location: requestLocation(url),
          data,
        };
        return json(output);
      }
      if (path === "/api/integration" && method === "GET") {
        const data: IntegrationInfo[] = (await agentStatuses())
          .filter(supportsGui)
          .filter(hasGuiAuthentication)
          .map((status) => ({
            id: status.kind,
            name: status.label,
            methods: [],
            connections: [{ type: "env", name: status.kind }],
          }));
        const output: IntegrationListOutput = {
          location: requestLocation(url),
          data,
        };
        return json(output);
      }
      if (path === "/api/model" && method === "GET") {
        const data: ModelInfo[] = (await agentStatuses()).filter(supportsGui).flatMap((status) => {
          const capabilities =
            status.capabilities.presentationCapabilities?.gui ?? status.capabilities;
          const models = capabilities.models ?? status.capabilities.models;
          return models.map((option) => {
            const model: ModelInfo = {
              id: option.id,
              modelID: option.id,
              providerID: status.kind,
              ...(capabilities.modelSubProvider?.[option.id]
                ? { canonical: capabilities.modelSubProvider[option.id] }
                : {}),
              name: option.label,
              capabilities: { tools: true, input: ["text"], output: ["text"] },
              variants: (
                capabilities.modelEfforts?.[option.id] ??
                status.capabilities.modelEfforts[option.id] ??
                capabilities.efforts ??
                status.capabilities.efforts
              ).map((id) => ({ id })),
              time: { released: 0 },
              cost: [],
              status: "active",
              enabled: true,
              limit: { context: 128_000, output: 8_192 },
            };
            return model;
          });
        });
        const output: ModelListOutput = {
          location: requestLocation(url),
          data,
        };
        return json(output);
      }
      if (path === "/api/model/default" && method === "GET") {
        // Provider discovery is asynchronous on a fresh profile — the vendored
        // client fetches this once at mount, so wait briefly for the first
        // GUI-capable provider to appear instead of locking in `data: null`.
        const deadline = Date.now() + 15_000;
        while (!defaultModel && Date.now() < deadline) {
          statuses = await input.client.agentStatuses({ omitSlashCommands: true });
          defaultModel = await resolveDefaultModel();
          if (!defaultModel) await new Promise((resolve) => setTimeout(resolve, 500));
        }
        const agents = (await agentStatuses()).filter(supportsGui);
        const defaultStatus = agents.find((status) => status.kind === defaultModel?.providerID);
        const defaultCapabilities =
          defaultStatus?.capabilities.presentationCapabilities?.gui ?? defaultStatus?.capabilities;
        const data: ModelInfo | null = defaultModel
          ? ({
              id: defaultModel.model,
              modelID: defaultModel.model,
              providerID: defaultModel.providerID,
              name: defaultModel.model,
              capabilities: { tools: true, input: ["text"], output: ["text"] },
              variants: (
                defaultCapabilities?.modelEfforts?.[defaultModel.model] ??
                defaultCapabilities?.efforts ??
                []
              ).map((id) => ({ id })),
              time: { released: 0 },
              cost: [],
              status: "active",
              enabled: true,
              limit: { context: 128_000, output: 8_192 },
            } satisfies ModelInfo)
          : null;
        const output: ModelDefaultOutput = {
          location: requestLocation(url),
          data,
        };
        return json(output);
      }
      if (path === "/api/fs/find" && method === "GET") {
        const current = await resolveProject();
        const limitValue = Number(url.searchParams.get("limit"));
        const limit = Number.isFinite(limitValue) ? Math.max(1, Math.min(200, limitValue)) : 50;
        const result = z
          .object({
            entries: z.array(
              z.object({
                path: z.string(),
                name: z.string(),
                type: z.enum(["file", "directory"]),
              }),
            ),
            totalIndexed: z.number().int().nonnegative(),
          })
          .parse(
            await input.client.callRemoteProcedure("searchProjectFiles", {
              projectLocation: current.location,
              query: url.searchParams.get("query") ?? "",
              limit,
            }),
          );
        const requestedType = url.searchParams.get("type");
        const data = result.entries
          .filter((entry) => requestedType === null || entry.type === requestedType)
          .map((entry) => ({ path: entry.path, type: entry.type }));
        return json({ location: requestLocation(url), data });
      }
      const fileReadMatch = path.match(/^\/api\/fs\/read\/(.+)$/u);
      if (fileReadMatch && method === "GET") {
        const current = await resolveProject();
        const filePath = decodeURIComponent(fileReadMatch[1]!);
        const result = readProjectFileResultSchema.parse(
          await input.client.callRemoteProcedure("readProjectFile", {
            projectLocation: current.location,
            path: filePath,
          }),
        );
        if (result.status === "ready" && result.content !== undefined)
          return new Response(new TextEncoder().encode(result.content), {
            headers: { "content-type": "application/octet-stream" },
          });
        if (result.status === "binary" && result.contentBase64 !== undefined)
          return new Response(Buffer.from(result.contentBase64, "base64"), {
            headers: { "content-type": "application/octet-stream" },
          });
        return json(
          { error: { code: result.status, message: `File content is ${result.status}.` } },
          result.status === "too_large" ? 413 : 415,
        );
      }
      if ((path === "/api/file" || path === "/api/fs/list") && method === "GET") {
        const current = await resolveProject();
        const directoryPath = url.searchParams.get("path") ?? "";
        const result = listProjectTreeResultSchema.parse(
          await input.client.callRemoteProcedure("listProjectTree", {
            projectLocation: current.location,
            directoryPath,
          }),
        );
        const output: FileListOutput = {
          location: requestLocation(url),
          data: result.entries.map((entry) => ({ path: entry.path, type: entry.type })),
        };
        return json(output);
      }
      if (path === "/api/session" && method === "GET") {
        const current = await resolveProject();
        const continuation = decodeThreadCursor(url.searchParams.get("cursor"));
        const page = await threadListPage(continuation);
        const statusList = await statusListNow();
        const data = page.threads
          .filter(
            (value) =>
              isGuiThread(value, statusList) && value.projectId === current.id && !value.archived,
          )
          .map((value) => toSession(value, current));
        if (debug)
          void logAdapterDebug(input.bootstrap.home, {
            source: "session.list",
            projectIdLength: current.id.length,
            sessionCount: data.length,
          });
        const output: SessionListOutput = {
          data,
          cursor: {
            previous: null,
            next: page.next ? encodeThreadCursor(page.next) : null,
          },
        };
        return json(output);
      }
      const inboxMatch = path.match(/^\/api\/session\/([^/]+)\/inbox$/u);
      if (inboxMatch && method === "GET") {
        const rawThreadId = threadId(decodeURIComponent(inboxMatch[1]!));
        await seedInbox(rawThreadId);
        const entry = inboxEntry(rawThreadId);
        const data: SessionInboxListOutput = [
          ...(entry.steer ? [inboxUserItem(rawThreadId, entry.steer, "steer")] : []),
          ...entry.queue.map((item) => inboxUserItem(rawThreadId, item, "queue")),
        ];
        return json({ data });
      }
      const inboxItemMatch = path.match(/^\/api\/session\/([^/]+)\/inbox\/([^/]+)$/u);
      if (inboxItemMatch && method === "DELETE") {
        const rawThreadId = threadId(decodeURIComponent(inboxItemMatch[1]!));
        const inboxID = decodeURIComponent(inboxItemMatch[2]!);
        const entry = inboxEntry(rawThreadId);
        if (entry.steer?.id === inboxID) {
          const dropped = entry.steer;
          const key = inboxKey(rawThreadId, inboxID);
          cancelledInboxIds.add(key);
          try {
            await input.client.clearPendingSteer(rawThreadId);
          } finally {
            if (entry.steer === dropped) entry.steer = null;
            if (cancelledInboxIds.delete(key))
              emitInboxEvent(rawThreadId, "session.inbox.cancelled", dropped, "steer");
          }
        } else {
          const index = entry.queue.findIndex((item) => item.id === inboxID);
          if (index >= 0) {
            const key = inboxKey(rawThreadId, inboxID);
            const dropped = entry.queue[index]!;
            cancelledInboxIds.add(key);
            try {
              await input.client.callRemoteProcedure("removeQueuedThreadFollowUp", {
                threadId: rawThreadId,
                id: inboxID,
              });
            } finally {
              if (entry.queue[index] === dropped) entry.queue.splice(index, 1);
              if (cancelledInboxIds.delete(key))
                emitInboxEvent(rawThreadId, "session.inbox.cancelled", dropped, "queue");
            }
          } else {
            // Neither the current steer nor a queued item — a delivered
            // prompt's inbox id looks exactly like this. 204 as a no-op;
            // never clearPendingSteer blindly or an unrelated steer dies.
            if (debug)
              void logAdapterDebug(input.bootstrap.home, {
                source: "inbox.delete",
                threadId: rawThreadId,
                inboxID,
                resolution: "noop",
              });
          }
        }
        if (debug)
          void logAdapterDebug(input.bootstrap.home, {
            source: "inbox.delete",
            threadId: rawThreadId,
            inboxID,
            resolution:
              entry.steer?.id === inboxID
                ? "steer"
                : entry.queue.some((item) => item.id === inboxID)
                  ? "queue"
                  : "noop",
          });
        return new Response(null, { status: 204 });
      }
      if (inboxItemMatch && method === "PATCH") {
        // session.inbox.update: change a pending item's delivery mode.
        const rawThreadId = threadId(decodeURIComponent(inboxItemMatch[1]!));
        const inboxID = decodeURIComponent(inboxItemMatch[2]!);
        const body = await readRequestBody();
        const delivery =
          body.delivery === "steer" || body.delivery === "queue" ? body.delivery : undefined;
        if (!delivery)
          return json(
            { error: { code: "invalid_request", message: "delivery must be steer or queue" } },
            400,
          );
        const entry = inboxEntry(rawThreadId);
        const sessionID = sessionId(rawThreadId);
        if (delivery === "steer" && entry.queue.some((item) => item.id === inboxID)) {
          await input.client.callRemoteProcedure("steerQueuedThreadFollowUp", {
            threadId: rawThreadId,
            id: inboxID,
          });
          input.events.emit(
            openCodeEvent(
              "session.inbox.delivery.changed",
              { sessionID, inboxID, delivery: "steer" },
              {
                durable: {
                  aggregateID: sessionID,
                  seq: input.events.nextDurableSequence(sessionID),
                  version: 1 as const,
                },
                location: { directory: input.bootstrap.directory },
              },
            ),
          );
        } else if (delivery === "queue" && entry.steer?.id === inboxID) {
          const item = entry.steer;
          const remoteThread = await cachedThreadById(rawThreadId);
          await input.client.clearPendingSteer(rawThreadId);
          await input.client.callRemoteProcedure("queueThreadFollowUp", {
            threadId: rawThreadId,
            prompt: item.prompt,
            ...(item.segments ? { segments: item.segments } : {}),
            config: remoteThread?.config ?? {
              model: sessions.get(sessionID)?.model ?? "",
              mode: "agent" as const,
            },
          });
          entry.steer = null;
          input.events.emit(
            openCodeEvent(
              "session.inbox.delivery.changed",
              { sessionID, inboxID, delivery: "queue" },
              {
                durable: {
                  aggregateID: sessionID,
                  seq: input.events.nextDurableSequence(sessionID),
                  version: 1 as const,
                },
                location: { directory: input.bootstrap.directory },
              },
            ),
          );
        }
        // Same delivery or unknown item: no-op per openapi.
        return new Response(null, { status: 204 });
      }
      if (path === "/api/session" && method === "POST") {
        const body = await readRequestBody();
        const current = await resolveProject();
        const id = String(body.id ?? sessionId(crypto.randomUUID()));
        const model = record(body.model);
        const agentID = typeof body.agent === "string" ? body.agent : "build";
        const providerID = String(model.providerID ?? "");
        const modelID = String(model.id ?? "");
        const effort = typeof model.variant === "string" ? model.variant : undefined;
        const approvalPolicy =
          typeof body.approvalPolicy === "string" ? body.approvalPolicy : undefined;
        const sandboxMode = typeof body.sandboxMode === "string" ? body.sandboxMode : undefined;
        const remoteThreadID = threadId(id);
        if (providerID) activeProviderID = providerID;
        // A session created inside a listed worktree starts its thread there —
        // the host runs prepare-worktree setup via the worktree fields.
        const requestedDirectory = String(record(body.location).directory ?? "");
        let worktreePath: string | undefined;
        let worktreeBranch: string | undefined;
        if (requestedDirectory && requestedDirectory !== directoryOf(current.location)) {
          const listed = record(
            await input.client.callRemoteProcedure("gitListWorktrees", {
              projectLocation: current.location,
            }),
          );
          const match = (Array.isArray(listed.worktrees) ? listed.worktrees : [])
            .map((entry) => record(entry))
            .find((entry) => String(entry.path ?? "") === requestedDirectory);
          if (match) {
            worktreePath = requestedDirectory;
            worktreeBranch = String(match.branch ?? "") || undefined;
          }
        }
        const createdAt = Date.now();
        sessions.set(id, {
          threadId: remoteThreadID,
          projectId: current.id,
          agentID,
          ...(providerID ? { providerID } : {}),
          ...(modelID ? { model: modelID } : {}),
          ...(effort ? { effort } : {}),
          ...(approvalPolicy ? { approvalPolicy } : {}),
          ...(sandboxMode ? { sandboxMode } : {}),
          ...(worktreePath ? { worktreePath } : {}),
          ...(worktreeBranch ? { worktreeBranch } : {}),
          createdAt,
          remoteStarted: false,
        });
        if (providerID && modelID) {
          input.registerThreadContext(remoteThreadID, {
            agent: agentID,
            providerID,
            model: modelID,
            location: { directory: worktreePath ?? directoryOf(current.location) },
          });
        }
        const output = {
          id,
          projectID: current.id,
          agent: agentID,
          ...(providerID && modelID
            ? { model: { id: modelID, providerID, ...(effort ? { variant: effort } : {}) } }
            : {}),
          cost: 0,
          tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
          time: { created: createdAt, updated: createdAt },
          location: { directory: worktreePath ?? input.bootstrap.directory },
        } satisfies SessionCreateOutput;
        return json({ data: output });
      }
      if (path === "/api/session/active" && method === "GET") {
        const output: SessionActiveOutput = {};
        return json(output);
      }
      const exportMatch = path.match(/^\/api\/experimental\/session\/([^/]+)\/export$/u);
      if (exportMatch && method === "GET") {
        const id = decodeURIComponent(exportMatch[1]!);
        const remoteThread = (await guiThreads()).find((value) => value.id === threadId(id));
        if (!remoteThread) return json({ error: "Unknown session" }, 404);
        return json({ data: await exportSession(id, remoteThread) });
      }
      const sessionOptionsMatch = path.match(/^\/api\/session\/([^/]+)\/options$/u);
      if (sessionOptionsMatch) {
        const id = decodeURIComponent(sessionOptionsMatch[1]!);
        if (method === "GET") return json({ data: await sessionOptions(id) });
        if (method === "POST") {
          const body = await readRequestBody();
          const result = await setSessionOptions(id, {
            approvalPolicy:
              typeof body.approvalPolicy === "string" ? body.approvalPolicy : undefined,
            sandboxMode: typeof body.sandboxMode === "string" ? body.sandboxMode : undefined,
            ...(typeof body.fast === "boolean" ? { fast: body.fast } : {}),
            ...(typeof body.thinking === "boolean" ? { thinking: body.thinking } : {}),
            contextSize: typeof body.contextSize === "string" ? body.contextSize : undefined,
          });
          if ("error" in result) return json({ error: result.error }, result.status);
          return json({ data: true });
        }
      }
      const sessionUpdateMatch = path.match(/^\/api\/session\/([^/]+)$/u);
      if (sessionUpdateMatch && method === "DELETE") {
        const deleteSession = decodeURIComponent(sessionUpdateMatch[1]!);
        if (await isLiveSubSession(deleteSession)) {
          return json(
            {
              error: {
                code: "read_only",
                message: "Subagent transcripts are read-only.",
              },
            },
            400,
          );
        }
        const remoteThread = await visibleThread(threadId(deleteSession));
        if (!remoteThread)
          return json({ error: { code: "not_found", message: "Session not found" } }, 404);
        await input.client.sendThreadCommand({ kind: "delete", threadId: remoteThread.id });
        return new Response(null, { status: 204 });
      }
      const viewMatch = path.match(/^\/api\/session\/([^/]+)\/view$/u);
      if (viewMatch && (method === "POST" || method === "PUT")) {
        currentSession = decodeURIComponent(viewMatch[1]!);
        // session.view: the host only clears a finished marker. Fall back to
        // the cached status so a thread that finished before this TUI
        // connected still clears.
        const viewSession = decodeURIComponent(viewMatch[1]!);
        if (!(await isLiveSubSession(viewSession))) {
          const remoteThread = await visibleThread(threadId(viewSession));
          if (remoteThread && (states.get(remoteThread.id) ?? remoteThread.status) === "finished") {
            await input.client.sendThreadCommand({
              kind: "acknowledge",
              threadId: remoteThread.id,
            });
          }
        }
        return new Response(null, { status: 204 });
      }
      const forkMatch = path.match(/^\/api\/session\/([^/]+)\/fork$/u);
      if (forkMatch && method === "POST") {
        const forkSession = decodeURIComponent(forkMatch[1]!);
        if (await isLiveSubSession(forkSession)) {
          return json(
            {
              error: {
                code: "read_only",
                message: "Subagent transcripts are read-only; fork the parent session instead.",
              },
            },
            400,
          );
        }
        const source = await visibleThread(threadId(forkSession));
        if (!source)
          return json({ error: { code: "not_found", message: "Session not found" } }, 404);
        // `fork` is a catalog command: the host must have advertised
        // capabilities.catalogMutations v1, otherwise it cannot persist the
        // intent truthfully.
        const descriptor =
          typeof input.client.environment === "function"
            ? await input.client.environment()
            : undefined;
        if (!hostSupportsCatalogMutations(descriptor?.capabilities?.catalogMutations))
          return json(
            {
              error: {
                code: "unsupported",
                message: "This Poracode host is too old to fork threads.",
              },
            },
            501,
          );
        const liveStatus = states.get(source.id) ?? source.status;
        const sourcePresentation = presentationOf(source, await statusListNow());
        if (!canForkThread({ presentationMode: sourcePresentation, status: liveStatus }))
          return json(
            {
              error: {
                code: "busy",
                message: "Wait for the current turn to finish before forking.",
              },
            },
            409,
          );
        const body = await readRequestBody();
        let throughItemId: string | undefined;
        if (typeof body.before === "string" && body.before.length > 0) {
          // The host only accepts completed-turn anchors; map the OpenCode
          // message id to its user_message item and pick the last turn that
          // ended before it in the thread's item order.
          const userItemId = itemId(body.before);
          const [items, turns] = await Promise.all([
            listThreadItems(source.id),
            input.client.threadCompletedTurns(source.id),
          ]);
          const positions = new Map(items.map((item, index) => [item.id, index] as const));
          const userIndex = positions.get(userItemId) ?? -1;
          const anchor = turns.findLast((turn) => {
            if (turn.anchorItemId === null) return false;
            const position = positions.get(turn.anchorItemId);
            return position !== undefined && position < userIndex;
          })?.anchorItemId;
          if (!anchor)
            return json(
              {
                error: {
                  code: "invalid_request",
                  message: "Nothing to fork before the first message.",
                },
              },
              400,
            );
          throughItemId = anchor;
        }
        const forkedId = crypto.randomUUID();
        try {
          await input.client.sendThreadCommand(
            {
              kind: "fork",
              threadId: forkedId,
              sourceThreadId: source.id,
              ...(throughItemId ? { throughItemId } : {}),
              title: `${source.title} (fork)`,
            },
            { commandId: crypto.randomUUID() },
          );
        } catch (error) {
          return json(
            {
              error: {
                code: "invalid_request",
                message: error instanceof Error ? error.message : String(error),
              },
            },
            400,
          );
        }
        const forked = (await listThreads()).find((value) => value.id === forkedId);
        if (!forked)
          return json({ error: { code: "not_found", message: "Forked session not found" } }, 404);
        return json({ data: toSession(forked, await resolveProject()) });
      }
      const sessionNoopMatch = path.match(/^\/api\/session\/([^/]+)\/(background|environment)$/u);
      if (sessionNoopMatch && (method === "POST" || method === "PUT")) {
        // Threads keep running on the host; there is no per-session
        // environment to set.
        return new Response(null, { status: 204 });
      }
      if (sessionUpdateMatch && (method === "PATCH" || method === "PUT")) {
        const body = await readRequestBody();
        const remoteThreadID = threadId(decodeURIComponent(sessionUpdateMatch[1]!));
        if (await isHiddenThread(remoteThreadID))
          return json({ error: { code: "not_found", message: "Session not found" } }, 404);
        // Rename and archive/unarchive map to catalog thread-metadata commands.
        if (typeof body.title === "string" && body.title.trim().length > 0)
          await input.client.sendThreadCommand({
            kind: "rename",
            threadId: remoteThreadID,
            title: body.title.trim(),
          });
        if (body.title === "") {
          // Vendored /rename with no input asks for a generated title.
          const remoteThread = await visibleThread(remoteThreadID);
          const currentProject = await resolveProject();
          if (remoteThread) {
            try {
              const generated = await generateTitle(
                remoteThread,
                await firstPromptText(remoteThreadID),
                currentProject,
              );
              await renameThreadTo(remoteThreadID, generated);
            } catch (error) {
              return json(
                {
                  error: {
                    code: "invalid_request",
                    message: error instanceof Error ? error.message : String(error),
                  },
                },
                400,
              );
            }
          }
        }
        if (typeof body.archived === "boolean")
          await input.client.sendThreadCommand({
            kind: body.archived ? "archive" : "unarchive",
            threadId: remoteThreadID,
          });
        // session.update declares 204 + empty (SessionUpdateOutput is void).
        return new Response(null, { status: 204 });
      }
      const terminalMatch = path.match(/^\/api\/experimental\/session\/([^/]+)\/terminal$/u);
      if (terminalMatch && method === "GET") {
        const output: ExperimentalPersistentPtyListOutput = [];
        return json({ data: output });
      }
      const messageGetMatch = path.match(/^\/api\/session\/([^/]+)\/message\/([^/]+)$/u);
      if (messageGetMatch && method === "GET") {
        const id = decodeURIComponent(messageGetMatch[1]!);
        const remoteThread = (await guiThreads()).find((value) => value.id === threadId(id));
        if (!remoteThread)
          return json({ error: { code: "not_found", message: "Session not found" } }, 404);
        const items = await listThreadItems(remoteThread.id);
        const message = historyMessages(remoteThread, items).find(
          (value) => value.id === decodeURIComponent(messageGetMatch[2]!),
        );
        return message
          ? json({ data: message })
          : json({ error: { code: "not_found", message: "Message not found" } }, 404);
      }
      const messageMatch = path.match(/^\/api\/session\/([^/]+)\/message$/u);
      if (messageMatch && method === "GET") {
        const id = decodeURIComponent(messageMatch[1]!);
        const remoteThreads = await guiThreads();
        const remoteThread = remoteThreads.find((value) => value.id === threadId(id));
        if (!remoteThread) {
          // A real thread wins; the virtual parse only applies when no thread
          // matches the decoded id.
          const subSession = parseSubSessionId(id);
          const parent = subSession
            ? remoteThreads.find((value) => value.id === subSession.threadId)
            : undefined;
          if (!parent) return json({ data: [], cursor: { previous: null, next: null } });
          await input.setThreadInterests([parent.id]);
          const parentItems = await listThreadItems(parent.id);
          // A still-running subagent buffers its child events on the host
          // unless a client subscribes — subscribe once while this virtual
          // session is loaded.
          const task = parentItems.find((value) => value.id === subSession?.itemId);
          if (task && task.state !== "completed") subscribeSubagent(parent.id, subSession!.itemId);
          const items = parentItems.filter((value) => value.parentItemId === subSession?.itemId);
          return json({
            data: historyMessages(parent, items),
            cursor: { previous: null, next: null },
          });
        }
        await input.setThreadInterests([threadId(id)]);
        await Promise.all([
          seedInbox(remoteThread.id),
          seedGoal(remoteThread.id),
          seedBackgroundTasks(remoteThread.id),
        ]);
        // Turns completed while the TUI was closed still need their anchors
        // finalized before checkpointRevert can restore them.
        void reconcileCheckpoints(remoteThread.id);
        // The bounded history page carries the persisted context-window
        // occupancy — emit it once on session load so the dock has a value
        // before the next live context.updated.
        const contextUsage = await input.client
          .threadContextUsage?.(remoteThread.id)
          ?.catch(() => null);
        if (contextUsage?.usedTokens) {
          input.events.emit(
            openCodeEvent(
              "session.usage.updated",
              {
                sessionID: id,
                cost: 0,
                tokens: {
                  input: contextUsage.usedTokens,
                  output: 0,
                  reasoning: 0,
                  cache: { read: 0, write: 0 },
                },
              },
              { location: { directory: input.bootstrap.directory } },
            ),
          );
        }
        activeProviderID = remoteThread.agentKind;
        const limit = Math.max(1, Math.min(100, Number(url.searchParams.get("limit")) || 20));
        const cursor = url.searchParams.get("cursor") ?? undefined;
        const output = await historyMessagePage(
          remoteThread,
          limit,
          cursor,
          async (beforePosition, pageSize) => {
            const page = await input.client.threadRuntimeItemsPage({
              threadId: remoteThread.id,
              ...(beforePosition !== undefined ? { beforePosition } : {}),
              limit: pageSize,
              targetTimelineEntryCount: Math.max(1, Math.min(100, limit)),
            });
            if (debug)
              await logAdapterDebug(input.bootstrap.home, {
                source: "message.list.page",
                cursor: beforePosition !== undefined,
                beforePosition: beforePosition ?? null,
                itemCount: page.items.length,
                nextCursor: page.nextCursor,
              });
            return page;
          },
        );
        if (debug)
          await logAdapterDebug(input.bootstrap.home, {
            source: "message.list",
            cursor: cursor !== undefined,
            limit,
            messageCount: output.data.length,
            hasNext: output.cursor.next !== null,
          });
        return json(output);
      }
      const promptMatch = path.match(/^\/api\/session\/([^/]+)\/prompt$/u);
      if (promptMatch && method === "POST") {
        const promptSession = decodeURIComponent(promptMatch[1]!);
        if (await isHiddenThread(threadId(promptSession)))
          return json({ error: { code: "not_found", message: "Session not found" } }, 404);
        if (await isLiveSubSession(promptSession)) {
          return json(
            {
              error: {
                code: "read_only",
                message: "Subagent transcripts are read-only; prompt the parent session instead.",
              },
            },
            400,
          );
        }
        const promptResult = await sendPrompt(promptSession, await readRequestBody());
        if ("error" in promptResult)
          return json(
            { error: promptResult.error },
            "status" in promptResult && typeof promptResult.status === "number"
              ? promptResult.status
              : 400,
          );
        return json(promptResult);
      }
      const compactMatch = path.match(/^\/api\/session\/([^/]+)\/compact$/u);
      if (compactMatch && method === "POST") {
        const compactSession = decodeURIComponent(compactMatch[1]!);
        if (await isLiveSubSession(compactSession))
          return json(
            {
              error: {
                code: "read_only",
                message: "Subagent transcripts are read-only; compact the parent session instead.",
              },
            },
            400,
          );
        const compactThread = await visibleThread(threadId(compactSession));
        if (!compactThread)
          return json({ error: { code: "not_found", message: "Session not found" } }, 404);
        const providerID = compactThread.agentKind;
        let compactAvailable = false;
        try {
          const commands = await input.client.agentSlashCommands(providerID);
          compactAvailable = commands.commands.some((command) => command.id === "compact");
        } catch {
          compactAvailable = false;
        }
        if (!compactAvailable)
          return json(
            {
              error: {
                code: "unsupported",
                message: "This provider has no compact command.",
              },
            },
            400,
          );
        await sendPrompt(compactSession, { text: "/compact" });
        // session.compact declares 200 + SessionInboxCompaction.
        return json({
          data: {
            id: `msg_${crypto.randomUUID()}`,
            sessionID: compactSession,
            time: { created: Date.now() },
            type: "compaction",
            payload: {},
            delivery: "steer",
          },
        });
      }
      const commandMatch = path.match(/^\/api\/session\/([^/]+)\/command$/u);
      if (commandMatch && method === "POST") {
        const session = decodeURIComponent(commandMatch[1]!);
        if (await isHiddenThread(threadId(session)))
          return json({ error: { code: "not_found", message: "Session not found" } }, 404);
        const body = record(await readRequestBody());
        const name = typeof body.name === "string" ? body.name.trim() : "";
        if (!name) throw new Error("A slash command name is required.");
        const args = typeof body.text === "string" ? body.text : "";
        await sendPrompt(session, { text: `/${name}${args ? ` ${args}` : ""}` });
        return new Response(null, { status: 204 });
      }
      const interruptMatch = path.match(/^\/api\/session\/([^/]+)\/interrupt$/u);
      if (interruptMatch && method === "POST") {
        const interruptSession = decodeURIComponent(interruptMatch[1]!);
        if (await isHiddenThread(threadId(interruptSession)))
          return json({ error: { code: "not_found", message: "Session not found" } }, 404);
        if (await isLiveSubSession(interruptSession)) {
          return json(
            {
              error: {
                code: "read_only",
                message:
                  "Subagent transcripts are read-only; interrupt the parent session instead.",
              },
            },
            400,
          );
        }
        const id = threadId(interruptSession);
        // No-op on an idle thread: interrupting an idle host thread can emit a
        // transient thread-state that never settles, and the vendored undo
        // always interrupts before wait/revert.stage.
        const remoteThread = await cachedThreadById(id);
        const liveStatus = states.get(id) ?? remoteThread?.status;
        const turnActive = liveStatus !== undefined && isThreadTurnActive(liveStatus);
        const runActive = input.hasActiveRun(interruptSession);
        if (debug)
          await logAdapterDebug(input.bootstrap.home, {
            source: "session.interrupt",
            threadID: id,
            status: String(states.get(id) ?? remoteThread?.status ?? "unknown"),
            turnActive,
            runActive,
            sent: turnActive || runActive,
          });
        // The generated client declares 200 + SessionInterruptResponse — a
        // bare 204 makes the call throw and aborts the vendored undo flow.
        const sent = turnActive || runActive;
        if (sent) await input.client.interruptThread(id);
        return json({ interrupted: sent });
      }
      const selectionMatch = path.match(/^\/api\/session\/([^/]+)\/(agent|model)$/u);
      if (selectionMatch && method === "POST") {
        const id = decodeURIComponent(selectionMatch[1]!);
        const rawThreadID = threadId(id);
        const body = await readRequestBody();
        const currentProject = await resolveProject();
        const current = sessions.get(id) ?? { threadId: rawThreadID, projectId: currentProject.id };
        if (selectionMatch[2] === "agent") {
          const agentID = String(body.agent ?? "build");
          if (agentID === "plan") {
            const status = (await agentStatuses()).find(
              (value) => value.kind === (current.providerID ?? activeProviderID),
            );
            if (!status || !supportsMode(status, "plan")) {
              return json(
                {
                  error: {
                    code: "unsupported",
                    message: "This provider does not support plan mode.",
                  },
                },
                400,
              );
            }
          }
          sessions.set(id, { ...current, agentID });
          if (current.providerID && current.model) {
            input.registerThreadContext(rawThreadID, {
              agent: agentID,
              providerID: current.providerID,
              model: current.model,
              location: { directory: directoryOf(currentProject.location) },
            });
          }
          return new Response(null, { status: 204 });
        }
        const model = record(body.model);
        const providerID = String(model.providerID ?? current.providerID ?? "");
        const modelID = String(model.id ?? current.model ?? "");
        const effort = typeof model.variant === "string" ? model.variant : undefined;
        if (!providerID || !modelID) throw new Error("Choose an installed provider and model");
        // A model from another provider on an existing thread stages an
        // in-place provider switch; the next prompt carries it.
        const remoteThread = threadCache.get(rawThreadID) ?? (await visibleThread(rawThreadID));
        if (remoteThread && remoteThread.agentKind !== providerID) {
          const switchStatus = states.get(rawThreadID) ?? remoteThread.status;
          if (switchStatus === "launching" || switchStatus === "working")
            return json(
              {
                error: {
                  code: "busy",
                  message: "Wait for the current turn to finish before switching providers.",
                },
              },
              409,
            );
          pendingSwitches.set(id, { providerID, modelID });
          const targetStatus = (await agentStatuses()).find((value) => value.kind === providerID);
          input.events.emit(
            openCodeEvent(
              "tui.toast.show",
              {
                message: `Your next message continues this conversation in ${String(record(targetStatus).label ?? record(targetStatus).name ?? providerID)}.`,
                variant: "info",
              },
              {},
            ),
          );
        } else {
          pendingSwitches.delete(id);
        }
        const updated = {
          ...current,
          providerID,
          model: modelID,
          ...(effort ? { effort } : {}),
        };
        if (current.providerID !== providerID) {
          delete updated.approvalPolicy;
          delete updated.sandboxMode;
        }
        sessions.set(id, updated);
        activeProviderID = providerID;
        input.registerThreadContext(rawThreadID, {
          agent: current.agentID ?? "build",
          providerID,
          model: modelID,
          location: { directory: directoryOf(currentProject.location) },
        });
        return new Response(null, { status: 204 });
      }
      const sessionMatch = path.match(/^\/api\/session\/([^/]+)$/u);
      if (sessionMatch && method === "GET") {
        const sessionID = decodeURIComponent(sessionMatch[1]!);
        currentSession = sessionID;
        const localSession = sessions.get(sessionID);
        if (localSession?.remoteStarted === false) {
          const createdAt = localSession.createdAt ?? Date.now();
          const output = {
            id: sessionID,
            projectID: localSession.projectId,
            agent: localSession.agentID ?? "build",
            ...(localSession.providerID && localSession.model
              ? {
                  model: {
                    id: localSession.model,
                    providerID: localSession.providerID,
                    ...(localSession.effort ? { variant: localSession.effort } : {}),
                  },
                }
              : {}),
            cost: 0,
            tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
            time: { created: createdAt, updated: createdAt },
            location: { directory: input.bootstrap.directory },
          } satisfies SessionInfo;
          if (debug)
            void logAdapterDebug(input.bootstrap.home, {
              source: "session.get-local",
              sessionIDLength: sessionID.length,
            });
          return json({ data: output });
        }
        const id = threadId(sessionID);
        const currentProject = await resolveProject();
        const remoteThreads = await guiThreads();
        const remoteThread = remoteThreads.find((value) => value.id === id);
        if (debug)
          void logAdapterDebug(input.bootstrap.home, {
            source: "session.get",
            threadIDLength: id.length,
            remoteThreadCount: remoteThreads.length,
            found: Boolean(remoteThread),
          });
        if (!remoteThread) {
          // A real thread wins over the virtual-id parse — only fall through to
          // a subsession when no thread matches the decoded id.
          const subSession = parseSubSessionId(sessionID);
          const parent = subSession
            ? remoteThreads.find((value) => value.id === subSession.threadId)
            : undefined;
          const item = parent
            ? (await listThreadItems(parent.id)).find(
                (value) => value.id === subSession?.itemId && isSubAgentItem(value),
              )
            : undefined;
          if (parent && item) {
            return json({ data: toSubSession(parent, item, currentProject) });
          }
          await logAdapterError({
            home: input.bootstrap.home,
            method,
            route: path,
            responseStatus: 404,
            input: inputSummary,
            error: new Error("Session not found"),
          });
          return json({ error: { code: "not_found", message: "Session not found" } }, 404);
        }
        activeProviderID = remoteThread.agentKind;
        const output: SessionGetOutput = toSession(remoteThread, currentProject);
        return json({ data: output });
      }
      const formReplyMatch = path.match(/^\/api\/session\/([^/]+)\/form\/([^/]+)\/reply$/u);
      if (formReplyMatch && method === "POST") {
        const session = decodeURIComponent(formReplyMatch[1]!);
        const formID = decodeURIComponent(formReplyMatch[2]!);
        const pendingRequest = await pendingFormRequest(session, formID);
        if (!pendingRequest)
          return json({ error: { code: "not_found", message: "Form not found" } }, 404);
        const body = record(await readRequestBody());
        const answer = formAnswerSchema.parse(body.answer);
        const runtimeRequest = {
          type: "request.opened" as const,
          threadId: pendingRequest.threadId,
          requestId: pendingRequest.requestId,
          requestType: pendingRequest.requestType,
          payload: pendingRequest.payload,
        };
        const resolution = formResponseForRequest(runtimeRequest, answer);
        input.forgetFormRequest(pendingRequest.threadId, pendingRequest.requestId);
        try {
          await input.client.resolveRequest({
            threadId: pendingRequest.threadId,
            requestId: pendingRequest.requestId,
            method: "requestPermission",
            response: resolution.response,
          });
        } catch (error) {
          input.recordFormRequest(pendingRequest.threadId, pendingRequest.requestId);
          input.events.resync();
          throw error;
        }
        pending.delete(pendingRequestKey(pendingRequest.threadId, pendingRequest.requestId));
        input.events.emit(
          openCodeEvent(
            "form.replied",
            { id: formID as FormInfo["id"], sessionID: session, answer },
            { location: { directory: input.bootstrap.directory } },
          ),
        );
        return new Response(null, { status: 204 });
      }
      const sessionFormMatch = path.match(/^\/api\/session\/([^/]+)\/form$/u);
      if (sessionFormMatch && method === "GET") {
        const session = decodeURIComponent(sessionFormMatch[1]!);
        const requests = await pendingRequestsForSession(session);
        const data = requests.flatMap((pendingRequest) => {
          if (pendingRequest.requestType !== "tool_user_input") return [];
          const form = formFromPending(pendingRequest);
          return form ? [form] : [];
        });
        return json({ data });
      }
      const formMatch = path.match(/^\/api\/session\/([^/]+)\/form\/([^/]+)$/u);
      if (formMatch) {
        const session = decodeURIComponent(formMatch[1]!);
        const formID = decodeURIComponent(formMatch[2]!);
        const pendingRequest = await pendingFormRequest(session, formID);
        if (!pendingRequest)
          return json({ error: { code: "not_found", message: "Form not found" } }, 404);
        if (method === "GET") {
          const form = formFromPending(pendingRequest);
          return form
            ? json({ data: { ...form, state: { status: "pending" } } satisfies FormDetail })
            : json({ error: { code: "not_found", message: "Form not found" } }, 404);
        }
        if (method === "DELETE") {
          const runtimeRequest = {
            type: "request.opened" as const,
            threadId: pendingRequest.threadId,
            requestId: pendingRequest.requestId,
            requestType: pendingRequest.requestType,
            payload: pendingRequest.payload,
          };
          const resolution = formDismissalForRequest(runtimeRequest);
          input.forgetFormRequest(pendingRequest.threadId, pendingRequest.requestId);
          try {
            await input.client.resolveRequest({
              threadId: pendingRequest.threadId,
              requestId: pendingRequest.requestId,
              method: "requestPermission",
              response: resolution.response,
            });
          } catch (error) {
            input.recordFormRequest(pendingRequest.threadId, pendingRequest.requestId);
            input.events.resync();
            throw error;
          }
          pending.delete(pendingRequestKey(pendingRequest.threadId, pendingRequest.requestId));
          input.events.emit(
            openCodeEvent(
              "form.cancelled",
              { id: formID as FormInfo["id"], sessionID: session },
              { location: { directory: input.bootstrap.directory } },
            ),
          );
          return new Response(null, { status: 204 });
        }
      }
      const permissionMatch = path.match(/^\/api\/session\/([^/]+)\/permission\/([^/]+)\/reply$/u);
      if (permissionMatch && method === "POST") {
        const body = await readRequestBody();
        const session = decodeURIComponent(permissionMatch[1]!);
        const rawThreadId = threadId(session);
        const openCodeRequestID = decodeURIComponent(permissionMatch[2]!);
        const resolvedRequestID = permissionRequestId(openCodeRequestID);
        const key = pendingRequestKey(rawThreadId, resolvedRequestID);
        const pendingRequest = pending.get(key);
        if (!pendingRequest) throw new Error("Permission request is no longer available");
        const decisionResult = z.enum(["once", "always", "reject"]).safeParse(body.decision);
        const decision = decisionResult.success ? decisionResult.data : "once";
        if (pendingRequest.elicitation) {
          // Binary accept/decline: "always" collapses to accept because there
          // is no persistent grant to record.
          const structured = emptyFormElicitationPayload(pendingRequest.payload);
          input.recordPermissionReply(
            pendingRequest.threadId,
            resolvedRequestID,
            decision === "reject" ? "reject" : "once",
          );
          await input.client.resolveRequest({
            threadId: pendingRequest.threadId,
            requestId: resolvedRequestID,
            method: "requestPermission",
            response: structured
              ? elicitationReply(structured, decision === "reject")
              : { action: decision === "reject" ? "decline" : "accept" },
          });
          pending.delete(key);
          return new Response(null, { status: 204 });
        }
        const optionId = selectPermissionOption(pendingRequest.options, decision);
        if (!optionId) throw new Error(`The permission does not offer ${decision}`);
        input.recordPermissionReply(pendingRequest.threadId, resolvedRequestID, decision);
        await input.client.resolveRequest({
          threadId: pendingRequest.threadId,
          requestId: resolvedRequestID,
          method: "requestPermission",
          response: { optionId },
        });
        pending.delete(key);
        return new Response(null, { status: 204 });
      }
      const permissionListMatch = path.match(/^\/api\/session\/([^/]+)\/permission$/u);
      if (permissionListMatch && method === "GET") {
        const session = decodeURIComponent(permissionListMatch[1]!);
        const requests = await pendingRequestsForSession(session);
        const output: PermissionListOutput = requests
          .filter(
            (pendingRequest) =>
              pendingRequest.requestType !== "tool_user_input" ||
              pendingRequest.elicitation === true,
          )
          .map((pendingRequest) => permissionItemFor(session, pendingRequest));
        return json(output);
      }
      const permissionGetMatch = path.match(/^\/api\/session\/([^/]+)\/permission\/([^/]+)$/u);
      if (permissionGetMatch && method === "GET") {
        const session = decodeURIComponent(permissionGetMatch[1]!);
        const requests = await pendingRequestsForSession(session);
        const pendingRequest = requests.find(
          (value) => permissionId(value.requestId) === decodeURIComponent(permissionGetMatch[2]!),
        );
        if (!pendingRequest)
          return json(
            { error: { code: "not_found", message: "Permission request not found" } },
            404,
          );
        return json({ data: permissionItemFor(session, pendingRequest) });
      }
      if (path === "/api/vcs" && method === "GET") {
        try {
          const current = await resolveProject();
          const snapshot = gitProjectSnapshotResultSchema.parse(
            await input.client.callRemoteProcedure("gitProjectSnapshot", {
              projectLocation: current.location,
            }),
          );
          const output: VcsGetOutput = {
            location: { directory: input.bootstrap.directory },
            data: {
              ...(snapshot.status?.remoteInfo
                ? { provider: snapshot.status.remoteInfo.platform }
                : {}),
              branch: {
                ...(snapshot.branches?.current ? { current: snapshot.branches.current } : {}),
              },
            },
          };
          return json(output);
        } catch {
          return json({
            location: { directory: input.bootstrap.directory },
            data: { branch: {} },
          } satisfies VcsGetOutput);
        }
      }
      if (path === "/api/vcs/base" && method === "GET")
        return json({
          location: { directory: input.bootstrap.directory },
          data: null,
        } satisfies VcsBaseOutput);
      if (path === "/api/vcs/status" && method === "GET") {
        try {
          const current = await resolveProject();
          const status = gitStatusResultSchema.parse(
            await input.client.callRemoteProcedure("getGitStatus", {
              projectLocation: current.location,
            }),
          );
          const data: VcsStatusOutput["data"] = [...status.staged, ...status.unstaged].map(
            (change) => ({
              file: change.path,
              additions: change.insertions,
              deletions: change.deletions,
              status: gitFileStatus(change.status),
            }),
          );
          return json({ location: { directory: input.bootstrap.directory }, data });
        } catch {
          return json({
            location: { directory: input.bootstrap.directory },
            data: [],
          } satisfies VcsStatusOutput);
        }
      }
      if (path === "/api/vcs/branch" && method === "GET") {
        try {
          const current = await resolveProject();
          const branches = gitBranchListResultSchema.parse(
            await input.client.callRemoteProcedure("gitListBranches", {
              projectLocation: current.location,
              includeRemote: true,
            }),
          );
          const search = url.searchParams.get("search")?.toLowerCase();
          const limitValue = Number(url.searchParams.get("limit"));
          const limit = Number.isFinite(limitValue) ? Math.max(1, Math.min(500, limitValue)) : 100;
          const data = branches.branches
            .map((branch) => branch.name)
            .filter((name) => !search || name.toLowerCase().includes(search))
            .slice(0, limit);
          return json({
            location: { directory: input.bootstrap.directory },
            data,
          } satisfies VcsBranchListOutput);
        } catch {
          return json({
            location: { directory: input.bootstrap.directory },
            data: [],
          } satisfies VcsBranchListOutput);
        }
      }
      if (path === "/api/vcs/diff" && method === "GET") {
        try {
          const current = await resolveProject();
          const mode = url.searchParams.get("mode");
          const result = gitDiffResultSchema.parse(
            await input.client.callRemoteProcedure("getGitDiff", {
              projectLocation: current.location,
              staged: mode === "committed",
            }),
          );
          return json({
            location: { directory: input.bootstrap.directory },
            data: parseGitDiff(result.diff),
          } satisfies VcsDiffOutput);
        } catch {
          return json({
            location: { directory: input.bootstrap.directory },
            data: [],
          } satisfies VcsDiffOutput);
        }
      }
      if (path === "/api/vcs/init" && method === "POST")
        return json(
          {
            error: {
              code: "unsupported",
              message: "VCS initialization is unavailable in this TUI.",
            },
          },
          501,
        );
      if (path === "/api/worktree" && method === "GET") {
        // An old host without gitListWorktrees answers an empty list.
        const output: { directory: string }[] = [];
        try {
          const currentProject = await resolveProject();
          const result = record(
            await input.client.callRemoteProcedure("gitListWorktrees", {
              projectLocation: currentProject.location,
            }),
          );
          for (const entry of Array.isArray(result.worktrees)
            ? (result.worktrees as unknown[])
            : [])
            output.push({ directory: String(record(entry).path ?? "") });
        } catch {
          // Unsupported or unreachable host — the workspace dialog sees none.
        }
        return json(output);
      }
      if (path === "/api/worktree" && method === "POST") {
        const body = record(await readRequestBody());
        const currentProject = await resolveProject();
        const branch =
          String(body.name ?? body.branch ?? "").trim() ||
          `poracode/${currentProject.name.toLowerCase().replace(/[^a-z0-9]+/gu, "-")}-${crypto.randomUUID().slice(0, 4)}`;
        const result = record(
          await input.client.callRemoteProcedure("gitAddWorktree", {
            projectLocation: currentProject.location,
            branch,
            createBranch: true,
          }),
        );
        const directory = String(result.path ?? result.worktree ?? result.directory ?? "");
        if (!directory)
          return json(
            { error: { code: "invalid_request", message: "Worktree creation returned no path" } },
            400,
          );
        createdWorktrees.set(directory, branch);
        return json({ data: { directory } });
      }
      if (path === "/api/worktree/refresh" && method === "POST") {
        try {
          const currentProject = await resolveProject();
          await input.client.callRemoteProcedure("gitListWorktrees", {
            projectLocation: currentProject.location,
          });
        } catch {
          // Refresh is best-effort; unsupported hosts still get 204.
        }
        return new Response(null, { status: 204 });
      }
      const waitMatch = path.match(/^\/api\/(?:experimental\/)?session\/([^/]+)\/wait$/u);
      if (waitMatch && method === "POST") {
        const waitSession = decodeURIComponent(waitMatch[1]!);
        const waitThreadId = threadId(waitSession);
        if (await isHiddenThread(waitThreadId))
          return json({ error: { code: "not_found", message: "Session not found" } }, 404);
        const deadline = Date.now() + 30_000;
        for (;;) {
          const remoteThread = await visibleThread(waitThreadId);
          if (!remoteThread)
            return json({ error: { code: "not_found", message: "Session not found" } }, 404);
          // thread-state can stay stale-active after turn.completed — trust
          // the translator's run state over it.
          if (
            !isThreadTurnActive(states.get(waitThreadId) ?? remoteThread.status) ||
            !input.hasActiveRun(waitSession)
          )
            break;
          if (Date.now() >= deadline)
            return json({ error: { code: "busy", message: "The thread is still working." } }, 409);
          await new Promise((resolve) => setTimeout(resolve, 250));
        }
        return new Response(null, { status: 204 });
      }
      const revertStageMatch = path.match(/^\/api\/session\/([^/]+)\/revert\/stage$/u);
      if (revertStageMatch && method === "POST") {
        const revertSession = decodeURIComponent(revertStageMatch[1]!);
        const rawId = threadId(revertSession);
        if (parseSubSessionId(revertSession))
          return json({ error: { code: "read_only", message: "This session is read-only" } }, 400);
        if (await isHiddenThread(rawId))
          return json({ error: { code: "not_found", message: "Session not found" } }, 404);
        const body = record(await readRequestBody());
        const userItemId = itemId(String(body.messageID ?? ""));
        const items = await listThreadItems(rawId);
        const itemsById = Object.fromEntries(items.map((item) => [item.id, item]));
        const checkpointItemId = findCheckpointBeforeUserMessage(
          items.map((item) => item.id),
          itemsById,
          userItemId,
        );
        if (!checkpointItemId)
          return json(
            {
              error: {
                code: "invalid_request",
                message: "Nothing to undo before the first message.",
              },
            },
            400,
          );
        const result = await input.client.checkpointRevert({
          threadId: rawId,
          checkpointItemId,
          operationKey: mintCheckpointOperationKey(),
        });
        if (debug)
          void logAdapterDebug(input.bootstrap.home, {
            source: "revert.stage",
            threadId: rawId,
            messageID: String(body.messageID ?? ""),
            checkpointItemId,
            result,
          });
        if (result.outcome === "ambiguous")
          return json(
            {
              error: {
                code: "conflict",
                message: "The revert outcome is uncertain — reopen the thread to check.",
              },
            },
            409,
          );
        if (result.outcome === "failed")
          return json(
            {
              error: {
                code: "invalid_request",
                message: "Can't restore files for that turn (no checkpoint was captured.)",
              },
            },
            400,
          );
        // session.revert.stage declares 200 + SessionRevert — the vendored
        // undo prefills the prompt from the staged message.
        return json({ data: { messageID: String(body.messageID ?? "") } });
      }
      const revertEndMatch = path.match(/^\/api\/session\/([^/]+)\/revert\/(commit|clear)$/u);
      if (revertEndMatch && method === "POST") {
        // commit and clear both declare 204 + empty — Poracode reverts are
        // final, so clearing is a no-op rather than a redo.
        return new Response(null, { status: 204 });
      }
      // The generated client sends revert.clear as DELETE /session/{id}/revert.
      const revertDeleteMatch = path.match(/^\/api\/session\/([^/]+)\/revert$/u);
      if (revertDeleteMatch && method === "DELETE") return new Response(null, { status: 204 });
      // Background tasks surface as vendored shells. Only the last progress
      // snapshot is available — output pages read it as a byte range.
      if (path === "/api/shell" && method === "GET") {
        const currentProject = await resolveProject();
        const cwd = directoryOf(currentProject.location);
        const output: unknown[] = [];
        for (const thread of await guiThreads())
          for (const task of backgroundTasks.get(thread.id) ?? [])
            output.push(shellInfoFor(thread.id, task, cwd));
        return json({ location: requestLocation(url), data: output });
      }
      // Vendored MCP surface: the three built-in toggles only — custom MCP
      // definitions and installed plugins are not remote-readable (the host
      // settings the client can't see own them), so they aren't listed.
      if (path === "/api/mcp" && method === "GET") {
        const settings = await remoteSettings();
        const disabled = new Set(
          Array.isArray(settings.disabledBuiltInMcpServers)
            ? (settings.disabledBuiltInMcpServers as unknown[]).map(String)
            : [],
        );
        const builtIns = [
          ["crossagents", "crossagentMcp"],
          ["browser", "browserMcp"],
          ["chrome", "chromeMcp"],
        ] as const;
        const sessionID = currentSession ?? "";
        const pendingList = sessionMcpPending.get(sessionID) ?? sessionMcpPending.get("");
        const data: McpListOutput["data"] = [];
        for (const [id] of builtIns) {
          if (disabled.has(id)) continue;
          const enabled = pendingList?.get(id) ?? true;
          data.push({ name: id, status: { status: enabled ? "connected" : "disabled" } });
        }
        const output: McpListOutput = { location: requestLocation(url), data };
        return json(output);
      }
      const mcpToggleMatch = path.match(
        /^\/api\/experimental\/mcp\/([^/]+)\/(connect|disconnect)$/u,
      );
      if (mcpToggleMatch && method === "POST") {
        const server = decodeURIComponent(mcpToggleMatch[1]!);
        const enabled = mcpToggleMatch[2] === "connect";
        // The vendored dialog sends no session — apply to the last-viewed
        // session; "" = location default for the next new thread.
        const sessionID = currentSession ?? "";
        let pendingToggle = sessionMcpPending.get(sessionID);
        if (!pendingToggle) {
          pendingToggle = new Map();
          sessionMcpPending.set(sessionID, pendingToggle);
        }
        pendingToggle.set(server, enabled);
        const remoteThread = sessionID ? await visibleThread(threadId(sessionID)) : undefined;
        const status = remoteThread
          ? (states.get(remoteThread.id) ?? remoteThread.status)
          : undefined;
        if (status !== undefined && isThreadTurnActive(status))
          input.events.emit(
            openCodeEvent(
              "tui.toast.show",
              { message: "Applies the next time this thread starts.", variant: "info" },
              { location: { directory: input.bootstrap.directory } },
            ),
          );
        return new Response(null, { status: 204 });
      }
      // Vendored skill palette — host-scanned skills for this project.
      if (path === "/api/skill" && method === "GET") {
        const skillProject = await resolveProject();
        const scanned = await input.client
          .callRemoteProcedure("scanSkills", { projectLocation: skillProject.location })
          .catch(() => null);
        const plugins = record(scanned).plugins;
        const data = (Array.isArray(plugins) ? plugins : []).map((value) => {
          const entry = record(value);
          const name = String(entry.name ?? "");
          const scope = String(entry.scope ?? "project");
          return {
            id: `${scope}:${name}`,
            name,
            description: String(entry.description ?? entry.name ?? ""),
            ...(typeof entry.path === "string" ? { path: entry.path } : {}),
            scope,
          };
        });
        return json({ location: requestLocation(url), data });
      }
      // `!command` — a one-off host dev shell, never a local spawn. PTY bytes
      // stream over the watched-terminal socket seam; the vendored UI reads
      // the rendered bash part, the next prompt carries the output as context.
      const sessionShellMatch = path.match(/^\/api\/session\/([^/]+)\/shell$/u);
      if (sessionShellMatch && method === "POST") {
        const shellSession = decodeURIComponent(sessionShellMatch[1]!);
        const body = record(await request.json().catch(() => ({})));
        const command = String(body.command ?? "").trim();
        if (!command)
          return json(
            { error: { code: "invalid_request", message: "A command is required." } },
            400,
          );
        if (await isLiveSubSession(shellSession))
          return json(
            { error: { code: "read_only", message: "Subagent transcripts are read-only." } },
            400,
          );
        const remoteThread = await visibleThread(threadId(shellSession));
        if (!remoteThread)
          return json({ error: { code: "not_found", message: "Session not found" } }, 404);
        const liveStatus = states.get(remoteThread.id) ?? remoteThread.status;
        if (liveStatus === "launching")
          return json({ error: { code: "conflict", message: "Thread is launching." } }, 409);
        const shellId = crypto.randomUUID();
        const currentProject = await resolveProject();
        const shellLocation = resolveProjectLocation(
          currentProject.location,
          remoteThread.worktreePath,
        );
        let output = "";
        try {
          await input.client.startShell({ shellId, projectLocation: shellLocation });
        } catch (error) {
          return json(
            {
              error: {
                code: "invalid_request",
                message: error instanceof Error ? error.message : String(error),
              },
            },
            400,
          );
        }
        const done = new Promise<void>((resolve) => {
          pendingShellExits.set(shellId, resolve);
        });
        const timer = setTimeout(() => {
          pendingShellTimeouts.add(shellId);
          pendingShellExits.get(shellId)?.();
        }, 120_000);
        try {
          input.watchTerminal?.(shellId, (data) => {
            output += data;
          });
          await input.client.writeTerminal({ threadId: shellId, data: `${command}\r` });
          await input.client.writeTerminal({ threadId: shellId, data: "exit\r" });
          await done;
        } finally {
          clearTimeout(timer);
          pendingShellExits.delete(shellId);
          input.unwatchTerminal?.(shellId);
          input.client.closeShell({ threadId: shellId }).catch(() => {});
        }
        const timedOut = pendingShellTimeouts.has(shellId);
        pendingShellTimeouts.delete(shellId);
        let text = stripAnsiPreservingLayout(output);
        const cap = 64 * 1024;
        if (text.length > cap) text = text.slice(-cap);
        if (timedOut) text += "\n[timed out]";
        // A synthetic completed bash part — TUI-local, the host transcript
        // doesn't get it.
        const messageID = `msg_shell-${crypto.randomUUID()}`;
        input.events.emit(
          openCodeEvent(
            "session.tool.success",
            {
              sessionID: shellSession,
              assistantMessageID: messageID,
              id: `part_${crypto.randomUUID()}`,
              content: [{ type: "text", text }],
              executed: true,
            },
            {
              location: { directory: input.bootstrap.directory },
              durable: { aggregateID: messageID, seq: 1, version: 2 },
            },
          ),
        );
        // One-shot context hand-off: the next real prompt carries the output.
        const stash = shellStash.get(shellSession) ?? [];
        stash.push({ command, output: text });
        shellStash.set(shellSession, stash.slice(-3));
        return new Response(null, { status: 204 });
      }
      if (path === "/api/shell" && method === "POST") {
        return json(
          {
            error: {
              code: "unsupported",
              message: "Start shells from a prompt with !command.",
            },
          },
          501,
        );
      }
      const shellGetMatch = path.match(/^\/api\/shell\/([^/]+)$/u);
      if (shellGetMatch && method === "GET") {
        const hit = taskFor(decodeURIComponent(shellGetMatch[1]!));
        if (!hit) return json({ error: { code: "not_found", message: "Shell not found" } }, 404);
        const currentProject = await resolveProject();
        return json({
          location: requestLocation(url),
          data: shellInfoFor(hit.rawThreadId, hit.task, directoryOf(currentProject.location)),
        });
      }
      const shellOutputMatch = path.match(/^\/api\/shell\/([^/]+)\/output$/u);
      if (shellOutputMatch && method === "GET") {
        const hit = taskFor(decodeURIComponent(shellOutputMatch[1]!));
        if (!hit) return json({ error: { code: "not_found", message: "Shell not found" } }, 404);
        const bytes = new TextEncoder().encode(String(hit.task.progress ?? ""));
        const cursor = Math.max(0, Number(url.searchParams.get("cursor") ?? 0) || 0);
        const limit = Math.max(1, Number(url.searchParams.get("limit") ?? 64 * 1024) || 0);
        const output = bytes.slice(cursor, cursor + limit);
        const end = cursor + output.length;
        return json({
          location: requestLocation(url),
          data: {
            output: new TextDecoder().decode(output),
            cursor: end,
            size: bytes.length,
            truncated: end < bytes.length,
          },
        });
      }
      const shellRemoveMatch = path.match(/^\/api\/shell\/([^/]+)$/u);
      if (shellRemoveMatch && method === "DELETE") {
        const hit = taskFor(decodeURIComponent(shellRemoveMatch[1]!));
        if (!hit) return json({ error: { code: "not_found", message: "Shell not found" } }, 404);
        const stopAction = record(hit.task.stopAction);
        if (typeof stopAction.id !== "string")
          return json(
            {
              error: {
                code: "conflict",
                message: "This background task can't be stopped from the TUI.",
              },
            },
            409,
          );
        await input.client.callRemoteProcedure("invokeThreadSessionAction", {
          threadId: hit.rawThreadId,
          actionId: stopAction.id,
          payload: stopAction.payload,
        });
        return new Response(null, { status: 204 });
      }
      const sessionMoveMatch = path.match(/^\/api\/session\/([^/]+)\/move$/u);
      if (sessionMoveMatch && method === "POST") {
        const moveSession = decodeURIComponent(sessionMoveMatch[1]!);
        const rawId = threadId(moveSession);
        const body = record(await readRequestBody());
        const directory = String(body.directory ?? "");
        const remoteThread = await visibleThread(rawId);
        if (!remoteThread || (await isHiddenThread(rawId)))
          return json({ error: { code: "not_found", message: "Session not found" } }, 404);
        const moveStatus = states.get(rawId) ?? remoteThread.status;
        if (moveStatus === "launching" || moveStatus === "working")
          return json(
            {
              error: {
                code: "busy",
                message: "Wait for the current turn to finish before moving the thread.",
              },
            },
            409,
          );
        const currentProject = await resolveProject();
        const projectDir = directoryOf(currentProject.location);
        if (directory === projectDir)
          return json(
            {
              error: {
                code: "invalid_request",
                message: "Moving a thread back to the main checkout isn't supported.",
              },
            },
            400,
          );
        const worktreesResult = record(
          await input.client.callRemoteProcedure("gitListWorktrees", {
            projectLocation: currentProject.location,
          }),
        );
        const listed = (
          Array.isArray(worktreesResult.worktrees) ? worktreesResult.worktrees : []
        ).map((entry) => record(entry));
        const match = listed.find((entry) => String(entry.path ?? "") === directory);
        if (!match)
          return json(
            {
              error: {
                code: "invalid_request",
                message: "Not a worktree of this project.",
              },
            },
            400,
          );
        if (moveStatus !== "inactive") await input.client.closeThread(rawId);
        const moveIsNew = createdWorktrees.delete(directory);
        await input.client.sendThreadCommand({
          kind: "set-worktree",
          threadId: rawId,
          worktreePath: directory,
          worktreeBranch: String(match.branch ?? ""),
          ...(moveIsNew ? { isNewWorktree: true } : {}),
        });
        const cached = threadCache.get(rawId);
        if (cached)
          threadCache.set(rawId, {
            ...cached,
            worktreePath: directory,
            worktreeBranch: String(match.branch ?? ""),
          });
        return new Response(null, { status: 204 });
      }
      if (path === "/api/command" && method === "GET") {
        const providerID =
          activeProviderID ??
          [...sessions.values()].reverse().find((session) => session.providerID)?.providerID ??
          defaultModel?.providerID;
        if (!providerID)
          return json({
            location: requestLocation(url),
            data: [],
          } satisfies CommandListOutput);
        try {
          const commands = await input.client.agentSlashCommands(providerID);
          const data: CommandListOutput["data"] = commands.commands.map((command) => ({
            name: command.id,
            ...(command.description ? { description: command.description } : {}),
          }));
          return json({ location: requestLocation(url), data });
        } catch {
          return json({
            location: requestLocation(url),
            data: [],
          } satisfies CommandListOutput);
        }
      }
      if (/\/api\/(file\/find|vcs|worktree|command|skill|mcp|reference|shell)/u.test(path)) {
        return json({ location: requestLocation(url), data: [] });
      }
      if (path === "/api/config" && method === "GET") {
        const output: ConfigGetOutput = [];
        return json(output);
      }
      if (path === "/api/form" && method === "GET") {
        const output: FormListOutput = {
          location: requestLocation(url),
          data: [],
        };
        return json(output);
      }
      if (path === "/api/experimental/migration/v1" && method === "GET") {
        const output: MigrationV1StatusOutput = { status: "completed" };
        return json(output);
      }
    } catch (error) {
      await logAdapterError({
        home: input.bootstrap.home,
        method,
        route: path,
        responseStatus: 500,
        input: inputSummary,
        error,
      }).catch(() => undefined);
      return json(
        {
          error: {
            code: "adapter_error",
            message: error instanceof Error ? error.message : String(error),
          },
        },
        500,
      );
    }
    await logAdapterError({
      home: input.bootstrap.home,
      method,
      route: path,
      responseStatus: 404,
      input: inputSummary,
      error: new Error("Route not found"),
    });
    return json({ error: { code: "not_found", message: "Route not found" } }, 404);
  };

  // PORACODE_TUI_DEBUG=1: one debug line per adapter request (method, route
  // with ids elided, status, duration).
  const handle = async (request: Request): Promise<Response> => {
    const started = Date.now();
    const response = await handleRequest(request);
    if (debug)
      void logAdapterDebug(input.bootstrap.home, {
        source: "request",
        method: request.method,
        // Route shape, not masked segments — literal words stay, id-like
        // segments become ":id" (/api/session/:id/prompt).
        path: new URL(request.url).pathname.replace(/[^/]+/gu, (segment) =>
          /^[a-z-]+$/u.test(segment) ? segment : ":id",
        ),
        status: response.status,
        ms: Date.now() - started,
      });
    return response;
  };

  const handleRemoteEvent = (event: unknown) => {
    const value = record(event);
    if (
      value.type === "windows-agent-statuses" ||
      value.type === "wsl-agent-statuses" ||
      value.type === "agent-status-updated"
    ) {
      handleAgentStatusEvent(value);
      return;
    }
    if (value.type === "thread-reset" && typeof value.threadId === "string") {
      states.delete(value.threadId);
      input.resetThread(value.threadId);
      input.events.resync();
      return;
    }
    if (value.type === "thread-pending-steer" && typeof value.threadId === "string") {
      updateInboxSteer(value.threadId, value.pending ?? null);
      return;
    }
    if (value.type === "thread-follow-up-queue" && typeof value.threadId === "string") {
      updateInboxQueue(value.threadId, value.queue ?? null);
      return;
    }
    if (typeof value.threadId === "string") {
      const itemEvent = record(value.event);
      if (
        (itemEvent.type === "item.started" ||
          itemEvent.type === "item.updated" ||
          itemEvent.type === "item.completed") &&
        itemEvent.itemType === "goal"
      )
        recordGoal(value.threadId, itemEvent.payload);
      if (
        itemEvent.type === "item.completed" &&
        typeof itemEvent.itemId === "string" &&
        subagentSubscriptions.has(subagentKey(value.threadId, itemEvent.itemId))
      )
        unsubscribeSubagent(value.threadId, itemEvent.itemId);
      // A checkpoint revert truncates the transcript on the host — drop the
      // per-session runtime state and resync like a thread-reset.
      if (itemEvent.type === "runtime.truncated") {
        input.resetThread(value.threadId);
        input.events.resync();
      }
      // background_tasks.changed replaces the thread's task list — diff for
      // shell.created/deleted emissions.
      // A completed turn finalizes the file checkpoint captured for the
      // prompt that opened it — required for checkpointRevert's files phase.
      if (itemEvent.type === "turn.completed") scheduleCheckpointReconcile(value.threadId);
      if (itemEvent.type === "background_tasks.changed") {
        const tasks = Array.isArray(itemEvent.tasks) ? itemEvent.tasks.map(record) : [];
        applyBackgroundTasks(value.threadId, tasks, input.bootstrap.directory);
      }
    }
    const changed = remoteThreadsChangedEventSchema.safeParse(event);
    if (changed.success) {
      void refreshChangedThreads(changed.data.threadIds).catch(() => input.events.resync());
      return;
    }
    const status = threadStatusSchema.safeParse(value.status);
    if (value.type === "thread-state" && typeof value.threadId === "string" && status.success) {
      if (debug && states.get(value.threadId) !== status.data)
        void logAdapterDebug(input.bootstrap.home, {
          source: "thread-state",
          threadId: value.threadId,
          from: String(states.get(value.threadId) ?? "unknown"),
          to: String(status.data),
        });
      states.set(value.threadId, status.data);
      if (typeof value.threadMentionToolsAvailable === "boolean")
        threadMentionTools.set(value.threadId, value.threadMentionToolsAvailable);
    }
    const config = threadConfigSchema.safeParse(value.config);
    if (
      value.type === "thread-state" &&
      typeof value.threadId === "string" &&
      typeof value.agentKind === "string" &&
      config.success
    ) {
      input.registerThreadContext(value.threadId, {
        agent: config.data.mode === "plan" ? "plan" : "build",
        providerID: value.agentKind,
        model: config.data.model,
        location: { directory: input.bootstrap.directory },
      });
    }
    const rememberRequest = (thread: unknown, runtime: unknown) => {
      const request = record(runtime);
      if (request.type === "request.opened" && typeof request.requestId === "string") {
        if (typeof thread !== "string") return;
        const saved = rememberPendingRequest(
          thread,
          request.requestId,
          request.requestType,
          request.payload,
        );
        if (!saved || saved.requestType === "tool_user_input" || !input.bootstrap.args.auto) return;
        const optionId = selectPermissionOption(saved.options, "once");
        if (!optionId) return;
        input.recordPermissionReply(thread, request.requestId, "once");
        void input.client
          .resolveRequest({
            threadId: thread,
            requestId: request.requestId,
            method: "requestPermission",
            response: { optionId },
          })
          .catch(() => input.events.resync());
      }
      if (request.type === "request.resolved" && typeof request.requestId === "string") {
        if (typeof thread === "string")
          pending.delete(pendingRequestKey(thread, request.requestId));
      }
    };
    if (value.type === "thread-runtime-event") {
      rememberRequest(value.threadId, value.event);
    }
    // A watched dev shell exiting unblocks the session.shell waiter.
    if (value.type === "thread-exited" && typeof value.threadId === "string")
      pendingShellExits.get(value.threadId)?.();
    if (value.type === "thread-runtime-events" && Array.isArray(value.events)) {
      for (const runtime of value.events) {
        rememberRequest(value.threadId, runtime);
        if (record(runtime).type === "turn.completed" && typeof value.threadId === "string")
          scheduleCheckpointReconcile(value.threadId);
      }
    }
    if (value.type === "thread-runtime-events-multi" && Array.isArray(value.batches)) {
      for (const batch of value.batches) {
        const entries = record(batch);
        if (Array.isArray(entries.events)) {
          for (const runtime of entries.events) {
            rememberRequest(entries.threadId, runtime);
            if (record(runtime).type === "turn.completed" && typeof entries.threadId === "string")
              scheduleCheckpointReconcile(entries.threadId);
          }
        }
      }
    }
    for (const translated of input.translate(event)) input.events.emit(translated);
  };

  async function refreshChangedThreads(threadIds: readonly string[]) {
    const previous = new Map(threadIds.map((id) => [id, threadCache.get(id)]));
    const [threads, projectsPage] = await Promise.all([
      listThreads(),
      input.client.boundedProjectListPage({ mode: "inventory", projectLimit: 100 }),
    ]);
    const statusList =
      typeof input.client.agentStatuses === "function" ? await agentStatuses() : [];
    const projects = new Map(projectsPage.projects.map((value) => [value.id, value]));
    for (const id of threadIds) {
      const before = previous.get(id);
      const after = threads.find((value) => value.id === id);
      const beforeVisible = before !== undefined && isGuiThread(before, statusList);
      const afterVisible = after !== undefined && isGuiThread(after, statusList);
      const sessionID = sessionId(id);
      const changedProject = after ? projects.get(after.projectId) : undefined;
      const eventLocation = {
        location: {
          directory: changedProject
            ? directoryOf(changedProject.location)
            : input.bootstrap.directory,
        },
      };
      if (!before && after) {
        if (!afterVisible) continue;
        input.events.emit(
          openCodeEvent(
            "session.created",
            {
              sessionID,
              projectID: after.projectId,
              location: eventLocation.location,
              slug: after.id,
              title: after.title,
              version: input.bootstrap.appVersion,
            },
            {
              durable: {
                aggregateID: sessionID,
                seq: input.events.nextDurableSequence(sessionID),
                version: 1,
              },
              ...eventLocation,
            },
          ),
        );
        continue;
      }
      if (before && !after) {
        if (!beforeVisible) continue;
        input.events.emit(
          openCodeEvent(
            "session.deleted",
            { sessionID },
            {
              durable: {
                aggregateID: sessionID,
                seq: input.events.nextDurableSequence(sessionID),
                version: 2,
              },
              ...eventLocation,
            },
          ),
        );
        continue;
      }
      if (!before || !after || !afterVisible) continue;
      if (before.title !== after.title) {
        input.events.emit(
          openCodeEvent(
            "session.renamed",
            { sessionID, title: after.title },
            {
              durable: {
                aggregateID: sessionID,
                seq: input.events.nextDurableSequence(sessionID),
                version: 1,
              },
              ...eventLocation,
            },
          ),
        );
      }
      if (before.archived !== after.archived) {
        input.events.emit(
          after.archived
            ? openCodeEvent(
                "session.archived",
                { sessionID },
                {
                  durable: {
                    aggregateID: sessionID,
                    seq: input.events.nextDurableSequence(sessionID),
                    version: 1,
                  },
                  ...eventLocation,
                },
              )
            : openCodeEvent(
                "session.unarchived",
                { sessionID },
                {
                  durable: {
                    aggregateID: sessionID,
                    seq: input.events.nextDurableSequence(sessionID),
                    version: 1,
                  },
                  ...eventLocation,
                },
              ),
        );
      }
    }
  }

  // Poracode facade: the bundled plugin calls these in-process instead of
  // over HTTP. sessionOptions returns the provider's advertised choices;
  // setSessionOptions validates them, updates the session, and persists via
  // the last-model file.
  const sessionOptions = async (session: string) => {
    const current = sessions.get(session);
    const remote = (await listThreads()).find((value) => value.id === threadId(session));
    const status = (await agentStatuses()).find(
      (value) => value.kind === (current?.providerID ?? remote?.agentKind ?? activeProviderID),
    );
    const caps = status?.capabilities.presentationCapabilities?.gui ?? status?.capabilities;
    const model = current?.model ?? remote?.config.model;
    const fastModels = caps?.fastModels ?? status?.capabilities.fastModels ?? [];
    const thinkingModels = caps?.thinkingModels ?? status?.capabilities.thinkingModels ?? [];
    return {
      approvalPolicies: (caps?.approvalPolicies ??
        status?.capabilities.approvalPolicies ??
        []) as readonly { id: string; label: string }[],
      sandboxModes: (caps?.sandboxModes ?? status?.capabilities.sandboxModes ?? []) as readonly {
        id: string;
        label: string;
      }[],
      fast: {
        offered: model !== undefined && fastModels.includes(model),
        disabledReason: caps?.fastDisabledReason ?? status?.capabilities.fastDisabledReason,
      },
      thinking: { offered: model !== undefined && thinkingModels.includes(model) },
      contextSizes: (caps?.contextSizes ?? status?.capabilities.contextSizes ?? []) as readonly {
        id: string;
        label: string;
      }[],
      defaults: {
        approvalPolicy: caps?.defaultApprovalPolicy ?? status?.capabilities.defaultApprovalPolicy,
        sandboxMode: caps?.defaultSandboxMode ?? status?.capabilities.defaultSandboxMode,
      },
    };
  };

  const setSessionOptions = async (
    session: string,
    choice: {
      approvalPolicy?: string;
      sandboxMode?: string;
      fast?: boolean;
      thinking?: boolean;
      contextSize?: string;
    },
  ) => {
    const current = sessions.get(session);
    const offered = await sessionOptions(session);
    if (
      choice.approvalPolicy &&
      offered.approvalPolicies.length > 0 &&
      !offered.approvalPolicies.some((option) => option.id === choice.approvalPolicy)
    )
      return { error: `Unknown approval policy: ${choice.approvalPolicy}`, status: 400 };
    if (
      choice.sandboxMode &&
      offered.sandboxModes.length > 0 &&
      !offered.sandboxModes.some((option) => option.id === choice.sandboxMode)
    )
      return { error: `Unknown sandbox mode: ${choice.sandboxMode}`, status: 400 };
    if (choice.fast !== undefined && !offered.fast.offered)
      return { error: "Fast mode is not offered for this session's model", status: 400 };
    if (choice.thinking !== undefined && !offered.thinking.offered)
      return {
        error: "Thinking mode is not offered for this session's model",
        status: 400,
      };
    if (
      choice.contextSize &&
      offered.contextSizes.length > 0 &&
      !offered.contextSizes.some((option) => option.id === choice.contextSize)
    )
      return { error: `Unknown context size: ${choice.contextSize}`, status: 400 };
    if (!current) return { error: "Unknown session", status: 404 };
    const updated = {
      ...current,
      ...(choice.approvalPolicy ? { approvalPolicy: choice.approvalPolicy } : {}),
      ...(choice.sandboxMode ? { sandboxMode: choice.sandboxMode } : {}),
      ...(choice.fast !== undefined ? { fast: choice.fast } : {}),
      ...(choice.thinking !== undefined ? { thinking: choice.thinking } : {}),
      ...(choice.contextSize ? { contextSize: choice.contextSize } : {}),
    };
    sessions.set(session, updated);
    const home = process.env.PORACODE_TUI_HOME;
    if (home) {
      const preferencePath = join(home, TUI_LAST_MODEL_FILE_NAME);
      const previous = record(
        await Bun.file(preferencePath)
          .json()
          .catch(() => undefined),
      );
      if (previous.version === undefined || previous.version === LAST_MODEL_VERSION)
        await Bun.write(
          preferencePath,
          JSON.stringify(
            tuiLastModelSchema.parse({
              ...previous,
              version: LAST_MODEL_VERSION,
              ...(updated.providerID ? { provider: updated.providerID } : {}),
              ...(updated.model ? { model: updated.model } : {}),
              ...(updated.effort ? { effort: updated.effort } : {}),
              ...(updated.fast !== undefined ? { fast: updated.fast } : {}),
              ...(updated.thinking !== undefined ? { thinking: updated.thinking } : {}),
              ...(updated.contextSize ? { contextSize: updated.contextSize } : {}),
              ...(choice.approvalPolicy ? { approvalPolicy: choice.approvalPolicy } : {}),
              ...(choice.sandboxMode ? { sandboxMode: choice.sandboxMode } : {}),
              updatedAt: new Date().toISOString(),
            }),
          ) + "\n",
        );
    }
    return { ok: true as const };
  };

  // exportSession assembles a full transcript through the existing history
  // projection — every bounded page — in the SessionTransferData shape the
  // generated client expects.
  const exportSession = async (session: string, remoteThread?: Thread) => {
    const thread =
      remoteThread ?? (await guiThreads()).find((value) => value.id === threadId(session));
    if (!thread) throw new Error(`Unknown session: ${session}`);
    await input.setThreadInterests([thread.id]);
    const messages = [];
    let cursor: string | undefined;
    while (true) {
      const page = await historyMessagePage(thread, 100, cursor, async (beforePosition, pageSize) =>
        input.client.threadRuntimeItemsPage({
          threadId: thread.id,
          ...(beforePosition !== undefined ? { beforePosition } : {}),
          limit: pageSize,
          targetTimelineEntryCount: 100,
        }),
      );
      messages.push(...page.data);
      if (page.cursor.next === null) break;
      cursor = page.cursor.next;
    }
    const currentProject = await resolveProject();
    return { info: toSession(thread, currentProject), messages };
  };

  // offeredProviders lists installed GUI providers with their first enabled
  // model so the plugin's switch command can create a bound session.
  const offeredProviders = async () =>
    (await agentStatuses())
      .filter(supportsGui)
      .filter(
        (status) => (status.presentationAuthStates?.gui ?? status.authState) === "authenticated",
      )
      .map((status) => {
        const caps = status.capabilities.presentationCapabilities?.gui ?? status.capabilities;
        return {
          id: status.kind,
          label: status.label,
          model: caps.models?.[0]?.id ?? status.capabilities.models?.[0]?.id,
        };
      });

  // threadFlags reads the cached thread metadata (star/done) for the plugin's
  // toggle commands; a cache miss refreshes through the thread list once.
  const threadFlags = async (session: string) => {
    const rawId = threadId(session);
    let thread = threadCache.get(rawId);
    if (!thread) thread = (await listThreads()).find((value) => value.id === rawId);
    if (!thread) return undefined;
    return { starred: Boolean(thread.starred), done: Boolean(thread.done) };
  };
  const setStarred = async (session: string, starred: boolean) => {
    await input.client.sendThreadCommand({
      kind: "set-starred",
      threadId: threadId(session),
      starred,
    });
    await listThreads();
    return threadFlags(session);
  };
  const setDone = async (session: string, done: boolean) => {
    await input.client.sendThreadCommand({
      kind: "set-done",
      threadId: threadId(session),
      done,
    });
    await listThreads();
    return threadFlags(session);
  };

  // A paused follow-up queue means a desktop user is editing an item;
  // resumeThreadFollowUps unpauses it. Report whether anything resumed.
  const resumeQueue = async (session: string) => {
    const rawId = threadId(session);
    await seedInbox(rawId);
    const entry = inboxEntry(rawId);
    if (!entry.paused) return { resumed: false as const };
    await input.client.callRemoteProcedure("resumeThreadFollowUps", { threadId: rawId });
    entry.paused = false;
    return { resumed: true as const };
  };

  // Side chat — a hidden GUI child thread that inherits the source thread's
  // project/provider/config, painted with the question only; the transcript
  // rides privately in clientContext.conversationSnapshot.
  const startSideChat = async (sessionID: string, question: string) => {
    const remoteThread = await visibleThread(threadId(sessionID));
    if (!remoteThread) throw new Error("Session not found");
    const currentProject = await resolveProject();
    const tail = (text: string) => {
      const plain = stripAnsiPreservingLayout(text);
      return plain.length > 6000 ? `[output truncated]\n${plain.slice(-6000)}` : plain;
    };
    const rows: string[] = [];
    for (const item of await listThreadItems(remoteThread.id)) {
      if (item.parentItemId) continue; // top-level only
      if (item.type === "user_message") {
        const text = String(record(item.payload).text ?? record(item.payload).prompt ?? "");
        if (text.trim()) rows.push(`User: ${tail(text)}`);
      } else if (item.type === "assistant_message") {
        const text = assistantDisplayText(item) ?? String(record(item.payload).text ?? "");
        if (text.trim()) rows.push(`Assistant: ${tail(text)}`);
      }
    }
    const transcript = rows.join("\n\n");
    const launched = sideChatLaunchInput(
      question,
      [{ kind: "text", content: question }],
      transcript || undefined,
    );
    const host =
      typeof input.client.describeHost === "function"
        ? await input.client.describeHost().catch(() => ({}))
        : {};
    const supportsMetadata = hostSupportsThreadLaunchMetadata(
      record(record(host).capabilities).threadLaunchMetadata as
        | { readonly versions: readonly number[] }
        | undefined,
    );
    const childId = crypto.randomUUID();
    await input.client.startNewThread({
      threadId: childId,
      projectId: currentProject.id,
      agentKind: remoteThread.agentKind,
      config: remoteThread.config,
      prompt: launched.prompt,
      segments: launched.segments,
      presentationMode: "gui",
      title: `Side chat · ${question.slice(0, 40)}`,
      ...(remoteThread.worktreePath ? { worktreePath: remoteThread.worktreePath } : {}),
      ...(remoteThread.worktreeBranch ? { worktreeBranch: remoteThread.worktreeBranch } : {}),
      ...(launched.clientContext ? { clientContext: launched.clientContext } : {}),
      ...(supportsMetadata ? { parentThreadId: remoteThread.id } : {}),
    });
    return sessionId(childId);
  };
  // Installed GUI providers that aren't authenticated — the login hint's
  // candidates. agentStatuses already honors the Windows/WSL selection.
  const loginCandidates = async () =>
    (await agentStatuses())
      .filter((status) => supportsGui(status) && !hasGuiAuthentication(status))
      .map((status) => ({
        kind: status.kind,
        label: record(status).label ?? status.kind,
        ...(typeof record(status).wslDistro === "string"
          ? { wslDistro: String(record(status).wslDistro) }
          : {}),
      }));
  // Provider usage & limits — the host polls providers on their own cadence;
  // an unsupported host or a failed collect surfaces as undefined.
  const providerUsage = async () => {
    try {
      return await input.client.providerUsage?.();
    } catch {
      return undefined;
    }
  };
  // This project's archived GUI threads — pages through the host list the
  // same way the session list does (archived threads age off the first page).
  const archivedThreads = async () => {
    const currentProject = await resolveProject();
    const statusList = await statusListNow();
    const output: Thread[] = [];
    let continuation: { cursor: string; after: unknown } | undefined;
    for (let page = 0; page < 10; page += 1) {
      const result = await threadListPage(continuation);
      for (const thread of result.threads)
        if (
          isGuiThread(thread, statusList) &&
          thread.projectId === currentProject.id &&
          thread.archived
        )
          output.push(thread);
      continuation = result.next;
      if (!continuation) break;
    }
    return output;
  };
  // Provider session actions — the host exposes per-thread actions a client
  // can invoke (listThreadSessionActions / invokeThreadSessionAction). An
  // unsupported host or error surfaces as an empty list / thrown error.
  const sessionActions = async (sessionID: string) => {
    if (parseSubSessionId(sessionID)) return [];
    const result = await input.client
      .callRemoteProcedure("listThreadSessionActions", { threadId: threadId(sessionID) })
      .catch(() => null);
    const actions = record(result).actions;
    if (!Array.isArray(actions)) return [];
    return actions
      .map((value) => record(value))
      .filter((entry) => typeof entry.id === "string")
      .map((entry) => ({ id: String(entry.id) }));
  };
  const invokeSessionAction = async (sessionID: string, actionId: string) => {
    if (parseSubSessionId(sessionID)) throw new Error("Subagent transcripts are read-only.");
    return input.client.callRemoteProcedure("invokeThreadSessionAction", {
      threadId: threadId(sessionID),
      actionId,
      payload: {},
    });
  };
  return {
    handle,
    handleRemoteEvent,
    sessionOptions,
    setSessionOptions,
    exportSession,
    offeredProviders,
    threadFlags,
    setStarred,
    setDone,
    resumeQueue,
    goalState,
    controlGoal,
    subscribeGoal,
    goalLine,
    goalSupported,
    sendPrompt,
    sessionActions,
    invokeSessionAction,
    archivedThreads,
    providerUsage,
    startSideChat,
    loginCandidates,
    disposeSubagentSubscriptions,
  };
}

function gitFileStatus(status: string): "added" | "deleted" | "modified" {
  const normalized = status.toLowerCase();
  if (normalized.includes("deleted")) return "deleted";
  if (normalized.includes("added") || normalized.includes("untracked")) return "added";
  return "modified";
}

function parseGitDiff(diff: string): VcsDiffOutput["data"] {
  return diff
    .split(/^diff --git /mu)
    .slice(1)
    .map((chunk) => {
      const patch = `diff --git ${chunk}`;
      const oldPath = patch.match(/^--- a\/(.+)$/mu)?.[1];
      const newPath = patch.match(/^\+\+\+ b\/(.+)$/mu)?.[1];
      const file = newPath ?? oldPath ?? "";
      const status: VcsDiffOutput["data"][number]["status"] =
        patch.includes("deleted file mode") || (!newPath && oldPath)
          ? "deleted"
          : patch.includes("new file mode") || (!oldPath && newPath)
            ? "added"
            : "modified";
      const lines = patch.split(/\r?\n/u);
      return {
        file,
        patch,
        additions: lines.filter((line) => line.startsWith("+") && !line.startsWith("+++")).length,
        deletions: lines.filter((line) => line.startsWith("-") && !line.startsWith("---")).length,
        status,
      };
    })
    .filter((entry) => entry.file.length > 0);
}

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function record(value: unknown): Record<string, unknown> {
  const parsed = recordSchema.safeParse(value);
  return parsed.success ? parsed.data : {};
}

function supportsGui(status: AgentStatus) {
  const capabilities = status.capabilities;
  return (
    capabilities.presentationMode === "gui" ||
    capabilities.presentationModes?.includes("gui") === true ||
    capabilities.presentationCapabilities?.gui !== undefined ||
    Object.values(status.runtimeVariants ?? {}).some(
      (variant) => variant.presentationMode === "gui",
    )
  );
}

function summarizeAgentStatus(status: AgentStatus) {
  const capabilities = status.capabilities.presentationCapabilities?.gui ?? status.capabilities;
  return {
    kind: status.kind,
    label: status.label,
    installed: status.installed,
    authState: status.presentationAuthStates?.gui ?? status.authState,
    envKind: status.envKind ?? null,
    gui: supportsGui(status),
    modelLabels: (capabilities.models ?? [])
      .slice(0, 8)
      .map(({ label }) => label)
      .join("|"),
  };
}

function supportsMode(status: AgentStatus, mode: "agent" | "plan" | "autopilot") {
  const capabilities = status.capabilities.presentationCapabilities?.gui ?? status.capabilities;
  return capabilities.modes?.includes(mode) === true;
}
