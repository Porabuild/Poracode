import { parseRelayVisitorPath } from "@/shared/remote/relayProtocol";

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

/**
 * Explicit raw-TCP address for a forwarded port. Reachable only from the same
 * network as the desktop; never a substitute for the isolated browser entry URL.
 */
export function buildRawTcpUrl(advertisedHost: string, listenPort: number): string {
  return `http://${advertisedHost}:${listenPort}/`;
}

export function buildEnterUrl(endpoint: string, enterPath: string): string {
  const url = new URL(endpoint);
  return url.origin + url.pathname.replace(/\/+$/, "") + enterPath;
}
