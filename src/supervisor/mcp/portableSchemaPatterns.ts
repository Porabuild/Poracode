/**
 * Some model gateways validate JSON Schema patterns as Unicode regular
 * expressions. Omit malformed constraints from the advertised schema; the MCP
 * server still owns argument validation. Walk schema positions only: a property
 * named `pattern`, or a regex inside a default/example, is user data.
 */
export function omitInvalidSchemaPatterns<T>(schema: T): T {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) return schema;
  const result = { ...schema } as Record<string, unknown>;
  if (typeof result.pattern === "string") {
    try {
      RegExp(result.pattern, "u");
    } catch {
      delete result.pattern;
    }
  }
  for (const key of [
    "properties",
    "patternProperties",
    "$defs",
    "definitions",
    "dependentSchemas",
  ]) {
    const value = result[key];
    if (value && typeof value === "object" && !Array.isArray(value)) {
      result[key] = Object.fromEntries(
        Object.entries(value).map(([name, child]) => [name, omitInvalidSchemaPatterns(child)]),
      );
    }
  }
  for (const key of ["allOf", "anyOf", "oneOf", "prefixItems"]) {
    const value = result[key];
    if (Array.isArray(value)) result[key] = value.map(omitInvalidSchemaPatterns);
  }
  for (const key of [
    "items",
    "additionalItems",
    "additionalProperties",
    "unevaluatedItems",
    "unevaluatedProperties",
    "contains",
    "propertyNames",
    "not",
    "if",
    "then",
    "else",
  ]) {
    const value = result[key];
    result[key] = Array.isArray(value)
      ? value.map(omitInvalidSchemaPatterns)
      : omitInvalidSchemaPatterns(value);
    if (value === undefined) delete result[key];
  }
  return result as T;
}

/** Limit nested object/array schemas while leaving validation to the MCP server. */
export function limitToolSchemaDepth<
  T extends { inputSchema: unknown; description?: string | undefined },
>(tool: T, maxDepth: number): T {
  const root = tool.inputSchema;
  const placeholder = { description: "See the original input schema in the tool description." };
  const referenceResults = new Map<string, boolean>();

  function visit(value: unknown, depth: number, refs: ReadonlySet<string>): [unknown, boolean] {
    if (!value || typeof value !== "object" || Array.isArray(value)) return [value, false];
    const node = value as Record<string, unknown>;
    if (typeof node["$dynamicRef"] === "string" || typeof node["$recursiveRef"] === "string")
      return [placeholder, true];
    const ref = node["$ref"];
    if (typeof ref === "string") {
      // References outside this local-pointer form cannot be safely bounded here.
      if ((ref !== "#" && !ref.startsWith("#/")) || ref.includes("%")) return [placeholder, true];
      if (refs.has(ref)) return [placeholder, true];
      let target: unknown = root;
      for (const part of ref === "#" ? [] : ref.slice(2).split("/")) {
        const key = part.replaceAll("~1", "/").replaceAll("~0", "~");
        if (!target || typeof target !== "object" || !Object.hasOwn(target, key)) {
          target = undefined;
          break;
        }
        target = (target as Record<string, unknown>)[key];
      }
      if (target === undefined) return [placeholder, true];
      const cacheKey = `${depth}:${ref}`;
      let limited = referenceResults.get(cacheKey);
      if (limited === undefined) {
        limited = visit(target, depth, new Set(refs).add(ref))[1];
        referenceResults.set(cacheKey, limited);
      }
      if (limited) return [placeholder, true];
    }
    const type = node["type"];
    const container =
      type === "object" ||
      type === "array" ||
      (Array.isArray(type) && (type.includes("object") || type.includes("array"))) ||
      (type === undefined &&
        ("properties" in node || "patternProperties" in node || "items" in node));
    const nextDepth = depth + (container ? 1 : 0);
    if (nextDepth > maxDepth) return [placeholder, true];

    const result = { ...node };
    let changed = false;
    for (const key of ["properties", "patternProperties", "dependentSchemas"]) {
      const entries = node[key];
      if (!entries || typeof entries !== "object" || Array.isArray(entries)) continue;
      result[key] = Object.fromEntries(
        Object.entries(entries).map(([name, child]) => {
          const [normalized, limited] = visit(child, nextDepth, refs);
          changed ||= limited;
          return [name, normalized];
        }),
      );
    }
    for (const key of ["allOf", "anyOf", "oneOf", "prefixItems"]) {
      const entries = node[key];
      if (!Array.isArray(entries)) continue;
      result[key] = entries.map((child) => {
        const [normalized, limited] = visit(child, nextDepth, refs);
        changed ||= limited;
        return normalized;
      });
    }
    for (const key of [
      "items",
      "additionalItems",
      "additionalProperties",
      "unevaluatedItems",
      "unevaluatedProperties",
      "contains",
      "propertyNames",
      "not",
      "if",
      "then",
      "else",
    ]) {
      const child = node[key];
      if (child === undefined) continue;
      if (Array.isArray(child)) {
        result[key] = child.map((entry) => {
          const [normalized, limited] = visit(entry, nextDepth, refs);
          changed ||= limited;
          return normalized;
        });
      } else {
        const [normalized, limited] = visit(child, nextDepth, refs);
        result[key] = normalized;
        changed ||= limited;
      }
    }
    return [changed ? result : value, changed];
  }

  const [inputSchema, limited] = visit(root, 0, new Set());
  if (!limited) return tool;
  return {
    ...tool,
    inputSchema: inputSchema === placeholder ? { ...placeholder, type: "object" } : inputSchema,
    description: `${tool.description ? `${tool.description}\n\n` : ""}Original input JSON schema (the tool server is responsible for validating arguments):\n${JSON.stringify(root)}`,
  } as T;
}
