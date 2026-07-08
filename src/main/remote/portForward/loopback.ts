import { connect, type Socket } from "node:net";

/**
 * The two addresses a "localhost"-bound dev server can end up listening on.
 * IPv4 is tried first (the overwhelmingly common case); IPv6 is the fallback
 * for a server (`vite --port …`, and other tools that bind the bare hostname
 * `localhost` rather than an explicit address) that resolved to IPv6-only on
 * this system instead of IPv4 — confirmed in the wild on Windows, where a
 * plain `vite --port 4321` bound only `::1`. Every loopback connection this
 * port-forwarding feature makes (the scanner's probe, the raw TCP forward,
 * the HTTP/WS reverse proxy) needs both tried in this order, because the
 * caller only ever knows the port, never which family the server actually
 * bound.
 */
export const LOOPBACK_HOSTS = ["127.0.0.1", "::1"] as const;
export type LoopbackHost = (typeof LOOPBACK_HOSTS)[number];

/**
 * Remembers, per port, which loopback family last accepted a connection.
 * Shared (module-level) across the scanner, {@link RemotePortForwardGateway}'s
 * raw TCP forward, and the HTTP/WS reverse proxy, so once *any* of them has
 * established which family a given port's dev server bound, the others — and
 * later connections to the same one — try that family first instead of
 * eating a doomed IPv4 connection attempt on every single connection.
 * Process-lifetime, in-memory, never invalidated on its own: a stale entry
 * (the server restarted bound to the other family) just costs one extra
 * failed dial the next time, since {@link connectLoopback} always falls back
 * and re-remembers whichever family actually worked.
 */
const resolvedHostByPort = new Map<number, LoopbackHost>();

/** Records `host` as the working family for `port`. Exported so a call site
 * that resolves the family itself (see `proxyForwardedHttpRequest`, which
 * can't use {@link connectLoopback} directly because `http.request` — not a
 * raw socket — owns the connection) can still feed the shared cache. */
export function rememberLoopbackHost(port: number, host: LoopbackHost): void {
  resolvedHostByPort.set(port, host);
}

/** {@link LOOPBACK_HOSTS}, reordered so `port`'s cached family (if any) is
 * tried first, and with any host in `exclude` dropped entirely. */
export function orderedLoopbackHosts(
  port: number,
  exclude?: readonly LoopbackHost[],
): readonly LoopbackHost[] {
  const cached = resolvedHostByPort.get(port);
  const hosts = cached
    ? [cached, ...LOOPBACK_HOSTS.filter((host) => host !== cached)]
    : LOOPBACK_HOSTS;
  if (!exclude || exclude.length === 0) return hosts;
  return hosts.filter((host) => !exclude.includes(host));
}

/** The loopback host that binding a listener to `bindHost` would also shadow
 * — i.e. a subsequent *outbound* connect to `host:port` would be captured by
 * that same listener instead of reaching a genuinely different process —
 * either because `bindHost` *is* that loopback address, or because it is the
 * matching wildcard (`0.0.0.0` covers `127.0.0.1`; `::` covers `::1`).
 * `undefined` for any other address: a bind to one specific LAN interface
 * never shadows loopback traffic.
 *
 * Used by {@link RemotePortForwardGateway}'s port-mirroring path: once its
 * forward listener binds directly to the target's port number, the outbound
 * leg (`connectLoopback`) must skip whichever loopback family that bind
 * shadows, or it would self-connect into its own listener instead of
 * reaching the real dev server — which, if reachable on loopback at all, can
 * only be bound to the *other* family (mirroring only succeeds when nothing
 * already holds `bindHost:port`, so a shadowed family can't also be the
 * dev server's). See the IPv6-only-dev-server case this module's doc comment
 * describes. */
export function shadowedLoopbackHost(bindHost: string): LoopbackHost | undefined {
  if (bindHost === "127.0.0.1" || bindHost === "0.0.0.0") return "127.0.0.1";
  if (bindHost === "::1" || bindHost === "::") return "::1";
  return undefined;
}

export interface LoopbackConnection {
  readonly socket: Socket;
  readonly host: LoopbackHost;
}

export interface ConnectLoopbackOptions {
  readonly timeoutMs?: number;
  /** Loopback families to skip entirely — see {@link shadowedLoopbackHost}. */
  readonly exclude?: readonly LoopbackHost[];
}

/**
 * Opens a TCP connection to `port` on loopback, trying each of
 * {@link orderedLoopbackHosts} in turn (cached family first) until one
 * connects, rejecting with the last attempt's error if none do. Only the
 * *connect* step falls back across families: once a socket successfully
 * connects it is handed back immediately, and everything after that (writes,
 * mid-stream errors) is entirely the caller's problem, same as any other raw
 * socket use in this codebase — this only ever protects the initial dial.
 *
 * Records the winning family for `port` (see {@link rememberLoopbackHost})
 * so the next connection to the same port — a new inbound connection through
 * an open forward, a fresh WebSocket upgrade — tries it first.
 */
export function connectLoopback(
  port: number,
  options?: ConnectLoopbackOptions,
): Promise<LoopbackConnection> {
  const { timeoutMs, exclude } = options ?? {};
  const hosts = orderedLoopbackHosts(port, exclude);

  const attempt = (index: number): Promise<LoopbackConnection> => {
    const host = hosts[index];
    if (host === undefined) {
      return Promise.reject(new Error(`No loopback host accepted a connection on port ${port}.`));
    }
    return new Promise((resolve, reject) => {
      const socket = connect({ host, port });
      let settled = false;

      const onFailure = (error: Error) => {
        if (settled) return;
        settled = true;
        socket.destroy();
        if (index + 1 < hosts.length) {
          resolve(attempt(index + 1));
        } else {
          reject(error);
        }
      };

      if (timeoutMs !== undefined) {
        socket.setTimeout(timeoutMs);
        socket.once("timeout", () =>
          onFailure(new Error(`Timed out connecting to ${host}:${port}.`)),
        );
      }
      socket.once("error", onFailure);
      socket.once("connect", () => {
        if (settled) return;
        settled = true;
        socket.removeAllListeners("timeout");
        socket.removeAllListeners("error");
        rememberLoopbackHost(port, host);
        resolve({ socket, host });
      });
    });
  };

  return attempt(0);
}

/**
 * Whether *something* accepts a raw TCP connection on `port`, on either
 * loopback family — used by the port scanner, which only needs a yes/no plus
 * (for the HTTP follow-up probe) which family answered, not a live socket.
 * Never throws; a refused/timed-out/errored probe on every family just means
 * "not detected".
 */
export async function probeLoopbackPort(
  port: number,
  timeoutMs: number,
): Promise<LoopbackHost | null> {
  try {
    const { socket, host } = await connectLoopback(port, { timeoutMs });
    socket.destroy();
    return host;
  } catch {
    return null;
  }
}
