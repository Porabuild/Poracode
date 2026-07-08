import { parseRelayVisitorPath } from "@/shared/remote/relayProtocol";

/**
 * Port forwarding opens a raw TCP listener on the paired desktop's own LAN
 * interface (`RemotePortForwardGateway`), so only an endpoint that reaches the
 * desktop directly can serve a forwarded port. A desktop paired through a relay
 * (`https://relay.example.test/s/<serverId>/`, see relayProtocol.ts) or any
 * https tunnel proxies HTTP/WS traffic but has no route to that raw listener,
 * so those endpoints must be treated as forwarding-incapable.
 */
export function isDirectEndpoint(endpoint: string): boolean {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol === "https:") return false;
  if (parseRelayVisitorPath(url.pathname)) return false;
  return true;
}

/** Build the phone-reachable URL for an open port forward: the host the phone
 * already reaches the desktop on (the API's `advertisedHost`), at the
 * forward's listen port. */
export function buildForwardUrl(advertisedHost: string, listenPort: number): string {
  return `http://${advertisedHost}:${listenPort}/`;
}

/**
 * Build the phone-reachable URL for a forward's authenticated `enterPath`
 * (e.g. `/forward/<id>/enter?fwt=<token>`), resolved against the endpoint the
 * app is already paired through. This works for every connectivity mode (LAN,
 * tailscale-serve HTTPS, the relay) because `enterPath` rides the same
 * authenticated HTTP endpoint the app already talks to.
 *
 * A relay endpoint carries a path prefix
 * (`https://relay.example.test/s/<serverId>/`) that MUST be preserved, so this
 * can't resolve `enterPath` against the endpoint with `new URL(enterPath,
 * endpoint)` — that treats the root-relative `enterPath` as replacing the
 * entire endpoint path, dropping the relay prefix. Instead, append it after
 * the endpoint's own path.
 */
export function buildEnterUrl(endpoint: string, enterPath: string): string {
  const url = new URL(endpoint);
  return url.origin + url.pathname.replace(/\/+$/, "") + enterPath;
}
