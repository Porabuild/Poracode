import {
  PORACODE_REMOTE_PROTOCOL_VERSION,
  REMOTE_STANDARD_SCOPES,
  remoteAgentStatusesSchema,
  remoteEnvironmentDescriptorSchema,
  remoteRuntimeItemsPageSchema,
  remoteShellSnapshotSchema,
  remoteThreadSnapshotSchema,
  type RemoteAgentStatuses,
  type RemoteEnvironmentDescriptor,
  type RemoteRuntimeItemsPage,
  type RemoteRuntimeItemsPageRequest,
  type RemoteShellSnapshot,
  type RemoteThreadSnapshot,
} from "@/shared/remote";
import type { Thread } from "@/shared/contracts";
import {
  dbGetProjects,
  dbGetThread,
  dbGetThreadCompletedTurns,
  dbGetThreadContextUsage,
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

export async function buildAgentStatuses(ctx: RemoteServerContext): Promise<RemoteAgentStatuses> {
  const wslDistros = [
    ...new Set(
      dbGetProjects().flatMap((project) =>
        project.location.kind === "wsl" ? [project.location.distro] : [],
      ),
    ),
  ];
  const statuses = await ctx.options.callSupervisor("getAgentStatuses", { wslDistros });
  return remoteAgentStatusesSchema.parse(
    withStableUpdatedAt("agent-statuses", {
      windows: statuses.windows,
      wsl: statuses.wsl,
    }),
  );
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

  let terminalScrollback: string | undefined;
  let terminalSize: RemoteThreadSnapshot["terminalSize"] | undefined;
  try {
    const [scrollback, size] = await Promise.all([
      ctx.options.callSupervisor("readTerminalScrollback", { threadId }),
      ctx.options.callSupervisor("readTerminalSize", { threadId }),
    ]);
    terminalScrollback = scrollback || dbGetThreadTerminalScrollback(threadId);
    terminalSize = size ?? undefined;
  } catch {
    terminalScrollback = dbGetThreadTerminalScrollback(threadId) || undefined;
    terminalSize = undefined;
  }

  // The terminal reads above cross an async supervisor boundary. Runtime and
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
  return remoteThreadSnapshotSchema.parse(
    withStableUpdatedAt(`thread:${threadId}`, {
      snapshotSeq: ctx.seq,
      thread,
      // Inline image bytes are replaced by host-minted references: they are ~89%
      // of runtime payload bytes and the client fetches each one on demand.
      runtimeItems: projectRuntimeItemsImageRefs(
        threadId,
        runtimePage?.items ?? dbGetThreadRuntimeItems(threadId),
      ),
      ...(runtimePage ? { runtimeNextCursor: runtimePage.nextCursor } : {}),
      completedTurns: dbGetThreadCompletedTurns(threadId),
      contextUsage: dbGetThreadContextUsage(threadId),
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
