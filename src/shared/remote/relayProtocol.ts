import { z } from "zod";

/**
 * Relay transport for cross-network access (docs/REMOTE_ARCHITECTURE.md, Phase
 * 5). A Lightcode server behind NAT dials OUT to a relay and registers under a
 * server id; a device points its endpoint at `https://<relay>/s/<serverId>/`
 * and the relay tunnels its HTTP + WebSocket traffic to the registered server.
 *
 * This module defines the framing for the single persistent control socket
 * between a server ("host") and the relay. Visitor⇄relay traffic stays plain
 * HTTP/WS — the relay translates it into these frames — so neither the client
 * nor `RemoteAccessServer` needs relay-specific code: the host adapter simply
 * proxies each framed request to the server's own loopback port.
 *
 * Auth is unchanged and end-to-end: the relay never sees pairing/bearer secrets
 * in cleartext beyond forwarding the Authorization header, and the host's
 * registration secret only prevents another process from hijacking a serverId.
 *
 * NOTE: this is the self-hostable transport. The managed, account-scoped
 * "cloud subscription" service (hosting, billing, per-account routing) layers on
 * top and is out of repo scope.
 */
export const LIGHTCODE_RELAY_PROTOCOL_VERSION = 1;

/** Host → relay: claim a server id on this control socket. */
export const relayRegisterFrameSchema = z.object({
  t: z.literal("register"),
  protocolVersion: z.literal(LIGHTCODE_RELAY_PROTOCOL_VERSION),
  serverId: z.string().min(1),
  /** Shared secret proving ownership of `serverId` (prevents hijacking). */
  secret: z.string().min(1),
  label: z.string().min(1).optional(),
});

/** Relay → host: registration accepted; `publicUrl` is the visitor base URL. */
export const relayRegisteredFrameSchema = z.object({
  t: z.literal("registered"),
  serverId: z.string().min(1),
  publicUrl: z.string().url(),
});

/** Relay → host: a visitor HTTP request to proxy to the local server. */
export const relayRequestFrameSchema = z.object({
  t: z.literal("req"),
  id: z.string().min(1),
  method: z.string().min(1),
  /** Path + query, relative to the server root (the `/s/<id>` prefix stripped). */
  path: z.string().min(1),
  headers: z.record(z.string(), z.string()),
  /** base64 request body, omitted when empty. */
  body: z.string().optional(),
});

/** Host → relay: the response for a `req` frame. */
export const relayResponseFrameSchema = z.object({
  t: z.literal("res"),
  id: z.string().min(1),
  status: z.number().int(),
  headers: z.record(z.string(), z.string()),
  /** base64 response body. */
  body: z.string(),
});

/** Host → relay: the request could not be served locally. */
export const relayRequestErrorFrameSchema = z.object({
  t: z.literal("req-error"),
  id: z.string().min(1),
  message: z.string(),
});

/** Relay → host: a visitor opened a WebSocket. */
export const relayWsOpenFrameSchema = z.object({
  t: z.literal("ws-open"),
  id: z.string().min(1),
  /** Path + query (e.g. `/ws?ticket=...`). */
  path: z.string().min(1),
});

/** Bidirectional: a WebSocket text frame for channel `id`. */
export const relayWsDataFrameSchema = z.object({
  t: z.literal("ws-data"),
  id: z.string().min(1),
  data: z.string(),
});

/** Bidirectional: close the WebSocket channel `id`. */
export const relayWsCloseFrameSchema = z.object({
  t: z.literal("ws-close"),
  id: z.string().min(1),
  reason: z.string().optional(),
});

export const relayHostFrameSchema = z.discriminatedUnion("t", [
  relayRegisterFrameSchema,
  relayResponseFrameSchema,
  relayRequestErrorFrameSchema,
  relayWsDataFrameSchema,
  relayWsCloseFrameSchema,
]);
export type RelayHostFrame = z.infer<typeof relayHostFrameSchema>;

export const relayServerFrameSchema = z.discriminatedUnion("t", [
  relayRegisteredFrameSchema,
  relayRequestFrameSchema,
  relayWsOpenFrameSchema,
  relayWsDataFrameSchema,
  relayWsCloseFrameSchema,
]);
export type RelayServerFrame = z.infer<typeof relayServerFrameSchema>;

export type RelayRequestFrame = z.infer<typeof relayRequestFrameSchema>;
export type RelayResponseFrame = z.infer<typeof relayResponseFrameSchema>;
export type RelayWsOpenFrame = z.infer<typeof relayWsOpenFrameSchema>;
export type RelayWsDataFrame = z.infer<typeof relayWsDataFrameSchema>;
export type RelayWsCloseFrame = z.infer<typeof relayWsCloseFrameSchema>;

/** Build the visitor-facing base URL for a registered server id. */
export function relayPublicUrl(relayBaseUrl: string, serverId: string): string {
  const base = new URL(relayBaseUrl);
  const prefix = base.pathname.replace(/\/+$/, "");
  base.pathname = `${prefix}/s/${encodeURIComponent(serverId)}/`;
  return base.toString();
}

/** `JSON.parse` that returns null instead of throwing (for framed sockets). */
export function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

/** Parse `/s/<serverId>/<rest>` → { serverId, path }. Returns null if no match. */
export function parseRelayVisitorPath(
  pathname: string,
): { readonly serverId: string; readonly path: string } | null {
  const match = /^\/s\/([^/]+)(\/.*)?$/.exec(pathname);
  if (!match) return null;
  const serverId = decodeURIComponent(match[1]!);
  if (!serverId) return null;
  return { serverId, path: match[2] && match[2].length > 0 ? match[2] : "/" };
}
