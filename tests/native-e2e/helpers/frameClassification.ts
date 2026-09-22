/**
 * Server-frame classification for the qualification matrix.
 *
 * The A1 acceptance metric is client-side: "offscreen bulk payload bytes do
 * not reach an uninterested client". This module classifies each received
 * server frame by content class and attributes its application bytes to the
 * declared thread interests of the connection that received it. It never
 * estimates bytes for frames it cannot attribute: a frame carrying both
 * interested and offscreen threads is counted as `mixed`, separately from
 * clean `offscreen` bytes.
 *
 * A runtime frame whose bulk content was withheld by the host interest filter
 * still arrives (sequence continuity is preserved by design) but carries an
 * empty `events` array; those frames are classed `summary`, never `bulk`, so
 * withheld content is not confused with content that actually reached the
 * client. Bulk *events* are counted alongside bytes so a run can prove no
 * sample loss against the producer's published event count.
 */

export type FrameClass = "bulk" | "control" | "summary" | "terminal" | "other";

export interface ClassifiedFrame {
  readonly frameClass: FrameClass;
  readonly threadIds: readonly string[];
  /** Thread ids of the bulk runtime events in this frame (may repeat). */
  readonly bulkEventThreadIds: readonly string[];
}

const RUNTIME_BULK_EVENT_TYPES = new Set([
  "thread-runtime-event",
  "thread-runtime-events",
  "thread-runtime-events-multi",
]);

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function runtimeEventThreadIds(event: Record<string, unknown>): string[] {
  const threadId = event.threadId;
  if (typeof threadId === "string" && threadId.length > 0) return [threadId];
  return [];
}

function isBulkRuntimeEvent(event: Record<string, unknown>): boolean {
  const type = event.type;
  return (
    type === "item.started" ||
    type === "item.updated" ||
    type === "item.completed" ||
    type === "content.delta"
  );
}

export interface RuntimeEventRef {
  readonly event: Record<string, unknown>;
  readonly threadId: string | null;
}

/**
 * Unwraps the runtime-event payloads of one server event body (single event,
 * batch, or multi-batch) into per-event refs with their attributed thread id.
 * Returns `[]` when the body is not one of the runtime transport shapes.
 * Shared by the frame classifier (offscreen-bulk accounting) and the
 * structured-workload canonical GUI frame counter so both attribute batches
 * identically.
 */
export function extractRuntimeEvents(body: Record<string, unknown>): readonly RuntimeEventRef[] {
  const runtimeEvents: RuntimeEventRef[] = [];
  const type = body.type;
  if (type === "thread-runtime-event") {
    const event = asRecord(body.event);
    if (event) {
      runtimeEvents.push({
        event,
        threadId: runtimeEventThreadIds(event)[0] ?? null,
      });
    }
  } else if (type === "thread-runtime-events") {
    const events = Array.isArray(body.events) ? body.events : [];
    const fallbackThreadId = typeof body.threadId === "string" ? body.threadId : null;
    for (const entry of events) {
      const event = asRecord(entry);
      if (event) {
        runtimeEvents.push({
          event,
          threadId: runtimeEventThreadIds(event)[0] ?? fallbackThreadId,
        });
      }
    }
  } else if (type === "thread-runtime-events-multi") {
    const batches = Array.isArray(body.batches) ? body.batches : [];
    for (const batch of batches) {
      const record = asRecord(batch);
      if (!record) continue;
      const batchThreadId = typeof record.threadId === "string" ? record.threadId : null;
      const events = Array.isArray(record.events) ? record.events : [];
      for (const entry of events) {
        const event = asRecord(entry);
        if (event) {
          runtimeEvents.push({
            event,
            threadId: runtimeEventThreadIds(event)[0] ?? batchThreadId,
          });
        }
      }
    }
  }
  return runtimeEvents;
}

function classifyEventBody(body: Record<string, unknown>): ClassifiedFrame {
  const type = typeof body.type === "string" ? body.type : "";
  if (!RUNTIME_BULK_EVENT_TYPES.has(type)) {
    const threadId = body.threadId;
    return {
      frameClass: "control",
      threadIds: typeof threadId === "string" ? [threadId] : [],
      bulkEventThreadIds: [],
    };
  }
  const runtimeEvents = extractRuntimeEvents(body);
  // An empty runtime frame is withheld content (the host keeps the frame so
  // sequence continuity holds and empties its payload); it is a summary, not
  // bulk and not a control message.
  if (runtimeEvents.length === 0) {
    const threadId = body.threadId;
    return {
      frameClass: "summary",
      threadIds: typeof threadId === "string" ? [threadId] : [],
      bulkEventThreadIds: [],
    };
  }
  const bulkEvents = runtimeEvents.filter((entry) => isBulkRuntimeEvent(entry.event));
  const frameClass: FrameClass = bulkEvents.length > 0 ? "bulk" : "control";
  const threadIds = [
    ...new Set(
      runtimeEvents
        .map((entry) => entry.threadId)
        .filter((threadId): threadId is string => threadId !== null),
    ),
  ];
  return {
    frameClass,
    threadIds,
    bulkEventThreadIds: bulkEvents
      .map((entry) => entry.threadId)
      .filter((threadId): threadId is string => threadId !== null),
  };
}

export function classifyServerFrame(message: Record<string, unknown>): ClassifiedFrame {
  const type = typeof message.type === "string" ? message.type : "";
  if (type === "event") {
    const body = asRecord(message.event);
    if (!body) return { frameClass: "control", threadIds: [], bulkEventThreadIds: [] };
    return classifyEventBody(body);
  }
  if (type === "terminal-output" || type === "terminal-watch-baseline-chunk") {
    const id = message.id;
    return {
      frameClass: "terminal",
      threadIds: typeof id === "string" ? [id] : [],
      bulkEventThreadIds: [],
    };
  }
  if (type === "terminal-watch-result") {
    const id = message.id;
    return {
      frameClass: "control",
      threadIds: typeof id === "string" ? [id] : [],
      bulkEventThreadIds: [],
    };
  }
  return { frameClass: "other", threadIds: [], bulkEventThreadIds: [] };
}

export interface FrameClassAccountingSnapshot {
  readonly bytesByClass: Readonly<Record<FrameClass, number>>;
  readonly framesByClass: Readonly<Record<FrameClass, number>>;
  readonly bulkEvents: number;
  readonly interestedBulkBytes: number;
  readonly interestedBulkEvents: number;
  readonly offscreenBulkBytes: number;
  readonly offscreenBulkEvents: number;
  readonly mixedBulkBytes: number;
  readonly mixedBulkFrames: number;
  readonly unattributedBulkBytes: number;
  readonly unattributedBulkEvents: number;
  readonly interests: readonly string[];
}

const EMPTY_CLASS_BYTES: Record<FrameClass, number> = {
  bulk: 0,
  control: 0,
  summary: 0,
  terminal: 0,
  other: 0,
};

export class FrameClassAccounting {
  private readonly bytes: Record<FrameClass, number> = { ...EMPTY_CLASS_BYTES };
  private readonly frames: Record<FrameClass, number> = { ...EMPTY_CLASS_BYTES };
  private interests = new Set<string>();
  private bulkEvents = 0;
  private interestedBulkBytes = 0;
  private interestedBulkEvents = 0;
  private offscreenBulkBytes = 0;
  private offscreenBulkEvents = 0;
  private mixedBulkBytes = 0;
  private mixedBulkFrames = 0;
  private unattributedBulkBytes = 0;
  private unattributedBulkEvents = 0;

  setInterests(threadIds: readonly string[]): void {
    this.interests = new Set(threadIds);
  }

  record(bytes: number, classified: ClassifiedFrame): void {
    this.bytes[classified.frameClass] += bytes;
    this.frames[classified.frameClass] += 1;
    this.bulkEvents += classified.bulkEventThreadIds.length;
    if (classified.frameClass !== "bulk" && classified.frameClass !== "terminal") return;
    if (classified.threadIds.length === 0) {
      this.unattributedBulkBytes += bytes;
      this.unattributedBulkEvents += classified.bulkEventThreadIds.length;
      return;
    }
    const interested = classified.threadIds.filter((threadId) => this.interests.has(threadId));
    const offscreen = classified.threadIds.length - interested.length;
    const offscreenEvents = classified.bulkEventThreadIds.filter(
      (threadId) => !this.interests.has(threadId),
    ).length;
    const interestedEvents = classified.bulkEventThreadIds.filter((threadId) =>
      this.interests.has(threadId),
    ).length;
    if (offscreen === 0) {
      this.interestedBulkBytes += bytes;
      this.interestedBulkEvents += interestedEvents;
      return;
    }
    if (interested.length === 0) {
      this.offscreenBulkBytes += bytes;
      this.offscreenBulkEvents += offscreenEvents;
      return;
    }
    this.mixedBulkBytes += bytes;
    this.mixedBulkFrames += 1;
    this.interestedBulkEvents += interestedEvents;
    this.offscreenBulkEvents += offscreenEvents;
  }

  snapshot(): FrameClassAccountingSnapshot {
    return {
      bytesByClass: { ...this.bytes },
      framesByClass: { ...this.frames },
      bulkEvents: this.bulkEvents,
      interestedBulkBytes: this.interestedBulkBytes,
      interestedBulkEvents: this.interestedBulkEvents,
      offscreenBulkBytes: this.offscreenBulkBytes,
      offscreenBulkEvents: this.offscreenBulkEvents,
      mixedBulkBytes: this.mixedBulkBytes,
      mixedBulkFrames: this.mixedBulkFrames,
      unattributedBulkBytes: this.unattributedBulkBytes,
      unattributedBulkEvents: this.unattributedBulkEvents,
      interests: [...this.interests].sort(),
    };
  }
}
