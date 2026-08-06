import type { Project, Thread } from "@/shared/contracts";
import type { RemoteThreadSnapshot } from "@/shared/remote";

interface RemotelyProjectedEntity {
  readonly remoteServerId?: string | undefined;
  readonly remoteId?: string | undefined;
}

export interface RemoteOwner {
  readonly desktopId: string;
  readonly remoteId: string;
}

/** Resolve the host identity shared by projected projects and threads. */
export function remoteOwner(
  entity: RemotelyProjectedEntity | null | undefined,
): RemoteOwner | undefined {
  return entity?.remoteServerId && entity.remoteId
    ? { desktopId: entity.remoteServerId, remoteId: entity.remoteId }
    : undefined;
}

export function remoteProjectId(remoteServerId: string, remoteId: string): string {
  return `remote:${remoteServerId}:project:${remoteId}`;
}

export function remoteThreadId(remoteServerId: string, remoteId: string): string {
  return `remote:${remoteServerId}:thread:${remoteId}`;
}

export function isProjectedRemoteEntityId(value: string, kind: "project" | "thread"): boolean {
  const marker = `:${kind}:`;
  const markerIndex = value.indexOf(marker, "remote:".length);
  return (
    value.startsWith("remote:") &&
    markerIndex > "remote:".length &&
    markerIndex + marker.length < value.length
  );
}

export function projectRemoteProject(remoteServerId: string, project: Project): Project {
  return {
    ...project,
    id: remoteProjectId(remoteServerId, project.id),
    remoteServerId,
    remoteId: project.id,
    location: { ...project.location, remoteServerId },
  };
}

export function projectRemoteThread(remoteServerId: string, thread: Thread): Thread {
  return {
    ...thread,
    id: remoteThreadId(remoteServerId, thread.id),
    remoteServerId,
    remoteId: thread.id,
    projectId: remoteProjectId(remoteServerId, thread.projectId),
    ...(thread.parentThreadId
      ? { parentThreadId: remoteThreadId(remoteServerId, thread.parentThreadId) }
      : {}),
  };
}

export function projectRemoteThreadSnapshot(
  remoteServerId: string,
  snapshot: RemoteThreadSnapshot,
): RemoteThreadSnapshot {
  return {
    ...snapshot,
    thread: projectRemoteThread(remoteServerId, snapshot.thread),
  };
}

export function projectRemoteThreadEvent(remoteServerId: string, value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  const event = value as Record<string, unknown>;
  if (event.type === "thread-runtime-events-multi" && Array.isArray(event.batches)) {
    return {
      ...event,
      batches: event.batches.map((batch) => {
        if (!batch || typeof batch !== "object") return batch;
        const record = batch as Record<string, unknown>;
        return typeof record.threadId === "string"
          ? { ...record, threadId: remoteThreadId(remoteServerId, record.threadId) }
          : record;
      }),
    };
  }
  return typeof event.threadId === "string"
    ? { ...event, threadId: remoteThreadId(remoteServerId, event.threadId) }
    : event;
}
