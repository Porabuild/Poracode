import type { IncomingMessage, ServerResponse } from "node:http";
import type { Duplex } from "node:stream";
import { isLoopbackHostname } from "@/shared/http";
import type { RemoteWebSocketTicketResult } from "@/shared/remote";
import {
  ENVIRONMENT_AUTH_AUTHORITY_HEADER,
  ENVIRONMENT_AUTH_AUTHORITY_PARENT,
  ENVIRONMENT_AUTHORIZATION_HEADER,
  ENVIRONMENT_PARENT_TICKET_PARAM,
  ENVIRONMENT_USE_SCOPES,
} from "@/shared/environments";
import { parseBearerAuthorizationHeader, RemoteHttpError } from "../auth";
import { environmentProxyChildWorkClass } from "../remoteAccessServerTypes";
import { proxyLoopbackHttpRequest, proxyLoopbackWebSocketUpgrade } from "../server/loopbackProxy";
import type { PrincipalAdmissionController } from "../server/principalAdmission";
import { writeError } from "../server/httpResponses";
import { rejectUpgrade } from "../server/wsConnections";
import { EnvironmentDescriptorTransform } from "./environmentDescriptorTransform";
import { EnvironmentProxyLegs } from "./environmentProxyLegs";
import {
  ENVIRONMENT_DESCRIPTOR_MAX_BYTES,
  ENVIRONMENT_DESCRIPTOR_TIMEOUT_MS,
  ENVIRONMENT_WS_TICKET_TTL_MS,
  buildChildRequestHeaders,
  canonicalDescriptorPath,
  keepChildHttpResponseHeader,
  keepChildUpgradeResponseHeader,
  readRawQueryParam,
  stripParentTicket,
} from "./environmentProxyPolicy";
import type {
  EnvironmentProxyBaseUrls,
  EnvironmentProxyGatewayLike,
  EnvironmentProxySecurityLike,
  EnvironmentProxySessionAuthority,
  EnvironmentProxyTarget,
  EnvironmentProxyTargetRegistry,
} from "./types";

export {
  ENVIRONMENT_DESCRIPTOR_MAX_BYTES,
  ENVIRONMENT_DESCRIPTOR_TIMEOUT_MS,
  ENVIRONMENT_WS_TICKET_TTL_MS,
} from "./environmentProxyPolicy";

/**
 * C1.2 parent proxy transport (ADR §5).
 *
 * The data plane is `/api/environments/{environmentId}/proxy/{childPath}`. The
 * parent is the only authority that dials the child: it authenticates the
 * parent credential from {@link ENVIRONMENT_AUTHORIZATION_HEADER} (never from
 * `Authorization`, never from a query parameter), resolves the target ONLY
 * from the verified environment registry, fences the target generation and
 * invalidation before any client credential crosses to the child, forwards the
 * child bearer in `Authorization` verbatim, and strips every parent-internal
 * header before the dial. Child `Set-Cookie` and CORS headers never reach the
 * parent origin; child descriptor endpoints are rewritten to the parent proxy
 * prefix so no loopback URL or port is ever exposed.
 *
 * Both HTTP and WS legs: share the existing loopback proxy core
 * (`server/loopbackProxy.ts`), the existing principal admission budgets, and
 * the existing session authority for revocation.
 *
 * Resource budget (the definition tests and operators rely on):
 * - one proxied leg = one principal work lease + one principal socket lease
 *   from the existing `PrincipalAdmissionController` (bulk class), acquired
 *   only after parent authentication and released only when the leg's
 *   transport actually settles — never on the logical revoke call;
 * - bodies are piped (`pipeline`), so backpressure propagates and the proxy
 *   retains no full body; the ONLY buffered body is a small descriptor
 *   transform, hard-capped by {@link ENVIRONMENT_DESCRIPTOR_MAX_BYTES} and
 *   {@link ENVIRONMENT_DESCRIPTOR_TIMEOUT_MS};
 * - each verified target generation owns one keep-alive pool with a hard
 *   socket cap, destroyed on invalidation, so upstream connections are
 *   bounded per environment and never outlive their tunnel;
 * - parent WS tickets are in-memory, single-use, session+environment bound,
 *   and TTL-bounded.
 *
 * The transport is orchestration only: pure header/query/descriptor policy
 * lives in `environmentProxyPolicy.ts` (E2 Cut D), the leg/lease/agent
 * lifetime in `environmentProxyLegs.ts` (E2 Cut E), and the fail-closed
 * descriptor transform in `environmentDescriptorTransform.ts` (E2 Cut F).
 */

export interface EnvironmentProxyGatewayOptions {
  readonly targets: EnvironmentProxyTargetRegistry;
  readonly authority: EnvironmentProxySessionAuthority;
  readonly principalAdmission: PrincipalAdmissionController;
  readonly baseUrls: () => EnvironmentProxyBaseUrls;
  /** Overridable for tests; defaults to the ADR's 30s. */
  readonly webSocketTicketTtlMs?: number;
  /** Overridable for tests; descriptor transforms stay hard-bounded. */
  readonly descriptorMaxBytes?: number;
  readonly descriptorTimeoutMs?: number;
}

export class EnvironmentProxyGateway implements EnvironmentProxyGatewayLike {
  private readonly targets: EnvironmentProxyTargetRegistry;
  private readonly authority: EnvironmentProxySessionAuthority;
  private readonly legs: EnvironmentProxyLegs;
  private readonly transform: EnvironmentDescriptorTransform;
  private readonly webSocketTicketTtlMs: number;
  private disposed = false;

  constructor(options: EnvironmentProxyGatewayOptions) {
    this.targets = options.targets;
    this.authority = options.authority;
    this.legs = new EnvironmentProxyLegs(options.principalAdmission);
    this.transform = new EnvironmentDescriptorTransform({
      legs: this.legs,
      baseUrls: options.baseUrls,
      descriptorMaxBytes: options.descriptorMaxBytes ?? ENVIRONMENT_DESCRIPTOR_MAX_BYTES,
      descriptorTimeoutMs: options.descriptorTimeoutMs ?? ENVIRONMENT_DESCRIPTOR_TIMEOUT_MS,
    });
    this.webSocketTicketTtlMs = options.webSocketTicketTtlMs ?? ENVIRONMENT_WS_TICKET_TTL_MS;
  }

  // -------------------------------------------------------------------------
  // Ticket mint (future management route seam)
  // -------------------------------------------------------------------------

  /**
   * Mints one parent environment upgrade ticket. This is the narrow internal
   * interface the future `POST /api/environments/{id}/websocket-ticket` route
   * calls; the route owner adds the registry contract and handler, this slice
   * does not register or advertise it. The session must hold
   * `session:operate` + `ports:forward`.
   */
  mintWebSocketTicket(input: {
    readonly parentAccessToken: string;
    readonly environmentId: string;
  }): RemoteWebSocketTicketResult {
    if (this.disposed) {
      throw new RemoteHttpError(
        "environment_proxy_unavailable",
        "The environment proxy is not available.",
        503,
      );
    }
    if (!input.environmentId) {
      throw new RemoteHttpError("invalid_request", "An environment is required.", 400);
    }
    return this.authority.issueEnvironmentWebSocketTicket({
      accessToken: input.parentAccessToken,
      environmentId: input.environmentId,
      scopes: ENVIRONMENT_USE_SCOPES,
      ttlMs: this.webSocketTicketTtlMs,
    });
  }

  // -------------------------------------------------------------------------
  // Revocation
  // -------------------------------------------------------------------------

  /** Parent session revocation: aborts every leg this session owns; each
   * leg's admission leases release only when its transport settles. */
  revokeSession(sessionId: string): void {
    this.legs.revokeSession(sessionId);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.legs.dispose();
    this.transform.dispose();
  }

  /** Live leg count (diagnostics/tests). */
  activeLegCount(): number {
    return this.legs.activeLegCount();
  }

  // -------------------------------------------------------------------------
  // HTTP data plane
  // -------------------------------------------------------------------------

  async handleHttpRequest(input: {
    readonly req: IncomingMessage;
    readonly res: ServerResponse;
    readonly security: EnvironmentProxySecurityLike;
    readonly environmentId: string;
    readonly rawChildPath: string;
    readonly rawQuery: string;
  }): Promise<void> {
    const { req, res, security } = input;
    const corsAllowed = security.applyCors(req, res);
    if (req.method === "OPTIONS") {
      res.writeHead(corsAllowed ? 204 : 403);
      res.end();
      return;
    }
    if (!corsAllowed) {
      writeError(
        res,
        new RemoteHttpError("origin_not_allowed", "Remote origin is not allowed.", 403),
      );
      return;
    }
    try {
      security.enforceHostHeader(req);
      let session: { readonly sessionId: string };
      try {
        session = this.authenticateParentRequest(req);
      } catch (error) {
        // Mark ONLY the authentication step's own 401/403 (missing or invalid
        // parent credential, missing parent scope) as parent-origin. The CORS
        // and Host rejections above are not authorization decisions, and any
        // error from the proxied leg below is not parent-origin either. Child
        // responses cannot forge the marker: the reserved namespace is
        // stripped on both planes (keepChild*ResponseHeader).
        if (error instanceof RemoteHttpError && (error.status === 401 || error.status === 403)) {
          res.setHeader(ENVIRONMENT_AUTH_AUTHORITY_HEADER, ENVIRONMENT_AUTH_AUTHORITY_PARENT);
        }
        throw error;
      }
      await this.proxyHttpLeg(req, res, session.sessionId, input);
    } catch (error) {
      if (res.destroyed) return;
      if (!res.headersSent) {
        writeError(res, error);
        return;
      }
      if (!res.writableEnded) res.destroy();
    }
  }

  private authenticateParentRequest(req: IncomingMessage): { sessionId: string } {
    const raw = req.headers[ENVIRONMENT_AUTHORIZATION_HEADER];
    const header = Array.isArray(raw) ? raw[0] : raw;
    const token = parseBearerAuthorizationHeader(header);
    if (!token) {
      throw new RemoteHttpError(
        "missing_environment_authorization",
        "Missing environment authorization.",
        401,
      );
    }
    return this.authority.authenticateBearerToken(token, ENVIRONMENT_USE_SCOPES);
  }

  private async proxyHttpLeg(
    req: IncomingMessage,
    res: ServerResponse,
    sessionId: string,
    input: {
      readonly environmentId: string;
      readonly rawChildPath: string;
      readonly rawQuery: string;
    },
  ): Promise<void> {
    // The descriptor route is GET-only: answer HEAD truthfully instead of
    // letting an empty body reach the JSON transform (which would turn it
    // into a spurious 502). No dial, bounded 405, `Allow: GET`.
    if (canonicalDescriptorPath(input.rawChildPath) !== null && req.method === "HEAD") {
      res.setHeader("Allow", "GET");
      writeError(
        res,
        new RemoteHttpError(
          "environment_method_not_allowed",
          "The environment descriptor supports GET only.",
          405,
        ),
      );
      return;
    }
    const target = this.resolveTarget(input.environmentId);
    const workClass = environmentProxyChildWorkClass(req.method ?? "GET", input.rawChildPath);
    const leg = this.legs.begin(sessionId, input.environmentId, target);
    const leases = this.legs.admit(sessionId, workClass, leg);
    const childQuery = stripParentTicket(input.rawQuery);
    try {
      await proxyLoopbackHttpRequest(
        req,
        res,
        {
          targetPort: target.remotePort,
          signal: leg.controller.signal,
          agent: this.legs.agentFor(target),
        },
        {
          httpPath: () =>
            childQuery.length > 0 ? `${input.rawChildPath}?${childQuery}` : input.rawChildPath,
          headers: (request) => buildChildRequestHeaders(request.headers, target.remotePort, false),
          // The parent origin's CORS decision is authoritative: hop-by-hop,
          // child CORS, and `location` response headers never reach the
          // browser. A redirect status is refused wholesale above, so the
          // only Location that could survive is on a non-redirect status —
          // and those still never leak a child origin.
          keepResponseHeader: keepChildHttpResponseHeader,
          // Child cookies must never land on the parent origin.
          setCookie: () => null,
          badGatewayMessage: "Bad Gateway: the environment child is not reachable.",
          transformResponse: (upstreamRes, signal) =>
            this.transform.transform({
              environmentId: input.environmentId,
              rawChildPath: input.rawChildPath,
              target,
              upstreamRes,
              signal,
              currentController: leg.controller,
            }),
        },
      );
    } finally {
      this.legs.end(leg, leases);
    }
  }

  // -------------------------------------------------------------------------
  // WS data plane
  // -------------------------------------------------------------------------

  async handleUpgradeRequest(input: {
    readonly req: IncomingMessage;
    readonly socket: Duplex;
    readonly head: Buffer;
    readonly security: EnvironmentProxySecurityLike;
    readonly environmentId: string;
    readonly rawChildPath: string;
    readonly rawQuery: string;
  }): Promise<void> {
    const { req, socket, head, security } = input;
    try {
      security.enforceHostHeader(req);
      const parentTicket = readRawQueryParam(input.rawQuery, ENVIRONMENT_PARENT_TICKET_PARAM);
      if (!parentTicket) {
        throw new RemoteHttpError(
          "missing_parent_ticket",
          "A parent environment WebSocket ticket is required.",
          401,
        );
      }
      const session = this.authority.consumeEnvironmentWebSocketTicket({
        ticket: parentTicket,
        environmentId: input.environmentId,
      });
      const target = this.resolveTarget(input.environmentId);
      const leg = this.legs.begin(session.sessionId, input.environmentId, target);
      // Upgrades stay bulk, matching the transport classifier (the control
      // class is the stop/approval POST routes; a WS handshake is not one).
      const leases = this.legs.admit(session.sessionId, "bulk", leg);
      try {
        const childQuery = stripParentTicket(input.rawQuery);
        await proxyLoopbackWebSocketUpgrade(
          req,
          socket,
          head,
          {
            targetPort: target.remotePort,
            signal: leg.controller.signal,
            agent: this.legs.agentFor(target),
          },
          {
            upgradePath: () =>
              childQuery.length > 0 ? `${input.rawChildPath}?${childQuery}` : input.rawChildPath,
            headers: (request) =>
              buildChildRequestHeaders(request.headers, target.remotePort, true),
            setCookie: () => null,
            // The parent CORS decision stays authoritative on a non-101
            // rejection too: child `access-control-*` headers are dropped
            // while the handshake's required headers ride verbatim.
            keepUpgradeResponseHeader: keepChildUpgradeResponseHeader,
          },
        );
      } finally {
        this.legs.end(leg, leases);
      }
    } catch (error) {
      if (error instanceof RemoteHttpError) {
        rejectUpgrade(
          socket,
          error.status,
          error.status === 401
            ? "Unauthorized"
            : error.status === 429
              ? "Too Many Requests"
              : "Forbidden",
          error.retryAfterMs,
        );
        return;
      }
      socket.destroy();
    }
  }

  // -------------------------------------------------------------------------
  // Target and fence
  // -------------------------------------------------------------------------

  /**
   * Resolves the target ONLY from the verified registry. The endpoint must be
   * a loopback URL whose port equals the verified remote port: a mismatched or
   * non-loopback endpoint is a failed invariant, never a dial.
   */
  private resolveTarget(environmentId: string): EnvironmentProxyTarget {
    if (this.disposed) {
      throw new RemoteHttpError(
        "environment_proxy_unavailable",
        "The environment proxy is not available.",
        503,
      );
    }
    let target: EnvironmentProxyTarget;
    try {
      target = this.targets.getVerifiedTarget(environmentId);
    } catch {
      throw new RemoteHttpError(
        "environment_not_connected",
        "This environment is not connected.",
        409,
      );
    }
    if (target.environmentId !== environmentId) {
      throw new RemoteHttpError(
        "environment_target_invalid",
        "The environment target is not valid.",
        502,
      );
    }
    if (this.transform.hasIdentityFailure(environmentId, target.generation)) {
      throw new RemoteHttpError(
        "environment_identity_changed",
        "The environment child identity changed; the tunnel is closed.",
        502,
      );
    }
    let endpoint: URL;
    try {
      endpoint = new URL(target.endpoint);
    } catch {
      throw new RemoteHttpError(
        "environment_target_invalid",
        "The environment target is not valid.",
        502,
      );
    }
    if (
      endpoint.protocol !== "http:" ||
      !isLoopbackHostname(endpoint.hostname) ||
      endpoint.port !== String(target.remotePort) ||
      !Number.isSafeInteger(target.remotePort) ||
      target.remotePort <= 0 ||
      target.remotePort > 65_535
    ) {
      throw new RemoteHttpError(
        "environment_target_invalid",
        "The environment target is not valid.",
        502,
      );
    }
    if (target.invalidation.aborted) {
      throw new RemoteHttpError(
        "environment_not_connected",
        "This environment is not connected.",
        409,
      );
    }
    try {
      target.assertCurrent();
    } catch {
      throw new RemoteHttpError(
        "environment_not_connected",
        "This environment is not connected.",
        409,
      );
    }
    return target;
  }
}
