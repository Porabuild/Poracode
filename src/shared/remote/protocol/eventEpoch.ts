import { z } from "zod";

/**
 * Event-stream epoch (`eventEpoch=v1`).
 *
 * A server's replay `seq` is in-memory and restarts at 0 with every server
 * instance while bearer sessions survive the restart, so a bare resume cursor
 * cannot prove which instance issued it: an old cursor at or below the new
 * head would otherwise replay as contiguous and silently skip the new
 * instance's first events. A declaring client binds its cursor to the opaque
 * epoch the instance reports in `ready` and sends both back on reconnect; the
 * server refuses (`resync-required`) a positive cursor whose epoch is missing
 * or different.
 *
 * Negotiated per connection, so it stays additive within the remote protocol
 * version (no `PORACODE_REMOTE_PROTOCOL_VERSION` bump): an old host ignores the
 * declaration and sends `ready` without `epoch`, which a client treats as
 * "legacy host, cursor unbound"; an old client never declares and keeps the
 * exact `{ type, seq }` ready frame. A changed meaning needs a new declaration
 * value, never a silent reinterpretation of `v1`.
 */
export const REMOTE_EVENT_EPOCH_DECLARATION = "v1" as const;

/** WS upgrade query parameter carrying the {@link REMOTE_EVENT_EPOCH_DECLARATION}. */
export const REMOTE_EVENT_EPOCH_WS_PARAM = "eventEpoch" as const;

/** WS upgrade query parameter carrying the epoch the resume cursor is bound to. */
export const REMOTE_LAST_SEEN_EPOCH_WS_PARAM = "lastSeenEpoch" as const;

/** Upper bound for an echoed epoch; the server mints UUIDs well below it. */
export const REMOTE_EVENT_EPOCH_MAX_LENGTH = 128;

/** Opaque per-instance identity; compared for equality only, never ordered. */
export const remoteEventEpochSchema = z.string().min(1).max(REMOTE_EVENT_EPOCH_MAX_LENGTH);

/**
 * Adds the epoch declaration (and the cursor's bound epoch, when it has one)
 * to a WS upgrade URL. Idempotent; an unbound cursor sends no `lastSeenEpoch`,
 * which the server answers with one authoritative resync for a positive cursor.
 */
export function withEventEpochDeclaration(
  wsUrl: string,
  lastSeenEpoch: string | undefined,
): string {
  const url = new URL(wsUrl);
  url.searchParams.set(REMOTE_EVENT_EPOCH_WS_PARAM, REMOTE_EVENT_EPOCH_DECLARATION);
  if (lastSeenEpoch === undefined) {
    url.searchParams.delete(REMOTE_LAST_SEEN_EPOCH_WS_PARAM);
  } else {
    url.searchParams.set(REMOTE_LAST_SEEN_EPOCH_WS_PARAM, lastSeenEpoch);
  }
  return url.toString();
}
