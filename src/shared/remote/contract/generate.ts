import { REMOTE_PROCEDURE_SPECS } from "../procedures";
import {
  remoteWebSocketClientMessageSchema,
  remoteWebSocketServerMessageSchema,
} from "../protocol";
import { canonicalize } from "./canonical";
import {
  buildRemoteV3AuthorityInput,
  manifestHashOf,
  readProtocolManifest,
  sourceHashOf,
} from "./hashes";
import { zodToJsonSchema } from "./jsonSchema";
import { buildNativeBindingOutput } from "./native/generate";
import { WEBSOCKET_QUERY_CODECS } from "./queryCodecs";
import { REMOTE_CONTRACT_REGISTRY } from "./registry";
import { collectRegisteredSemanticValidatorIds } from "./semanticValidators";
import { collectRegisteredPortableTransformIds } from "./portableTransforms";
import { compareUnicodeCodePoints } from "./unicodeOrder";
import {
  REMOTE_BINDING_FORMAT_VERSION,
  REMOTE_CONTRACT_NAME,
  REMOTE_GENERATOR_VERSION,
  REMOTE_JSON_SCHEMA_DIALECT,
  REMOTE_PROTOCOL_VERSION,
} from "./versions";

const DO_NOT_EDIT = "GENERATED FILE. Do not edit by hand. Run `pnpm protocol:remote:v3:generate`.";

function discriminatedTypeLiterals(schema: unknown): string[] {
  const options = (schema as { options?: readonly unknown[] }).options ?? [];
  const names: string[] = [];
  for (const option of options) {
    const typeField = (option as { shape?: { type?: { value?: unknown } } }).shape?.type;
    const value = typeField?.value;
    if (typeof value === "string") names.push(value);
  }
  return names.sort(compareUnicodeCodePoints);
}

function routeIr(route: (typeof REMOTE_CONTRACT_REGISTRY.routes)[number]) {
  return {
    id: route.id,
    method: route.method,
    path: route.path,
    auth: route.auth,
    scopes: [...route.scopes],
    ...(route.scopeResolution ? { scopeResolution: route.scopeResolution } : {}),
    ...(route.queryParameters ? { queryParameters: [...route.queryParameters] } : {}),
    ...(route.queryCodecs
      ? {
          queryCodecs: route.queryCodecs.map((codec) => ({
            name: codec.name,
            kind: codec.kind,
            optional: codec.optional,
            repeated: codec.repeated,
          })),
        }
      : {}),
    ...(route.pathParameters ? { pathParameters: [...route.pathParameters] } : {}),
    ...(route.legacy ? { legacy: true } : {}),
    ...(route.idempotency ? { idempotency: route.idempotency } : {}),
    request: {
      bodyKind: route.request.bodyKind,
      ...(route.request.jsonSchema
        ? { jsonSchema: zodToJsonSchema(route.request.jsonSchema, "input") }
        : {}),
      ...(route.request.querySchema
        ? { querySchema: zodToJsonSchema(route.request.querySchema, "input") }
        : {}),
      ...(route.request.pathSchema
        ? { pathSchema: zodToJsonSchema(route.request.pathSchema, "input") }
        : {}),
    },
    response: {
      wireKind: route.response.wireKind,
      status: route.response.status,
      ...(route.response.contentType ? { contentType: route.response.contentType } : {}),
      ...(route.response.errorStatus ? { errorStatus: route.response.errorStatus } : {}),
      ...(route.response.errorBodyKind ? { errorBodyKind: route.response.errorBodyKind } : {}),
      ...(route.response.jsonSchema
        ? { jsonSchema: zodToJsonSchema(route.response.jsonSchema, "output") }
        : {}),
    },
  };
}

function procedureIr(procedure: (typeof REMOTE_CONTRACT_REGISTRY.procedures)[number]) {
  return {
    name: procedure.name,
    scope: procedure.scope,
    owner: procedure.owner,
    ...(procedure.timeout ? { timeout: procedure.timeout } : {}),
    request: zodToJsonSchema(procedure.requestSchema, "input"),
    result: {
      kind: procedure.resultKind,
      ...(procedure.resultKind === "omitted"
        ? { presence: "omitted", never: "null" }
        : { schema: zodToJsonSchema(procedure.resultSchema, "output") }),
    },
  };
}

export function buildRemoteV3UnsignedIr(manifest: unknown): Record<string, unknown> {
  const routes = [...REMOTE_CONTRACT_REGISTRY.routes]
    .map(routeIr)
    .sort((left, right) => compareUnicodeCodePoints(left.id, right.id));
  const procedures = [...REMOTE_CONTRACT_REGISTRY.procedures]
    .map(procedureIr)
    .sort((left, right) => compareUnicodeCodePoints(left.name, right.name));

  return {
    doNotEdit: DO_NOT_EDIT,
    contract: REMOTE_CONTRACT_NAME,
    protocolVersion: REMOTE_PROTOCOL_VERSION,
    bindingFormatVersion: REMOTE_BINDING_FORMAT_VERSION,
    generatorVersion: REMOTE_GENERATOR_VERSION,
    unknownObjectFields: REMOTE_CONTRACT_REGISTRY.unknownObjectFields,
    inventory: { ...REMOTE_CONTRACT_REGISTRY.inventory },
    compatibility: {
      endpointPathPolicy: "append-to-preserved-base-path",
      unknownObjectFields: "ignore",
      voidProcedureResult: "omit-field-never-null",
      cursorUnits: "js-string-code-units",
    },
    webSocket: {
      clientMessages: discriminatedTypeLiterals(remoteWebSocketClientMessageSchema),
      serverMessages: discriminatedTypeLiterals(remoteWebSocketServerMessageSchema),
      clientSchema: zodToJsonSchema(remoteWebSocketClientMessageSchema, "input"),
      serverSchema: zodToJsonSchema(remoteWebSocketServerMessageSchema, "output"),
      queryCodecs: WEBSOCKET_QUERY_CODECS.map((codec) => ({ ...codec })),
    },
    semanticValidatorIds: collectRegisteredSemanticValidatorIds(),
    portableTransformIds: collectRegisteredPortableTransformIds(),
    proceduresAllowlist: Object.keys(REMOTE_PROCEDURE_SPECS).sort(compareUnicodeCodePoints),
    routes,
    procedures,
    manifestFormatVersion: (manifest as { formatVersion?: unknown }).formatVersion ?? 1,
  };
}

export function buildRemoteV3IrDocument(): Record<string, unknown> {
  const manifest = readProtocolManifest();
  const unsignedIr = buildRemoteV3UnsignedIr(manifest);
  const authority = buildRemoteV3AuthorityInput({ unsignedIr, manifest });
  return {
    ...unsignedIr,
    sourceHash: sourceHashOf(authority),
    manifestHash: manifestHashOf(manifest),
  };
}

export function buildRemoteV3JsonSchemaBundle(
  ir: Record<string, unknown>,
): Record<string, unknown> {
  const defs: Record<string, unknown> = {};
  const routes = ir.routes as Array<{
    id: string;
    request: Record<string, unknown>;
    response: Record<string, unknown>;
  }>;
  const procedures = ir.procedures as Array<{
    name: string;
    request: unknown;
    result: { kind: string; schema?: unknown };
  }>;

  for (const route of routes) {
    if (route.request.jsonSchema) {
      defs[`route.${route.id}.request`] = route.request.jsonSchema;
    }
    if (route.request.querySchema) {
      defs[`route.${route.id}.query`] = route.request.querySchema;
    }
    if (route.request.pathSchema) {
      defs[`route.${route.id}.path`] = route.request.pathSchema;
    }
    if (route.response.jsonSchema) {
      defs[`route.${route.id}.response`] = route.response.jsonSchema;
    }
  }
  for (const procedure of procedures) {
    defs[`procedure.${procedure.name}.request`] = procedure.request;
    if (procedure.result.kind === "json") {
      defs[`procedure.${procedure.name}.result`] = procedure.result.schema;
    } else {
      defs[`procedure.${procedure.name}.result`] = {
        $comment: "Void result omitted from /api/git/call JSON; never null.",
        "x-poracode-wire": "omitted",
        "x-poracode-semanticValidators": ["void-result.omit-field"],
      };
    }
  }

  const sortedDefs: Record<string, unknown> = {};
  for (const key of Object.keys(defs).sort(compareUnicodeCodePoints)) {
    sortedDefs[key] = defs[key];
  }

  return {
    $schema: REMOTE_JSON_SCHEMA_DIALECT,
    $id: "poracode.remote.v3.binding",
    $comment: DO_NOT_EDIT,
    protocolVersion: REMOTE_PROTOCOL_VERSION,
    bindingFormatVersion: REMOTE_BINDING_FORMAT_VERSION,
    generatorVersion: REMOTE_GENERATOR_VERSION,
    sourceHash: ir.sourceHash,
    manifestHash: ir.manifestHash,
    inventory: ir.inventory,
    $defs: sortedDefs,
  };
}

export function buildRemoteV3Inventory(ir: Record<string, unknown>): Record<string, unknown> {
  return {
    doNotEdit: DO_NOT_EDIT,
    protocolVersion: REMOTE_PROTOCOL_VERSION,
    bindingFormatVersion: REMOTE_BINDING_FORMAT_VERSION,
    generatorVersion: REMOTE_GENERATOR_VERSION,
    sourceHash: ir.sourceHash,
    manifestHash: ir.manifestHash,
    inventory: ir.inventory,
  };
}

export const CORE_GENERATED_FILE_NAMES = [
  "ir.json",
  "json-schema.bundle.json",
  "inventory.json",
] as const;

export type RemoteV3GeneratedFiles = Record<string, string> & {
  readonly "ir.json": string;
  readonly "json-schema.bundle.json": string;
  readonly "inventory.json": string;
};

export function buildRemoteV3GeneratedFiles(): RemoteV3GeneratedFiles {
  const ir = buildRemoteV3IrDocument();
  const core = {
    "ir.json": canonicalize(ir),
    "json-schema.bundle.json": canonicalize(buildRemoteV3JsonSchemaBundle(ir)),
    "inventory.json": canonicalize(buildRemoteV3Inventory(ir)),
  };
  const native = buildNativeBindingOutput(ir, readProtocolManifest());
  return {
    ...core,
    ...Object.fromEntries(
      Object.entries(native.files).map(([path, contents]) => [`native/${path}`, contents]),
    ),
  } as RemoteV3GeneratedFiles;
}
