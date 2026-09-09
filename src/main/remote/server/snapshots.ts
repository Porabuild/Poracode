import {
  PORACODE_REMOTE_PROTOCOL_VERSION,
  REMOTE_PUSH_ROUTING_VERSION,
  REMOTE_BROWSER_FORWARD_VERSION,
  REMOTE_STANDARD_SCOPES,
  remoteAgentStatusesSchema,
  remoteEnvironmentDescriptorSchema,
  remoteRuntimeItemsPageSchema,
  remoteShellSnapshotSchema,
  remoteThreadSnapshotSchema,
  remoteAgentSlashCommandsSchema,
  type RemoteAgentSlashCommands,
  type RemoteAgentStatuses,
  type RemoteEnvironmentDescriptor,
  type RemoteRuntimeItemsPage,
  type RemoteRuntimeItemsPageRequest,
  type RemoteShellSnapshot,
  type RemoteThreadSnapshot,
} from "@/shared/remote";
import { TERMINAL_CURSOR_SYNC_SUPPORTED_VERSIONS } from "./terminalCursorSync";
import type { BackgroundTask, Thread } from "@/shared/contracts";
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
} from "../../db";
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

export function buildShellSnapshot(ctx: RemoteServerContext): RemoteShellSnapshot {
  const threads = dbGetThreads();
  const runtimeSummariesByThread: RemoteShellSnapshot["runtimeSummariesByThread"] = {};
  const visibleThreads = threads.filter((thread) => !thread.archived);
  const runtimeSummaries = dbGetThreadRuntimeSummaries(visibleThreads.map((thread) => thread.id));
  for (const thread of visibleThreads) {
    const summary = runtimeSummaries[thread.id] ?? { itemCount: 0 };
    runtimeSummariesByThread[thread.id] = {
      itemCount: summary.itemCount,
      ...(summary.latestItemId ? { latestItemId: summary.latestItemId } : {}),
      ...(summary.latestItemType ? { latestItemType: summary.latestItemType } : {}),
      ...(summary.latestItemState ? { latestItemState: summary.latestItemState } : {}),
      ...(summary.contextUsage ? { contextUsage: summary.contextUsage } : {}),
    };
  }
  return remoteShellSnapshotSchema.parse(
    withStableUpdatedAt("shell", {
      snapshotSeq: ctx.seq,
      projects: dbGetProjects(),
      threads,
      runtimeSummariesByThread,
      gitSummariesByThread: ctx.options.gitSummaries?.() ?? {},
      ...(ctx.options.gitState
        ? { gitState: projectGitStateSnapshotForRemote(ctx.options.gitState.getSnapshot()) }
        : {}),
    }),
  );
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
  } = {},
): Promise<RemoteThreadSnapshot> {
  const initialThread = dbGetThread(threadId);
  if (!initialThread) {
    throw new RemoteHttpError("thread_not_found", "Thread not found.", 404);
  }

  const readsTerminal = initialThread.presentationMode !== "gui";
  let terminalScrollback: string | undefined;
  let terminalSize: RemoteThreadSnapshot["terminalSize"] | undefined;
  let backgroundTasks: BackgroundTask[] = [];
  try {
    const [scrollback, size, tasks] = await Promise.all([
      readsTerminal
        ? ctx.options.callSupervisor("readTerminalScrollback", { threadId })
        : undefined,
      readsTerminal ? ctx.options.callSupervisor("readTerminalSize", { threadId }) : undefined,
      ctx.options.callSupervisor("readThreadBackgroundTasks", { threadId }),
    ]);
    terminalScrollback = scrollback || dbGetThreadTerminalScrollback(threadId);
    terminalSize = size ?? undefined;
    backgroundTasks = Array.isArray(tasks) ? tasks : [];
  } catch {
    terminalScrollback = dbGetThreadTerminalScrollback(threadId) || undefined;
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
  return remoteThreadSnapshotSchema.parse(
    withStableUpdatedAt(`thread:${threadId}`, {
      snapshotSeq: ctx.seq,
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
