import type { IncomingMessage, ServerResponse } from "node:http";
import type { Duplex } from "node:stream";
import type { RemoteAccessScope, RemoteWebSocketTicketResult } from "@/shared/remote";
import type { AuthenticatedRemoteSession } from "../auth";
import type { PrincipalAdmissionController } from "../server/principalAdmission";

/**
 * Structural interfaces for the C1 parent proxy (ADR §5). Deliberately narrow:
 *
 * - the target registry is the host environment runtime service's
 *   `getVerifiedTarget(environmentId)` — the proxy never resolves a target
 *   from a client-supplied URL, host, or port, and never learns the store;
 * - the session authority is the host `RemoteAuthStore` (bearer
 *   authentication plus the environment upgrade ticket lifecycle), so parent
 *   revocation stays with the one existing session authority;
 * - the security surface is the two existing request gates (CORS + Host).
 *
 * The runtime service, the auth store, and `RemoteServerSecurity` all satisfy
 * these structurally, so the proxy adds no dependency edge into their
 * internals and no composition is required until the route owner wires it.
 */

/**
 * One verified environment target, exactly the runtime service's
 * `getVerifiedTarget` shape: live target identity (`generation`) plus the
 * fence (`assertCurrent`) and the invalidation signal that fires when the
 * tunnel changes, disconnects, or is disposed. `endpoint`/`remotePort` stay
 * host-local; every consumer must re-fence before acting on them.
 */
export interface EnvironmentProxyTarget {
  readonly environmentId: string;
  readonly generation: number;
  readonly endpoint: string;
  readonly remotePort: number;
  readonly childDesktopId: string;
  readonly invalidation: AbortSignal;
  assertCurrent(): void;
}

export interface EnvironmentProxyTargetRegistry {
  getVerifiedTarget(environmentId: string): EnvironmentProxyTarget;
}

export interface EnvironmentProxySessionAuthority {
  authenticateBearerToken(
    accessToken: string,
    requiredScopes: readonly RemoteAccessScope[],
  ): AuthenticatedRemoteSession;
  issueEnvironmentWebSocketTicket(input: {
    readonly accessToken: string;
    readonly environmentId: string;
    readonly scopes: readonly RemoteAccessScope[];
    readonly ttlMs?: number;
  }): RemoteWebSocketTicketResult;
  consumeEnvironmentWebSocketTicket(input: {
    readonly ticket: string;
    readonly environmentId: string;
  }): AuthenticatedRemoteSession;
}

/** The two existing request gates the proxy must run before credentials
 * cross: the parent CORS decision and the Host-header allowlist. */
export interface EnvironmentProxySecurityLike {
  applyCors(req: IncomingMessage, res: ServerResponse): boolean;
  enforceHostHeader(req: IncomingMessage): void;
}

/** The parent's advertised bases, read at response-rewrite time (they exist
 * once the listener started). */
export interface EnvironmentProxyBaseUrls {
  readonly httpBaseUrl: string;
  readonly wsBaseUrl: string;
}

/**
 * What `RemoteAccessServerOptions` accepts for the data plane. It is a FACTORY
 * because the gateway must share the server's ONE
 * `PrincipalAdmissionController` (the same per-principal work/socket budgets
 * the event sockets use) — the server owns that controller and hands it to the
 * factory at construction. The proxy prefix dispatch and the parent-session
 * revocation hook are wired by the server; the management route that mints a
 * parent WS ticket is a separate owner's route and calls
 * {@link EnvironmentProxyGatewayLike.mintWebSocketTicket} — nothing here
 * advertises the capability or composes a gateway on its own.
 */
export type EnvironmentProxyFactory = (deps: {
  readonly principalAdmission: PrincipalAdmissionController;
}) => EnvironmentProxyGatewayLike;

export interface EnvironmentProxyGatewayLike {
  handleHttpRequest(input: {
    readonly req: IncomingMessage;
    readonly res: ServerResponse;
    readonly security: EnvironmentProxySecurityLike;
    readonly environmentId: string;
    readonly rawChildPath: string;
    readonly rawQuery: string;
  }): Promise<void>;
  handleUpgradeRequest(input: {
    readonly req: IncomingMessage;
    readonly socket: Duplex;
    readonly head: Buffer;
    readonly security: EnvironmentProxySecurityLike;
    readonly environmentId: string;
    readonly rawChildPath: string;
    readonly rawQuery: string;
  }): Promise<void>;
  /** Narrow internal mint for the future management ticket route. */
  mintWebSocketTicket(input: {
    readonly parentAccessToken: string;
    readonly environmentId: string;
  }): RemoteWebSocketTicketResult;
  /** Parent session revocation: closes every leg that session owns. */
  revokeSession(sessionId: string): void;
  dispose(): void;
}
