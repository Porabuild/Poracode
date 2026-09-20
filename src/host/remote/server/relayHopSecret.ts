import { randomBytes, timingSafeEqual } from "node:crypto";
import type { IncomingHttpHeaders } from "node:http";

/**
 * Header the in-process relay adapter stamps on every loopback dial. Presence
 * of a matching per-process secret can only make a loopback gate STRICTER
 * (the dial is proxied, not local). A client-set copy is stripped at ingress
 * (V6 A.6); it never grants `X-Forwarded-For` trust on its own.
 */
export const RELAY_LOOPBACK_HOP_HEADER = "x-poracode-relay-hop";

let hopSecret: Buffer | null = null;

/** The hop secret this process stamps on authenticated in-process relay dials. */
export function relayLoopbackHopSecret(): string {
  hopSecret ??= randomBytes(32);
  return hopSecret.toString("base64url");
}

export function resetRelayLoopbackHopSecretForTests(): void {
  hopSecret = null;
}

function hopHeaderValue(headers: IncomingHttpHeaders): string | undefined {
  const raw = headers[RELAY_LOOPBACK_HOP_HEADER];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value === undefined || value === "" ? undefined : value;
}

function matchesHopSecret(value: string | undefined): boolean {
  if (!hopSecret || value === undefined) return false;
  const expected = Buffer.from(hopSecret.toString("base64url"));
  const provided = Buffer.from(value);
  if (expected.length !== provided.length) return false;
  return timingSafeEqual(expected, provided);
}

/** Whether the request carries THIS process's relay hop secret. */
export function hasRelayLoopbackHopMarker(req: { readonly headers: IncomingHttpHeaders }): boolean {
  return matchesHopSecret(hopHeaderValue(req.headers));
}

/**
 * Drop a client-set hop marker that is not this process's secret so leftover
 * `=== "1"` checks cannot treat a spoofed header as a relay hop.
 */
export function stripUnauthenticatedRelayHopMarker(headers: IncomingHttpHeaders): void {
  const value = hopHeaderValue(headers);
  if (matchesHopSecret(value)) return;
  delete headers[RELAY_LOOPBACK_HOP_HEADER];
}
