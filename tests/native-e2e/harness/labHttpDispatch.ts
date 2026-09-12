import type { IncomingMessage, ServerResponse } from "node:http";
import { isRemoteProcedure } from "../../../src/shared/remote/procedures.ts";
import { z } from "zod";
import { remoteTokenExchangePayloadSchema } from "../../../src/shared/remote/protocol.ts";
import { configuredProcedureFixture, isConfiguredProcedureName } from "./contractFixtures.ts";
import {
  headerValue,
  readBoundedJsonBody,
  rejectChunkedRequest,
  stripBasePath,
  writeError,
  writeJson,
} from "./httpIo.ts";
import { LabHttpError, parseBearerAuthorizationHeader } from "./labAuth.ts";
import { writeValidatedRoute } from "./contractResponse.ts";
import { handleLifecycleHttp } from "./lifecycleHttp.ts";
import { procedureByName } from "./manifest.ts";
import type { LabRuntime } from "./labRuntime.ts";
import { matchHttpRoute } from "./routeTable.ts";
import { handleDeterministicRoute, handleForwardEnter } from "./routeFixtures.ts";
import {
  parseWithSchema,
  resolveProcedureSchemas,
  resolveRouteSchemas,
} from "./schemaValidation.ts";

export async function handleLabHttp(
  runtime: LabRuntime,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  try {
    const url = new URL(req.url ?? "/", runtime.httpBaseUrl);
    const pathname = stripBasePath(url.pathname, runtime.basePath);
    if (pathname === null) {
      writeError(res, new LabHttpError("not_found", "Not found.", 404));
      return;
    }
    const matched = matchHttpRoute(req.method ?? "GET", pathname, runtime.manifest);
    if (!matched) {
      writeError(res, new LabHttpError("not_found", "Not found.", 404));
      return;
    }
    runtime.observationLedger.recordOperation(`route:${matched.route.id}`, {
      method: req.method ?? "GET",
      path: pathname,
    });
    runtime.ledger.observeHttpRoute(matched.route.id);
    const fault = await runtime.faults.applyHttp(matched.route.id, req, res);
    if (fault === "handled") return;

    if (matched.route.auth !== "public") {
      rejectChunkedRequest(req);
    }

    switch (matched.route.id) {
      case "environment":
      case "environment-legacy":
        writeValidatedRoute(runtime, res, matched.route.id, runtime.environment());
        return;
      case "token-exchange":
        await handleTokenExchange(runtime, req, res);
        return;
      case "websocket-ticket": {
        runtime.requireRouteAuth(req, url, matched.route.auth, matched.route.scopes);
        await validateEmptyBody(req);
        const issued = runtime.auth.issueWebSocketTicket(bearerToken(req, url));
        writeValidatedRoute(runtime, res, matched.route.id, issued);
        return;
      }
      case "procedure-call":
        await handleProcedureCall(runtime, req, res, url);
        return;
      case "forward-enter":
        await handleForwardEnter(runtime, req, res, url, matched.params);
        return;
      default: {
        runtime.requireRouteAuth(req, url, matched.route.auth, matched.route.scopes);
        if (await handleLifecycleHttp(runtime, req, res, matched.route.id, url, matched.params)) {
          return;
        }
        if (
          await handleDeterministicRoute(runtime, req, res, matched.route.id, url, matched.params)
        ) {
          return;
        }
        runtime.ledger.observeHttpRoute(matched.route.id, {
          statusCode: 501,
          source: "negative",
        });
        throw new LabHttpError(
          "unconfigured_contract_case",
          `Route ${matched.route.id} is catalogued but has no truthful deterministic fixture.`,
          501,
        );
      }
    }
  } catch (error) {
    if (!res.headersSent) writeError(res, error);
    else req.socket.destroy();
  }
}

async function handleTokenExchange(
  runtime: LabRuntime,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  rejectChunkedRequest(req);
  const body = await readBoundedJsonBody(req);
  const requestSchema = remoteTokenExchangePayloadSchema.extend({
    scopes: z.array(z.string().min(1)).optional(),
  });
  let parsed: { credential: string; scopes?: readonly string[] };
  try {
    parsed = parseWithSchema(requestSchema, body, "token-exchange request") as {
      credential: string;
      scopes?: readonly string[];
    };
  } catch (error) {
    throw new LabHttpError(
      "invalid_request",
      error instanceof Error ? error.message : "Request payload is invalid.",
      400,
    );
  }
  const result = runtime.auth.exchangePairingCredential({
    credential: parsed.credential,
    ...(parsed.scopes ? { scopes: parsed.scopes } : {}),
    knownScopes: runtime.manifest.scopes,
  });
  runtime.consumePairingSecretFile();
  writeValidatedRoute(runtime, res, "token-exchange", result);
}

async function handleProcedureCall(
  runtime: LabRuntime,
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
): Promise<void> {
  const token = bearerToken(req, url);
  runtime.auth.authenticateBearer(token, []);
  const body = await readBoundedJsonBody(req);
  const envelope = parseWithSchema(
    resolveRouteSchemas("procedure-call").requestSchema,
    body,
    "procedure-call request",
  ) as { procedure: string; payload: unknown };
  runtime.ledger.observeProcedure(envelope.procedure);
  if (
    !isRemoteProcedure(envelope.procedure) ||
    !procedureByName(envelope.procedure, runtime.manifest)
  ) {
    runtime.ledger.observeProcedure(envelope.procedure, { statusCode: 400, source: "negative" });
    throw new LabHttpError("unknown_procedure", "Unknown procedure.", 400);
  }
  const spec = procedureByName(envelope.procedure, runtime.manifest);
  if (!spec) {
    throw new LabHttpError("unknown_procedure", "Unknown procedure.", 400);
  }
  runtime.auth.authenticateBearer(token, [spec.scope]);
  const fixture = configuredProcedureFixture(envelope.procedure);
  if (!fixture) {
    runtime.ledger.observeProcedure(envelope.procedure, { statusCode: 501, source: "negative" });
    throw new LabHttpError(
      "unconfigured_contract_case",
      `Procedure ${envelope.procedure} is allowlisted but has no deterministic fixture.`,
      501,
    );
  }
  const schemas = resolveProcedureSchemas(envelope.procedure);
  if (schemas.availability !== "zod" || !schemas.requestSchema || !schemas.responseSchema) {
    throw new LabHttpError(
      "unconfigured_contract_case",
      fixture.schemaReason ?? `Procedure ${envelope.procedure} has no authoritative schema.`,
      501,
    );
  }
  parseWithSchema(schemas.requestSchema, envelope.payload, `${envelope.procedure} payload`);
  if (!isConfiguredProcedureName(fixture.name)) {
    throw new LabHttpError("unconfigured_contract_case", "Fixture name is not configured.", 501);
  }
  if (fixture.mutates) runtime.ledger.markRequiresFollowUp("procedure", fixture.name);
  const result = runtime.workspace.invoke(fixture.name, envelope.payload);
  const bodyOut =
    fixture.resultKind === "omitted"
      ? parseWithSchema(schemas.responseSchema, {}, `${fixture.name} envelope`)
      : parseWithSchema(schemas.responseSchema, { result }, `${fixture.name} envelope`);
  runtime.ledger.observeProcedure(fixture.name, { statusCode: 200, source: "mock" });
  runtime.ledger.observeHttpRoute("procedure-call", { statusCode: 200, source: "mock" });
  for (const mutation of runtime.workspace.takeFollowUps(fixture.name)) {
    runtime.ledger.recordFollowUp("procedure", mutation, { statusCode: 200, source: "mock" });
  }
  writeJson(res, 200, bodyOut);
}

async function validateEmptyBody(req: IncomingMessage): Promise<void> {
  const body = await readBoundedJsonBody(req);
  if (Object.keys(body as Record<string, unknown>).length > 0) {
    throw new LabHttpError("invalid_request", "Request body must be empty.", 400);
  }
}

export function bearerToken(req: IncomingMessage, url: URL, allowQuery = false): string {
  const header = headerValue(req, "authorization");
  const fromHeader = parseBearerAuthorizationHeader(header);
  const fromQuery = allowQuery ? url.searchParams.get("access_token") : null;
  const token = fromHeader ?? fromQuery;
  if (!token) {
    throw new LabHttpError("missing_access_token", "Missing access token.", 401);
  }
  return token;
}
