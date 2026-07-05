import {
  LIGHTCODE_REMOTE_PROTOCOL_VERSION,
  REMOTE_STANDARD_SCOPES,
  remoteAgentStatusesSchema,
  remoteEnvironmentDescriptorSchema,
  remoteShellSnapshotSchema,
  remoteThreadSnapshotSchema,
  type RemoteAgentStatuses,
  type RemoteEnvironmentDescriptor,
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
  dbGetThreadRuntimeSummaries,
  dbGetThreads,
} from "../../db";
import { RemoteHttpError } from "../auth";
import type { RemoteServerContext } from "./context";

/** Sort order for a thread already known to the DB; remote-created rows that
 * aren't present yet sort to the top via a descending timestamp. */
export function sortOrderForThread(threads: readonly Thread[], threadId: string): number {
  const index = threads.findIndex((thread) => thread.id === threadId);
  return index === -1 ? -Date.now() : index;
}

export function descriptor(ctx: RemoteServerContext): RemoteEnvironmentDescriptor {
  const info = ctx.requireInfo();
  return remoteEnvironmentDescriptorSchema.parse({
    protocolVersion: LIGHTCODE_REMOTE_PROTOCOL_VERSION,
    desktopId: ctx.options.identity.desktopId,
    label: ctx.options.identity.label,
    appVersion: ctx.options.appVersion,
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
  return remoteShellSnapshotSchema.parse({
    snapshotSeq: ctx.seq,
    projects: dbGetProjects(),
    threads,
    runtimeSummariesByThread,
    gitSummariesByThread: ctx.options.gitSummaries?.() ?? {},
    updatedAt: new Date().toISOString(),
  });
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
  return remoteAgentStatusesSchema.parse({
    windows: statuses.windows,
    wsl: statuses.wsl,
    updatedAt: new Date().toISOString(),
  });
}

export async function buildThreadSnapshot(
  ctx: RemoteServerContext,
  threadId: string,
): Promise<RemoteThreadSnapshot> {
  const thread = dbGetThread(threadId);
  if (!thread) {
    throw new RemoteHttpError("thread_not_found", "Thread not found.", 404);
  }

  let terminalScrollback: string | undefined;
  let terminalSize: RemoteThreadSnapshot["terminalSize"] | undefined;
  try {
    const [scrollback, size] = await Promise.all([
      ctx.options.callSupervisor("readTerminalScrollback", { threadId }),
      ctx.options.callSupervisor("readTerminalSize", { threadId }),
    ]);
    terminalScrollback = scrollback;
    terminalSize = size ?? undefined;
  } catch {
    terminalScrollback = undefined;
    terminalSize = undefined;
  }

  return remoteThreadSnapshotSchema.parse({
    snapshotSeq: ctx.seq,
    thread,
    runtimeItems: dbGetThreadRuntimeItems(threadId),
    completedTurns: dbGetThreadCompletedTurns(threadId),
    contextUsage: dbGetThreadContextUsage(threadId),
    ...(terminalScrollback ? { terminalScrollback } : {}),
    ...(terminalSize ? { terminalSize } : {}),
    updatedAt: new Date().toISOString(),
  });
}
