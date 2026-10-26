import type {
  OpenCodeEvent,
  PermissionListOutput,
  PermissionReply,
  SessionInfo,
  SessionInboxUser,
} from "@opencode/client";
import type {
  AgentStatus,
  GoalItemPayload,
  PendingSteerState,
  ProjectLocation,
  RequestPayload,
  Thread,
  ThreadStatus,
  canonicalRequestTypeSchema,
} from "@/shared/contracts";
import type { RemoteDesktopClient } from "@/shared/remote/client";
import type { RemoteAgentStatuses, RemoteProject } from "@/shared/remote";
import type { PersistedRuntimeItem } from "@/shared/ipc/schemas";
import type { PermissionOption } from "../permissions";
import type { TuiBootstrap } from "../../bootstrap";
import type { EventStreamHub, ThreadEventContext } from "../events";
import type { formInfoForRequest } from "../forms";
import type { z } from "zod";

export interface RouterInput {
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
}

export type InboxEntry = {
  steer: PendingSteerState | null;
  queue: PendingSteerState[];
  paused: boolean;
  seeded: boolean;
};

export type PendingRequest = {
  requestId: string;
  threadId: string;
  requestType: z.infer<typeof canonicalRequestTypeSchema>;
  payload: RequestPayload;
  options: PermissionOption[];
  elicitation?: boolean;
};

export type SessionRecord = {
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
};

/**
 * One shared mutable context for every router subsystem. Modules destructure
 * the state containers (assigned first, so always present) and call helpers
 * through `ctx.` — call-time lookup keeps construction order from mattering.
 */
export interface RouterContext {
  input: RouterInput;
  debug: boolean;
  wslLocation: boolean;

  sessions: Map<string, SessionRecord>;
  states: Map<string, ThreadStatus>;
  pendingReverts: Map<string, { messageID: string; checkpointItemId: string }>;
  pending: Map<string, PendingRequest>;
  inbox: Map<string, InboxEntry>;
  cancelledInboxIds: Set<string>;
  goals: Map<string, GoalItemPayload>;
  goalListeners: Set<(rawThreadId: string) => void>;
  createdWorktrees: Map<string, string>;
  pendingSwitches: Map<string, { providerID: string; modelID: string }>;
  threadMentionTools: Map<string, boolean>;
  capturedCheckpoints: Map<string, Set<string>>;
  finalizedAnchors: Set<string>;
  uncapturableAnchors: Set<string>;
  reconciling: Set<string>;
  pendingShellExits: Map<string, () => void>;
  pendingShellTimeouts: Set<string>;
  shellStash: Map<string, { command: string; output: string }[]>;
  sessionMcpPending: Map<string, Map<string, boolean>>;
  backgroundTasks: Map<string, Record<string, unknown>[]>;
  subagentSubscriptions: Set<string>;
  threadCache: Map<string, Thread>;

  // Mutable scalars shared across modules — assigned through ctx.
  currentSession: string | undefined;
  project: RemoteProject | undefined;
  statuses: RemoteAgentStatuses | undefined;
  defaultModel: { providerID: string; model: string } | undefined;
  activeProviderID: string | undefined;

  // threads.ts
  cachedThreadById: (rawId: string) => Promise<Thread | undefined>;
  listThreadItems: (rawThreadId: string) => Promise<PersistedRuntimeItem[]>;
  listThreads: () => Promise<Thread[]>;
  projectLocation: (value: RemoteProject) => ProjectLocation;
  directoryOf: (value: ProjectLocation) => string;
  toSession: (value: Thread, currentProject: RemoteProject) => SessionInfo;
  isSubAgentItem: (item: PersistedRuntimeItem) => boolean;
  presentationOf: (value: Thread, statusList: AgentStatus[]) => "gui" | "terminal" | undefined;
  isGuiThread: (value: Thread, statusList: AgentStatus[]) => boolean;
  guiThreads: () => Promise<Thread[]>;
  statusListNow: () => Promise<AgentStatus[]>;
  isHiddenThread: (rawId: string) => Promise<boolean>;
  visibleThread: (rawId: string) => Promise<Thread | undefined>;
  isLiveSubSession: (session: string) => Promise<boolean>;
  toSubSession: (
    parent: Thread,
    item: PersistedRuntimeItem,
    currentProject: RemoteProject,
  ) => SessionInfo;
  collectThreads: (page: { threads: Thread[] }) => void;
  threadListPage: (continuation?: { cursor: string; after: unknown }) => Promise<{
    threads: Thread[];
    next?: { cursor: string; after: unknown };
  }>;
  findThreadById: (rawId: string) => Promise<Thread | undefined>;
  encodeThreadCursor: (next: { cursor: string; after: unknown }) => string;
  decodeThreadCursor: (value: string | null) => { cursor: string; after: unknown } | undefined;

  // catalog.ts
  resolveProject: () => Promise<RemoteProject>;
  agentStatuses: () => Promise<AgentStatus[]>;
  hasGuiAuthentication: (status: AgentStatus) => boolean;
  resolveDefaultModel: () => Promise<{ providerID: string; model: string } | undefined>;
  requestLocation: (url: URL) => { directory: string };
  persistLastModel: (patch: Record<string, unknown>) => Promise<void>;
  emptyStatuses: () => RemoteAgentStatuses;
  emitProviderRefresh: () => void;
  statusSignature: (list: AgentStatus[]) => string;
  handleAgentStatusEvent: (value: Record<string, unknown>) => boolean;

  // checkpoints.ts
  captureFileCheckpoint: (
    rawThreadId: string,
    checkpointItemId: string | undefined,
    projectLocation: unknown,
  ) => Promise<void>;
  reconcileCheckpoints: (rawThreadId: string) => Promise<number>;
  scheduleCheckpointReconcile: (rawThreadId: string) => void;

  // shells.ts
  shellIdFor: (rawThreadId: string, taskId: string) => string;
  parseShellId: (id: string) => { rawThreadId: string; taskId: string } | undefined;
  taskFor: (id: string) => { task: Record<string, unknown>; rawThreadId: string } | undefined;
  shellInfoFor: (
    rawThreadId: string,
    task: Record<string, unknown>,
    cwd: string,
  ) => Record<string, unknown>;
  applyBackgroundTasks: (
    rawThreadId: string,
    tasks: Record<string, unknown>[],
    cwd: string,
  ) => void;

  // subagents.ts
  subagentKey: (rawThreadId: string, taskItemId: string) => string;
  subscribeSubagent: (rawThreadId: string, taskItemId: string) => void;
  unsubscribeSubagent: (rawThreadId: string, taskItemId: string) => void;
  disposeSubagentSubscriptions: () => void;

  // titles.ts
  followUpDelivery: () => Promise<"steer" | "queue">;
  hostOwnsTitles: () => Promise<boolean>;
  remoteSettings: () => Promise<Record<string, unknown>>;
  titleGenChoice: (
    thread: Thread,
    location: ProjectLocation,
  ) => Promise<{ error: string } | { agentKind: string; selection: unknown }>;
  generateTitle: (thread: Thread, prompt: string, currentProject: RemoteProject) => Promise<string>;
  firstPromptText: (rawThreadId: string) => Promise<string>;
  renameThreadTo: (rawThreadId: string, title: string) => Promise<void>;
  autoTitle: (rawThreadId: string, prompt: string, currentProject: RemoteProject) => void;

  // goals.ts
  goalLine: (session: string) => string | undefined;

  // goals.ts
  recordGoal: (rawThreadId: string, payload: unknown) => void;
  seedBackgroundTasks: (rawThreadId: string) => Promise<void>;
  seedGoal: (rawThreadId: string) => Promise<void>;
  goalState: (session: string) => Promise<
    | {
        objective: string;
        status: string;
        availableActions: string[];
        tokensUsed?: number;
        tokenBudget?: number;
        timeUsedSeconds?: number;
        lastReason?: string;
      }
    | undefined
  >;
  controlGoal: (
    session: string,
    control: { action: "pause" | "resume" | "clear" | "edit"; objective?: string },
  ) => Promise<{ error: string } | { ok: true }>;
  subscribeGoal: (listener: (rawThreadId: string) => void) => () => void;
  goalSupported: (session: string) => Promise<boolean>;

  // requests.ts
  pendingRequestKey: (rawThreadId: string, requestId: string) => string;
  rememberPendingRequest: (
    rawThreadId: string,
    requestId: string,
    requestType: unknown,
    payload: unknown,
  ) => PendingRequest | undefined;
  permissionItemFor: (
    session: string,
    pendingRequest: PendingRequest,
  ) => PermissionListOutput[number];
  pendingRequestsForSession: (session: string) => Promise<PendingRequest[]>;
  pendingFormRequest: (session: string, rawFormID: string) => Promise<PendingRequest | undefined>;
  formFromPending: (request: PendingRequest) => ReturnType<typeof formInfoForRequest>;

  // prompt.ts
  sendPrompt: (
    session: string,
    body: Record<string, unknown>,
  ) => Promise<Response | { status: number; error: { code: string; message: string } }>;

  // facade.ts — session options shape consumed by the plugin layer
  sessionOptions: (session: string) => Promise<{
    approvalPolicies: readonly { id: string; label: string }[];
    sandboxModes: readonly { id: string; label: string }[];
    fast: { offered: boolean; disabledReason: string | undefined };
    thinking: { offered: boolean };
    contextSizes: readonly { id: string; label: string }[];
    defaults: { approvalPolicy: string | undefined; sandboxMode: string | undefined };
  }>;
  setSessionOptions: (
    session: string,
    choice: {
      approvalPolicy?: string;
      sandboxMode?: string;
      fast?: boolean;
      thinking?: boolean;
      contextSize?: string;
    },
  ) => Promise<{ error: string; status: number } | { ok: true }>;
  exportSession: (
    session: string,
    remoteThread?: Thread,
  ) => Promise<{ info: SessionInfo; messages: unknown[] }>;

  // remoteEvents.ts
  handleRemoteEvent: (event: unknown) => void;

  // facade.ts
  offeredProviders: () => Promise<{ id: string; label: string; model: string | undefined }[]>;
  threadFlags: (session: string) => Promise<{ starred: boolean; done: boolean } | undefined>;
  setStarred: (
    session: string,
    starred: boolean,
  ) => Promise<{ starred: boolean; done: boolean } | undefined>;
  setDone: (
    session: string,
    done: boolean,
  ) => Promise<{ starred: boolean; done: boolean } | undefined>;
  resumeQueue: (session: string) => Promise<{ resumed: boolean }>;
  sessionActions: (sessionID: string) => Promise<{ id: string }[]>;
  invokeSessionAction: (sessionID: string, actionId: string) => Promise<unknown>;
  archivedThreads: () => Promise<Thread[]>;
  providerUsage: () => Promise<
    Awaited<ReturnType<NonNullable<RemoteDesktopClient["providerUsage"]>>> | undefined
  >;
  startSideChat: (sessionID: string, question: string) => Promise<string>;
  loginCandidates: () => Promise<{ kind: string; label: string; wslDistro?: string }[]>;

  // revert.ts
  emitRevertEvent: (
    type: "session.revert.staged" | "session.revert.cleared" | "session.revert.committed",
    sessionID: string,
    extra: Record<string, unknown>,
  ) => void;
  commitPendingRevert: (
    sessionID: string,
  ) => Promise<{ status: number; error: { code: string; message: string } } | undefined>;

  // inbox.ts
  inboxKey: (rawThreadId: string, id: string) => string;
  inboxEntry: (rawThreadId: string) => InboxEntry;
  inboxUserItem: (
    rawThreadId: string,
    value: PendingSteerState,
    delivery: "steer" | "queue",
  ) => SessionInboxUser;
  emitInboxEvent: (
    rawThreadId: string,
    type: "session.inbox.enqueued" | "session.inbox.delivered" | "session.inbox.cancelled",
    value: PendingSteerState,
    delivery: "steer" | "queue",
  ) => void;
  dropInboxItem: (
    rawThreadId: string,
    value: PendingSteerState,
    delivery: "steer" | "queue",
  ) => void;
  updateInboxSteer: (rawThreadId: string, value: unknown) => void;
  updateInboxQueue: (rawThreadId: string, value: unknown) => void;
  seedInbox: (rawThreadId: string) => Promise<void>;
}

/** Arguments handed to each route-group handler in handleRequest's chain. */
export type RouteArgs = {
  ctx: RouterContext;
  request: Request;
  url: URL;
  method: string;
  path: string;
  readBody: () => Promise<Record<string, unknown>>;
  inputSummary: () => unknown;
};
