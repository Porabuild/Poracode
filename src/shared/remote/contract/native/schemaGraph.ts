import { canonicalize, sha256Hex } from "../canonical";
import { compareUnicodeCodePoints } from "../unicodeOrder";
import { stableTypeName } from "./names";
import type {
  JsonSchema,
  NativeBindingIr,
  NativeSchemaGraph,
  NativeSchemaRoot,
  NativeTypeNode,
} from "./types";

function jsonPointer(root: JsonSchema, reference: string): JsonSchema {
  if (!reference.startsWith("#/"))
    throw new Error(`Only local JSON Schema references are supported: ${reference}`);
  let current: unknown = root;
  for (const encoded of reference.slice(2).split("/")) {
    const key = encoded.replaceAll("~1", "/").replaceAll("~0", "~");
    if (!current || typeof current !== "object" || Array.isArray(current) || !(key in current)) {
      throw new Error(`Unresolved local JSON Schema reference: ${reference}`);
    }
    current = (current as Record<string, unknown>)[key];
  }
  if (!current || typeof current !== "object" || Array.isArray(current)) {
    throw new Error(`JSON Schema reference does not target an object: ${reference}`);
  }
  return current as JsonSchema;
}

/** Resolve a schema's private `$defs` namespace and reject external or cyclic references. */
export function resolveLocalSchemaReferences(schema: JsonSchema): JsonSchema {
  const resolving = new Set<string>();
  const visit = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(visit);
    if (!value || typeof value !== "object") return value;
    const item = value as Record<string, unknown>;
    if (typeof item.$ref === "string") {
      const reference = item.$ref;
      if (resolving.has(reference))
        throw new Error(`Cyclic local JSON Schema reference: ${reference}`);
      resolving.add(reference);
      const resolved = visit(jsonPointer(schema, reference));
      resolving.delete(reference);
      if (!resolved || typeof resolved !== "object" || Array.isArray(resolved)) return resolved;
      const siblings = Object.fromEntries(
        Object.entries(item)
          .filter(([key]) => key !== "$ref")
          .map(([key, nested]) => [key, visit(nested)]),
      );
      return { ...(resolved as Record<string, unknown>), ...siblings };
    }
    return Object.fromEntries(
      Object.entries(item)
        .filter(([key]) => key !== "$defs" && key !== "$schema")
        .map(([key, nested]) => [key, visit(nested)]),
    );
  };
  return visit(schema) as JsonSchema;
}

export function structuralSchemaHash(schema: JsonSchema): string {
  return sha256Hex(canonicalize(schema));
}

function schemaChildren(
  schema: JsonSchema,
): Array<{ readonly label: string; readonly schema: JsonSchema }> {
  const children: Array<{ label: string; schema: JsonSchema }> = [];
  const properties = schema.properties;
  if (properties && typeof properties === "object" && !Array.isArray(properties)) {
    for (const key of Object.keys(properties).sort(compareUnicodeCodePoints)) {
      const child = (properties as Record<string, unknown>)[key];
      if (child && typeof child === "object" && !Array.isArray(child)) {
        children.push({ label: key, schema: child as JsonSchema });
      }
    }
  }
  if (schema.items && typeof schema.items === "object" && !Array.isArray(schema.items)) {
    children.push({ label: "item", schema: schema.items as JsonSchema });
  }
  if (
    schema.additionalProperties &&
    typeof schema.additionalProperties === "object" &&
    !Array.isArray(schema.additionalProperties)
  ) {
    children.push({ label: "value", schema: schema.additionalProperties as JsonSchema });
  }
  if (
    schema.propertyNames &&
    typeof schema.propertyNames === "object" &&
    !Array.isArray(schema.propertyNames)
  ) {
    children.push({ label: "property-name", schema: schema.propertyNames as JsonSchema });
  }
  for (const unionKey of ["oneOf", "anyOf"] as const) {
    const options = schema[unionKey];
    if (!Array.isArray(options)) continue;
    options.forEach((option, index) => {
      if (option && typeof option === "object" && !Array.isArray(option)) {
        children.push({ label: `option-${index + 1}`, schema: option as JsonSchema });
      }
    });
  }
  return children;
}

function isNamedSchema(schema: JsonSchema): boolean {
  return (
    schema.type === "object" ||
    Array.isArray(schema.oneOf) ||
    Array.isArray(schema.anyOf) ||
    Array.isArray(schema.enum) ||
    schema.const !== undefined
  );
}

function unionVariants(schema: JsonSchema): JsonSchema[] {
  const variants = Array.isArray(schema.oneOf)
    ? schema.oneOf
    : Array.isArray(schema.anyOf)
      ? schema.anyOf
      : [];
  return variants.filter((variant): variant is JsonSchema =>
    Boolean(variant && typeof variant === "object" && !Array.isArray(variant)),
  );
}

function wsVariant(schema: JsonSchema, type: string): JsonSchema {
  const resolved = resolveLocalSchemaReferences(schema);
  for (const option of unionVariants(resolved)) {
    const properties = option.properties as Record<string, JsonSchema> | undefined;
    if (properties?.type?.const === type) return option;
  }
  throw new Error(`WebSocket schema is missing declared ${type} variant`);
}

export function collectNativeSchemaRoots(ir: NativeBindingIr): NativeSchemaRoot[] {
  const roots: NativeSchemaRoot[] = [];
  for (const route of ir.routes) {
    const prefix = `Route${route.id}`;
    if (route.request.jsonSchema) {
      roots.push({
        id: `route.${route.id}.request`,
        preferredName: `${prefix}Request`,
        schema: route.request.jsonSchema,
        transport: route.request.bodyKind,
      });
    }
    if (route.request.querySchema) {
      roots.push({
        id: `route.${route.id}.query`,
        preferredName: `${prefix}Query`,
        schema: route.request.querySchema,
        transport: "query",
      });
    }
    if (route.request.pathSchema) {
      roots.push({
        id: `route.${route.id}.path`,
        preferredName: `${prefix}Path`,
        schema: route.request.pathSchema,
        transport: "path",
      });
    }
    if (route.response.jsonSchema) {
      roots.push({
        id: `route.${route.id}.response`,
        preferredName: `${prefix}Response`,
        schema: route.response.jsonSchema,
        transport: route.response.wireKind,
      });
    }
  }
  for (const procedure of ir.procedures) {
    const prefix = `Procedure${procedure.name}`;
    roots.push({
      id: `procedure.${procedure.name}.request`,
      preferredName: `${prefix}Request`,
      schema: procedure.request,
      transport: "json",
    });
    if (procedure.result.kind === "json") {
      roots.push({
        id: `procedure.${procedure.name}.result`,
        preferredName: `${prefix}Result`,
        schema: procedure.result.schema,
        transport: "json",
      });
    }
  }
  roots.push({
    id: "websocket.client",
    preferredName: "WebSocketClientMessage",
    schema: ir.webSocket.clientSchema,
    transport: "websocket",
  });
  roots.push({
    id: "websocket.server",
    preferredName: "WebSocketServerMessage",
    schema: ir.webSocket.serverSchema,
    transport: "websocket",
  });
  for (const type of ir.webSocket.clientMessages) {
    roots.push({
      id: `websocket.client.${type}`,
      preferredName: `WebSocketClient${type}`,
      schema: wsVariant(ir.webSocket.clientSchema, type),
      transport: "websocket",
    });
  }
  for (const type of ir.webSocket.serverMessages) {
    roots.push({
      id: `websocket.server.${type}`,
      preferredName: `WebSocketServer${type}`,
      schema: wsVariant(ir.webSocket.serverSchema, type),
      transport: "websocket",
    });
  }
  return roots.sort((left, right) => compareUnicodeCodePoints(left.id, right.id));
}

export function buildNativeSchemaGraph(roots: readonly NativeSchemaRoot[]): NativeSchemaGraph {
  const schemas = new Map<string, JsonSchema>();
  const preferredNames = new Map<string, Set<string>>();
  const visit = (schema: JsonSchema, preferredName: string): void => {
    const hash = structuralSchemaHash(schema);
    const existing = schemas.get(hash);
    if (existing && canonicalize(existing) !== canonicalize(schema)) {
      throw new Error(`Structural schema hash collision: ${hash}`);
    }
    schemas.set(hash, schema);
    const names = preferredNames.get(hash) ?? new Set<string>();
    names.add(preferredName);
    preferredNames.set(hash, names);
    for (const child of schemaChildren(schema)) {
      visit(child.schema, `${preferredName}-${child.label}`);
    }
  };

  const resolvedRoots = roots.map((root) => ({
    ...root,
    schema: resolveLocalSchemaReferences(root.schema),
  }));
  for (const root of resolvedRoots) visit(root.schema, root.preferredName);

  const nodesByHash = new Map<string, NativeTypeNode>();
  for (const [hash, schema] of schemas) {
    if (
      !isNamedSchema(schema) &&
      !resolvedRoots.some((root) => structuralSchemaHash(root.schema) === hash)
    )
      continue;
    const candidates = [...(preferredNames.get(hash) ?? [])].sort(compareUnicodeCodePoints);
    nodesByHash.set(hash, {
      hash,
      name: stableTypeName(candidates[0] ?? "Anonymous", hash),
      schema,
    });
  }
  const nodes = [...nodesByHash.values()].sort((left, right) =>
    compareUnicodeCodePoints(left.name, right.name),
  );
  const rootMap = new Map<string, NativeTypeNode>();
  for (const root of resolvedRoots) {
    const hash = structuralSchemaHash(root.schema);
    const node = nodesByHash.get(hash) ?? {
      hash,
      name: stableTypeName(root.preferredName, hash),
      schema: root.schema,
    };
    rootMap.set(root.id, node);
    if (!nodesByHash.has(hash)) {
      nodesByHash.set(hash, node);
      nodes.push(node);
    }
  }
  nodes.sort((left, right) => compareUnicodeCodePoints(left.name, right.name));
  const validationNodes = [...schemas.entries()]
    .map(([hash, schema]) => ({ hash, name: `Schema_${hash.slice(0, 12)}`, schema }))
    .sort((left, right) => compareUnicodeCodePoints(left.hash, right.hash));
  return { roots: rootMap, nodes, validationNodes };
}
