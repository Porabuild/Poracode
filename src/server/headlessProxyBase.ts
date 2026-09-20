/** Bind hosts that mean "all interfaces" — the server then also listens on loopback. */
const WILDCARD_BIND_HOSTS = new Set(["0.0.0.0", "::", "::0"]);

/**
 * The base URL the relay host adapter should proxy visitor traffic to on this
 * machine. The server binds to `bindHost`; the relay must reach the SAME
 * address, not a hardcoded 127.0.0.1.
 *
 * On a wildcard bind (`0.0.0.0`/`::`/`::0`/empty) the server also accepts
 * loopback, so 127.0.0.1 is correct and avoids depending on any external
 * interface. On a specific bind host (e.g. a Tailscale/VPN IP) the server does
 * NOT listen on 127.0.0.1, so proxying there would ECONNREFUSED — use the
 * configured host, bracketing IPv6 literals. The bound port is always taken
 * from the actually-listening `httpBaseUrl`.
 */
export function resolveLocalProxyBase(bindHost: string | undefined, httpBaseUrl: string): string {
  const port = new URL(httpBaseUrl).port;
  const host = bindHost?.trim();
  if (!host || WILDCARD_BIND_HOSTS.has(host)) {
    return `http://127.0.0.1:${port}`;
  }
  // Bracket IPv6 literals (they contain colons); IPv4/hostnames pass through.
  const authorityHost = host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;
  return `http://${authorityHost}:${port}`;
}
