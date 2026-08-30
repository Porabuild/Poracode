import { buildRemoteV3AuthorityInput, manifestHashOf, sourceHashOf } from "../hashes";
import { compareUnicodeCodePoints } from "../unicodeOrder";
import type {
  JsonSchema,
  NativeBindingIr,
  NativeProcedureIr,
  NativeQueryCodec,
  NativeRouteIr,
} from "./types";

const SHA256 = /^sha256:[a-f0-9]{64}$/;
const QUERY_KINDS = new Set(["string", "int", "decimal", "0-or-1", "JSON-string"]);
const PORTABLE_VALIDATORS = new Set([
  "git.add-worktree.frozen-source",
  "git.delete-branch.remote-cannot-have-owner",
  "git.remove-worktree.owner-requires-branch",
  "mcp.reserved-name",
  "mcp.valid-url",
  "pr-watch.agent-required-when-enabled",
  "push.registration.platform-fields",
  "push.routing.identifier-no-controls",
  "push.web.endpoint-https",
  "string.trim",
  "terminal.cursor.output-data-utf16",
  "terminal.cursor.output-range",
  "terminal.cursor.ready-range-utf16",
  "thread.goal.objective.trim",
  "void-envelope.omit-result",
  "void-result.omit-field",
]);
const PORTABLE_TRANSFORMS = new Set([
  "agent-settings.strip-sensitive",
  "push.routing.client-connection-id.lowercase",
  "string.trim",
]);

function record(value: unknown, context: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${context} must be an object`);
  }
  return value as Record<string, unknown>;
}

function string(value: unknown, context: string): string {
  if (typeof value !== "string" || value.length === 0)
    throw new Error(`${context} must be a string`);
  return value;
}

function integer(value: unknown, context: string): number {
  if (!Number.isSafeInteger(value)) throw new Error(`${context} must be a safe integer`);
  return value as number;
}

function stringArray(value: unknown, context: string): string[] {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    throw new Error(`${context} must be a string array`);
  }
  return value as string[];
}

function schema(value: unknown, context: string): JsonSchema {
  return record(value, context);
}

function queryCodecs(value: unknown, context: string): NativeQueryCodec[] {
  if (!Array.isArray(value)) throw new Error(`${context} must be an array`);
  return value.map((raw, index) => {
    const item = record(raw, `${context}[${index}]`);
    const kind = string(item.kind, `${context}[${index}].kind`);
    if (!QUERY_KINDS.has(kind)) throw new Error(`${context}[${index}] has unknown codec ${kind}`);
    if (typeof item.optional !== "boolean" || item.repeated !== false) {
      throw new Error(`${context}[${index}] has invalid optional/repeated flags`);
    }
    return {
      name: string(item.name, `${context}[${index}].name`),
      kind: kind as NativeQueryCodec["kind"],
      optional: item.optional,
      repeated: false,
    };
  });
}

function parseRoute(value: unknown, index: number): NativeRouteIr {
  const item = record(value, `routes[${index}]`);
  const request = record(item.request, `routes[${index}].request`);
  const response = record(item.response, `routes[${index}].response`);
  const bodyKind = string(request.bodyKind, `routes[${index}].request.bodyKind`);
  const wireKind = string(response.wireKind, `routes[${index}].response.wireKind`);
  if (!["json", "empty", "raw-upload"].includes(bodyKind))
    throw new Error(`unknown body kind ${bodyKind}`);
  if (
    !["json", "binary", "empty", "unit", "redirect-html", "procedure-result"].includes(wireKind)
  ) {
    throw new Error(`unknown response wire kind ${wireKind}`);
  }
  return {
    id: string(item.id, `routes[${index}].id`),
    method: string(item.method, `routes[${index}].method`),
    path: string(item.path, `routes[${index}].path`),
    auth: string(item.auth, `routes[${index}].auth`),
    scopes: stringArray(item.scopes, `routes[${index}].scopes`),
    ...(item.scopeResolution === undefined
      ? {}
      : { scopeResolution: string(item.scopeResolution, "scopeResolution") }),
    ...(item.queryParameters === undefined
      ? {}
      : { queryParameters: stringArray(item.queryParameters, "queryParameters") }),
    ...(item.queryCodecs === undefined
      ? {}
      : { queryCodecs: queryCodecs(item.queryCodecs, "queryCodecs") }),
    ...(item.pathParameters === undefined
      ? {}
      : { pathParameters: stringArray(item.pathParameters, "pathParameters") }),
    ...(item.legacy === true ? { legacy: true as const } : {}),
    ...(item.idempotency === undefined
      ? {}
      : { idempotency: string(item.idempotency, "idempotency") }),
    request: {
      bodyKind: bodyKind as NativeRouteIr["request"]["bodyKind"],
      ...(request.jsonSchema === undefined
        ? {}
        : { jsonSchema: schema(request.jsonSchema, "request.jsonSchema") }),
      ...(request.querySchema === undefined
        ? {}
        : { querySchema: schema(request.querySchema, "request.querySchema") }),
      ...(request.pathSchema === undefined
        ? {}
        : { pathSchema: schema(request.pathSchema, "request.pathSchema") }),
    },
    response: {
      wireKind: wireKind as NativeRouteIr["response"]["wireKind"],
      status: integer(response.status, "response.status"),
      ...(response.contentType === undefined
        ? {}
        : { contentType: string(response.contentType, "contentType") }),
      ...(response.errorStatus === undefined
        ? {}
        : { errorStatus: integer(response.errorStatus, "errorStatus") }),
      ...(response.errorBodyKind === undefined
        ? {}
        : { errorBodyKind: string(response.errorBodyKind, "errorBodyKind") }),
      ...(response.jsonSchema === undefined
        ? {}
        : { jsonSchema: schema(response.jsonSchema, "response.jsonSchema") }),
    },
  };
}

function parseProcedure(value: unknown, index: number): NativeProcedureIr {
  const item = record(value, `procedures[${index}]`);
  const result = record(item.result, `procedures[${index}].result`);
  const kind = string(result.kind, `procedures[${index}].result.kind`);
  if (kind !== "json" && kind !== "omitted")
    throw new Error(`unknown procedure result kind ${kind}`);
  if (kind === "omitted" && (result.presence !== "omitted" || result.never !== "null")) {
    throw new Error(`procedures[${index}].result has incompatible omitted-result metadata`);
  }
  return {
    name: string(item.name, `procedures[${index}].name`),
    scope: string(item.scope, `procedures[${index}].scope`),
    owner: string(item.owner, `procedures[${index}].owner`),
    ...(item.timeout === undefined ? {} : { timeout: string(item.timeout, "timeout") }),
    request: schema(item.request, `procedures[${index}].request`),
    result:
      kind === "json"
        ? { kind, schema: schema(result.schema, `procedures[${index}].result.schema`) }
        : { kind, presence: "omitted", never: "null" },
  };
}

function validateSchemaSemantics(value: unknown, context: string): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => validateSchemaSemantics(item, `${context}[${index}]`));
    return;
  }
  if (!value || typeof value !== "object") return;
  const item = value as Record<string, unknown>;
  const transforms = item["x-poracode-transforms"];
  if (transforms !== undefined) {
    for (const id of stringArray(transforms, `${context}.x-poracode-transforms`)) {
      if (!PORTABLE_TRANSFORMS.has(id)) {
        throw new Error(`${context} uses unsupported portable transform ${id}`);
      }
    }
  }
  const ids = item["x-poracode-semanticValidators"];
  if (ids !== undefined) {
    for (const id of stringArray(ids, `${context}.x-poracode-semanticValidators`)) {
      if (id === "zod.custom-refine" || !PORTABLE_VALIDATORS.has(id)) {
        throw new Error(`${context} uses unsupported semantic validator ${id}`);
      }
    }
  }
  for (const [key, nested] of Object.entries(item))
    validateSchemaSemantics(nested, `${context}.${key}`);
}

function assertSortedUnique(values: readonly string[], context: string): void {
  const expected = [...new Set(values)].sort(compareUnicodeCodePoints);
  if (
    expected.length !== values.length ||
    expected.some((value, index) => value !== values[index])
  ) {
    throw new Error(`${context} must be unique and sorted by Unicode code point`);
  }
}

export function parseNativeBindingIr(raw: unknown, manifest: unknown): NativeBindingIr {
  const item = record(raw, "binding IR");
  if (item.contract !== "poracode.remote")
    throw new Error("binding IR contract must be poracode.remote");
  if (item.protocolVersion !== 8)
    throw new Error(`unsupported protocol version ${String(item.protocolVersion)}`);
  if (item.bindingFormatVersion !== 2)
    throw new Error(`unsupported binding format ${String(item.bindingFormatVersion)}`);
  if (item.generatorVersion !== 3)
    throw new Error(`unsupported generator version ${String(item.generatorVersion)}`);
  if (item.manifestFormatVersion !== 1)
    throw new Error(`unsupported manifest format ${String(item.manifestFormatVersion)}`);
  const sourceHash = string(item.sourceHash, "sourceHash");
  const manifestHash = string(item.manifestHash, "manifestHash");
  if (!SHA256.test(sourceHash) || !SHA256.test(manifestHash))
    throw new Error("binding hashes must be sha256 values");
  const computedManifestHash = manifestHashOf(manifest);
  if (manifestHash !== computedManifestHash)
    throw new Error(`manifestHash mismatch: ${manifestHash} != ${computedManifestHash}`);

  const unsignedIr = { ...item };
  delete unsignedIr.sourceHash;
  delete unsignedIr.manifestHash;
  const computedSourceHash = sourceHashOf(buildRemoteV3AuthorityInput({ unsignedIr, manifest }));
  if (sourceHash !== computedSourceHash)
    throw new Error(`sourceHash mismatch: ${sourceHash} != ${computedSourceHash}`);

  const inventory = record(item.inventory, "inventory");
  const routesRaw = Array.isArray(item.routes) ? item.routes : [];
  const proceduresRaw = Array.isArray(item.procedures) ? item.procedures : [];
  const routes = routesRaw.map(parseRoute);
  const procedures = proceduresRaw.map(parseProcedure);
  const webSocket = record(item.webSocket, "webSocket");
  const clientMessages = stringArray(webSocket.clientMessages, "webSocket.clientMessages");
  const serverMessages = stringArray(webSocket.serverMessages, "webSocket.serverMessages");
  const semanticValidatorIds = stringArray(item.semanticValidatorIds, "semanticValidatorIds");
  const portableTransformIds = stringArray(item.portableTransformIds, "portableTransformIds");
  assertSortedUnique(
    routes.map((route) => route.id),
    "route ids",
  );
  assertSortedUnique(
    procedures.map((procedure) => procedure.name),
    "procedure names",
  );
  assertSortedUnique(clientMessages, "WebSocket client message names");
  assertSortedUnique(serverMessages, "WebSocket server message names");
  assertSortedUnique(semanticValidatorIds, "semantic validator ids");
  assertSortedUnique(portableTransformIds, "portable transform ids");
  for (const id of semanticValidatorIds) {
    if (!PORTABLE_VALIDATORS.has(id)) throw new Error(`unsupported semantic validator ${id}`);
  }
  for (const id of portableTransformIds) {
    if (!PORTABLE_TRANSFORMS.has(id)) throw new Error(`unsupported portable transform ${id}`);
  }
  if (portableTransformIds.length !== PORTABLE_TRANSFORMS.size) {
    throw new Error("portable transform inventory mismatch");
  }
  if (integer(inventory.routes, "inventory.routes") !== routes.length)
    throw new Error("route count mismatch");
  if (integer(inventory.procedures, "inventory.procedures") !== procedures.length)
    throw new Error("procedure count mismatch");
  if (
    integer(inventory.webSocketClientMessages, "inventory.webSocketClientMessages") !==
    clientMessages.length
  )
    throw new Error("WebSocket client count mismatch");
  if (
    integer(inventory.webSocketServerMessages, "inventory.webSocketServerMessages") !==
    serverMessages.length
  )
    throw new Error("WebSocket server count mismatch");
  const actualVoidResults = procedures.filter(
    (procedure) => procedure.result.kind === "omitted",
  ).length;
  const actualJsonResults = procedures.filter(
    (procedure) => procedure.result.kind === "json",
  ).length;
  if (
    integer(inventory.voidProcedureResults, "inventory.voidProcedureResults") !== actualVoidResults
  )
    throw new Error("void procedure result count mismatch");
  if (
    integer(inventory.jsonProcedureResults, "inventory.jsonProcedureResults") !== actualJsonResults
  )
    throw new Error("JSON procedure result count mismatch");

  if (item.unknownObjectFields !== "ignore" && item.unknownObjectFields !== "reject") {
    throw new Error("unknownObjectFields must be ignore or reject");
  }

  routes.forEach((route, index) => validateSchemaSemantics(route, `routes[${index}]`));
  procedures.forEach((procedure, index) =>
    validateSchemaSemantics(procedure, `procedures[${index}]`),
  );
  validateSchemaSemantics(webSocket, "webSocket");

  return {
    contract: "poracode.remote",
    protocolVersion: 8,
    bindingFormatVersion: 2,
    generatorVersion: 3,
    manifestFormatVersion: 1,
    sourceHash,
    manifestHash,
    unknownObjectFields: item.unknownObjectFields,
    inventory: {
      ...inventory,
      routes: routes.length,
      procedures: procedures.length,
      voidProcedureResults: integer(
        inventory.voidProcedureResults,
        "inventory.voidProcedureResults",
      ),
      jsonProcedureResults: integer(
        inventory.jsonProcedureResults,
        "inventory.jsonProcedureResults",
      ),
      webSocketClientMessages: clientMessages.length,
      webSocketServerMessages: serverMessages.length,
    },
    semanticValidatorIds,
    portableTransformIds,
    routes,
    procedures,
    webSocket: {
      clientMessages,
      serverMessages,
      clientSchema: schema(webSocket.clientSchema, "webSocket.clientSchema"),
      serverSchema: schema(webSocket.serverSchema, "webSocket.serverSchema"),
      queryCodecs: queryCodecs(webSocket.queryCodecs, "webSocket.queryCodecs"),
    },
  };
}

export function supportedPortableSemanticValidatorIds(): readonly string[] {
  return [...PORTABLE_VALIDATORS].sort(compareUnicodeCodePoints);
}
