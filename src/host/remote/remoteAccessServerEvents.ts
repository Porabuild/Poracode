import type { WebSocket } from "ws";
import type { SupervisorEvent } from "@/shared/ipc";
import type { Project, RuntimeEvent } from "@/shared/contracts";
import { remoteProjectCommandResultSchema } from "@/shared/remote";
import { dbGetProjects } from "@/host/db";
import { persistSupervisorEvent } from "./server/runtimePersistence";
import { projectGitStatePatchForInterests } from "./server/gitStateProjection";
import { filterEventForItemInterests } from "./server/itemInterestFilter";
import { filterEventForNoticeGate } from "./server/noticeGate";
import {
  capBroadcastEvent,
  DEFAULT_MAX_WEBSOCKET_OUTBOUND_BUFFER_BYTES,
  maxBroadcastEventBytes,
  trimEventBuffer,
} from "./server/eventSizeGuard";
import { buildCursorTaggedTerminalOutput } from "./server/terminalCursorSync";
import {
  replayDesktopEvents,
  type DesktopInternalReplayContext,
} from "./server/desktopInternalStream";
import type { RemoteBroadcastEvent } from "./server/context";
import {
  EVENT_BUFFER_LIMIT,
  EVENT_BUFFER_MAX_BYTES,
  type RemoteAccessServerHost,
} from "./remoteAccessServerTypes";
import { broadcast, broadcastRaw, send, sendRaw } from "./remoteAccessServerWs";

/**
 * Admits a loopback desktop-internal connection to the desktop-only
 * replayable stream and resumes it from the client's `lastDesktopSeq`
 * cursor, mirroring the shared stream's reconnect semantics (no cursor or a
 * current one replays nothing; a cursor ahead of the server's — a server
 * restart — earns `resync-required`; otherwise the bounded buffer replays
 * the missing range).
 */
export function attachDesktopInternalClient(
  host: RemoteAccessServerHost,
  ws: WebSocket,
  lastDesktopSeq: number | null,
): void {
  if (host.stopping) return;
  host.desktopInternalClients.add(ws);
  if (lastDesktopSeq === null || lastDesktopSeq === host.desktopSeq) return;
  if (lastDesktopSeq > host.desktopSeq) {
    // The resync cursor is the DESKTOP space's own head: these frames live on
    // the ipc sequence, so the shared-loopback head would be a meaningless
    // cursor that loops a future desktop-stream resume into permanent resyncs.
    send(host, ws, {
      type: "resync-required",
      seq: host.desktopSeq,
      reason: "Desktop event stream reset; request a fresh snapshot.",
    });
    return;
  }
  host.desktopReplayingClients.add(ws);
  replayDesktopEvents(desktopReplayContext(host), ws, lastDesktopSeq);
}

export function detachDesktopInternalClient(host: RemoteAccessServerHost, ws: WebSocket): void {
  host.desktopInternalClients.delete(ws);
  host.desktopReplayingClients.delete(ws);
}

function desktopReplayContext(host: RemoteAccessServerHost): DesktopInternalReplayContext {
  return {
    get desktopSeq() {
      return host.desktopSeq;
    },
    desktopEventBuffer: host.desktopEventBuffer,
    desktopReplayingClients: host.desktopReplayingClients,
    send: (ws, message) => send(host, ws, message),
    sendRaw: (ws, data, onSent) => sendRaw(host, ws, data, onSent),
  };
}

export function waitForSupervisorEvent(
  host: RemoteAccessServerHost,
  match: (event: RemoteBroadcastEvent) => boolean,
  timeoutMs: number,
): Promise<RemoteBroadcastEvent> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      host.supervisorEventListeners.delete(listener);
      reject(new Error("Timed out waiting for supervisor event."));
    }, timeoutMs);
    timer.unref?.();
    const listener = (event: RemoteBroadcastEvent) => {
      if (!match(event)) return;
      clearTimeout(timer);
      host.supervisorEventListeners.delete(listener);
      resolve(event);
    };
    host.supervisorEventListeners.add(listener);
  });
}

export function notifyEventInterestsChanged(host: RemoteAccessServerHost): void | Promise<void> {
  const terminalThreadIds = new Set<string>();
  for (const watched of host.terminalWatches.values()) {
    for (const threadId of watched) terminalThreadIds.add(threadId);
  }

  const runtimeThreadIds = new Set<string>();
  let allRuntimeEvents = false;
  for (const [client, session] of host.clients) {
    if (!session.scopes.includes("session:read")) continue;
    const interests = host.itemInterests.get(client);
    if (!interests) {
      allRuntimeEvents = true;
      continue;
    }
    for (const threadId of interests) runtimeThreadIds.add(threadId);
  }
  const interests = {
    terminalThreadIds: [...terminalThreadIds].sort(),
    runtimeThreadIds: [...runtimeThreadIds].sort(),
    allRuntimeEvents,
  };
  // Includes final connection cleanup after external admission has closed.
  return host.work.run(() => host.options.onEventInterestsChanged?.(interests));
}

/** Pushes an event onto the replayable WS event stream. Out-of-band desktop
 * events (git summaries) ride the same stream as supervisor events. When this
 * composition owns persistence, publication is gated on the persistence
 * outcome: refused canonical events never receive a `seq`, and a `thread-reset`
 * is withheld until its durable rebase applies (then published once through the
 * retained envelope). */
export function publishSupervisorEvent(
  host: RemoteAccessServerHost,
  event: RemoteBroadcastEvent,
  remotelyConsumedEventTypes: ReadonlySet<RemoteBroadcastEvent["type"]>,
  desktopInternalEventTypes: ReadonlySet<RemoteBroadcastEvent["type"]>,
): void {
  if (host.options.ownsSupervisorPersistence !== false) {
    const outcome = persistSupervisorEvent(event, {
      publishDeferredEvent: (deferred) =>
        publishAppliedSupervisorEvent(
          host,
          deferred,
          remotelyConsumedEventTypes,
          desktopInternalEventTypes,
        ),
    });
    if (outcome.kind === "withhold") return;
    publishAppliedSupervisorEvent(
      host,
      outcome.event,
      remotelyConsumedEventTypes,
      desktopInternalEventTypes,
    );
    return;
  }
  publishAppliedSupervisorEvent(host, event, remotelyConsumedEventTypes, desktopInternalEventTypes);
}

/** Notify waiters and broadcast an event whose durable effect is already applied. */
function publishAppliedSupervisorEvent(
  host: RemoteAccessServerHost,
  event: RemoteBroadcastEvent,
  remotelyConsumedEventTypes: ReadonlySet<RemoteBroadcastEvent["type"]>,
  desktopInternalEventTypes: ReadonlySet<RemoteBroadcastEvent["type"]>,
): void {
  // H3: thread-membership publication is bounded by construction in the ONE
  // shared publisher, so every producer (housekeeping sweeps, HTTP routes,
  // host-local writers, the desktop all-id projection) is covered. A sweep
  // that legitimately clears tens of thousands of rows becomes many small,
  // replay-safe events instead of one over-cap event that would be withheld
  // and globally resync every client.
  if (event.type === "remote-threads-changed") {
    const batches = batchThreadIdsForMembershipEvents(event.threadIds, event.viewedThreadIds);
    for (const threadIds of batches) {
      publishAppliedSupervisorEventNow(
        host,
        { ...event, threadIds },
        remotelyConsumedEventTypes,
        desktopInternalEventTypes,
      );
    }
    // An empty membership change publishes nothing: there is no state to
    // converge on, and an empty event would only churn seq/replay.
    return;
  }
  publishAppliedSupervisorEventNow(
    host,
    event,
    remotelyConsumedEventTypes,
    desktopInternalEventTypes,
  );
}

/**
 * Smallest envelope that needs no byte-budget assumptions about a single id:
 * one event plus the `seq`/`space` wrapper the live and replay frames carry.
 * Both id arrays are the EMPTY form on purpose: the serialized `viewedThreadIds`
 * payload replaces its own `[]` in this envelope and is charged separately per
 * batch by {@link batchThreadIdsForMembershipEvents}, and each thread id is
 * charged from its own escaping length.
 */
const MEMBERSHIP_EVENT_ENVELOPE_BYTES = Buffer.byteLength(
  '{"type":"event","seq":4294967295,"space":"loopback","event":' +
    '{"type":"remote-threads-changed","threadIds":[],"viewedThreadIds":[]}}',
  "utf8",
);

/**
 * UTF-8 batching TARGET for one bounded thread-membership event. Deliberately
 * far below the generic per-event cap (`maxBroadcastEventBytes`): ~200 UUIDs
 * per event, so a 60k-id sweep publishes ~300 small frames that every
 * transport and replay path can carry. This is a target, not a hard bound:
 * one accepted id (a thread id or a viewed id) that alone exceeds the
 * remaining budget forms its own batch, exactly like the historical
 * oversized-single-id exception, and the hard per-event guard still governs
 * exceptional values.
 */
export const THREADS_CHANGED_EVENT_TARGET_BYTES = 8 * 1024;

/**
 * Bytes the serialized `viewedThreadIds` payload adds to the event beyond the
 * empty `[]` the base envelope already counts. The viewed acknowledgement
 * rides EVERY batch (it is never truncated and never dropped), so it must be
 * charged to every batch's budget. Accepted ids are not universally bounded by
 * HTTP header/body limits: imports and local procedures are separate ingress
 * paths, which is exactly why an oversized single id is split, never dropped,
 * and left to the hard per-event guard.
 */
function viewedThreadIdsPayloadBytes(viewedThreadIds: readonly string[]): number {
  return Math.max(0, Buffer.byteLength(JSON.stringify(viewedThreadIds), "utf8") - 2);
}

/**
 * Splits a thread-membership id list into ordered, duplicate-free batches that
 * each target {@link THREADS_CHANGED_EVENT_TARGET_BYTES}, including the event
 * envelope, the live/replay wrapper, JSON escaping of arbitrary accepted id
 * lengths, and the serialized `viewedThreadIds` payload every batch carries.
 * An id that alone exceeds the budget is never dropped: it forms its own
 * single-id batch. An empty `threadIds` input produces no events (the caller
 * publishes nothing); a viewed-only payload has no membership convergence and
 * is published by no producer.
 */
export function batchThreadIdsForMembershipEvents(
  threadIds: readonly string[],
  viewedThreadIds: readonly string[] | undefined = [],
  maxBytes: number = THREADS_CHANGED_EVENT_TARGET_BYTES,
): string[][] {
  const batches: string[][] = [];
  const envelopeBytes =
    MEMBERSHIP_EVENT_ENVELOPE_BYTES + viewedThreadIdsPayloadBytes(viewedThreadIds ?? []);
  let batch: string[] = [];
  let batchBytes = envelopeBytes;
  for (const threadId of new Set(threadIds)) {
    const idBytes = Buffer.byteLength(JSON.stringify(threadId), "utf8") + 1;
    if (batch.length > 0 && batchBytes + idBytes > maxBytes) {
      batches.push(batch);
      batch = [];
      batchBytes = envelopeBytes;
    }
    batch.push(threadId);
    batchBytes += idBytes;
  }
  if (batch.length > 0) batches.push(batch);
  return batches;
}

/** The unbatched publish path: listeners, replay buffer, live fan-out. */
function publishAppliedSupervisorEventNow(
  host: RemoteAccessServerHost,
  event: RemoteBroadcastEvent,
  remotelyConsumedEventTypes: ReadonlySet<RemoteBroadcastEvent["type"]>,
  desktopInternalEventTypes: ReadonlySet<RemoteBroadcastEvent["type"]>,
): void {
  for (const listener of host.supervisorEventListeners) {
    try {
      listener(event);
    } catch (error) {
      console.warn("[remote] supervisor event waiter failed:", error);
    }
  }
  updateBackgroundTasks(host, event);

  // Terminal output is high-volume and ephemeral: keep it off the replayable
  // event stream (replaying PTY bytes would garble the screen) and only send
  // it to clients that opted into that terminal via `terminal-watch`.
  if (event.type === "thread-output") {
    broadcastTerminalOutput(host, event);
    return;
  }
  // Only buffer + broadcast events a remote client actually consumes; chatty
  // supervisor events no client reads would waste bandwidth and churn the
  // bounded replay buffer (see REMOTELY_CONSUMED_EVENT_TYPES). The withheld
  // desktop-only families instead feed the desktop-internal stream, where
  // loopback desktop sessions consume them without widening the external
  // event surface.
  if (!remotelyConsumedEventTypes.has(event.type)) {
    publishDesktopInternalEvent(host, event, desktopInternalEventTypes);
    return;
  }
  const seq = ++host.seq;
  // Bounded catalog changes: a catalog mutation is canonicalized to its bounded
  // signal BEFORE global size enforcement (canonical replay retains only the
  // signal), then fanned out per declaration — declared sockets get the
  // signal, undeclared sockets get the truthful full list when it is
  // deliverable or a per-socket resync otherwise. The global
  // `undeliverable → broadcast resync` branch below is therefore unreachable
  // for catalog changes, no matter how large the project list is.
  if (event.type === "remote-projects-changed") {
    publishCatalogChangedEvent(host, event, seq);
    return;
  }
  // An event larger than the per-event budget would make `sendRaw` terminate
  // every connected client, and would do it again on replay after they
  // reconnect. Withhold its largest payload fields so the live stream stays
  // deliverable; the full payload was persisted above and reaches clients on
  // the next HTTP history fetch.
  const capped = capBroadcastEvent(
    event,
    maxBroadcastEventBytes(
      host.options.maxWebSocketOutboundBufferBytes ?? DEFAULT_MAX_WEBSOCKET_OUTBOUND_BUFFER_BYTES,
    ),
  );
  if (capped.kind === "undeliverable") {
    // Nothing about this event can ride the socket. `seq` has still advanced,
    // so leaving it out of the replay buffer makes both currently-connected
    // and later-reconnecting clients converge on the same self-healing path:
    // refetch authoritative state over HTTP.
    host.options.onOversizedEventDropped?.({ type: event.type, bytes: capped.bytes });
    host.replayingClients.clear();
    broadcast(host, {
      type: "resync-required",
      seq,
      reason: "Event too large for the live stream; request a fresh snapshot.",
    });
    return;
  }
  host.eventBuffer.push({
    seq,
    event: capped.event,
    bytes: capped.bytes,
    json: capped.json,
  });
  trimEventBuffer(host.eventBuffer, EVENT_BUFFER_LIMIT, EVENT_BUFFER_MAX_BYTES);
  // Some events are tailored per connection: pull-request bodies go only to the
  // client reviewing that PR, and transcript content only to clients watching
  // that thread. Every client still receives an event for every seq — only the
  // content differs — which keeps the replay contiguity check valid.
  if (needsPerClientScoping(capped.event)) {
    for (const client of host.clients.keys()) {
      if (host.replayingClients.has(client)) continue;
      const scoped = scopeEventForClient(host, capped.event, client);
      sendRaw(
        host,
        client,
        scoped === capped.event
          ? `{"type":"event","seq":${seq},"space":"loopback","event":${capped.json}}`
          : JSON.stringify({ type: "event", seq, space: "loopback", event: scoped }),
      );
    }
    return;
  }
  // The wrapper is assembled by concatenation so a multi-megabyte event body
  // is serialized exactly once per publish rather than once here and again in
  // `broadcast`. The byte budget is likewise measured once: `capped.bytes` is
  // the UTF-8 length of `capped.json`, and the ASCII wrapper contributes a
  // fixed prefix plus one closing brace.
  const prefix = `{"type":"event","seq":${seq},"space":"loopback","event":`;
  broadcastRaw(
    host,
    `${prefix}${capped.json}}`,
    Buffer.byteLength(prefix, "utf8") + capped.bytes + 1,
  );
}

/**
 * Fans one desktop-only supervisor event out to the desktop-internal loopback
 * sessions on its own contiguous replayable sequence. Never touches the
 * shared buffer, the shared `seq`, or any non-desktop-internal client, so the
 * desktop event set can never leak to external or native clients. No
 * per-client scoping applies here: these families are global (usage, LSP,
 * OSC, crossagent), not transcript content.
 */
function publishDesktopInternalEvent(
  host: RemoteAccessServerHost,
  event: RemoteBroadcastEvent,
  desktopInternalEventTypes: ReadonlySet<RemoteBroadcastEvent["type"]>,
): void {
  if (!desktopInternalEventTypes.has(event.type)) return;
  if (host.desktopInternalClients.size === 0) return;
  const seq = ++host.desktopSeq;
  // Same safety valve as the shared stream: an event too large for one frame
  // would terminate every desktop session and do it again on replay. Advance
  // `desktopSeq` without buffering and tell the sessions to resync.
  const capped = capBroadcastEvent(
    event,
    maxBroadcastEventBytes(
      host.options.maxWebSocketOutboundBufferBytes ?? DEFAULT_MAX_WEBSOCKET_OUTBOUND_BUFFER_BYTES,
    ),
  );
  if (capped.kind === "undeliverable") {
    host.options.onOversizedEventDropped?.({ type: event.type, bytes: capped.bytes });
    host.desktopReplayingClients.clear();
    for (const client of host.desktopInternalClients) {
      // Same ipc-space cursor rule as every desktop-internal resync: the
      // desktop head, never the shared-loopback head.
      send(host, client, {
        type: "resync-required",
        seq: host.desktopSeq,
        reason: "Desktop event too large for the live stream; request a fresh snapshot.",
      });
    }
    return;
  }
  host.desktopEventBuffer.push({
    seq,
    event: capped.event,
    bytes: capped.bytes,
    json: capped.json,
  });
  trimEventBuffer(host.desktopEventBuffer, EVENT_BUFFER_LIMIT, EVENT_BUFFER_MAX_BYTES);
  const data = `{"type":"desktop-event","seq":${seq},"space":"ipc","event":${capped.json}}`;
  const dataBytes = Buffer.byteLength(data, "utf8");
  for (const client of host.desktopInternalClients) {
    if (host.desktopReplayingClients.has(client)) continue;
    sendRaw(host, client, data, undefined, dataBytes);
  }
}

function updateBackgroundTasks(host: RemoteAccessServerHost, event: RemoteBroadcastEvent): void {
  if (event.type === "thread-reset" || event.type === "thread-exited") {
    host.backgroundTasksByThread.set(event.threadId, []);
    return;
  }
  const runtimeEvents: readonly RuntimeEvent[] =
    event.type === "thread-runtime-event"
      ? [event.event]
      : event.type === "thread-runtime-events"
        ? event.events
        : event.type === "thread-runtime-events-multi"
          ? event.batches.flatMap((batch) => batch.events)
          : [];
  for (const runtimeEvent of runtimeEvents) {
    if (runtimeEvent.type === "background_tasks.changed") {
      host.backgroundTasksByThread.set(runtimeEvent.threadId, [...runtimeEvent.tasks]);
    }
  }
}

/** True for event types whose content varies per connection. */
function needsPerClientScoping(event: RemoteBroadcastEvent): boolean {
  return (
    event.type === "remote-git-state" ||
    event.type === "thread-runtime-event" ||
    event.type === "thread-runtime-events" ||
    event.type === "thread-runtime-events-multi"
  );
}

/**
 * True when at least one connected socket that is NOT replaying needs the
 * legacy full catalog list. Replaying sockets make their own decision when the
 * replay reaches the canonical signal entry (declared: signal; undeclared:
 * per-socket resync), so they neither require nor receive the live full form.
 */
function hasUndeclaredCatalogChangeSubscriber(host: RemoteAccessServerHost): boolean {
  for (const client of host.clients.keys()) {
    if (host.replayingClients.has(client)) continue;
    if (!host.boundedCatalogChangeClients.has(client)) return true;
  }
  return false;
}

/**
 * Publishes one catalog membership change. With no undeclared subscriber and no
 * embedding callback, the bounded signal alone is published and the catalog is
 * never read (D6): a bounded-only mutation must not pay for a full project
 * read when nothing consumes it. When either consumer exists, the
 * authoritative rows are read and parsed once for the legacy full form; the
 * publisher canonicalizes it for the wire and retains only the signal.
 */
export function publishCatalogChanged(host: RemoteAccessServerHost): void {
  const embedding = host.options.onProjectsChanged;
  if (!hasUndeclaredCatalogChangeSubscriber(host) && !embedding) {
    host.publishSupervisorEvent({ type: "remote-projects-changed", mode: "signal" });
    return;
  }
  const projects = dbGetProjects();
  host.publishSupervisorEvent({
    type: "remote-projects-changed",
    projects: remoteProjectCommandResultSchema.parse({ projects }).projects,
  });
  embedding?.(projects);
}

/**
 * Same decision for a caller that already holds the authoritative rows (a
 * host-local projection): no duplicate read, and the wire parse is skipped
 * entirely when neither an undeclared socket nor the embedding callback
 * consumes the full list.
 */
export function publishCatalogChangedRows(
  host: RemoteAccessServerHost,
  projects: readonly Project[],
): void {
  const embedding = host.options.onProjectsChanged;
  if (!hasUndeclaredCatalogChangeSubscriber(host) && !embedding) {
    host.publishSupervisorEvent({ type: "remote-projects-changed", mode: "signal" });
    return;
  }
  host.publishSupervisorEvent({
    type: "remote-projects-changed",
    projects: remoteProjectCommandResultSchema.parse({ projects }).projects,
  });
  embedding?.(projects);
}

/**
 * Canonical signal + declaration-aware live fan-out for one catalog mutation.
 * The signal frame is what replay retains; the full list is serialized at most
 * once per publish and only when an undeclared socket is actually live.
 */
function publishCatalogChangedEvent(
  host: RemoteAccessServerHost,
  event: Extract<RemoteBroadcastEvent, { type: "remote-projects-changed" }>,
  seq: number,
): void {
  const maxBytes = maxBroadcastEventBytes(
    host.options.maxWebSocketOutboundBufferBytes ?? DEFAULT_MAX_WEBSOCKET_OUTBOUND_BUFFER_BYTES,
  );
  const signal = capBroadcastEvent(
    { type: "remote-projects-changed", mode: "signal" } as const,
    maxBytes,
  );
  if (signal.kind === "undeliverable") {
    // Unreachable for a ~90-byte frame with a positive budget; kept as the
    // same self-healing fallback if a host configures an absurd budget.
    host.options.onOversizedEventDropped?.({ type: event.type, bytes: signal.bytes });
    host.replayingClients.clear();
    broadcast(host, {
      type: "resync-required",
      seq,
      reason: "Event too large for the live stream; request a fresh snapshot.",
    });
    return;
  }
  host.eventBuffer.push({
    seq,
    event: signal.event,
    bytes: signal.bytes,
    json: signal.json,
    catalogChange: "signal",
  });
  trimEventBuffer(host.eventBuffer, EVENT_BUFFER_LIMIT, EVENT_BUFFER_MAX_BYTES);

  const fullEvent: typeof event | null = event.projects === undefined ? null : event;
  let fullJson: string | null = null;
  let fullBytes = 0;
  if (fullEvent && hasUndeclaredCatalogChangeSubscriber(host)) {
    fullJson = JSON.stringify(fullEvent);
    fullBytes = Buffer.byteLength(fullJson, "utf8");
  }
  const prefix = `{"type":"event","seq":${seq},"space":"loopback","event":`;
  const prefixBytes = Buffer.byteLength(prefix, "utf8");
  for (const client of host.clients.keys()) {
    if (host.replayingClients.has(client)) continue;
    if (host.boundedCatalogChangeClients.has(client)) {
      sendRaw(host, client, `${prefix}${signal.json}}`, undefined, prefixBytes + signal.bytes + 1);
      continue;
    }
    // Undeclared: truthful full live event when deliverable; otherwise this
    // ONE socket is told to refetch authoritative state. Never a global resync.
    if (fullJson !== null && fullBytes <= maxBytes) {
      sendRaw(host, client, `${prefix}${fullJson}}`, undefined, prefixBytes + fullBytes + 1);
      continue;
    }
    send(host, client, {
      type: "resync-required",
      seq,
      reason: "Catalog change is not deliverable on the live stream; request a fresh snapshot.",
    });
  }
}

/** Applies every per-connection projection for `client`. */
export function scopeEventForClient(
  host: RemoteAccessServerHost,
  event: RemoteBroadcastEvent,
  client: WebSocket,
): RemoteBroadcastEvent {
  if (event.type === "remote-git-state") return scopeGitStateEvent(host, event, client);
  // B1 notice gate first: a connection that cannot render the durable notice
  // must not receive post-gap canonical content even if it declared thread
  // interests for the gated thread; the item-interest filter still applies
  // afterwards exactly as before.
  const noticeScoped = filterEventForNoticeGate(host, event, client);
  return filterEventForItemInterests(noticeScoped, host.itemInterests.get(client) ?? null);
}

/** Narrows a git-state patch to what `client` declared an interest in. */
function scopeGitStateEvent(
  host: RemoteAccessServerHost,
  event: Extract<RemoteBroadcastEvent, { type: "remote-git-state" }>,
  client: WebSocket,
): RemoteBroadcastEvent {
  const interests = host.gitStateInterests.get(client) ?? [];
  const patch = projectGitStatePatchForInterests(event.patch, interests);
  return patch === event.patch ? event : { ...event, patch };
}

export function publishThreadsChanged(
  host: RemoteAccessServerHost,
  threadIds: readonly string[],
): void {
  host.publishSupervisorEvent({
    type: "remote-threads-changed",
    threadIds: [...new Set(threadIds)],
  });
}

/**
 * Streams PTY bytes to watching clients.
 *
 * - Legacy watchers: lossy 1.5MB skip (terminal self-heals; keeps old clients
 *   compatible with silent backpressure drops).
 * - Reliable cursor-sync watchers: hard outbound-limit path only — congestion
 *   disconnects rather than silently gapping the cursor stream. Frames are
 *   tagged with generation/fromCursor/toCursor for the active watchId.
 */
function broadcastTerminalOutput(
  host: RemoteAccessServerHost,
  event: Extract<SupervisorEvent, { type: "thread-output" }>,
): void {
  const id = event.threadId;
  const data = event.data;
  let legacySerialized: string | null = null;
  for (const [client, watched] of host.terminalWatches) {
    if (!watched.has(id)) continue;
    if (client.readyState !== client.OPEN) continue;

    const reliable = host.terminalCursorSync.getReliable(client, id);
    if (reliable) {
      // Reliable path: never silently skip. sendRaw disconnects on hard limit.
      const tagged = buildCursorTaggedTerminalOutput(
        id,
        data,
        reliable.watchId,
        event.terminalInstanceId,
        event.outputLength,
      );
      sendRaw(host, client, JSON.stringify(tagged));
      continue;
    }

    // Legacy path: drop frames on a congested socket.
    if (client.bufferedAmount > 1_500_000) continue;
    legacySerialized ??= JSON.stringify({ type: "terminal-output", id, data });
    sendRaw(host, client, legacySerialized);
  }
}

/**
 * Asks every connected client to discard incremental state and refetch
 * authoritative data. Used when the supervisor shed bulk traffic in transit
 * (supervisor-output-shed): the events never reached persistence, so no
 * replay can repair them — clients must resync terminal output from the
 * supervisor, which remains the authoritative PTY source.
 */
export function broadcastResyncRequired(host: RemoteAccessServerHost, reason: string): void {
  broadcast(host, { type: "resync-required", seq: host.seq, reason });
}
