import type { ServerResponse } from "node:http";
import { REMOTE_HTTP_ROUTES } from "../../../src/shared/remote/contract/routes/index.ts";
import { writeJson } from "./httpIo.ts";
import { LabHttpError } from "./labAuth.ts";
import type { LabRuntime } from "./labRuntime.ts";
import { parseWithSchema } from "./schemaValidation.ts";

export function writeValidatedRoute(
  runtime: LabRuntime,
  res: ServerResponse,
  routeId: string,
  body: unknown,
): void {
  const route = REMOTE_HTTP_ROUTES.find((candidate) => candidate.id === routeId);
  if (!route?.response.jsonSchema) {
    throw new LabHttpError(
      "unconfigured_contract_case",
      `Route ${routeId} has no authoritative JSON response schema.`,
      501,
    );
  }
  const payload = parseWithSchema(route.response.jsonSchema, body, `${routeId} response`);
  runtime.ledger.observeHttpRoute(routeId, {
    statusCode: route.response.status,
    source: "mock",
  });
  writeJson(res, route.response.status, payload);
}

export function recordRouteFollowUps(runtime: LabRuntime, evidenceRouteId: string): void {
  for (const routeId of runtime.lifecycle.takeFollowUps(evidenceRouteId)) {
    runtime.ledger.recordFollowUp("route", routeId, {
      statusCode: 200,
      source: "mock",
    });
  }
  for (const routeId of runtime.routes.takeFollowUps(evidenceRouteId)) {
    runtime.ledger.recordFollowUp("route", routeId, {
      statusCode: 200,
      source: "mock",
    });
  }
}
