import type { IncomingMessage, ServerResponse } from "node:http";
import type { z } from "zod";
import type { RemoteAccessScope, RemoteWebSocketTicketResult } from "@/shared/remote";
import {
  environmentIdSchema,
  environmentScopesSatisfied,
  type EnvironmentOperation,
  type EnvironmentPublicProjection,
} from "@/shared/environments";
import {
  remoteEnvironmentAdoptLegacyBodySchema,
  remoteEnvironmentCreateBodySchema,
  remoteEnvironmentExpectedRevisionBodySchema,
  remoteEnvironmentTrustAcceptBodySchema,
  remoteEnvironmentUpdateBodySchema,
  type RemoteEnvironmentAdoptLegacyBody,
  type RemoteEnvironmentCreateBody,
  type RemoteEnvironmentExpectedRevisionBody,
  type RemoteEnvironmentTrustAcceptBody,
  type RemoteEnvironmentUpdateBody,
} from "@/shared/remote/contract/environmentSchemas";
import type { EnvironmentManagementRouteId } from "@/shared/remote/contract/routes/environments";
import type {
  EnvironmentPairingResult,
  EnvironmentRuntimeService,
  EnvironmentServiceAcceptTrustInput,
  EnvironmentServiceCreateInput,
  EnvironmentServiceUpgradeInput,
} from "@/host/environments/environmentRuntimeService";
import type { EnvironmentUpdateInput } from "@/host/environments/EnvironmentStore";
import { RemoteHttpError } from "../auth";
import { writeJson } from "../server/httpResponses";
import { readJsonBody } from "../server/requestBody";
import { environmentManagementHttpError } from "./environmentManagementErrors";
import type { EnvironmentProxyGatewayLike } from "./types";

/**
 * C1 management handler factory (ADR §5/§6).
 *
 * It is deliberately composition-independent: the factory consumes a narrow
 * injected management runtime and a narrow ticket minter and returns handlers
 * keyed by the registry's environment route ids. The real host runtime
 * (`EnvironmentRuntimeService`) and the composed parent proxy gateway satisfy
 * those interfaces structurally, so the parent's adapter can pass the objects
 * it already owns — no second environment authority is invented here.
 *
 * Authorization is enforced in the handler as well as by the dispatcher: every
 * handler asserts the operation's registered scopes BEFORE any runtime call,
 * so a directly-invoked handler can never start a trust probe, connect,
 * pairing, or mutation for an unauthorized session. Viewer sessions
 * (`session:read`) can list/get only.
 *
 * Error sanitization lives in `environmentManagementErrors.ts`: handlers
 * rethrow only bounded `RemoteHttpError`s whose message is the runtime's fixed
 * public phrase, so raw SSH output, credential references, tunnel endpoints,
 * and filesystem paths never cross the boundary.
 */

/** The narrow management authority; `EnvironmentRuntimeService` satisfies it. */
export interface EnvironmentManagementRuntime {
  listPublic(): readonly EnvironmentPublicProjection[];
  getPublic(environmentId: string): EnvironmentPublicProjection | undefined;
  create(input: EnvironmentServiceCreateInput): Promise<EnvironmentPublicProjection>;
  update(input: EnvironmentUpdateInput): Promise<EnvironmentPublicProjection>;
  delete(input: {
    readonly environmentId: string;
    readonly expectedRevision: number;
  }): Promise<void>;
  adoptLegacy(input: EnvironmentManagementAdoptLegacyInput): Promise<EnvironmentPublicProjection>;
  probeTrust(
    environmentId: string,
    signal?: AbortSignal,
  ): Promise<EnvironmentManagementTrustProbeResult>;
  acceptTrust(
    input: EnvironmentServiceAcceptTrustInput,
    signal?: AbortSignal,
  ): Promise<EnvironmentPublicProjection>;
  connect(
    environmentId: string,
    options?: { readonly signal?: AbortSignal },
  ): Promise<EnvironmentPublicProjection>;
  pairing(
    environmentId: string,
    options?: { readonly signal?: AbortSignal },
  ): Promise<EnvironmentPairingResult>;
  disconnect(environmentId: string): Promise<EnvironmentPublicProjection>;
  upgrade(input: EnvironmentServiceUpgradeInput): Promise<EnvironmentPublicProjection>;
}

export interface EnvironmentManagementAdoptLegacyInput {
  readonly environmentId: string;
  readonly expectedRevision: number;
  readonly legacyConnectionId: string;
}

/** Probe outcome; host/port/lookup name stay host-local (never serialized). */
export interface EnvironmentManagementTrustProbeResult {
  readonly fingerprint: string;
  readonly keyType: string;
  readonly host: string;
  readonly port: number;
  readonly lookupName: string;
}

/**
 * The one ticket authority for the parent WS upgrade. The composed
 * `EnvironmentProxyGatewayLike` satisfies it; the mint re-authenticates the
 * parent access token with the environment-use scopes, so the handler never
 * re-implements ticket validation.
 */
export interface EnvironmentManagementTicketMinter {
  mintWebSocketTicket(input: {
    readonly parentAccessToken: string;
    readonly environmentId: string;
  }): RemoteWebSocketTicketResult;
}

/** What a handler needs from an authenticated caller; never the full context. */
export interface EnvironmentManagementSession {
  readonly scopes: readonly RemoteAccessScope[];
}

/**
 * The handler call surface. It is a strict subset of the dispatcher's
 * `HttpRouteCall` (`req`, `res`, `url`, `params`, `session`, `bearerToken`), so
 * the parent's adapter passes those fields through without casting a
 * `RemoteServerContext`. `signal` is optional: when the adapter can observe a
 * client disconnect it can forward it to the connect/pairing/probe/accept/
 * upgrade operations, which are the operations that accept caller detachment.
 */
export interface EnvironmentManagementCall {
  readonly req: IncomingMessage;
  readonly res: ServerResponse;
  readonly url: URL;
  readonly params: Readonly<Record<string, string>>;
  readonly session: EnvironmentManagementSession | null;
  readonly bearerToken: string | null;
  readonly signal?: AbortSignal;
}

export type EnvironmentManagementHandler = (
  call: EnvironmentManagementCall,
) => Promise<void> | void;

export type EnvironmentManagementHandlers = {
  readonly [RouteId in EnvironmentManagementRouteId]: EnvironmentManagementHandler;
};

export interface EnvironmentManagementDeps {
  readonly runtime: EnvironmentManagementRuntime;
  readonly tickets: EnvironmentManagementTicketMinter;
}

/**
 * Compile-time conformance gates. If the host runtime service or the composed
 * proxy gateway stops structurally satisfying the narrow interfaces, the
 * assignment below fails typecheck instead of drifting silently.
 */
export type EnvironmentManagementRuntimeConformance =
  EnvironmentRuntimeService extends EnvironmentManagementRuntime ? true : never;
export const ENVIRONMENT_MANAGEMENT_RUNTIME_CONFORMANCE: EnvironmentManagementRuntimeConformance = true;
export type EnvironmentManagementTicketMinterConformance =
  EnvironmentProxyGatewayLike extends EnvironmentManagementTicketMinter ? true : never;
export const ENVIRONMENT_MANAGEMENT_TICKET_MINTER_CONFORMANCE: EnvironmentManagementTicketMinterConformance = true;

const MISSING_SCOPE_MESSAGE = "Access token does not grant this operation.";

function missingScope(): RemoteHttpError {
  return new RemoteHttpError("missing_scope", MISSING_SCOPE_MESSAGE, 403);
}

function environmentNotFound(): RemoteHttpError {
  return new RemoteHttpError("environment_not_found", "Environment not found.", 404);
}

/**
 * Authorization first: every handler runs this before touching the runtime, so
 * an unauthorized call can never trigger a trust probe, connect, pairing, or
 * mutation. The dispatcher enforces the same registry scopes; this is the
 * defense-in-depth copy that keeps a standalone factory safe.
 */
function requireScopes(call: EnvironmentManagementCall, operation: EnvironmentOperation): void {
  if (call.session === null || !environmentScopesSatisfied(call.session.scopes, operation)) {
    throw missingScope();
  }
}

/** The path id is a UUID; anything else is not-found, never a lookup. */
function requireWireEnvironmentId(params: Readonly<Record<string, string>>): string {
  const raw = params.environmentId;
  if (raw !== undefined && raw !== "") {
    let decoded: string;
    try {
      decoded = decodeURIComponent(raw);
    } catch {
      throw environmentNotFound();
    }
    if (!decoded.includes("/") && environmentIdSchema.safeParse(decoded).success) return decoded;
  }
  throw environmentNotFound();
}

async function readBody<T>(req: IncomingMessage, schema: z.ZodType<T>): Promise<T> {
  return schema.parse(await readJsonBody(req));
}

function optionalSignal(
  signal: AbortSignal | undefined,
): { readonly signal?: AbortSignal } | undefined {
  return signal === undefined ? undefined : { signal };
}

async function guarded(work: () => Promise<void> | void): Promise<void> {
  try {
    await work();
  } catch (error) {
    throw environmentManagementHttpError(error);
  }
}

function createBodyToRuntimeInput(
  body: RemoteEnvironmentCreateBody,
): EnvironmentServiceCreateInput {
  return body;
}

function updateBodyToRuntimeInput(
  environmentId: string,
  body: RemoteEnvironmentUpdateBody,
): EnvironmentUpdateInput {
  return { environmentId, expectedRevision: body.expectedRevision, patch: body.patch };
}

/**
 * The reusable management slice. Returns one handler per environment route id;
 * every handler fails closed on missing/insufficient scopes and maps host
 * failures into bounded HTTP errors.
 */
export function createEnvironmentManagementHandlers(
  deps: EnvironmentManagementDeps,
): EnvironmentManagementHandlers {
  const { runtime, tickets } = deps;

  return {
    "environment-list": (call) =>
      guarded(async () => {
        requireScopes(call, "list");
        writeJson(call.res, 200, { environments: runtime.listPublic() });
      }),

    "environment-create": (call) =>
      guarded(async () => {
        requireScopes(call, "create");
        const input = createBodyToRuntimeInput(
          await readBody(call.req, remoteEnvironmentCreateBodySchema),
        );
        const environment = await runtime.create(input);
        writeJson(call.res, 200, { environment });
      }),

    "environment-get": (call) =>
      guarded(async () => {
        requireScopes(call, "get");
        const environment = runtime.getPublic(requireWireEnvironmentId(call.params));
        if (environment === undefined) throw environmentNotFound();
        writeJson(call.res, 200, { environment });
      }),

    "environment-update": (call) =>
      guarded(async () => {
        requireScopes(call, "update");
        const environmentId = requireWireEnvironmentId(call.params);
        const body = await readBody(call.req, remoteEnvironmentUpdateBodySchema);
        const environment = await runtime.update(updateBodyToRuntimeInput(environmentId, body));
        writeJson(call.res, 200, { environment });
      }),

    "environment-delete": (call) =>
      guarded(async () => {
        requireScopes(call, "delete");
        const environmentId = requireWireEnvironmentId(call.params);
        const body = await readBody<RemoteEnvironmentExpectedRevisionBody>(
          call.req,
          remoteEnvironmentExpectedRevisionBodySchema,
        );
        await runtime.delete({ environmentId, expectedRevision: body.expectedRevision });
        writeJson(call.res, 200, { ok: true });
      }),

    "environment-connect": (call) =>
      guarded(async () => {
        requireScopes(call, "connect");
        const environment = await runtime.connect(
          requireWireEnvironmentId(call.params),
          optionalSignal(call.signal),
        );
        writeJson(call.res, 200, { environment });
      }),

    "environment-disconnect": (call) =>
      guarded(async () => {
        requireScopes(call, "disconnect");
        const environment = await runtime.disconnect(requireWireEnvironmentId(call.params));
        writeJson(call.res, 200, { environment });
      }),

    "environment-pairing": (call) =>
      guarded(async () => {
        requireScopes(call, "pairing");
        const pairing = await runtime.pairing(
          requireWireEnvironmentId(call.params),
          optionalSignal(call.signal),
        );
        writeJson(call.res, 200, {
          pairing: {
            environmentId: pairing.environmentId,
            endpoint: pairing.endpoint,
            pairingCredential: pairing.pairingCredential,
            childDesktopId: pairing.childDesktopId,
          },
        });
      }),

    "environment-upgrade": (call) =>
      guarded(async () => {
        requireScopes(call, "upgrade");
        const environmentId = requireWireEnvironmentId(call.params);
        const body = await readBody<RemoteEnvironmentExpectedRevisionBody>(
          call.req,
          remoteEnvironmentExpectedRevisionBodySchema,
        );
        const environment = await runtime.upgrade({
          environmentId,
          expectedRevision: body.expectedRevision,
          ...(call.signal === undefined ? {} : { signal: call.signal }),
        });
        writeJson(call.res, 200, { environment });
      }),

    "environment-websocket-ticket": (call) =>
      guarded(async () => {
        requireScopes(call, "websocket-ticket");
        const environmentId = requireWireEnvironmentId(call.params);
        if (call.bearerToken === null || call.bearerToken === "") {
          throw new RemoteHttpError("missing_access_token", "Missing access token.", 401);
        }
        const ticket = tickets.mintWebSocketTicket({
          parentAccessToken: call.bearerToken,
          environmentId,
        });
        writeJson(call.res, 200, ticket);
      }),

    "environment-trust-probe": (call) =>
      guarded(async () => {
        requireScopes(call, "trust");
        const probe = await runtime.probeTrust(requireWireEnvironmentId(call.params), call.signal);
        // Only the public fingerprint crosses the wire; the resolved host,
        // port, and lookup name stay host-local.
        writeJson(call.res, 200, { fingerprint: probe.fingerprint, keyType: probe.keyType });
      }),

    "environment-trust-accept": (call) =>
      guarded(async () => {
        requireScopes(call, "trust");
        const environmentId = requireWireEnvironmentId(call.params);
        const body = await readBody<RemoteEnvironmentTrustAcceptBody>(
          call.req,
          remoteEnvironmentTrustAcceptBodySchema,
        );
        const environment = await runtime.acceptTrust(
          {
            environmentId,
            expectedRevision: body.expectedRevision,
            fingerprint: body.fingerprint,
          },
          call.signal,
        );
        writeJson(call.res, 200, { environment });
      }),

    "environment-adopt-legacy": (call) =>
      guarded(async () => {
        requireScopes(call, "migrate");
        const environmentId = requireWireEnvironmentId(call.params);
        const body = await readBody<RemoteEnvironmentAdoptLegacyBody>(
          call.req,
          remoteEnvironmentAdoptLegacyBodySchema,
        );
        const environment = await runtime.adoptLegacy({
          environmentId,
          expectedRevision: body.expectedRevision,
          legacyConnectionId: body.legacyConnectionId,
        });
        writeJson(call.res, 200, { environment });
      }),
  };
}
