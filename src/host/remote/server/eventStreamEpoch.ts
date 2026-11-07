import { randomUUID } from "node:crypto";
import type { RemoteServerContext } from "./context";

/**
 * Resume-cursor verification for the shared replayable event stream.
 *
 * `ctx.seq` is in-memory and restarts at 0 with every server instance while
 * bearer sessions persist, so a cursor issued by an earlier instance that is at
 * or below the new head would replay as contiguous and silently skip the new
 * instance's first events. Two rules close that gap:
 *
 * - A connection that declared `eventEpoch=v1` is verified exactly: its
 *   positive cursor must carry this instance's epoch.
 * - An undeclared (older) client cannot name its epoch, so the first
 *   cursor-bearing resume of each session on this instance earns one
 *   authoritative resync. Every later connection of that session uses the
 *   ordinary seq rules, which is what keeps native resync-then-reconnect flows
 *   from looping. Two old realms sharing one session can still slip through
 *   after the first one re-baselines; declaring clients are not exposed to that.
 *
 * State is keyed by the server's context (one per `RemoteAccessServer`
 * instance), so the epoch is minted once per instance and dies with it.
 */
interface EventStreamEpochState {
  readonly epoch: string;
  /** Sessions with an undeclared connection on this instance, oldest first. */
  readonly legacySessions: Map<string, true>;
}

/** Caps the legacy session memory; an evicted session pays one extra resync. */
export const MAX_TRACKED_LEGACY_RESUME_SESSIONS = 4_096;

const states = new WeakMap<Pick<RemoteServerContext, "seq">, EventStreamEpochState>();

function stateOf(ctx: Pick<RemoteServerContext, "seq">): EventStreamEpochState {
  let state = states.get(ctx);
  if (!state) {
    state = { epoch: randomUUID(), legacySessions: new Map() };
    states.set(ctx, state);
  }
  return state;
}

/** This server instance's opaque event-stream epoch. */
export function eventStreamEpochOf(ctx: Pick<RemoteServerContext, "seq">): string {
  return stateOf(ctx).epoch;
}

/** The epoch half of an upgrade: `null` for a client that did not declare. */
export interface EventStreamEpochResume {
  readonly lastSeenEpoch: string | null;
}

/**
 * True when the resume cursor may use the ordinary seq rules. Call once per
 * accepted connection: it also records undeclared sessions. A null or zero
 * cursor is always verified, since replaying from the start cannot skip an
 * event.
 */
export function verifyResumeCursor(
  ctx: RemoteServerContext,
  sessionId: string,
  lastSeenSeq: number | null,
  epochResume: EventStreamEpochResume | null,
): boolean {
  const state = stateOf(ctx);
  const positive = lastSeenSeq !== null && lastSeenSeq >= 1;
  if (epochResume) return !positive || epochResume.lastSeenEpoch === state.epoch;
  const known = state.legacySessions.delete(sessionId);
  state.legacySessions.set(sessionId, true);
  if (state.legacySessions.size > MAX_TRACKED_LEGACY_RESUME_SESSIONS) {
    const oldest = state.legacySessions.keys().next().value;
    if (oldest !== undefined) state.legacySessions.delete(oldest);
  }
  return !positive || known;
}
