import { procedureByName, type ProtocolManifest } from "./manifest.ts";
import { REMOTE_PROCEDURE_RESULT_FIXTURES } from "../../../src/shared/remote/contract/goldens/procedureFixtures.ts";
import { loadGeneratedContract } from "./generatedContract.ts";
import {
  CONFIGURED_PROCEDURE_NAMES,
  FIXTURE_PROJECT_LOCATION,
  LabProcedureWorkspace,
  MUTATING_PROCEDURES,
  PROCEDURE_REQUEST_FIXTURES,
  fixtureProjectId,
  type ConfiguredProcedureName,
} from "./procedureFixtures.ts";
import {
  isOmittedProcedure,
  resolveProcedureSchemas,
  resolveRouteSchemas,
  type SchemaAvailability,
} from "./schemaValidation.ts";

export const CONFIGURED_ROUTE_IDS = loadGeneratedContract().ir.routes.map((route) => route.id);

export type ConfiguredRouteId = string;

export const GET_GIT_STATUS_PAYLOAD = {
  projectLocation: FIXTURE_PROJECT_LOCATION,
} as const;

export const GIT_STAGE_PAYLOAD = {
  projectLocation: FIXTURE_PROJECT_LOCATION,
  filePath: "README.md",
} as const;

export interface ProcedureFixture {
  readonly name: string;
  readonly resultKind: "json" | "omitted";
  readonly mutates: boolean;
  readonly schemaAvailability: SchemaAvailability;
  readonly schemaReason?: string;
  readonly request: unknown;
  readonly result?: unknown;
}

export interface RouteFixtureMeta {
  readonly routeId: string;
  readonly schemaAvailability: SchemaAvailability;
  readonly schemaReason?: string;
}

const CONFIGURED_PROCEDURES: readonly ProcedureFixture[] = CONFIGURED_PROCEDURE_NAMES.map(
  (name) => ({
    name,
    resultKind: isOmittedProcedure(name) ? "omitted" : "json",
    mutates: MUTATING_PROCEDURES.has(name),
    schemaAvailability: "zod",
    request: PROCEDURE_REQUEST_FIXTURES[name],
    result: REMOTE_PROCEDURE_RESULT_FIXTURES[name],
  }),
);

export function isConfiguredRoute(routeId: string): routeId is ConfiguredRouteId {
  return CONFIGURED_ROUTE_IDS.includes(routeId);
}

export function routeFixtureMeta(routeId: string): RouteFixtureMeta {
  const schemas = resolveRouteSchemas(routeId);
  return {
    routeId,
    schemaAvailability: schemas.availability,
    ...(schemas.reason ? { schemaReason: schemas.reason } : {}),
  };
}

export function configuredProcedureFixture(name: string): ProcedureFixture | undefined {
  return CONFIGURED_PROCEDURES.find((entry) => entry.name === name);
}

export function isConfiguredProcedureName(name: string): name is ConfiguredProcedureName {
  return CONFIGURED_PROCEDURE_NAMES.includes(name as ConfiguredProcedureName);
}

export function allConfiguredProcedureFixtures(): readonly ProcedureFixture[] {
  return CONFIGURED_PROCEDURES;
}

export function describeProcedureCase(
  name: string,
  manifest: ProtocolManifest,
): "unknown" | "unconfigured" | "configured" {
  if (!procedureByName(name, manifest)) return "unknown";
  return configuredProcedureFixture(name) ? "configured" : "unconfigured";
}

export function assertConfiguredProcedureSchemas(): void {
  for (const fixture of CONFIGURED_PROCEDURES) {
    const resolved = resolveProcedureSchemas(fixture.name);
    if (fixture.schemaAvailability === "unavailable") {
      if (!fixture.schemaReason) {
        throw new Error(`Procedure fixture ${fixture.name} is unavailable without a reason`);
      }
      continue;
    }
    if (resolved.availability !== "zod" || !resolved.requestSchema || !resolved.responseSchema) {
      throw new Error(
        `Procedure fixture ${fixture.name} claims Zod validation but schemas are ${resolved.reason ?? resolved.availability}`,
      );
    }
    if (isOmittedProcedure(fixture.name) !== (fixture.resultKind === "omitted")) {
      throw new Error(
        `Procedure fixture ${fixture.name} resultKind does not match omittedResultSchema`,
      );
    }
    resolved.requestSchema.parse(fixture.request);
    if (fixture.resultKind === "omitted") {
      resolved.responseSchema.parse({});
    } else {
      resolved.responseSchema.parse({ result: fixture.result });
    }
  }
}

export {
  FIXTURE_PROJECT_LOCATION,
  LabProcedureWorkspace,
  PROCEDURE_REQUEST_FIXTURES,
  fixtureProjectId,
};
