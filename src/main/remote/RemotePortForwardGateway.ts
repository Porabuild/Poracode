import { randomBytes, randomUUID } from "node:crypto";
import { Agent, type AgentOptions } from "node:http";
import { createServer, type AddressInfo, type Server, type Socket } from "node:net";
import type { ActivePortForward, DetectedPort } from "@/shared/remote";
import { RemoteHttpError } from "./auth";
import { isForwardableTargetPort, DEFAULT_FORWARDABLE_PORTS } from "./portForward/forwardablePorts";
import { connectLoopback, shadowedLoopbackHost, type LoopbackHost } from "./portForward/loopback";
import { DEFAULT_PORT_PROBE_TIMEOUT_MS, scanPorts } from "./portForward/portScanner";

const DEFAULT_MAX_FORWARDS = 10;
/** Connect tickets expire; a client re-opens the forward (the create route is
 * idempotent per target port and mints fresh) rather than holding a credential
 * forever. Matches the browser enter-token TTL. */
const DEFAULT_CONNECT_TICKET_TTL_MS = 10 * 60 * 1000;
/** How long an inbound connection may sit silent waiting for its credential
 * line before it is destroyed (bounds half-open socket hoarding). */
const DEFAULT_CONNECT_AUTH_TIMEOUT_MS = 10_000;
/** Hard cap on the buffered credential line — far above any real token
 * (43-char base64url tickets, ~100-char bearers); anything longer is garbage
 * or an attack, never a credential. */
const MAX_CONNECT_AUTH_LINE_BYTES = 512;

/** Pool policy for the per-forward keep-alive agents ({@link
 * ForwardLifetime.agent}): the same idle policy the shared `http.globalAgent`
 * pool applied before each forward owned its own, so only ownership changed —
 * idle sockets retire ~5s after their last response instead of lingering for
 * the forward's whole life. `timeout` never deadlines an in-flight response:
 * the agent's timeout handling destroys a socket only once it is back in the
 * free pool (Node `_http_agent`'s `onTimeout`). */
const FORWARD_AGENT_OPTIONS: AgentOptions = {
  keepAlive: true,
  scheduling: "lifo",
  timeout: 5000,
};

export interface RemotePortForwardGatewayOptions {
  /** Host the forward's TCP listeners bind to. Composition roots pass the
   * SAME resolved bind host the `RemoteAccessServer` itself listens on (see
   * `src/main/remote/config.ts` — loopback by default since the Gate 6 bind
   * modes), so a forward is reachable exactly where the remote-access API is
   * and never wider. */
  readonly bindHost: string;
  /** The remote-access server's own configured port. Forwarding onto it is
   * rejected as a nonsensical self-referential loop. Omit (or pass 0, e.g. an
   * ephemeral test port) to skip that check. */
  readonly remoteAccessPort?: number;
  /** The forward allowlist (see `portForward/forwardablePorts.ts`): the SAME
   * list backs the discovery scan ({@link scanPorts}) and the forward-creation
   * gate ({@link startForward}), so only ports the discovery surface
   * advertises can be forwarded. Defaults to the curated dev-port list.
   * `candidatePorts` is the legacy spelling of this option and is still
   * honored. */
  readonly forwardablePorts?: readonly number[];
  /** Overridable for tests; defaults to the curated dev-port list. */
  readonly candidatePorts?: readonly number[];
  /** Caps concurrent open forwards. */
  readonly maxForwards?: number;
  /** Per-port probe timeout used by {@link scanPorts}. */
  readonly probeTimeoutMs?: number;
  /** TTL for per-forward connect tickets minted by
   * {@link mintConnectTicket}. */
  readonly connectTicketTtlMs?: number;
  /** How long an inbound connection may wait for its credential line before
   * being destroyed. */
  readonly connectAuthTimeoutMs?: number;
  /** Authorizes a raw forward connection that presents the paired bearer
   * token instead of a per-forward ticket (typically
   * `(token) => auth.authenticateBearerToken(token, ["ports:forward"])` wrapped
   * to catch the throw). Absent = only per-forward tickets authenticate. */
  readonly authorizeConnectToken?: (token: string) => boolean | Promise<boolean>;
}

/** A live handle on one forward's lifetime, handed out by
 * {@link RemotePortForwardGateway.acquireForwardLifetime} to the HTTP/WS
 * reverse-proxy session layer (`portForward/portProxy.ts`). Deliberately the
 * exact forward *instance* — id plus target port plus revocation signal —
 * never a bare target port, which a different forward can later reuse.
 * `signal` aborts synchronously the moment this forward is stopped or the
 * gateway disposed; consumers register per operation and must remove that
 * registration when the operation ends. */
export interface ForwardLifetime {
  readonly forwardId: string;
  readonly targetPort: number;
  readonly signal: AbortSignal;
  /** This forward instance's private keep-alive agent — the only agent the
   * plain-HTTP reverse-proxy path (`proxyForwardedHttpRequest`) dials this
   * target through. Its idle sockets are destroyed with the forward
   * ({@link stopForward}); the shared global agent would instead leave them
   * open and hand them to a later forward that reuses the same target port. */
  readonly agent: Agent;
  /** The loopback family this forward's own listener shadows (mirrored-port
   * bind over the gateway's bind host), or `null`/`undefined` when none. The
   * reverse-proxy paths exclude it from their dial fallback chain — dialing it
   * would loop back into this very listener (credential-gated, so the proxied
   * request would be destroyed instead of tunneled). */
  readonly shadowedLoopback?: LoopbackHost | null;
}

interface ForwardEntry {
  readonly id: string;
  readonly targetPort: number;
  readonly listenPort: number;
  readonly createdAt: number;
  /** The loopback family the listener that WON the bind attempt shadows, if
   * any (the mirrored-port attempt over a loopback bind host; the ephemeral
   * fallback never shadows). Surfaced via {@link ForwardLifetime} so the
   * reverse-proxy paths skip dialing our own listener. */
  readonly shadowedLoopback: LoopbackHost | null;
  readonly server: Server;
  readonly sockets: Set<Socket>;
  /** Backs this forward's {@link ForwardLifetime} — aborted by
   * {@link stopForward}. Kept on the entry so no side map mirrors `forwards`. */
  readonly lifetime: AbortController;
  /** The forward's private keep-alive agent, handed out via
   * {@link acquireForwardLifetime} and destroyed by {@link stopForward}
   * (see {@link ForwardLifetime.agent}). Kept on the entry, like `lifetime`,
   * so no side map mirrors `forwards`. */
  readonly agent: Agent;
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
 * discovers them ({@link scanPorts}) and opens/closes a raw TCP proxy from
 * the SAME host the remote-access server itself binds (loopback by default
 * since the Gate 6 bind modes — see `src/main/remote/config.ts`) to the target
 * port on loopback ({@link startForward}/{@link stopForward}), so a paired
 * client can reach e.g. a Vite dev server directly. Two Gate 6 gates apply
 * (plan item 4.5, finding S5): only ports on the forwardable-port allowlist
 * (`portForward/forwardablePorts.ts`, shared with the discovery scan) can be
 * forwarded — never the server's own port — and every raw connection must
 * present a credential before any byte reaches the target (see
 * {@link pipeConnection}); the authenticated browser-origin proxy path
 * (`portForward/portProxy.ts` + `server/portForwardProxy.ts`) keeps its own
 * session auth. Raw TCP piping (not an HTTP proxy) means WebSocket upgrades
 * (HMR) pass through unmodified. The outbound leg tries `127.0.0.1` then
 * falls back to `::1` (see {@link connectLoopback}) since a dev server bound
 * to the bare hostname `localhost` can end up IPv6-only.
 *
 * Electron-free by design — constructed and injected the same way in the
 * Electron main composition root and the headless server (see
 * docs/REMOTE_ARCHITECTURE.md).
 */
export class RemotePortForwardGateway {
  private readonly forwards = new Map<string, ForwardEntry>();
  /** Per-forward connect credentials (see {@link mintConnectTicket}): token →
   * owning forward id + expiry. Multi-use within the TTL so a flaky phone can
   * reconnect; every ticket dies with its forward instance. */
  private readonly connectTickets = new Map<string, { forwardId: string; expiresAtMs: number }>();
  /** In-flight `startForward` calls keyed by targetPort, so concurrent callers
   * for the same port share one listener instead of racing two into
   * existence (see {@link startForward}). Removed on settle (success or
   * failure) so a subsequent call — retry included — starts fresh. */
  private readonly pendingStarts = new Map<number, Promise<ActivePortForward>>();
  /** Set by {@link dispose}; makes shutdown airtight against a `startForward`
   * that is mid-`listen()` when dispose runs — see {@link openForward}. */
  private disposed = false;

  constructor(private readonly options: RemotePortForwardGatewayOptions) {}

  /** The ONE forward allowlist backing discovery and creation (see
   * `portForward/forwardablePorts.ts`; `forwardablePorts` wins over the
   * legacy `candidatePorts` spelling). */
  private get forwardAllowlist(): readonly number[] {
    return (
      this.options.forwardablePorts ?? this.options.candidatePorts ?? DEFAULT_FORWARDABLE_PORTS
    );
  }

  async scanPorts(): Promise<DetectedPort[]> {
    if (this.disposed) {
      throw new RemoteHttpError(
        "gateway_disposed",
        "The port forward gateway has been disposed.",
        503,
      );
    }
    return scanPorts(
      this.forwardAllowlist,
      this.options.probeTimeoutMs ?? DEFAULT_PORT_PROBE_TIMEOUT_MS,
    );
  }

  /** Idempotent per `targetPort`: a second call for an already-forwarded port
   * returns the existing forward rather than opening a duplicate listener.
   * Concurrent calls for the same port share the single in-flight open (see
   * `pendingStarts`) so two listeners can never be raced into existence.
   * Refuses ports outside the forward allowlist with `port_not_forwardable`
   * (403) and the server's own port with `invalid_port`. Callers that serve
   * raw-TCP clients (the authenticated `POST /api/ports/forward` route) mint
   * the connect credential for the result via {@link mintConnectTicket}. */
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
    const lifetime = new AbortController();
    const bindHost = this.options.bindHost;
    // If the mirrored bind below succeeds, this listener occupies
    // `bindHost:targetPort`, which may shadow one of the loopback families
    // `connectLoopback` dials on the outbound leg (e.g. `bindHost: "0.0.0.0"`
    // shadows `127.0.0.1`) — self-connecting into our own listener instead of
    // reaching the real dev server. Computed once, up front, so it can be
    // baked into the *mirrored* server's connection handler; the fallback
    // server (ephemeral port) never shadows loopback, so it gets none.
    const mirrorShadow = shadowedLoopbackHost(bindHost);

    let server = this.createForwardServer(id, targetPort, sockets, mirrorShadow);
    // Which loopback family the listener that actually WON the bind shadows —
    // the mirrored attempt over a loopback bind host, or none for the
    // ephemeral fallback (see the shadow rationale around `mirrorShadow`).
    let shadowed: LoopbackHost | null = mirrorShadow ?? null;
    try {
      await this.listenOn(server, targetPort, bindHost);
    } catch {
      // Mirrored bind failed — fully close/discard this server instance (it
      // never reached "listening", so nothing else references it) before
      // falling back, so there is no leaked handle and no unhandled 'error'
      // from reusing a server that already errored.
      await new Promise<void>((resolve) => server.close(() => resolve()));
      server = this.createForwardServer(id, targetPort, sockets, undefined);
      shadowed = null;
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
    // Created only past the `disposed` gate above, so an entry that is never
    // registered never owns an agent that would need destroying.
    const agent = new Agent(FORWARD_AGENT_OPTIONS);
    const entry: ForwardEntry = {
      id,
      targetPort,
      listenPort: address.port,
      createdAt: Date.now(),
      shadowedLoopback: shadowed,
      server,
      sockets,
      lifetime,
      agent,
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
    forwardId: string,
    targetPort: number,
    sockets: Set<Socket>,
    shadowedHost: LoopbackHost | undefined,
  ): Server {
    const server = createServer((inbound) =>
      this.pipeConnection(forwardId, targetPort, sockets, inbound, shadowedHost),
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

  /** Closes the forward's listener and destroys every socket it owns: the
   * accepted inbound sockets and their piped outbound counterparts, plus the
   * idle upstream connections pooled in the forward's private keep-alive
   * agent (see {@link ForwardLifetime.agent}). Aborts the forward's
   * {@link ForwardLifetime} synchronously first, so every proxy operation
   * riding it revokes before any async teardown runs. */
  async stopForward(id: string): Promise<boolean> {
    const entry = this.forwards.get(id);
    if (!entry) return false;
    this.forwards.delete(id);
    this.clearConnectTickets(id);
    entry.lifetime.abort();
    entry.agent.destroy();
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
   * if none is open — the hot-path check behind the `/api/ports/enter`
   * existence guard and `PortProxy.consumeEnterToken`, both of which only need
   * one forward, not the whole `listForwards()` snapshot. */
  getForward(id: string): ActivePortForward | null {
    const entry = this.forwards.get(id);
    return entry ? toPublic(entry) : null;
  }

  /**
   * Mints a per-forward connect ticket for an OPEN forward — the raw-TCP
   * counterpart of the browser enter token, and the credential a paired
   * client presents on every raw connection to the forward's listener. Called
   * by the authenticated `POST /api/ports/forward` route so the ticket is
   * minted at forward creation and returned in the forward result (throwing
   * for an unknown id); safe to call repeatedly — old tickets for the same
   * forward stay valid until their own TTL elapses, so reopening always
   * yields a fresh credential without invalidating in-flight reconnects.
   *
   * Tickets are opaque 32-byte base64url tokens bound to the exact forward
   * instance: stopping the forward destroys every ticket for it, and a
   * re-forwarded port (new instance) never accepts an old forward's ticket.
   */
  mintConnectTicket(forwardId: string): string {
    if (this.disposed || !this.forwards.has(forwardId)) {
      throw new RemoteHttpError("forward_not_found", "Port forward not found.", 404);
    }
    this.pruneConnectTickets();
    const token = randomBytes(32).toString("base64url");
    this.connectTickets.set(token, {
      forwardId,
      expiresAtMs: Date.now() + (this.options.connectTicketTtlMs ?? DEFAULT_CONNECT_TICKET_TTL_MS),
    });
    return token;
  }

  /** Whether `credential` authorizes a raw connection to `forwardId`: a live
   * per-forward ticket for THIS forward instance, or — when a validator is
   * wired — the paired bearer token. */
  private async authorizeInboundConnect(forwardId: string, credential: string): Promise<boolean> {
    if (!credential) return false;
    this.pruneConnectTickets();
    const ticket = this.connectTickets.get(credential);
    if (
      ticket &&
      ticket.forwardId === forwardId &&
      ticket.expiresAtMs > Date.now() &&
      this.forwards.has(forwardId)
    ) {
      return true;
    }
    const authorize = this.options.authorizeConnectToken;
    if (!authorize) return false;
    try {
      return Boolean(await authorize(credential));
    } catch {
      // A validator signals rejection by throwing (e.g. the auth store's
      // `authenticateBearerToken`); a throw is a "no", never a crash.
      return false;
    }
  }

  private pruneConnectTickets(): void {
    const now = Date.now();
    for (const [token, ticket] of this.connectTickets) {
      if (ticket.expiresAtMs <= now) this.connectTickets.delete(token);
    }
  }

  private clearConnectTickets(forwardId: string): void {
    for (const [token, ticket] of this.connectTickets) {
      if (ticket.forwardId === forwardId) this.connectTickets.delete(token);
    }
  }

  /** The hot path behind proxy session resolution (`PortProxy.resolveSession`):
   * resolves to the exact open forward instance — revocation signal and
   * private agent — or `null` once stopped/disposed: a stopped forward's port
   * can be re-forwarded, and its stale sessions must never reach the new
   * occupant. Allocates only the handle; the controller and agent live on the
   * entry. */
  acquireForwardLifetime(forwardId: string): ForwardLifetime | null {
    const entry = this.forwards.get(forwardId);
    if (!entry) return null;
    return {
      forwardId: entry.id,
      targetPort: entry.targetPort,
      signal: entry.lifetime.signal,
      agent: entry.agent,
      shadowedLoopback: entry.shadowedLoopback,
    };
  }

  /** Closes every open forward; safe to call multiple times. Also flips the
   * `disposed` flag first (synchronously, before touching `forwards`) so any
   * `startForward` whose `listen()` resolves after this point self-closes
   * instead of registering — see {@link openForward}. `stopForward`'s body
   * runs synchronously up to its first `await`, so every lifetime is already
   * revoked when this returns. */
  dispose(): void {
    this.disposed = true;
    this.connectTickets.clear();
    for (const id of [...this.forwards.keys()]) {
      void this.stopForward(id);
    }
  }

  /**
   * Gate for every raw connection a forward listener accepts: the client must
   * present a credential as the FIRST line (LF-terminated) before any byte
   * reaches the target — the per-forward connect ticket minted at
   * {@link startForward} result time ({@link mintConnectTicket}), or, when a
   * validator is wired, the paired bearer token (an optional leading
   * `Bearer ` is stripped). Unauthenticated connections are destroyed without
   * dialing the target (plan item 4.5, finding S5); so is a connection that
   * never completes its credential line within `connectAuthTimeoutMs`, or
   * whose first line exceeds the credential size cap. Bytes after the newline
   * (early payload) are replayed into the pipe once authorized.
   *
   * After authorization this delegates to {@link startPiping}: raw TCP both
   * ways (so WebSocket upgrades, e.g. Vite HMR, pass through untouched). The
   * outbound leg is opened via {@link connectLoopback}, which tries
   * `127.0.0.1` then falls back to `::1` on a connect failure — piping only
   * starts once it actually connects, so an inbound socket sits buffered (not
   * dropped) while that fallback plays out. `shadowedHost`, when this forward
   * mirrored the target's port number, excludes the loopback family that this
   * very listener shadows, so the outbound dial can't self-connect into it
   * (see {@link openForward}). Destroys both sides on either erroring or
   * closing — never leaves a half-open socket or an unhandled 'error' event.
   */
  private pipeConnection(
    forwardId: string,
    targetPort: number,
    sockets: Set<Socket>,
    inbound: Socket,
    shadowedHost: LoopbackHost | undefined,
  ): void {
    sockets.add(inbound);

    /** Refusal/unexpected-close teardown: the target was never dialed. */
    let refused = false;
    const refuse = (): void => {
      clearTimeout(timeout);
      if (refused) return;
      refused = true;
      sockets.delete(inbound);
      inbound.destroy();
    };
    const timeout = setTimeout(
      refuse,
      this.options.connectAuthTimeoutMs ?? DEFAULT_CONNECT_AUTH_TIMEOUT_MS,
    );
    // Bounded bookkeeping only; it must never keep a disposing process alive.
    timeout.unref?.();

    let buffered = "";
    let decided = false;
    const onData = (chunk: Buffer): void => {
      buffered += chunk.toString("utf8");
      const newline = buffered.indexOf("\n");
      if (newline === -1) {
        if (buffered.length > MAX_CONNECT_AUTH_LINE_BYTES) refuse();
        return;
      }
      if (decided) return;
      decided = true;
      clearTimeout(timeout);
      inbound.off("data", onData);
      inbound.off("error", refuse);
      inbound.off("close", refuse);
      // Optional HTTP-style scheme prefix; a base64url ticket never contains
      // a space, so stripping it cannot corrupt the ticket path.
      const credential = buffered
        .slice(0, newline)
        .trim()
        .replace(/^Bearer\s+/i, "");
      const remainder = buffered.slice(newline + 1);
      void this.authorizeInboundConnect(forwardId, credential).then((authorized) => {
        if (!authorized) {
          refuse();
          return;
        }
        if (inbound.destroyed) return;
        this.startPiping(targetPort, sockets, inbound, shadowedHost, remainder);
      });
    };
    inbound.on("data", onData);
    inbound.on("error", refuse);
    inbound.on("close", refuse);
  }

  /** The (post-authorization) raw bidirectional pipe to the target port.
   * `earlyData` carries bytes the client sent past its credential line before
   * authorization completed — replayed into the outbound socket before the
   * streams are piped so request framing is preserved. */
  private startPiping(
    targetPort: number,
    sockets: Set<Socket>,
    inbound: Socket,
    shadowedHost: LoopbackHost | undefined,
    earlyData: string,
  ): void {
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
        if (earlyData.length > 0) outbound.write(earlyData, "utf8");
        inbound.pipe(outbound);
        outbound.pipe(inbound);
      })
      .catch(teardown);
  }

  /** The forward-creation gate: an in-range port inside the SAME allowlist
   * the discovery scan uses (see `portForward/forwardablePorts.ts`), never
   * the remote-access server's own port. */
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
    if (
      !isForwardableTargetPort(targetPort, {
        forwardablePorts: this.forwardAllowlist,
        ...(this.options.remoteAccessPort
          ? { remoteAccessPort: this.options.remoteAccessPort }
          : {}),
      })
    ) {
      throw new RemoteHttpError(
        "port_not_forwardable",
        `Port ${targetPort} is not on this host's forwardable-port allowlist.`,
        403,
      );
    }
  }
}
