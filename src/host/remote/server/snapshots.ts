import { getSqlite } from "@/host/db/connection";
import { DEVICE_WORKSPACE_VERSION } from "@/shared/deviceWorkspace";
import { DEVICE_PREVIEW_VERSION } from "@/shared/devicePreview";
import { readRuntimeSnapshot } from "@/host/db/runtimeReadSnapshot";
import { assertLegacySnapshotWithinReservation } from "./legacyReadPrecheck";
import type { ThreadRuntimeSummary } from "@/host/db/runtimeItems";
import { DatabaseReadUnavailableError } from "@/host/db/databaseReadProtocol";
import { readLegacyShellCatalog, readLegacyThreadCatalog } from "@/host/db/legacyCatalogReads";
import { readDatabaseAsync } from "@/host/db/asyncReads";
import { readCommittedRuntimeSnapshot } from "@/host/db/runtimeSnapshotRead";
import { HISTORY_DETAILS_VERSION } from "@/shared/remote/historyPresentation";
import { THREAD_HISTORY_RESUME_VERSION } from "@/shared/remote/historyResume";
import {
  PORACODE_REMOTE_PROTOCOL_VERSION,
  REMOTE_CATALOG_MUTATIONS_VERSION,
  REMOTE_FLAT_THREAD_REORDER_VERSION,
  REMOTE_BOUNDED_CATALOG_CHANGES_VERSION,
  REMOTE_PUSH_ROUTING_VERSION,
  REMOTE_BROWSER_FORWARD_VERSION,
  REMOTE_RUNTIME_HISTORY_NOTICES_VERSION,
  REMOTE_SSH_ENVIRONMENTS_VERSION,
  REMOTE_THREAD_LAUNCH_METADATA_VERSION,
  REMOTE_CONVERSATION_SNAPSHOTS_VERSION,
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
import { type Thread } from "@/shared/contracts";
import {
  beginRuntimeFence,
  dbGetProjects,
  dbGetThread,
  dbGetThreadRuntimeItemsPage,
  flushRuntimeFence,
  readRuntimeFenceAsync,
} from "@/host/db";
import { RemoteHttpError } from "../auth";
import { mapFenceRefusal, mapPersistenceRefusal } from "./persistenceRefusals";
import type { RemoteServerContext } from "./context";
import { readRuntimeHistoryNoticeForRead } from "./runtimeHistoryNoticeGate";
import { CONVERSATION_SEARCH_VERSION } from "@/shared/conversationSearch";
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
  stored: Record<string, ThreadRuntimeSummary>,
): RemoteShellSnapshot["runtimeSummariesByThread"] {
  const visibleThreads = threads.filter((thread) => !thread.archived);
  const runtimeSummaries = stored;
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
      ...(ctx.options.deviceWorkspace
        ? {
            deviceWorkspace: {
              versions: [DEVICE_WORKSPACE_VERSION],
              ...(ctx.options.deviceWorkspace.hasLivePreview()
                ? { livePreview: { versions: [DEVICE_PREVIEW_VERSION], modes: ["h264"] } }
                : {}),
            },
          }
        : {}),
      conversationSearch: { versions: [CONVERSATION_SEARCH_VERSION] },
      historyDetails: { versions: [HISTORY_DETAILS_VERSION] },
      threadHistoryResume: { versions: [THREAD_HISTORY_RESUME_VERSION] },
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
      flatThreadReorder: {
        versions: [REMOTE_FLAT_THREAD_REORDER_VERSION],
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
      conversationSnapshots: { versions: [REMOTE_CONVERSATION_SNAPSHOTS_VERSION] },
      threadForks: { versions: [1] },
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
  return projectShellSnapshot(ctx, readLegacyShellCatalog(options), options, ctx.seq, true);
}

export async function buildShellSnapshotAsync(
  ctx: RemoteServerContext,
  options: { threadListLimit?: number } = {},
): Promise<RemoteShellSnapshot> {
  const snapshotSeq = ctx.seq;
  const data = await readDatabaseAsync("legacyShellCatalog", [options], () =>
    readRuntimeSnapshot(getSqlite(), () => {
      assertLegacySnapshotWithinReservation(options);
      return readLegacyShellCatalog(options);
    }),
  );
  return projectShellSnapshot(ctx, data, options, snapshotSeq, ctx.seq === snapshotSeq);
}

function projectShellSnapshot(
  ctx: RemoteServerContext,
  data: ReturnType<typeof readLegacyShellCatalog>,
  options: { threadListLimit?: number },
  snapshotSeq: number,
  mayPrune: boolean,
): RemoteShellSnapshot {
  const { projects, summaries, nextCursor: threadsNextCursor } = data;
  if (options.threadListLimit === undefined && mayPrune) {
    const knownThreadIds = new Set(data.threads.map((thread) => thread.id));
    ctx.sessionConfigInventory.retainThreads(knownThreadIds);
    ctx.threadLiveReadState.retainThreads(knownThreadIds);
  }
  const threads = data.threads.map((thread) => ctx.sessionConfigInventory.enrichThreadRow(thread));
  const summariesByThread = runtimeSummariesFor(threads, summaries);
  const gitSummariesByThread =
    options.threadListLimit === undefined
      ? (ctx.options.gitSummaries?.() ?? {})
      : gitSummariesFor(ctx, threads);
  const gitState = ctx.options.gitState
    ? projectGitStateSnapshotForRemote(ctx.options.gitState.getSnapshot())
    : undefined;
  // Async readers pin before dispatch. Never move the cursor past mutations
  // that may have occurred after the worker took its SQLite snapshot.
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
  let data;
  try {
    data = readLegacyThreadCatalog(input);
  } catch {
    throw new RemoteHttpError(
      "invalid_thread_cursor",
      "The thread list cursor is not recognized by this host.",
      400,
    );
  }
  return projectThreadListPage(ctx, data);
}

export async function buildThreadListPageAsync(
  ctx: RemoteServerContext,
  input: { cursor?: string; limit: number },
): Promise<RemoteThreadListPage> {
  let data;
  try {
    data = await readDatabaseAsync("legacyThreadCatalog", [input], () =>
      readLegacyThreadCatalog(input),
    );
  } catch (error) {
    if (error instanceof DatabaseReadUnavailableError) throw mapPersistenceRefusal(error);
    throw new RemoteHttpError(
      "invalid_thread_cursor",
      "The thread list cursor is not recognized by this host.",
      400,
    );
  }
  return projectThreadListPage(ctx, data);
}

function projectThreadListPage(
  ctx: RemoteServerContext,
  page: ReturnType<typeof readLegacyThreadCatalog>,
): RemoteThreadListPage {
  return remoteThreadListPageSchema.parse({
    threads: page.threads.map((thread) => ctx.sessionConfigInventory.enrichThreadRow(thread)),
    runtimeSummariesByThread: runtimeSummariesFor(page.threads, page.summaries),
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
        !project.disabled && project.location.kind === "wsl" ? [project.location.distro] : [],
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
        !project.disabled && project.location.kind === "wsl" ? [project.location.distro] : [],
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
  let history;
  try {
    history = await readRuntimeFenceAsync(fenceToken, async () => {
      const runtimeNotice = readRuntimeHistoryNoticeForRead(
        ctx,
        threadId,
        options.noticesDeclared === true,
      );
      const readOptions = {
        ...(options.runtimePage !== undefined ? { runtimePage: options.runtimePage } : {}),
        ...(options.targetTimelineEntryCount !== undefined
          ? { targetTimelineEntryCount: options.targetTimelineEntryCount }
          : {}),
        terminalScrollback: readsTerminal && !options.omitScrollback,
        omitScrollback: options.omitScrollback === true,
      };
      const data = await readDatabaseAsync("runtimeSnapshot", [threadId, readOptions], () =>
        readCommittedRuntimeSnapshot(threadId, readOptions),
      );
      return { ...data, runtimeNotice };
    });
  } catch (error) {
    throw mapPersistenceRefusal(error);
  }
  const { runtimePage, runtimeItems, latestGoal, completedTurns, contextUsage, runtimeNotice } =
    history;
  const runtimeItemsWithGoal =
    latestGoal && !runtimeItems.some((item) => item.id === latestGoal.id)
      ? [latestGoal, ...runtimeItems]
      : runtimeItems;

  // Stored history and latest host-projected controls are independent of
  // supervisor/agent readiness. Live terminal contents arrive through the
  // separately subscribed terminal watch; a cold snapshot uses its durable tail.
  const terminalScrollback = history.terminalScrollback || undefined;
  const backgroundTasks = [...(ctx.backgroundTasksByThread.get(threadId) ?? [])];
  const followUpQueue = readsTerminal ? null : ctx.threadLiveReadState.queueFor(threadId);

  const thread = dbGetThread(threadId);
  if (!thread) {
    throw new RemoteHttpError("thread_not_found", "Thread not found.", 404);
  }
  const enrichedThread = ctx.sessionConfigInventory.enrichThreadRow(thread);
  return remoteThreadSnapshotSchema.parse(
    withStableUpdatedAt(`thread:${threadId}`, {
      snapshotSeq,
      ...ctx.threadLiveReadState.projectSnapshotRuntime(enrichedThread),
      // Inline image bytes are replaced by host-minted references: they are ~89%
      // of runtime payload bytes and the client fetches each one on demand.
      runtimeItems: projectRuntimeItemsImageRefs(threadId, runtimeItemsWithGoal),
      ...(runtimePage ? { runtimeNextCursor: runtimePage.nextCursor } : {}),
      completedTurns,
      contextUsage,
      backgroundTasks,
      ...(terminalScrollback ? { terminalScrollback } : {}),
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
  let page: Awaited<ReturnType<typeof dbGetThreadRuntimeItemsPage>>;
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
