import { z } from "zod";
import type { SessionInboxUser } from "@opencode/client";
import { pendingSteerStateSchema, type PendingSteerState } from "@/shared/contracts";
import { openCodeEvent } from "../events";
import { sessionId } from "../ids";
import type { RouterContext } from "./context";

export function createInbox(ctx: RouterContext) {
  const inboxKey = (rawThreadId: string, id: string) => `${rawThreadId}${id}`;
  const inboxEntry = (rawThreadId: string) => {
    let entry = ctx.inbox.get(rawThreadId);
    if (!entry) {
      entry = { steer: null, queue: [], paused: false, seeded: false };
      ctx.inbox.set(rawThreadId, entry);
    }
    return entry;
  };
  const inboxUserItem = (
    rawThreadId: string,
    value: PendingSteerState,
    delivery: "steer" | "queue",
  ): SessionInboxUser => ({
    id: value.id,
    sessionID: sessionId(rawThreadId),
    time: { created: value.stagedAt },
    type: "user",
    payload: {
      text: value.prompt,
      ...(value.segments?.length
        ? {
            files: value.segments
              .filter((segment) => segment.kind === "attachment" || segment.kind === "file")
              .map((segment) => ({
                data: "",
                mime:
                  "mimeType" in segment && segment.mimeType
                    ? segment.mimeType
                    : "application/octet-stream",
                source: { type: "uri" as const, uri: segment.path },
              })),
          }
        : {}),
    },
    delivery,
  });
  const emitInboxEvent = (
    rawThreadId: string,
    type: "session.inbox.enqueued" | "session.inbox.delivered" | "session.inbox.cancelled",
    value: PendingSteerState,
    delivery: "steer" | "queue",
  ) => {
    const sessionID = sessionId(rawThreadId);
    const item = inboxUserItem(rawThreadId, value, delivery);
    const durable = {
      aggregateID: sessionID,
      seq: ctx.input.events.nextDurableSequence(sessionID),
      version: 1 as const,
    };
    if (type === "session.inbox.enqueued") {
      ctx.input.events.emit(
        openCodeEvent(
          type,
          { sessionID, inboxID: value.id, item },
          { durable, location: { directory: ctx.input.bootstrap.directory } },
        ),
      );
      return;
    }
    ctx.input.events.emit(
      openCodeEvent(
        type,
        { sessionID, inboxID: value.id },
        { durable, location: { directory: ctx.input.bootstrap.directory } },
      ),
    );
  };
  const dropInboxItem = (
    rawThreadId: string,
    value: PendingSteerState,
    delivery: "steer" | "queue",
  ) => {
    const key = inboxKey(rawThreadId, value.id);
    emitInboxEvent(
      rawThreadId,
      ctx.cancelledInboxIds.delete(key) ? "session.inbox.cancelled" : "session.inbox.delivered",
      value,
      delivery,
    );
  };
  const updateInboxSteer = (rawThreadId: string, value: unknown) => {
    const entry = inboxEntry(rawThreadId);
    const next = pendingSteerStateSchema.safeParse(value).data ?? null;
    const prev = entry.steer;
    if (prev && (!next || next.id !== prev.id)) dropInboxItem(rawThreadId, prev, "steer");
    if (next && (!prev || prev.id !== next.id)) {
      entry.steer = next;
      emitInboxEvent(rawThreadId, "session.inbox.enqueued", next, "steer");
      return;
    }
    entry.steer = next;
  };
  const updateInboxQueue = (rawThreadId: string, value: unknown) => {
    const entry = inboxEntry(rawThreadId);
    const parsed = z
      .object({ items: z.array(pendingSteerStateSchema), paused: z.boolean().default(false) })
      .safeParse(value);
    const next = parsed.success ? parsed.data.items : [];
    const nextIds = new Set(next.map((item) => item.id));
    const previous = entry.queue.filter((item) => !nextIds.has(item.id));
    for (const item of previous) dropInboxItem(rawThreadId, item, "queue");
    const previousIds = new Set(entry.queue.map((item) => item.id));
    for (const item of next)
      if (!previousIds.has(item.id))
        emitInboxEvent(rawThreadId, "session.inbox.enqueued", item, "queue");
    entry.queue = next;
    if (parsed.success) entry.paused = parsed.data.paused;
  };
  // Seed the queue once per thread on session load; a host that predates the
  // follow-up procedures answers with an error, which stays an empty queue.
  const seedInbox = async (rawThreadId: string) => {
    const entry = inboxEntry(rawThreadId);
    if (entry.seeded) return;
    entry.seeded = true;
    try {
      const queue = await ctx.input.client.callRemoteProcedure("getThreadFollowUpQueue", {
        threadId: rawThreadId,
      });
      updateInboxQueue(rawThreadId, queue);
    } catch {
      /* old host without follow-up procedures */
    }
  };
  return {
    inboxKey,
    inboxEntry,
    inboxUserItem,
    emitInboxEvent,
    dropInboxItem,
    updateInboxSteer,
    updateInboxQueue,
    seedInbox,
  };
}
