import {
  RELAY_LOOPBACK_HOP_HEADER,
  relayLoopbackHopSecret,
} from "@/host/remote/server/relayHopSecret";

const RELAY_CLIENT_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

/** Preserve one rate-limit bucket per relay network peer. Old relays share a
 * conservative bucket; request IDs would give each attempt a fresh limit. */
export function forwardedForIdentity(clientId: string | undefined): string {
  return clientId && RELAY_CLIENT_ID_PATTERN.test(clientId) ? `relay:${clientId}` : "relay:legacy";
}

/**
 * Dial shapes the in-process adapter actually opens against the host
 * loopback. Call sites must pass a key from this table so the A.10 test
 * enumerates production dials rather than a free-standing literal.
 */
export const RELAY_ORIGIN_DIAL_TABLE = {
  http: { extra: { "accept-encoding": "identity" } },
  ws: { extra: { cookie: "sid=1" } },
} as const;

export type RelayOriginDialShape = keyof typeof RELAY_ORIGIN_DIAL_TABLE;

/**
 * V6 A.10 / S-9: the ONE header stamp every relay→loopback dial must carry.
 * The hop marker is this process's secret (V6 A.6); presence only makes
 * loopback gates stricter. X-Forwarded-For is trusted because this secret
 * proves the dial is the in-process adapter, not a client-set header.
 * Visitor-supplied copies of either header must be dropped *before* this
 * helper runs. `shape` must be a {@link RELAY_ORIGIN_DIAL_TABLE} key.
 */
export function relayDialOriginHeaders(
  shape: RelayOriginDialShape,
  clientId: string | undefined,
  extra?: Readonly<Record<string, string>>,
): Record<string, string> {
  void shape;
  return {
    ...extra,
    [RELAY_LOOPBACK_HOP_HEADER]: relayLoopbackHopSecret(),
    "x-forwarded-for": forwardedForIdentity(clientId),
  };
}
