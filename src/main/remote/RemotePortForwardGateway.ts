import { randomUUID } from "node:crypto";
import { createServer, type AddressInfo, type Server, type Socket } from "node:net";
import type { ActivePortForward, DetectedPort } from "@/shared/remote";
import { RemoteHttpError } from "./auth";
import { connectLoopback, shadowedLoopbackHost, type LoopbackHost } from "./portForward/loopback";
import {
  DEFAULT_PORT_FORWARD_CANDIDATE_PORTS,
  DEFAULT_PORT_PROBE_TIMEOUT_MS,
  scanPorts,
} from "./portForward/portScanner";

const DEFAULT_MAX_FORWARDS = 10;

export interface RemotePortForwardGatewayOptions {
  /** Host the forward's TCP listener binds to. Reuses the same resolved bind
   * host `RemoteAccessServer` listens on (see `src/main/remote/config.ts`,
   * default `0.0.0.0`), so the forward is reachable on whatever LAN interface
   * the phone already uses to reach the remote-access API. */
  readonly bindHost: string;
  /** The remote-access server's own configured port. Forwarding onto it is
   * rejected as a nonsensical self-referential loop. Omit (or pass 0, e.g. an
   * ephemeral test port) to skip that check. */
  readonly remoteAccessPort?: number;
  /** Overridable for tests; defaults to the curated dev-port list. */
  readonly candidatePorts?: readonly number[];
  /** Caps concurrent open forwards. */
  readonly maxForwards?: number;
  /** Per-port probe timeout used by {@link scanPorts}. */
  readonly probeTimeoutMs?: number;
}

interface ForwardEntry {
  readonly id: string;
  readonly targetPort: number;
  readonly listenPort: number;
  readonly createdAt: number;
  readonly server: Server;
  readonly sockets: Set<Socket>;
}

function toPublic(entry: ForwardEntry): ActivePortForward {
  return {
    id: entry.id,
    targetPort: entry.targetPort,
    listenPort: entry.listenPort,
    createdAt: entry.createdAt,
  };
}

/**
 * Bridges the desktop's localhost dev servers to remote (PWA) clients:
 * discovers them ({@link scanPorts}) and opens/closes a raw TCP proxy from the
 * desktop's LAN-reachable interface to the target port on loopback
 * ({@link startForward}/{@link stopForward}), so a phone browser can load e.g.
 * a Vite dev server directly. Raw TCP piping (not an HTTP proxy) means
 * WebSocket upgrades (HMR) pass through unmodified. The outbound leg tries
 * `127.0.0.1` then falls back to `::1` (see {@link connectLoopback}) since a
 * dev server bound to the bare hostname `localhost` can end up IPv6-only.
 *
 * Electron-free by design — constructed and injected the same way in the
 * Electron main composition root and the headless server (see
 * docs/REMOTE_ARCHITECTURE.md).
 */
export class RemotePortForwardGateway {
  private readonly forwards = new Map<string, ForwardEntry>();
  /** In-flight `startForward` calls keyed by targetPort, so concurrent callers
   * for the same port share one listener instead of racing two into
   * existence (see {@link startForward}). Removed on settle (success or
   * failure) so a subsequent call — retry included — starts fresh. */
  private readonly pendingStarts = new Map<number, Promise<ActivePortForward>>();
  /** Set by {@link dispose}; makes shutdown airtight against a `startForward`
   * that is mid-`listen()` when dispose runs — see {@link openForward}. */
  private disposed = false;

  constructor(private readonly options: RemotePortForwardGatewayOptions) {}

  async scanPorts(): Promise<DetectedPort[]> {
    if (this.disposed) {
      throw new RemoteHttpError(
        "gateway_disposed",
        "The port forward gateway has been disposed.",
        503,
      );
    }
    return scanPorts(
      this.options.candidatePorts ?? DEFAULT_PORT_FORWARD_CANDIDATE_PORTS,
      this.options.probeTimeoutMs ?? DEFAULT_PORT_PROBE_TIMEOUT_MS,
    );
  }

  /** Idempotent per `targetPort`: a second call for an already-forwarded port
   * returns the existing forward rather than opening a duplicate listener.
   * Concurrent calls for the same port share the single in-flight open (see
   * `pendingStarts`) so two listeners can never be raced into existence. */
  async startForward(targetPort: number): Promise<ActivePortForward> {
    this.validateTargetPort(targetPort);
    if (this.disposed) {
      throw new RemoteHttpError(
        "gateway_disposed",
        "The port forward gateway has been disposed.",
        503,
      );
    }
    const existing = [...this.forwards.values()].find((entry) => entry.targetPort === targetPort);
    if (existing) return toPublic(existing);

    const pending = this.pendingStarts.get(targetPort);
    if (pending) return pending;

    const maxForwards = this.options.maxForwards ?? DEFAULT_MAX_FORWARDS;
    // Count pending starts too: otherwise concurrent calls for *different*
    // ports could each pass this check before any of them finishes
    // registering, blowing past the cap.
    if (this.forwards.size + this.pendingStarts.size >= maxForwards) {
      throw new RemoteHttpError(
        "forward_limit_reached",
        `Cannot open more than ${maxForwards} port forwards at once.`,
        429,
      );
    }

    const startPromise = this.openForward(targetPort).finally(() => {
      this.pendingStarts.delete(targetPort);
    });
    this.pendingStarts.set(targetPort, startPromise);
    return startPromise;
  }

  /** Opens the listener for a new forward. Split out of `startForward` so the
   * pending-starts bookkeeping there stays simple.
   *
   * Tries to mirror the target's port number first — `listen(targetPort,
   * bindHost)` — so a phone hitting `http://<lan-ip>:5173` lands on the same
   * port the dev server itself uses on loopback. That bind usually succeeds
   * because the dev server only holds `127.0.0.1`/`::1`, leaving the
   * wildcard/LAN-interface binding free. If it fails for any reason
   * (`EADDRINUSE` — the dev server bound `0.0.0.0`, or something else already
   * holds the port; `EACCES` for privileged ports; anything else), the
   * failed server is closed and discarded and a fresh one falls back to the
   * ephemeral `listen(0, …)` behavior. Deliberately not platform-branched:
   * wildcard-vs-specific bind conflicts differ between Windows and Linux, so
   * attempting and catching covers both. */
  private async openForward(targetPort: number): Promise<ActivePortForward> {
    const id = randomUUID();
    const sockets = new Set<Socket>();
    const bindHost = this.options.bindHost;
    // If the mirrored bind below succeeds, this listener occupies
    // `bindHost:targetPort`, which may shadow one of the loopback families
    // `connectLoopback` dials on the outbound leg (e.g. `bindHost: "0.0.0.0"`
    // shadows `127.0.0.1`) — self-connecting into our own listener instead of
    // reaching the real dev server. Computed once, up front, so it can be
    // baked into the *mirrored* server's connection handler; the fallback
    // server (ephemeral port) never shadows loopback, so it gets none.
    const mirrorShadow = shadowedLoopbackHost(bindHost);

    let server = this.createForwardServer(targetPort, sockets, mirrorShadow);
    try {
      await this.listenOn(server, targetPort, bindHost);
    } catch {
      // Mirrored bind failed — fully close/discard this server instance (it
      // never reached "listening", so nothing else references it) before
      // falling back, so there is no leaked handle and no unhandled 'error'
      // from reusing a server that already errored.
      await new Promise<void>((resolve) => server.close(() => resolve()));
      server = this.createForwardServer(targetPort, sockets, undefined);
      await this.listenOn(server, 0, bindHost);
    }

    // `dispose()` may have run while `listen()` was in flight above (there is
    // no `await` between the flag check and the registration below, so this
    // check is race-free): close the just-opened listener immediately instead
    // of registering an orphaned forward nothing will ever tear down.
    if (this.disposed) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      throw new RemoteHttpError(
        "gateway_disposed",
        "The port forward gateway has been disposed.",
        503,
      );
    }

    const address = server.address() as AddressInfo;
    const entry: ForwardEntry = {
      id,
      targetPort,
      listenPort: address.port,
      createdAt: Date.now(),
      server,
      sockets,
    };
    this.forwards.set(id, entry);
    return toPublic(entry);
  }

  /** Constructs (but does not `listen()`) the raw-TCP-piping server for one
   * forward. Attaches the connection handler before `listen()` is ever
   * called so there is no window between "listening" and "accepting" where
   * an inbound connection could be dropped. `shadowedHost`, if set, is a
   * loopback family this *specific* listen attempt would shadow if it binds
   * — see {@link openForward} — and is threaded into every inbound
   * connection's outbound dial so it never self-connects. */
  private createForwardServer(
    targetPort: number,
    sockets: Set<Socket>,
    shadowedHost: LoopbackHost | undefined,
  ): Server {
    const server = createServer((inbound) =>
      this.pipeConnection(targetPort, sockets, inbound, shadowedHost),
    );
    server.on("error", () => {
      // A listener-level error (vs. a per-connection error, handled in
      // pipeConnection) must never crash the process.
    });
    return server;
  }

  /** Resolves once `server` starts listening on `port`/`host`, or rejects
   * with the bind error (e.g. `EADDRINUSE`, `EACCES`) so callers can fall
   * back. */
  private listenOn(server: Server, port: number, host: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const onError = (error: Error) => {
        server.off("listening", onListening);
        reject(error);
      };
      const onListening = () => {
        server.off("error", onError);
        resolve();
      };
      server.once("error", onError);
      server.once("listening", onListening);
      server.listen(port, host);
    });
  }

  /** Closes the forward's listener and destroys every live socket it owns
   * (both accepted inbound sockets and their piped outbound counterparts). */
  async stopForward(id: string): Promise<boolean> {
    const entry = this.forwards.get(id);
    if (!entry) return false;
    this.forwards.delete(id);
    for (const socket of entry.sockets) {
      socket.destroy();
    }
    entry.sockets.clear();
    await new Promise<void>((resolve) => entry.server.close(() => resolve()));
    return true;
  }

  listForwards(): ActivePortForward[] {
    return [...this.forwards.values()].map(toPublic);
  }

  /** O(1) lookup of a single open forward by id (the map's own key), or `null`
   * if none is open — the hot-path check behind the HTTP/WS proxy session
   * resolution and the `/api/ports/enter` existence guard, both of which only
   * need one forward, not the whole `listForwards()` snapshot. */
  getForward(id: string): ActivePortForward | null {
    const entry = this.forwards.get(id);
    return entry ? toPublic(entry) : null;
  }

  /** Closes every open forward; safe to call multiple times. Also flips the
   * `disposed` flag first (synchronously, before touching `forwards`) so any
   * `startForward` whose `listen()` resolves after this point self-closes
   * instead of registering — see {@link openForward}. */
  dispose(): void {
    this.disposed = true;
    for (const id of [...this.forwards.keys()]) {
      void this.stopForward(id);
    }
  }

  /** Pipes one accepted inbound socket to a fresh outbound connection to the
   * forward's target port, raw TCP both ways (so WebSocket upgrades, e.g. Vite
   * HMR, pass through untouched). The outbound leg is opened via
   * {@link connectLoopback}, which tries `127.0.0.1` then falls back to `::1`
   * on a connect failure — piping only starts once it actually connects, so
   * an inbound socket sits buffered (not dropped) while that fallback plays
   * out. `shadowedHost`, when this forward mirrored the target's port number,
   * excludes the loopback family that this very listener shadows, so the
   * outbound dial can't self-connect into it (see {@link openForward}).
   * Destroys both sides on either erroring or closing — never leaves a
   * half-open socket or an unhandled 'error' event. */
  private pipeConnection(
    targetPort: number,
    sockets: Set<Socket>,
    inbound: Socket,
    shadowedHost: LoopbackHost | undefined,
  ): void {
    sockets.add(inbound);

    let closed = false;
    let outbound: Socket | undefined;
    const teardown = () => {
      if (closed) return;
      closed = true;
      sockets.delete(inbound);
      if (outbound) sockets.delete(outbound);
      inbound.destroy();
      outbound?.destroy();
    };

    inbound.on("error", teardown);
    inbound.on("close", teardown);

    connectLoopback(targetPort, shadowedHost ? { exclude: [shadowedHost] } : undefined)
      .then((connection) => {
        // The inbound side (or the whole gateway) may have torn down while
        // the outbound connect/fallback was in flight.
        if (closed) {
          connection.socket.destroy();
          return;
        }
        outbound = connection.socket;
        sockets.add(outbound);
        outbound.on("error", teardown);
        outbound.on("close", teardown);
        inbound.pipe(outbound);
        outbound.pipe(inbound);
      })
      .catch(teardown);
  }

  private validateTargetPort(targetPort: number): void {
    if (!Number.isInteger(targetPort) || targetPort < 1 || targetPort > 65535) {
      throw new RemoteHttpError("invalid_port", "targetPort must be between 1 and 65535.", 400);
    }
    if (this.options.remoteAccessPort && targetPort === this.options.remoteAccessPort) {
      throw new RemoteHttpError(
        "invalid_port",
        "Cannot forward the remote access server's own port.",
        400,
      );
    }
  }
}
