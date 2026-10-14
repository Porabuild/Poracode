import { REMOTE_PROCEDURE_SPECS } from "../procedures";
import {
  REMOTE_STANDARD_SCOPES,
  remoteWebSocketClientMessageSchema,
  remoteWebSocketServerMessageSchema,
} from "../protocol";
import { canonicalize } from "./canonical";
import { buildRemoteV3AuthorityInput, manifestHashOf, sourceHashOf } from "./hashes";
import { zodToJsonSchema } from "./jsonSchema";
import { buildNativeBindingOutput } from "./native/generate";
import { WEBSOCKET_QUERY_CODECS } from "./queryCodecs";
import {
  REMOTE_COMPATIBILITY_POLICY,
  REMOTE_DISCOVERY_FALLBACK_PATHS,
  REMOTE_OUT_OF_BAND_WS_MESSAGES,
  REMOTE_PROTOCOL_MANIFEST_FORMAT_VERSION,
  REMOTE_REPLAYABLE_EVENT_TYPES,
  REMOTE_RUNTIME_EVENT_TYPES,
  REMOTE_WEBSOCKET_SERVER_MESSAGES,
  REMOTE_WIRE_FORMAT,
  discriminatedTypeLiterals,
} from "./protocolFacts";
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

/**
 * The generated protocol manifest: the language-neutral inventory every client
 * flavor reads. Built entirely from the contract registry plus
 * `protocolFacts` — there is no hand-maintained manifest source anymore, so
 * the manifest cannot drift from the registry that drives the HTTP router.
 */
export function buildRemoteProtocolManifest(): Record<string, unknown> {
  const routePaths = new Set(REMOTE_CONTRACT_REGISTRY.routes.map((route) => route.path));
  for (const path of REMOTE_DISCOVERY_FALLBACK_PATHS) {
    if (!routePaths.has(path)) {
      throw new Error(`Discovery fallback path is not a registered route: ${path}`);
    }
  }
  const serverMessages = new Set(REMOTE_WEBSOCKET_SERVER_MESSAGES);
  for (const message of REMOTE_OUT_OF_BAND_WS_MESSAGES) {
    if (!serverMessages.has(message)) {
      throw new Error(`Out-of-band WebSocket message is not a server message: ${message}`);
    }
  }
  const knownScopes = new Set<string>(REMOTE_STANDARD_SCOPES);
  for (const route of REMOTE_CONTRACT_REGISTRY.routes) {
    for (const scope of route.scopes) {
      if (!knownScopes.has(scope)) {
        throw new Error(`Route ${route.id} declares unknown scope: ${scope}`);
      }
    }
  }
  return {
    formatVersion: REMOTE_PROTOCOL_MANIFEST_FORMAT_VERSION,
    contract: REMOTE_CONTRACT_NAME,
    protocolVersion: REMOTE_PROTOCOL_VERSION,
    wireFormat: { ...REMOTE_WIRE_FORMAT },
    compatibility: {
      ...REMOTE_COMPATIBILITY_POLICY,
      minimumAcceptedProtocolVersion: REMOTE_PROTOCOL_VERSION,
      maximumAcceptedProtocolVersion: REMOTE_PROTOCOL_VERSION,
    },
    scopes: [...REMOTE_STANDARD_SCOPES],
    httpRoutes: REMOTE_CONTRACT_REGISTRY.routes.map((route) => ({
      id: route.id,
      method: route.method,
      path: route.path,
      auth: route.auth,
      scopes: [...route.scopes],
      ...(route.scopeResolution ? { scopeResolution: route.scopeResolution } : {}),
      ...(route.queryParameters ? { queryParameters: [...route.queryParameters] } : {}),
      ...(route.legacy ? { legacy: true } : {}),
      ...(route.idempotency ? { idempotency: route.idempotency } : {}),
    })),
    procedures: REMOTE_CONTRACT_REGISTRY.procedures.map((procedure) => ({
      name: procedure.name,
      scope: procedure.scope,
      owner: procedure.owner,
      ...(procedure.timeout ? { timeout: procedure.timeout } : {}),
    })),
    webSocket: {
      clientMessages: [...discriminatedTypeLiterals(remoteWebSocketClientMessageSchema)],
      serverMessages: [...discriminatedTypeLiterals(remoteWebSocketServerMessageSchema)],
      replayableEventTypes: [...REMOTE_REPLAYABLE_EVENT_TYPES],
      runtimeEventTypes: [...REMOTE_RUNTIME_EVENT_TYPES],
      outOfBandMessages: [...REMOTE_OUT_OF_BAND_WS_MESSAGES],
    },
  };
}

export function buildRemoteV3IrDocument(): Record<string, unknown> {
  const manifest = buildRemoteProtocolManifest();
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
  "manifest.json",
  "ir.json",
  "json-schema.bundle.json",
  "inventory.json",
] as const;

export type RemoteV3GeneratedFiles = Record<string, string> & {
  readonly "manifest.json": string;
  readonly "ir.json": string;
  readonly "json-schema.bundle.json": string;
  readonly "inventory.json": string;
};

export function buildRemoteV3GeneratedFiles(): RemoteV3GeneratedFiles {
  const manifest = buildRemoteProtocolManifest();
  const ir = buildRemoteV3IrDocument();
  const core = {
    "manifest.json": canonicalize(manifest),
    "ir.json": canonicalize(ir),
    "json-schema.bundle.json": canonicalize(buildRemoteV3JsonSchemaBundle(ir)),
    "inventory.json": canonicalize(buildRemoteV3Inventory(ir)),
  };
  const native = buildNativeBindingOutput(ir, manifest);
  return {
    ...core,
    ...Object.fromEntries(
      Object.entries(native.files).map(([path, contents]) => [`native/${path}`, contents]),
    ),
  } as RemoteV3GeneratedFiles;
}
