import { readFileSync } from "node:fs";
import { join } from "node:path";
import { findRepoRoot } from "./paths.ts";

interface GeneratedInventory {
  readonly routes: number;
  readonly procedures: number;
  readonly jsonProcedureResults: number;
  readonly voidProcedureResults: number;
  readonly blockedProcedureResults: readonly string[];
  readonly webSocketClientMessages: number;
  readonly webSocketServerMessages: number;
  readonly replayableEventTypes: number;
  readonly runtimeEventTypes: number;
}

export interface GeneratedRouteContract {
  readonly id: string;
  readonly method: "GET" | "POST" | "DELETE";
  readonly path: string;
  readonly pathParameters?: readonly string[];
  readonly queryCodecs?: readonly {
    readonly kind: "string" | "int" | "boolean" | "JSON-string";
    readonly name: string;
    readonly optional: boolean;
    readonly repeated: boolean;
  }[];
  readonly request: {
    readonly bodyKind: "empty" | "json" | "raw-upload";
    readonly jsonSchema?: unknown;
    readonly querySchema?: unknown;
    readonly pathSchema?: unknown;
  };
  readonly response: {
    readonly status: number;
    readonly wireKind: string;
    readonly jsonSchema?: unknown;
  };
}

export interface GeneratedProcedureContract {
  readonly name: string;
  readonly owner: string;
  readonly scope: string;
  readonly request: unknown;
  readonly result: { readonly kind: "json" | "omitted"; readonly schema?: unknown };
}

interface GeneratedIr {
  readonly bindingFormatVersion: number;
  readonly protocolVersion: number;
  readonly manifestHash: string;
  readonly sourceHash: string;
  readonly inventory: GeneratedInventory;
  readonly routes: readonly GeneratedRouteContract[];
  readonly procedures: readonly GeneratedProcedureContract[];
}

interface GeneratedSchemaBundle {
  readonly bindingFormatVersion: number;
  readonly protocolVersion: number;
  readonly manifestHash: string;
  readonly sourceHash: string;
  readonly inventory: GeneratedInventory;
  readonly $defs: Readonly<Record<string, unknown>>;
}

let cached: { readonly ir: GeneratedIr; readonly bundle: GeneratedSchemaBundle } | undefined;

export function loadGeneratedContract(): {
  readonly ir: GeneratedIr;
  readonly bundle: GeneratedSchemaBundle;
} {
  if (cached) return cached;
  const generated = join(findRepoRoot(), "protocol/remote/v3/generated");
  const ir = JSON.parse(readFileSync(join(generated, "ir.json"), "utf8")) as GeneratedIr;
  const bundle = JSON.parse(
    readFileSync(join(generated, "json-schema.bundle.json"), "utf8"),
  ) as GeneratedSchemaBundle;
  if (
    ir.protocolVersion !== bundle.protocolVersion ||
    ir.bindingFormatVersion !== bundle.bindingFormatVersion ||
    ir.manifestHash !== bundle.manifestHash ||
    ir.sourceHash !== bundle.sourceHash ||
    JSON.stringify(ir.inventory) !== JSON.stringify(bundle.inventory)
  ) {
    throw new Error("Generated IR and JSON Schema bundle do not describe the same contract.");
  }
  cached = { ir, bundle };
  return cached;
}

export function generatedRoute(id: string): GeneratedRouteContract {
  const route = loadGeneratedContract().ir.routes.find((candidate) => candidate.id === id);
  if (!route) throw new Error(`Generated IR has no route ${id}`);
  return route;
}

export function generatedProcedure(name: string): GeneratedProcedureContract {
  const procedure = loadGeneratedContract().ir.procedures.find(
    (candidate) => candidate.name === name,
  );
  if (!procedure) throw new Error(`Generated IR has no procedure ${name}`);
  return procedure;
}

export function assertGeneratedSchemaDefinitions(): void {
  const { ir, bundle } = loadGeneratedContract();
  for (const route of ir.routes) {
    for (const suffix of ["request", "query", "path", "response"] as const) {
      const key = `route.${route.id}.${suffix}`;
      const expected =
        (suffix === "request" && route.request.jsonSchema !== undefined) ||
        (suffix === "query" && route.request.querySchema !== undefined) ||
        (suffix === "path" && route.request.pathSchema !== undefined) ||
        (suffix === "response" && route.response.jsonSchema !== undefined);
      if (expected && bundle.$defs[key] === undefined) {
        throw new Error(`Generated schema bundle is missing ${key}`);
      }
    }
  }
  for (const procedure of ir.procedures) {
    if (bundle.$defs[`procedure.${procedure.name}.request`] === undefined) {
      throw new Error(`Generated schema bundle is missing procedure.${procedure.name}.request`);
    }
    if (bundle.$defs[`procedure.${procedure.name}.result`] === undefined) {
      throw new Error(`Generated schema bundle is missing procedure.${procedure.name}.result`);
    }
  }
}
