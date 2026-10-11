import { randomBytes, randomUUID } from "node:crypto";
import { Agent, type AgentOptions } from "node:http";
import { createServer, type AddressInfo, type Server, type Socket } from "node:net";
import type { ActivePortForward, DetectedPort } from "@/shared/remote";
import { RemoteHttpError } from "./auth";
import { isForwardableTargetPort, DEFAULT_FORWARDABLE_PORTS } from "./portForward/forwardablePorts";
import { connectLoopback, shadowedLoopbackHost, type LoopbackHost } from "./portForward/loopback";
import { DEFAULT_PORT_PROBE_TIMEOUT_MS, scanPorts } from "./portForward/portScanner";
import {
  toPublic,
  type ForwardEntry,
  type ForwardLifetime,
  type RemotePortForwardGatewayOptions,
} from "./RemotePortForwardGateway.types";

export type {
  ForwardLifetime,
  RemotePortForwardGatewayOptions,
} from "./RemotePortForwardGateway.types";

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

/** Electron-free localhost port-forward gateway for remote and headless hosts. */
export class RemotePortForwardGateway {
  private readonly forwards = new Map<string, ForwardEntry>();
  /** Per-forward connect credentials (see {@link mintConnectTicket}): token →
   * owning forward id + session + expiry. Single-use and session-bound (V6
   * A.10); every ticket dies with its forward instance or its session. */
  private readonly connectTickets = new Map<
    string,
    { forwardId: string; sessionId: string; expiresAtMs: number }
  >();
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
   * client presents on a raw connection to the forward's listener. Called
   * by the authenticated `POST /api/ports/forward` route so the ticket is
   * minted at forward creation and returned in the forward result (throwing
   * for an unknown id).
   *
   * Tickets are opaque 32-byte base64url tokens bound to the exact forward
   * instance AND the minting session (V6 A.10): they are single-use, stopping
   * the forward destroys every ticket for it, and session revocation burns
   * remaining tickets for that session.
   */
  mintConnectTicket(forwardId: string, sessionId: string): string {
    if (this.disposed || !this.forwards.has(forwardId)) {
      throw new RemoteHttpError("forward_not_found", "Port forward not found.", 404);
    }
    this.pruneConnectTickets();
    const token = randomBytes(32).toString("base64url");
    this.connectTickets.set(token, {
      forwardId,
      sessionId,
      expiresAtMs: Date.now() + (this.options.connectTicketTtlMs ?? DEFAULT_CONNECT_TICKET_TTL_MS),
    });
    return token;
  }

  /** Burns every unused connect ticket minted for `sessionId` (V6 A.10). */
  revokeSessionTickets(sessionId: string): void {
    for (const [token, ticket] of this.connectTickets) {
      if (ticket.sessionId === sessionId) this.connectTickets.delete(token);
    }
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
      this.connectTickets.delete(credential);
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
