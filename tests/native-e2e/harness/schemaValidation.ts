import { z } from "zod";
import { remoteProcedureCallEnvelopeSchema } from "../../../src/shared/ipc/resultCodec.ts";
import { REMOTE_PROCEDURE_CONTRACTS } from "../../../src/shared/remote/contract/procedures.ts";
import { REMOTE_HTTP_ROUTES } from "../../../src/shared/remote/contract/routes/index.ts";
import { generatedProcedure, generatedRoute } from "./generatedContract.ts";

export type SchemaAvailability = "zod" | "unavailable";

export interface SchemaResolution {
  readonly availability: SchemaAvailability;
  readonly reason?: string;
  readonly requestSchema?: z.ZodType;
  readonly responseSchema?: z.ZodType;
}

export function resolveRouteSchemas(routeId: string): SchemaResolution {
  const generated = generatedRoute(routeId);
  const route = REMOTE_HTTP_ROUTES.find((candidate) => candidate.id === routeId);
  if (!route) {
    return { availability: "unavailable", reason: `No authoritative route ${routeId}` };
  }
  if (generated.request.bodyKind !== route.request.bodyKind) {
    throw new Error(`Generated and runtime body kinds disagree for ${routeId}`);
  }
  return {
    availability: "zod",
    ...(route.request.jsonSchema ? { requestSchema: route.request.jsonSchema } : {}),
    ...(route.response.jsonSchema ? { responseSchema: route.response.jsonSchema } : {}),
  };
}

export function resolveProcedureSchemas(name: string): SchemaResolution {
  const contract = REMOTE_PROCEDURE_CONTRACTS.find((candidate) => candidate.name === name);
  if (!contract) return { availability: "unavailable", reason: `Unknown procedure ${name}` };
  const generated = generatedProcedure(name);
  if (generated.result.kind !== contract.resultKind) {
    throw new Error(`Generated and runtime result kinds disagree for ${name}`);
  }
  return {
    availability: "zod",
    requestSchema: contract.requestSchema,
    responseSchema: remoteProcedureCallEnvelopeSchema(contract.resultSchema),
  };
}

export function isOmittedProcedure(name: string): boolean {
  return generatedProcedure(name).result.kind === "omitted";
}

export function parseWithSchema<T>(
  schema: z.ZodType<T> | undefined,
  value: unknown,
  label: string,
): T {
  if (!schema) {
    throw new Error(`${label} has no schema to parse against`);
  }
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new Error(`${label} failed schema validation: ${parsed.error.message}`);
  }
  return parsed.data;
}

export function assertSchemaOrExplicitGap(resolution: SchemaResolution, label: string): void {
  if (resolution.availability === "unavailable" && !resolution.reason) {
    throw new Error(`${label} marked unavailable without an explicit reason`);
  }
}
