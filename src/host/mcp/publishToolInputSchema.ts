/**
 * Project a tool input schema onto the keywords Gemini's function schema
 * accepts. A discriminated union becomes one object: the shared discriminator
 * is an enum, and a field stays required only when every branch requires it.
 * Callers keep validating arguments with the original schema.
 */

const ADVERTISED_KEYS = new Set([
  "type",
  "format",
  "description",
  "nullable",
  "enum",
  "maxItems",
  "minItems",
  "properties",
  "required",
  "items",
  "minimum",
  "maximum",
  "minLength",
  "maxLength",
  "pattern",
  "title",
  "default",
]);

const UNION_KEYS = ["oneOf", "anyOf", "allOf"] as const;
const PREFERRED_DISCRIMINATORS = ["action", "kind"];

type Json = Record<string, unknown>;

function isJson(value: unknown): value is Json {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function unique(values: readonly unknown[]): unknown[] {
  const seen = new Set<string>();
  const result: unknown[] = [];
  for (const value of values) {
    const key = JSON.stringify(value);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(value);
  }
  return result;
}

function closedValues(schema: Json): unknown[] | undefined {
  if (schema.properties || schema.items) return undefined;
  if (Object.hasOwn(schema, "const")) return [schema.const];
  if (Array.isArray(schema.enum)) return schema.enum;
  return undefined;
}

function isObjectSchema(schema: Json): boolean {
  return schema.type === "object" || isJson(schema.properties);
}

function requiredOf(schema: Json): Set<string> {
  return new Set(
    Array.isArray(schema.required) ? schema.required.filter((key) => typeof key === "string") : [],
  );
}

function unionBranches(
  schema: Json,
): { key: (typeof UNION_KEYS)[number]; branches: Json[] } | undefined {
  for (const key of UNION_KEYS) {
    const value = schema[key];
    if (!Array.isArray(value) || value.length === 0) continue;
    const branches = value.filter(isJson);
    if (branches.length === value.length) return { key, branches };
  }
  return undefined;
}

function enumType(values: readonly unknown[]): string {
  if (values.every((value) => typeof value === "string")) return "string";
  if (values.every((value) => typeof value === "boolean")) return "boolean";
  if (values.every((value) => typeof value === "number" && Number.isInteger(value))) {
    return "integer";
  }
  if (values.every((value) => typeof value === "number")) return "number";
  return "string";
}

function copyText(from: Json, key: "description" | "title", onto: Json): void {
  if (typeof onto[key] === "string") return;
  if (typeof from[key] === "string") onto[key] = from[key];
}

function mergeProperty(left: unknown, right: unknown): unknown {
  if (!isJson(left) || !isJson(right)) return left;
  if (JSON.stringify(left) === JSON.stringify(right)) return left;
  const leftClosed = closedValues(left);
  const rightClosed = closedValues(right);
  if (leftClosed && rightClosed) {
    const values = unique([...leftClosed, ...rightClosed]);
    const merged = { ...left };
    delete merged.const;
    delete merged.enum;
    return { ...merged, type: enumType(values), enum: values };
  }
  if (isObjectSchema(left) && isObjectSchema(right))
    return mergeObjects([left, right], "intersection");
  return left;
}

function mergeObjects(branches: readonly Json[], requiredMode: "intersection" | "union"): Json {
  const properties: Json = {};
  for (const branch of branches) {
    const props = isJson(branch.properties) ? branch.properties : {};
    for (const [name, schema] of Object.entries(props)) {
      properties[name] = name in properties ? mergeProperty(properties[name], schema) : schema;
    }
  }
  const closedOnEveryBranch = Object.keys(properties).filter((name) =>
    branches.every((branch) => {
      const property = isJson(branch.properties) ? branch.properties[name] : undefined;
      return isJson(property) && closedValues(property) !== undefined;
    }),
  );
  const discriminator =
    PREFERRED_DISCRIMINATORS.find((name) => closedOnEveryBranch.includes(name)) ??
    closedOnEveryBranch[0];
  if (discriminator) {
    const values = branches.flatMap((branch) => {
      const property = (branch.properties as Json)[discriminator];
      return isJson(property) ? (closedValues(property) ?? []) : [];
    });
    const current = isJson(properties[discriminator]) ? properties[discriminator] : {};
    properties[discriminator] = {
      ...(typeof current.description === "string" ? { description: current.description } : {}),
      type: enumType(values),
      enum: unique(values),
    };
  }
  const required = [...requiredOf(branches[0] ?? {})].filter((name) =>
    branches.every((branch) => requiredOf(branch).has(name)),
  );
  if (requiredMode === "union") {
    for (const branch of branches) {
      for (const name of requiredOf(branch)) {
        if (!required.includes(name) && name in properties) required.push(name);
      }
    }
  }
  const merged: Json = { type: "object", properties };
  if (required.length > 0) merged.required = required.filter((name) => name in properties);
  return merged;
}

function scalarType(schema: Json): string | undefined {
  return typeof schema.type === "string" ? schema.type : undefined;
}

function collapseUnion(
  node: Json,
  key: (typeof UNION_KEYS)[number],
  branches: readonly Json[],
): Json {
  const collapsed = branches.every(isObjectSchema)
    ? mergeObjects(branches, key === "allOf" ? "union" : "intersection")
    : (collapseScalars(branches) ?? { ...(branches.find(isObjectSchema) ?? branches[0]) });
  copyText(node, "description", collapsed);
  copyText(node, "title", collapsed);
  return collapsed;
}

function collapseScalars(branches: readonly Json[]): Json | undefined {
  if (branches.some(isObjectSchema)) return undefined;
  if (branches.every((branch) => closedValues(branch) !== undefined)) {
    const values = branches.flatMap((branch) => closedValues(branch) ?? []);
    return { type: enumType(values), enum: unique(values) };
  }
  const valued = branches.filter((branch) => scalarType(branch) !== "null");
  const includesNull = branches.some((branch) => scalarType(branch) === "null");
  if (includesNull && valued.length === 1) return { ...valued[0], nullable: true };
  const types = unique(
    branches.map(scalarType).filter((type): type is string => type !== undefined),
  );
  const nonNull = types.filter((type) => type !== "null");
  if (nonNull.length !== 1) return undefined;
  const collapsed: Json = { type: nonNull[0] };
  if (types.includes("null")) collapsed.nullable = true;
  return collapsed;
}

function rewriteConst(node: Json): void {
  if (!Object.hasOwn(node, "const")) return;
  const value = node.const;
  delete node.const;
  if (typeof value === "string") {
    node.type = "string";
    node.enum = [value];
    return;
  }
  if (typeof value === "number") {
    node.type = Number.isInteger(value) ? "integer" : "number";
    node.minimum = value;
    node.maximum = value;
  }
}

function normalizeBounds(node: Json): void {
  if (node.type !== "integer") return;
  if (typeof node.exclusiveMinimum === "number" && typeof node.minimum !== "number") {
    node.minimum = Math.floor(node.exclusiveMinimum) + 1;
  }
  if (typeof node.exclusiveMaximum === "number" && typeof node.maximum !== "number") {
    node.maximum = Math.ceil(node.exclusiveMaximum) - 1;
  }
}

function normalizeType(node: Json): void {
  if (!Array.isArray(node.type)) return;
  const types = node.type.filter((type) => type !== "null");
  if (node.type.includes("null")) node.nullable = true;
  if (types.length === 1) node.type = types[0];
  else delete node.type;
}

function flatten(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(flatten);
  if (!isJson(value)) return value;
  const node: Json = {};
  for (const [key, child] of Object.entries(value)) node[key] = flatten(child);
  const union = unionBranches(node);
  if (union) return collapseUnion(node, union.key, union.branches);
  normalizeBounds(node);
  normalizeType(node);
  return node;
}

function project(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(project);
  if (!isJson(value)) return value;
  const source = { ...value };
  rewriteConst(source);
  const next: Json = {};
  for (const [key, child] of Object.entries(source)) {
    if (!ADVERTISED_KEYS.has(key)) continue;
    if (key === "properties" && isJson(child)) {
      next.properties = Object.fromEntries(
        Object.entries(child).map(([name, property]) => [name, project(property)]),
      );
      continue;
    }
    if (key === "items") {
      next.items = project(child);
      continue;
    }
    if (key === "required" && Array.isArray(child)) {
      next.required = child.filter((name) => typeof name === "string");
      continue;
    }
    next[key] = child;
  }
  const required = next.required;
  const properties = next.properties;
  if (Array.isArray(required) && isJson(properties)) {
    const names = required.filter(
      (name): name is string => typeof name === "string" && name in properties,
    );
    if (names.length === 0) delete next.required;
    else next.required = names;
  }
  return next;
}

export function publishToolInputSchema(schema: Json): Json {
  const projected = project(flatten(schema));
  if (!isJson(projected)) return { type: "object", properties: {} };
  if (projected.type !== "object") projected.type = "object";
  if (!isJson(projected.properties)) projected.properties = {};
  return projected;
}
