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
