import type { GoalItemPayload, Thread, ThreadStatus } from "@/shared/contracts";
import { deriveLocationFromPath } from "@/shared/createProject";
import type { RemoteAgentStatuses, RemoteProject } from "@/shared/remote";
import type { InboxEntry, PendingRequest, RouterInput, SessionRecord } from "./context";

/** All shared mutable state for the router, created once per createRouter. */
export function createRouterState(input: RouterInput) {
  const ctx = {
    input,
    debug: process.env.PORACODE_TUI_DEBUG === "1",
    wslLocation: deriveLocationFromPath(input.bootstrap.directory, process.platform).kind === "wsl",

    sessions: new Map<string, SessionRecord>(),
    states: new Map<string, ThreadStatus>(),
    // Staged /undo targets. The vendored prompt commits before the next send
    // (and /redo clears), so the irreversible checkpointRevert runs on commit —
    // staging alone never touches the host.
    pendingReverts: new Map<string, { messageID: string; checkpointItemId: string }>(),
    pending: new Map<string, PendingRequest>(),
    // Inbox cache: the host owns one pending-steer slot plus an ordered
    // follow-up queue per thread; we mirror them so the vendored inbox list,
    // cancel, and delivery-change routes can answer without inventing state.
    inbox: new Map<string, InboxEntry>(),
    // Items we cancelled locally so the host's next drop is reported as
    // cancelled, not delivered.
    cancelledInboxIds: new Set<string>(),
    goals: new Map<string, GoalItemPayload>(),
    goalListeners: new Set<(rawThreadId: string) => void>(),
    createdWorktrees: new Map<string, string>(),
    pendingSwitches: new Map<string, { providerID: string; modelID: string }>(),
    threadMentionTools: new Map<string, boolean>(),
    // User-message item ids for which the adapter captured a file checkpoint,
    // per thread. checkpointRevert's files phase only restores turns whose base
    // user message has one — send paths create it pre-dispatch, turn.completed
    // finalizes against the turn's anchor.
    capturedCheckpoints: new Map<string, Set<string>>(),
    finalizedAnchors: new Set<string>(),
    // Anchors whose base user_message exists but was never captured (turns that
    // predate this adapter's captures) can never finalize — skip them for good
    // so they don't page the whole thread on every turn.
    uncapturableAnchors: new Set<string>(),
    reconciling: new Set<string>(),
    // `!command` shells: exit resolvers keyed by shellId and the one-shot
    // context stash keyed by session id (cap 3).
    pendingShellExits: new Map<string, () => void>(),
    pendingShellTimeouts: new Set<string>(),
    shellStash: new Map<string, { command: string; output: string }[]>(),
    sessionMcpPending: new Map<string, Map<string, boolean>>(),
    // Agent background tasks per thread, surfaced to the vendored TUI as
    // shells. background_tasks.changed replaces the full list; the store seeds
    // on session load via readThreadBackgroundTasks.
    backgroundTasks: new Map<string, Record<string, unknown>[]>(),
    subagentSubscriptions: new Set<string>(),
    threadCache: new Map<string, Thread>(),

    // Mutable scalars — assigned from routes and helpers across modules, so
    // they live on the context rather than being destructured.
    currentSession: undefined as string | undefined,
    project: undefined as RemoteProject | undefined,
    statuses: undefined as RemoteAgentStatuses | undefined,
    defaultModel: undefined as { providerID: string; model: string } | undefined,
    activeProviderID: undefined as string | undefined,
  };
  return ctx;
}
