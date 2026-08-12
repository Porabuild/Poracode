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

export function buildForwardUrl(advertisedHost: string, listenPort: number): string {
  return `http://${advertisedHost}:${listenPort}/`;
}

export function buildEnterUrl(endpoint: string, enterPath: string): string {
  const url = new URL(endpoint);
  return url.origin + url.pathname.replace(/\/+$/, "") + enterPath;
}
