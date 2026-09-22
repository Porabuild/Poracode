import {
  PORACODE_REMOTE_PROTOCOL_VERSION,
  REMOTE_CATALOG_MUTATIONS_VERSION,
  REMOTE_BOUNDED_CATALOG_CHANGES_VERSION,
  REMOTE_PUSH_ROUTING_VERSION,
  REMOTE_BROWSER_FORWARD_VERSION,
  REMOTE_RUNTIME_HISTORY_NOTICES_VERSION,
  REMOTE_SSH_ENVIRONMENTS_VERSION,
  REMOTE_THREAD_LAUNCH_METADATA_VERSION,
  REMOTE_PROJECT_COMMAND_RESULTS_VERSION,
  REMOTE_EXPERIMENTS_VERSION,
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
  type RemoteRuntimeHistoryNotice,
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
  beginRuntimeFence,
  dbGetProjects,
  dbGetThread,
  dbGetThreadCompletedTurns,
  dbGetThreadContextUsage,
  dbGetThreadRuntimeSummariesCommitted,
  dbGetThreadRuntimeItemsPage,
  dbReadLatestThreadGoalItem,
  dbReadThreadRuntimeItems,
  dbReadThreadRuntimeItemsPage,
  dbGetThreadTerminalScrollback,
  dbGetThreads,
  dbGetThreadsPage,
  flushRuntimeFence,
  readRuntimeFence,
} from "@/host/db";
import {
  LEGACY_RUNTIME_PAGE_LIMIT,
  LEGACY_RUNTIME_PAGE_TARGET_ENTRIES,
} from "@/host/db/runtimeTimelineReads";
import { RemoteHttpError } from "../auth";
import { mapFenceRefusal, mapPersistenceRefusal } from "./persistenceRefusals";
import type { RemoteServerContext } from "./context";
import { readRuntimeHistoryNoticeForRead } from "./runtimeHistoryNoticeGate";
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
  const runtimeSummaries = dbGetThreadRuntimeSummariesCommitted(
    visibleThreads.map((thread) => thread.id),
  );
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
      ...(ctx.options.environmentManagement && ctx.environmentProxy
        ? { sshEnvironments: { versions: [REMOTE_SSH_ENVIRONMENTS_VERSION] } }
        : {}),
      ...(ctx.options.portProxy
        ? { browserForward: { versions: [REMOTE_BROWSER_FORWARD_VERSION] } }
        : {}),
      ...(ctx.options.pushRegistrations
        ? { pushRouting: { versions: [REMOTE_PUSH_ROUTING_VERSION] } }
        : {}),
      // B1: advertised only when the composition wired the durable gap/notice
      // store; a client shows the recovery action only when it is advertised.
      ...(ctx.options.runtimeHistoryGap
        ? { runtimeHistoryNotices: { versions: [REMOTE_RUNTIME_HISTORY_NOTICES_VERSION] } }
        : {}),
      terminalCursorSync: {
        versions: [...TERMINAL_CURSOR_SYNC_SUPPORTED_VERSIONS],
      },
      // Managed catalog mutations: relative project/thread reorder, nullable
      // workspace assignment, and project draft-config persistence ride the
      // existing command routes on every composition that serves them.
      catalogMutations: {
        versions: [REMOTE_CATALOG_MUTATIONS_VERSION],
      },
      // Bounded catalog-change notifications: a client may declare
      // `catalogChanges=bounded-v1` on its event socket to receive the bounded
      // signal form instead of the full catalog list. Every composition that
      // serves the shared event stream implements the projection, so this is
      // unconditional; it is a separate capability from catalog mutability.
      boundedCatalogChanges: {
        versions: [REMOTE_BOUNDED_CATALOG_CHANGES_VERSION],
      },
      // Managed-root launch metadata: a `start` command's workspace/geometry
      // and parent/PR lineage are persisted by this route implementation and
      // honored at launch. Separate from catalog mutability: a client sends
      // only the fields it knows this host will apply.
      threadLaunchMetadata: {
        versions: [REMOTE_THREAD_LAUNCH_METADATA_VERSION],
      },
      // Managed-root bounded project-command results: the existing project
      // command route honors the exact per-request bounded declaration.
      projectCommandResults: {
        versions: [REMOTE_PROJECT_COMMAND_RESULTS_VERSION],
      },
      // Experiment authority: advertised ONLY when this composition wired the
      // embedded desktop authority port (the local-shell experiment worktree
      // driver). A headless/helper composition omits the port, so the routes
      // answer 501 and clients refuse the feature truthfully. The mutating
      // routes additionally enforce the documented loopback LOCALITY check.
      ...(ctx.options.experimentAuthority
        ? { experiments: { versions: [REMOTE_EXPERIMENTS_VERSION] } }
        : {}),
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
  const projects = dbGetProjects();
  const gitState = ctx.options.gitState
    ? projectGitStateSnapshotForRemote(ctx.options.gitState.getSnapshot())
    : undefined;
  // Capture the sequence after every synchronous read (summaries barrier
  // included) so the cursor never lags content that the snapshot already
  // contains. Shell summaries are projections, so a degraded barrier still
  // serves the committed prefix here.
  const snapshotSeq = ctx.seq;
  return remoteShellSnapshotSchema.parse(
    withStableUpdatedAt("shell", {
      snapshotSeq,
      projects,
      threads,
      ...(threadsNextCursor ? { threadsNextCursor } : {}),
      runtimeSummariesByThread: summariesByThread,
      gitSummariesByThread,
      ...(gitState ? { gitState } : {}),
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
    /**
     * B1: the request declared `notices=v1`. Read and gated inside the fenced
     * turn; absent means an incapable reader is refused typed on a notice
     * thread instead of being served a transcript it cannot reconcile.
     */
    readonly noticesDeclared?: boolean;
  } = {},
): Promise<RemoteThreadSnapshot> {
  const initialThread = dbGetThread(threadId);
  if (!initialThread) {
    throw new RemoteHttpError("thread_not_found", "Thread not found.", 404);
  }

  const readsTerminal = initialThread.presentationMode !== "gui";
  // Asynchronous committed-prefix fence: pin the intake prefix and capture the
  // published cursor in the SAME synchronous turn, then commit the prefix in
  // chunks, then read behind the held fence. Content is exactly the published
  // canonical domain at or below `snapshotSeq`: no yielded gap can admit an
  // event that content misses while the cursor already covers it.
  let fenceToken: ReturnType<typeof beginRuntimeFence>;
  try {
    // Waiter-bound exhaustion throws synchronously here, before the fence
    // exists; it is the same typed retryable refusal as a failed flush.
    fenceToken = beginRuntimeFence(threadId);
  } catch (error) {
    throw mapPersistenceRefusal(error);
  }
  const snapshotSeq = ctx.seq;
  const fenceResult = await flushRuntimeFence(fenceToken);
  if (fenceResult.kind !== "committed") {
    throw mapFenceRefusal(threadId, fenceResult);
  }
  let runtimePage: ReturnType<typeof dbReadThreadRuntimeItemsPage> | null = null;
  let runtimeItems: ReturnType<typeof dbReadThreadRuntimeItems>;
  let latestGoal: ReturnType<typeof dbReadLatestThreadGoalItem>;
  let completedTurns: ReturnType<typeof dbGetThreadCompletedTurns>;
  let contextUsage: ReturnType<typeof dbGetThreadContextUsage>;
  let runtimeNotice: ReturnType<typeof readRuntimeHistoryNoticeForRead>;
  try {
    ({ runtimePage, runtimeItems, latestGoal, completedTurns, contextUsage, runtimeNotice } =
      readRuntimeFence(fenceToken, () => {
        const page = options.runtimePage
          ? dbReadThreadRuntimeItemsPage(
              threadId,
              undefined,
              LEGACY_RUNTIME_PAGE_LIMIT,
              options.targetTimelineEntryCount ?? LEGACY_RUNTIME_PAGE_TARGET_ENTRIES,
            )
          : null;
        return {
          runtimePage: page,
          runtimeItems: page?.items ?? dbReadThreadRuntimeItems(threadId),
          latestGoal: page ? dbReadLatestThreadGoalItem(threadId) : null,
          completedTurns: dbGetThreadCompletedTurns(threadId),
          contextUsage: dbGetThreadContextUsage(threadId),
          // B1: the notice read and its declared-reader gate share this
          // synchronous fenced turn with the transcript read, so an
          // acknowledgement cannot land between them.
          runtimeNotice: readRuntimeHistoryNoticeForRead(
            ctx,
            threadId,
            options.noticesDeclared === true,
          ),
        };
      }));
  } catch (error) {
    // A contaminated thread must not be served as a short transcript with a
    // fresh cursor (the client would replay and double-apply the gap). Refuse
    // with a retryable typed error instead.
    throw mapPersistenceRefusal(error);
  }
  const runtimeItemsWithGoal =
    latestGoal && !runtimeItems.some((item) => item.id === latestGoal.id)
      ? [latestGoal, ...runtimeItems]
      : runtimeItems;

  // Async supervisor reads come after the cursor. A queue/task/state event that
  // lands while they are suspended is > cursor and arrives through WS replay;
  // applying those events is idempotent, so the snapshot can never silently
  // miss an update it does not carry.
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
  // row before returning; otherwise a completed transcript can be returned
  // with an older `working` status and the client will conservatively treat
  // the history as non-authoritative. A state newer than the cursor is
  // re-delivered by replay, so this cannot disagree silently.
  const thread = dbGetThread(threadId);
  if (!thread) {
    throw new RemoteHttpError("thread_not_found", "Thread not found.", 404);
  }
  const followUpQueue = await followUpQueuePromise;
  return remoteThreadSnapshotSchema.parse(
    withStableUpdatedAt(`thread:${threadId}`, {
      snapshotSeq,
      thread,
      // Inline image bytes are replaced by host-minted references: they are ~89%
      // of runtime payload bytes and the client fetches each one on demand.
      runtimeItems: projectRuntimeItemsImageRefs(threadId, runtimeItemsWithGoal),
      ...(runtimePage ? { runtimeNextCursor: runtimePage.nextCursor } : {}),
      completedTurns,
      contextUsage,
      backgroundTasks,
      ...(terminalScrollback ? { terminalScrollback } : {}),
      ...(terminalSize ? { terminalSize } : {}),
      ...(followUpQueue !== undefined ? { followUpQueue } : {}),
      ...(runtimeNotice !== undefined ? { runtimeNotice } : {}),
    }),
  );
}

export async function buildThreadRuntimeItemsPage(
  input: RemoteRuntimeItemsPageRequest,
  options: {
    /**
     * B1: the durable notice already read + gated by the caller for this
     * request. Managed GUI hydration reads item pages, so the notice must ride
     * this shape too; the caller reads it synchronously with the gate.
     */
    readonly runtimeNotice?: RemoteRuntimeHistoryNotice;
  } = {},
): Promise<RemoteRuntimeItemsPage> {
  if (!dbGetThread(input.threadId)) {
    throw new RemoteHttpError("thread_not_found", "Thread not found.", 404);
  }
  let page: ReturnType<typeof dbReadThreadRuntimeItemsPage>;
  try {
    page = await dbGetThreadRuntimeItemsPage(
      input.threadId,
      input.beforePosition,
      input.limit,
      input.targetTimelineEntryCount,
    );
  } catch (error) {
    throw mapPersistenceRefusal(error);
  }
  return remoteRuntimeItemsPageSchema.parse({
    ...page,
    items: projectRuntimeItemsImageRefs(input.threadId, page.items),
    ...(options.runtimeNotice ? { runtimeNotice: options.runtimeNotice } : {}),
  });
}
