import { json } from "./helpers";
import { logAdapterDebug } from "../diagnostics";
import { sessionId, threadId } from "../ids";
import type { SessionInboxListOutput, SessionInboxUser } from "@opencode/client";
import { z } from "zod";
import { pendingSteerStateSchema, type PendingSteerState } from "@/shared/contracts";
import { openCodeEvent } from "../events";
import type { RouteArgs, RouterContext } from "./context";

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

/** Session inbox routes: GET list, DELETE + PATCH item. */
export async function handleInboxRoutes({
  ctx,
  method,
  path,
  readBody,
}: RouteArgs): Promise<Response | undefined> {
  const {
    input,
    sessions,
    cancelledInboxIds,
    inboxKey,
    inboxEntry,
    inboxUserItem,
    emitInboxEvent,
    seedInbox,
    cachedThreadById,
  } = ctx;

  const inboxMatch = path.match(/^\/api\/session\/([^/]+)\/inbox$/u);
  if (inboxMatch && method === "GET") {
    const rawThreadId = threadId(decodeURIComponent(inboxMatch[1]!));
    await seedInbox(rawThreadId);
    const entry = inboxEntry(rawThreadId);
    const data: SessionInboxListOutput = [
      ...(entry.steer ? [inboxUserItem(rawThreadId, entry.steer, "steer")] : []),
      ...entry.queue.map((item) => inboxUserItem(rawThreadId, item, "queue")),
    ];
    return json({ data });
  }
  const inboxItemMatch = path.match(/^\/api\/session\/([^/]+)\/inbox\/([^/]+)$/u);
  if (inboxItemMatch && method === "DELETE") {
    const rawThreadId = threadId(decodeURIComponent(inboxItemMatch[1]!));
    const inboxID = decodeURIComponent(inboxItemMatch[2]!);
    const entry = inboxEntry(rawThreadId);
    if (entry.steer?.id === inboxID) {
      const dropped = entry.steer;
      const key = inboxKey(rawThreadId, inboxID);
      cancelledInboxIds.add(key);
      try {
        await input.client.clearPendingSteer(rawThreadId);
      } finally {
        if (entry.steer === dropped) entry.steer = null;
        if (cancelledInboxIds.delete(key))
          emitInboxEvent(rawThreadId, "session.inbox.cancelled", dropped, "steer");
      }
    } else {
      const index = entry.queue.findIndex((item) => item.id === inboxID);
      if (index >= 0) {
        const key = inboxKey(rawThreadId, inboxID);
        const dropped = entry.queue[index]!;
        cancelledInboxIds.add(key);
        try {
          await input.client.callRemoteProcedure("removeQueuedThreadFollowUp", {
            threadId: rawThreadId,
            id: inboxID,
          });
        } finally {
          if (entry.queue[index] === dropped) entry.queue.splice(index, 1);
          if (cancelledInboxIds.delete(key))
            emitInboxEvent(rawThreadId, "session.inbox.cancelled", dropped, "queue");
        }
      } else {
        // Neither the current steer nor a queued item — a delivered
        // prompt's inbox id looks exactly like this. 204 as a no-op;
        // never clearPendingSteer blindly or an unrelated steer dies.
        if (ctx.debug)
          void logAdapterDebug(input.bootstrap.home, {
            source: "inbox.delete",
            threadId: rawThreadId,
            inboxID,
            resolution: "noop",
          });
      }
    }
    if (ctx.debug)
      void logAdapterDebug(input.bootstrap.home, {
        source: "inbox.delete",
        threadId: rawThreadId,
        inboxID,
        resolution:
          entry.steer?.id === inboxID
            ? "steer"
            : entry.queue.some((item) => item.id === inboxID)
              ? "queue"
              : "noop",
      });
    return new Response(null, { status: 204 });
  }
  if (inboxItemMatch && method === "PATCH") {
    // session.inbox.update: change a pending item's delivery mode.
    const rawThreadId = threadId(decodeURIComponent(inboxItemMatch[1]!));
    const inboxID = decodeURIComponent(inboxItemMatch[2]!);
    const body = await readBody();
    const delivery =
      body.delivery === "steer" || body.delivery === "queue" ? body.delivery : undefined;
    if (!delivery)
      return json(
        { error: { code: "invalid_request", message: "delivery must be steer or queue" } },
        400,
      );
    const entry = inboxEntry(rawThreadId);
    const sessionID = sessionId(rawThreadId);
    if (delivery === "steer" && entry.queue.some((item) => item.id === inboxID)) {
      await input.client.callRemoteProcedure("steerQueuedThreadFollowUp", {
        threadId: rawThreadId,
        id: inboxID,
      });
      input.events.emit(
        openCodeEvent(
          "session.inbox.delivery.changed",
          { sessionID, inboxID, delivery: "steer" },
          {
            durable: {
              aggregateID: sessionID,
              seq: input.events.nextDurableSequence(sessionID),
              version: 1 as const,
            },
            location: { directory: input.bootstrap.directory },
          },
        ),
      );
    } else if (delivery === "queue" && entry.steer?.id === inboxID) {
      const item = entry.steer;
      const remoteThread = await cachedThreadById(rawThreadId);
      await input.client.clearPendingSteer(rawThreadId);
      await input.client.callRemoteProcedure("queueThreadFollowUp", {
        threadId: rawThreadId,
        prompt: item.prompt,
        ...(item.segments ? { segments: item.segments } : {}),
        config: remoteThread?.config ?? {
          model: sessions.get(sessionID)?.model ?? "",
          mode: "agent" as const,
        },
      });
      entry.steer = null;
      input.events.emit(
        openCodeEvent(
          "session.inbox.delivery.changed",
          { sessionID, inboxID, delivery: "queue" },
          {
            durable: {
              aggregateID: sessionID,
              seq: input.events.nextDurableSequence(sessionID),
              version: 1 as const,
            },
            location: { directory: input.bootstrap.directory },
          },
        ),
      );
    }
    // Same delivery or unknown item: no-op per openapi.
    return new Response(null, { status: 204 });
  }
  return undefined;
}
