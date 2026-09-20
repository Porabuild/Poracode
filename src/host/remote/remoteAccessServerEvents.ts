import type { WebSocket } from "ws";
import type { SupervisorEvent } from "@/shared/ipc";
import type { RuntimeEvent } from "@/shared/contracts";
import { persistSupervisorEvent } from "./server/runtimePersistence";
import { projectGitStatePatchForInterests } from "./server/gitStateProjection";
import { filterEventForItemInterests } from "./server/itemInterestFilter";
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
    send(host, ws, {
      type: "resync-required",
      seq: host.seq,
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
    get seq() {
      return host.seq;
    },
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
 * events (git summaries) ride the same stream as supervisor events. */
export function publishSupervisorEvent(
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
  if (host.options.ownsSupervisorPersistence !== false) {
    persistSupervisorEvent(event);
  }

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
  // `broadcast`.
  broadcastRaw(host, `{"type":"event","seq":${seq},"space":"loopback","event":${capped.json}}`);
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
      send(host, client, {
        type: "resync-required",
        seq: host.seq,
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
  for (const client of host.desktopInternalClients) {
    if (host.desktopReplayingClients.has(client)) continue;
    sendRaw(host, client, data);
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

/** Applies every per-connection projection for `client`. */
export function scopeEventForClient(
  host: RemoteAccessServerHost,
  event: RemoteBroadcastEvent,
  client: WebSocket,
): RemoteBroadcastEvent {
  if (event.type === "remote-git-state") return scopeGitStateEvent(host, event, client);
  return filterEventForItemInterests(event, host.itemInterests.get(client) ?? null);
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
