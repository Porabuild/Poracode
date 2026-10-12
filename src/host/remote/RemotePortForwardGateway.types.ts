import type { Agent } from "node:http";
import type { Server, Socket } from "node:net";
import type { ActivePortForward } from "@/shared/remote";
import type { LoopbackHost } from "./portForward/loopback";

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

export interface ForwardEntry {
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

export function toPublic(entry: ForwardEntry): ActivePortForward {
  return {
    id: entry.id,
    targetPort: entry.targetPort,
    listenPort: entry.listenPort,
    createdAt: entry.createdAt,
  };
}
