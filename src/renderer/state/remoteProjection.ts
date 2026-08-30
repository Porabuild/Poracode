import type { Project, PromptSegment, Thread } from "@/shared/contracts";
import type { PersistedRuntimeItem } from "@/shared/ipc/schemas";
import type { RemoteThreadSnapshot } from "@/shared/remote";
import { inlinePromptSegmentText } from "@/shared/promptContent";

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

export function unprojectRemoteThreadId(remoteServerId: string, value: string): string | undefined {
  const prefix = `remote:${remoteServerId}:thread:`;
  return value.startsWith(prefix) && value.length > prefix.length
    ? value.slice(prefix.length)
    : undefined;
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
    runtimeItems: projectRemoteRuntimeItems(remoteServerId, snapshot.runtimeItems),
  };
}

/** Project thread ids embedded in persisted user-message content blocks. */
export function projectRemoteRuntimeItems(
  remoteServerId: string,
  items: readonly PersistedRuntimeItem[],
): PersistedRuntimeItem[] {
  return items.map((item) => {
    if (item.type !== "user_message" || !item.payload || typeof item.payload !== "object") {
      return item;
    }
    const payload = item.payload as Record<string, unknown>;
    if (!Array.isArray(payload.content)) return item;
    return {
      ...item,
      payload: projectRemoteMessagePayload(remoteServerId, payload),
    };
  });
}

/** Thread-id projection shared by every event/record shape below. */
function threadIdPatch(remoteServerId: string, record: Record<string, unknown>) {
  return typeof record.threadId === "string"
    ? { threadId: remoteThreadId(remoteServerId, record.threadId) }
    : {};
}

function projectRemoteSegmentList(remoteServerId: string, value: unknown): unknown {
  return Array.isArray(value)
    ? value.map((segment) => projectRemoteContentBlock(remoteServerId, segment))
    : value;
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
        return {
          ...record,
          ...threadIdPatch(remoteServerId, record),
          ...(Array.isArray(record.events)
            ? {
                events: record.events.map((item) =>
                  projectRemoteRuntimeEvent(remoteServerId, item),
                ),
              }
            : {}),
        };
      }),
    };
  }
  if (event.type === "thread-runtime-event") {
    return {
      ...event,
      ...threadIdPatch(remoteServerId, event),
      ...(event.event !== undefined
        ? { event: projectRemoteRuntimeEvent(remoteServerId, event.event) }
        : {}),
    };
  }
  if (event.type === "thread-runtime-events" && Array.isArray(event.events)) {
    return {
      ...event,
      ...threadIdPatch(remoteServerId, event),
      events: event.events.map((item) => projectRemoteRuntimeEvent(remoteServerId, item)),
    };
  }
  if (event.type === "thread-pending-steer") {
    const pending = event.pending;
    return {
      ...event,
      ...threadIdPatch(remoteServerId, event),
      ...(pending && typeof pending === "object" && !Array.isArray(pending)
        ? {
            pending: {
              ...pending,
              ...("segments" in pending
                ? { segments: projectRemoteSegmentList(remoteServerId, pending.segments) }
                : {}),
            },
          }
        : {}),
    };
  }
  return projectRemoteRuntimeEvent(remoteServerId, event);
}

function projectRemoteRuntimeEvent(remoteServerId: string, value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const event = value as Record<string, unknown>;
  return {
    ...event,
    ...threadIdPatch(remoteServerId, event),
    ...(event.payload !== undefined
      ? { payload: projectRemoteMessagePayload(remoteServerId, event.payload) }
      : {}),
  };
}

function projectRemoteMessagePayload(remoteServerId: string, value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const payload = value as Record<string, unknown>;
  if (!Array.isArray(payload.content)) return value;
  return {
    ...payload,
    content: payload.content.map((block) => projectRemoteContentBlock(remoteServerId, block)),
  };
}

function projectRemoteContentBlock(remoteServerId: string, value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const block = value as Record<string, unknown>;
  // Only wrap host-namespace ids. An id that is already renderer-projected
  // (persisted by an older client or foreign to this host) must survive the
  // round trip untouched — re-wrapping would corrupt it.
  if (
    block.kind === "thread" &&
    typeof block.threadId === "string" &&
    !isProjectedRemoteEntityId(block.threadId, "thread")
  ) {
    return { ...block, threadId: remoteThreadId(remoteServerId, block.threadId) };
  }
  return value;
}

/**
 * Degrade a thread mention the target host cannot resolve to its inline
 * `@title` text, so the agent still sees the reference instead of receiving a
 * thread_id its `read_thread` tool can never satisfy.
 */
function threadMentionTextSegment(
  segment: Extract<PromptSegment, { kind: "thread" }>,
): PromptSegment {
  return { kind: "text", content: inlinePromptSegmentText(segment) };
}

/** Translate renderer-projected thread mention ids back to a remote host id. */
export function unprojectRemoteThreadMentionSegments(
  remoteServerId: string,
  segments: readonly PromptSegment[],
  threads: readonly Thread[],
): PromptSegment[] {
  const remoteThreads = new Map(
    threads
      .filter((thread) => thread.remoteServerId === remoteServerId && thread.remoteId)
      .map((thread) => [thread.id, thread.remoteId!]),
  );
  return segments.map((segment) => {
    if (segment.kind !== "thread") return segment;
    const remoteId =
      remoteThreads.get(segment.threadId) ??
      unprojectRemoteThreadId(remoteServerId, segment.threadId);
    return remoteId ? { ...segment, threadId: remoteId } : threadMentionTextSegment(segment);
  });
}

/**
 * Degrade renderer-projected thread mentions destined for a LOCAL host: a
 * `remote:<desktopId>:thread:<id>` mention references another desktop's thread
 * and can never be resolved by the local supervisor's `read_thread`.
 */
export function downgradeProjectedThreadMentionSegments(
  segments: readonly PromptSegment[],
): PromptSegment[] {
  return segments.map((segment) =>
    segment.kind === "thread" && isProjectedRemoteEntityId(segment.threadId, "thread")
      ? threadMentionTextSegment(segment)
      : segment,
  );
}
