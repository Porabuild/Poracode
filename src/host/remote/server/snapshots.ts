import {
  PORACODE_REMOTE_PROTOCOL_VERSION,
  REMOTE_PUSH_ROUTING_VERSION,
  REMOTE_BROWSER_FORWARD_VERSION,
  REMOTE_STANDARD_SCOPES,
  remoteAgentStatusesSchema,
  remoteEnvironmentDescriptorSchema,
  remoteRuntimeItemsPageSchema,
  remoteShellSnapshotSchema,
  remoteThreadListPageSchema,
  remoteThreadSnapshotSchema,
  remoteAgentSlashCommandsSchema,
  type RemoteAgentSlashCommands,
  type RemoteAgentStatuses,
  type RemoteEnvironmentDescriptor,
  type RemoteRuntimeItemsPage,
  type RemoteRuntimeItemsPageRequest,
  type RemoteShellSnapshot,
  type RemoteThreadListPage,
  type RemoteThreadSnapshot,
} from "@/shared/remote";
import { TERMINAL_CURSOR_SYNC_SUPPORTED_VERSIONS } from "./terminalCursorSync";
import {
  threadFollowUpQueueStateSchema,
  type BackgroundTask,
  type Thread,
} from "@/shared/contracts";
import {
  dbGetProjects,
  dbGetThread,
  dbGetThreadCompletedTurns,
  dbGetThreadContextUsage,
  dbGetLatestThreadGoalItem,
  dbGetThreadRuntimeItems,
  dbGetThreadRuntimeItemsPage,
  dbGetThreadRuntimeSummaries,
  dbGetThreadTerminalScrollback,
  dbGetThreads,
  dbGetThreadsPage,
} from "@/host/db";
import { RemoteHttpError } from "../auth";
import type { RemoteServerContext } from "./context";
import { withStableUpdatedAt } from "./stableUpdatedAt";
import { projectRuntimeItemsImageRefs } from "./imageRefProjection";
import { projectGitStateSnapshotForRemote } from "./gitStateProjection";

/** Sort order for a thread already known to the DB; remote-created rows that
 * aren't present yet sort to the top via a descending timestamp. */
export function sortOrderForThread(threads: readonly Thread[], threadId: string): number {
  const index = threads.findIndex((thread) => thread.id === threadId);
  return index === -1 ? -Date.now() : index;
}

/**
 * Per-thread runtime summaries for a thread slice, in the shell snapshot's
 * shape. Shared by the shell snapshot and the bounded thread-list pages so
 * their summary semantics cannot drift.
 */
function runtimeSummariesFor(
  threads: readonly Thread[],
): RemoteShellSnapshot["runtimeSummariesByThread"] {
  const visibleThreads = threads.filter((thread) => !thread.archived);
  const runtimeSummaries = dbGetThreadRuntimeSummaries(visibleThreads.map((thread) => thread.id));
  const summariesByThread: RemoteShellSnapshot["runtimeSummariesByThread"] = {};
  for (const thread of visibleThreads) {
    const summary = runtimeSummaries[thread.id] ?? { itemCount: 0 };
    summariesByThread[thread.id] = {
      itemCount: summary.itemCount,
      ...(summary.latestItemId ? { latestItemId: summary.latestItemId } : {}),
      ...(summary.latestItemType ? { latestItemType: summary.latestItemType } : {}),
      ...(summary.latestItemState ? { latestItemState: summary.latestItemState } : {}),
      ...(summary.contextUsage ? { contextUsage: summary.contextUsage } : {}),
    };
  }
  return summariesByThread;
}

/** Slice the thread-keyed git summaries down to one page's thread ids. */
function gitSummariesFor(
  ctx: RemoteServerContext,
  threads: readonly Thread[],
): RemoteShellSnapshot["gitSummariesByThread"] {
  const all = ctx.options.gitSummaries?.() ?? {};
  const ids = new Set(threads.map((thread) => thread.id));
  const sliced: NonNullable<RemoteShellSnapshot["gitSummariesByThread"]> = {};
  for (const [threadId, summary] of Object.entries(all)) {
    if (ids.has(threadId)) sliced[threadId] = summary;
  }
  return sliced;
}

export function descriptor(ctx: RemoteServerContext): RemoteEnvironmentDescriptor {
  const info = ctx.requireInfo();
  const platform =
    process.platform === "win32" || process.platform === "darwin" || process.platform === "linux"
      ? process.platform
      : undefined;
  return remoteEnvironmentDescriptorSchema.parse({
    protocolVersion: PORACODE_REMOTE_PROTOCOL_VERSION,
    hostMode: ctx.options.hostMode ?? "desktop",
    desktopId: ctx.options.identity.desktopId,
    label: ctx.options.identity.label,
    appVersion: ctx.options.appVersion,
    ...(platform ? { platform } : {}),
    auth: {
      policy: "remote-reachable",
      bootstrapMethods: ["one-time-token"],
      sessionMethods: ["bearer-access-token"],
      scopes: REMOTE_STANDARD_SCOPES,
    },
    endpoints: {
      httpBaseUrl: info.httpBaseUrl,
      wsBaseUrl: info.wsBaseUrl,
    },
    capabilities: {
      ...(ctx.options.portProxy
        ? { browserForward: { versions: [REMOTE_BROWSER_FORWARD_VERSION] } }
        : {}),
      ...(ctx.options.pushRegistrations
        ? { pushRouting: { versions: [REMOTE_PUSH_ROUTING_VERSION] } }
        : {}),
      terminalCursorSync: {
        versions: [...TERMINAL_CURSOR_SYNC_SUPPORTED_VERSIONS],
      },
    },
  });
}

/**
 * Builds the shell snapshot. Without `threadListLimit` the historical full
 * thread list is served (legacy clients depend on it). With it (Gate 4
 * hazard #3) the list is bounded to its first `limit` rows plus a
 * `threadsNextCursor` that pages the remainder from {@link buildThreadListPage};
 * the thread-keyed summary maps are sliced to the returned rows so no
 * response grows with the whole host.
 */
export function buildShellSnapshot(
  ctx: RemoteServerContext,
  options: { threadListLimit?: number } = {},
): RemoteShellSnapshot {
  let threads: Thread[];
  let threadsNextCursor: string | null | undefined;
  let summariesByThread: RemoteShellSnapshot["runtimeSummariesByThread"];
  let gitSummariesByThread: RemoteShellSnapshot["gitSummariesByThread"];
  if (options.threadListLimit === undefined) {
    threads = dbGetThreads();
    summariesByThread = runtimeSummariesFor(threads);
    gitSummariesByThread = ctx.options.gitSummaries?.() ?? {};
  } else {
    const page = dbGetThreadsPage({ limit: options.threadListLimit });
    threads = page.threads;
    summariesByThread = runtimeSummariesFor(threads);
    gitSummariesByThread = gitSummariesFor(ctx, threads);
    threadsNextCursor = page.nextCursor;
  }
  return remoteShellSnapshotSchema.parse(
    withStableUpdatedAt("shell", {
      snapshotSeq: ctx.seq,
      projects: dbGetProjects(),
      threads,
      ...(threadsNextCursor ? { threadsNextCursor } : {}),
      runtimeSummariesByThread: summariesByThread,
      gitSummariesByThread,
      ...(ctx.options.gitState
        ? { gitState: projectGitStateSnapshotForRemote(ctx.options.gitState.getSnapshot()) }
        : {}),
    }),
  );
}

/**
 * One continuation page for a threadLimit-bounded shell snapshot. Clients
 * reach this route only after a snapshot returned `threadsNextCursor`, so a
 * host cursor reply always matches a page-producing host.
 */
export function buildThreadListPage(
  ctx: RemoteServerContext,
  input: { cursor?: string; limit: number },
): RemoteThreadListPage {
  let page: ReturnType<typeof dbGetThreadsPage>;
  try {
    page = dbGetThreadsPage({
      limit: input.limit,
      ...(input.cursor !== undefined ? { cursor: input.cursor } : {}),
    });
  } catch {
    throw new RemoteHttpError(
      "invalid_thread_cursor",
      "The thread list cursor is not recognized by this host.",
      400,
    );
  }
  return remoteThreadListPageSchema.parse({
    threads: page.threads,
    runtimeSummariesByThread: runtimeSummariesFor(page.threads),
    gitSummariesByThread: gitSummariesFor(ctx, page.threads),
    nextCursor: page.nextCursor,
  });
}

export async function buildAgentStatuses(
  ctx: RemoteServerContext,
  options: { omitSlashCommands?: boolean } = {},
): Promise<RemoteAgentStatuses> {
  const wslDistros = [
    ...new Set(
      dbGetProjects().flatMap((project) =>
        project.location.kind === "wsl" ? [project.location.distro] : [],
      ),
    ),
  ];
  const statuses = await ctx.options.callSupervisor("getAgentStatuses", { wslDistros });
  // WS3-A payload split: slash-command catalogs dominate this payload (they
  // embed full skill descriptions for every detected agent). Clients that
  // opt in fetch one agent's catalog lazily from agent-slash-commands
  // instead of every agent's on every cold start.
  const windows = options.omitSlashCommands
    ? statuses.windows.map((entry) => ({
        ...entry,
        capabilities: { ...entry.capabilities, slashCommands: undefined },
      }))
    : statuses.windows;
  const wsl = options.omitSlashCommands
    ? statuses.wsl.map((entry) => ({
        ...entry,
        capabilities: { ...entry.capabilities, slashCommands: undefined },
      }))
    : statuses.wsl;
  return remoteAgentStatusesSchema.parse(
    withStableUpdatedAt("agent-statuses", {
      windows,
      wsl,
    }),
  );
}

/**
 * One agent's slash-command catalog for the WS3-A lazy fetch. Reads the same
 * supervisor detection as agent-statuses; `kind` matches the agent kind the
 * client already sees there.
 */
export async function buildAgentSlashCommands(
  ctx: RemoteServerContext,
  kind: string,
): Promise<RemoteAgentSlashCommands> {
  const wslDistros = [
    ...new Set(
      dbGetProjects().flatMap((project) =>
        project.location.kind === "wsl" ? [project.location.distro] : [],
      ),
    ),
  ];
  const statuses = await ctx.options.callSupervisor("getAgentStatuses", { wslDistros });
  const entry = [...statuses.windows, ...statuses.wsl].find((candidate) => candidate.kind === kind);
  if (!entry) {
    throw new RemoteHttpError("agent_not_found", `No detected agent "${kind}".`, 404);
  }
  return remoteAgentSlashCommandsSchema.parse({
    kind,
    commands: entry.capabilities?.slashCommands ?? [],
  });
}

export async function buildThreadSnapshot(
  ctx: RemoteServerContext,
  threadId: string,
  options: {
    readonly runtimePage?: boolean;
    readonly targetTimelineEntryCount?: number;
    /**
     * WS3 #2: cursor-sync (v2) clients render the terminal from the watch
     * baseline, which re-delivers the retained tail anyway — skip the
     * inlined `terminalScrollback` here so the tail is never sent twice.
     */
    readonly omitScrollback?: boolean;
  } = {},
): Promise<RemoteThreadSnapshot> {
  // Capture the sequence at request start. The snapshot reads several
  // independent async sources; using ctx.seq at return would label a queue
  // read taken before a live event as current when that event lands while the
  // other reads are suspended.
  const snapshotSeq = ctx.seq;
  const initialThread = dbGetThread(threadId);
  if (!initialThread) {
    throw new RemoteHttpError("thread_not_found", "Thread not found.", 404);
  }

  const readsTerminal = initialThread.presentationMode !== "gui";
  let terminalScrollback: string | undefined;
  let terminalSize: RemoteThreadSnapshot["terminalSize"] | undefined;
  // Keep this call independent from the terminal reads below. A host with an
  // older supervisor can still serve the existing thread history even when it
  // cannot provide the additive queued-follow-up snapshot field.
  const followUpQueuePromise = Promise.resolve()
    .then(() =>
      readsTerminal ? null : ctx.options.callSupervisor("getThreadFollowUpQueue", { threadId }),
    )
    .then((queue) => {
      const parsed = threadFollowUpQueueStateSchema.nullable().safeParse(queue);
      return parsed.success ? parsed.data : undefined;
    })
    .catch(() => undefined);
  let backgroundTasks: BackgroundTask[] = [];
  try {
    const [scrollback, size, tasks] = await Promise.all([
      readsTerminal && !options.omitScrollback
        ? ctx.options.callSupervisor("readTerminalScrollback", { threadId })
        : undefined,
      readsTerminal ? ctx.options.callSupervisor("readTerminalSize", { threadId }) : undefined,
      ctx.options.callSupervisor("readThreadBackgroundTasks", { threadId }),
    ]);
    terminalScrollback = options.omitScrollback
      ? undefined
      : scrollback || dbGetThreadTerminalScrollback(threadId);
    terminalSize = size ?? undefined;
    backgroundTasks = Array.isArray(tasks) ? tasks : [];
  } catch {
    terminalScrollback = options.omitScrollback
      ? undefined
      : dbGetThreadTerminalScrollback(threadId) || undefined;
    terminalSize = undefined;
    backgroundTasks = [];
  }
  backgroundTasks = [...(ctx.backgroundTasksByThread.get(threadId) ?? backgroundTasks)];

  // The supervisor reads above cross an async boundary. Runtime and
  // thread-state events can persist while they are in flight, so re-read the
  // row before taking the synchronous runtime snapshot; otherwise a completed
  // transcript can be returned with an older `working` status and the client
  // will conservatively treat the history as non-authoritative.
  const thread = dbGetThread(threadId);
  if (!thread) {
    throw new RemoteHttpError("thread_not_found", "Thread not found.", 404);
  }
  const runtimePage = options.runtimePage
    ? dbGetThreadRuntimeItemsPage(threadId, undefined, 500, options.targetTimelineEntryCount ?? 40)
    : null;
  const runtimeItems = runtimePage?.items ?? dbGetThreadRuntimeItems(threadId);
  const latestGoal = runtimePage ? dbGetLatestThreadGoalItem(threadId) : null;
  const runtimeItemsWithGoal =
    latestGoal && !runtimeItems.some((item) => item.id === latestGoal.id)
      ? [latestGoal, ...runtimeItems]
      : runtimeItems;
  const followUpQueue = await followUpQueuePromise;
  return remoteThreadSnapshotSchema.parse(
    withStableUpdatedAt(`thread:${threadId}`, {
      snapshotSeq,
      thread,
      // Inline image bytes are replaced by host-minted references: they are ~89%
      // of runtime payload bytes and the client fetches each one on demand.
      runtimeItems: projectRuntimeItemsImageRefs(threadId, runtimeItemsWithGoal),
      ...(runtimePage ? { runtimeNextCursor: runtimePage.nextCursor } : {}),
      completedTurns: dbGetThreadCompletedTurns(threadId),
      contextUsage: dbGetThreadContextUsage(threadId),
      backgroundTasks,
      ...(terminalScrollback ? { terminalScrollback } : {}),
      ...(terminalSize ? { terminalSize } : {}),
      ...(followUpQueue !== undefined ? { followUpQueue } : {}),
    }),
  );
}

export function buildThreadRuntimeItemsPage(
  input: RemoteRuntimeItemsPageRequest,
): RemoteRuntimeItemsPage {
  if (!dbGetThread(input.threadId)) {
    throw new RemoteHttpError("thread_not_found", "Thread not found.", 404);
  }
  const page = dbGetThreadRuntimeItemsPage(
    input.threadId,
    input.beforePosition,
    input.limit,
    input.targetTimelineEntryCount,
  );
  return remoteRuntimeItemsPageSchema.parse({
    ...page,
    items: projectRuntimeItemsImageRefs(input.threadId, page.items),
  });
}
