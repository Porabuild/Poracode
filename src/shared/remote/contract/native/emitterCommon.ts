import { compareUnicodeCodePoints } from "../unicodeOrder";
import { collisionSuffix, stableMemberName } from "./names";
import { structuralSchemaHash } from "./schemaGraph";
import type { JsonSchema, NativeBindingIr, NativeSchemaGraph, NativeTypeNode } from "./types";

export const NATIVE_SEMANTIC_VALIDATOR_IDS = [
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
] as const;

export function assertNativeSemanticValidatorCoverage(ir: NativeBindingIr): void {
  const implemented = new Set<string>(NATIVE_SEMANTIC_VALIDATOR_IDS);
  for (const id of ir.semanticValidatorIds) {
    if (!implemented.has(id)) {
      throw new Error(`No executable native semantic validator implementation for ${id}`);
    }
  }
}

const SUPPORTED_SCHEMA_KEYWORDS = new Set([
  "additionalProperties",
  "anyOf",
  "const",
  "default",
  "description",
  "enum",
  "exclusiveMaximum",
  "exclusiveMinimum",
  "format",
  "items",
  "maximum",
  "maxItems",
  "maxLength",
  "minimum",
  "minItems",
  "minLength",
  "oneOf",
  "pattern",
  "properties",
  "propertyNames",
  "required",
  "title",
  "type",
  "x-poracode-semanticValidators",
  "x-poracode-transforms",
  "x-poracode-unknownFields",
]);

/** Fail closed when the authoritative graph gains validation semantics we do not emit. */
export function assertNativeSchemaKeywordCoverage(graph: NativeSchemaGraph): void {
  for (const node of graph.validationNodes) {
    for (const keyword of Object.keys(node.schema)) {
      if (!SUPPORTED_SCHEMA_KEYWORDS.has(keyword)) {
        throw new Error(`No executable native JSON Schema implementation for ${keyword}`);
      }
    }
  }
}

export function supportedNativeSchemaKeywords(): readonly string[] {
  return [...SUPPORTED_SCHEMA_KEYWORDS].sort(compareUnicodeCodePoints);
}

export function validationSchemaMemberName(schema: JsonSchema): string {
  return `schema_${structuralSchemaHash(schema).slice(0, 16)}`;
}

export function validationFunctionName(schema: JsonSchema): string {
  return `validate_${structuralSchemaHash(schema).slice(0, 16)}`;
}

export interface NativeRootAdapter {
  readonly id: string;
  readonly memberName: string;
  readonly typeName: string;
  readonly schema: JsonSchema;
}

export function rootAdapters(
  graph: NativeSchemaGraph,
  language: "swift" | "kotlin",
): NativeRootAdapter[] {
  const baseNames = new Map<string, string[]>();
  for (const id of graph.roots.keys()) {
    const base = stableMemberName(id, language);
    baseNames.set(base, [...(baseNames.get(base) ?? []), id]);
  }
  return [...graph.roots.entries()]
    .sort(([left], [right]) => compareUnicodeCodePoints(left, right))
    .map(([id, node]) => {
      const base = stableMemberName(id, language);
      return {
        id,
        memberName:
          (baseNames.get(base)?.length ?? 0) > 1 ? `${base}_${collisionSuffix(id)}` : base,
        typeName: node.name,
        schema: node.schema,
      };
    });
}

export interface NativeField {
  readonly wireName: string;
  readonly memberName: string;
  readonly schema: JsonSchema;
  readonly required: boolean;
  readonly nullable: boolean;
}

export type NativeJsonLiteral = string | number | boolean | null;

export interface NativeUnionDiscriminator {
  readonly property: string;
  readonly optionValues: readonly (readonly NativeJsonLiteral[])[];
}

function schemaLiteralValues(schema: JsonSchema): NativeJsonLiteral[] {
  const values = Array.isArray(schema.enum)
    ? schema.enum
    : schema.const !== undefined
      ? [schema.const]
      : [];
  return values.filter(
    (value): value is NativeJsonLiteral =>
      value === null ||
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean",
  );
}

function literalsOverlap(
  left: readonly NativeJsonLiteral[],
  right: readonly NativeJsonLiteral[],
): boolean {
  return left.some((leftValue) => right.some((rightValue) => Object.is(leftValue, rightValue)));
}

/** Find a required literal property whose values select exactly one union option. */
export function unionDiscriminator(
  options: readonly JsonSchema[],
): NativeUnionDiscriminator | undefined {
  if (options.length === 0 || options.some((option) => option.type !== "object")) return undefined;
  const firstProperties = options[0]?.properties;
  if (!firstProperties || typeof firstProperties !== "object" || Array.isArray(firstProperties))
    return undefined;
  for (const property of Object.keys(firstProperties).sort(compareUnicodeCodePoints)) {
    const optionValues: NativeJsonLiteral[][] = [];
    let valid = true;
    for (const option of options) {
      const required = new Set(Array.isArray(option.required) ? option.required : []);
      const properties = option.properties;
      const propertySchema =
        properties && typeof properties === "object" && !Array.isArray(properties)
          ? (properties as Record<string, unknown>)[property]
          : undefined;
      if (
        !required.has(property) ||
        !propertySchema ||
        typeof propertySchema !== "object" ||
        Array.isArray(propertySchema)
      ) {
        valid = false;
        break;
      }
      const values = schemaLiteralValues(propertySchema as JsonSchema);
      if (values.length === 0) {
        valid = false;
        break;
      }
      optionValues.push(values);
    }
    if (!valid) continue;
    const disjoint = optionValues.every((values, index) =>
      optionValues.slice(index + 1).every((other) => !literalsOverlap(values, other)),
    );
    if (disjoint) return { property, optionValues };
  }
  return undefined;
}

export function unionOptionLiterals(schema: JsonSchema): readonly NativeJsonLiteral[] {
  return schemaLiteralValues(schema);
}

export function schemaUnionOptions(schema: JsonSchema): JsonSchema[] {
  const raw = Array.isArray(schema.oneOf)
    ? schema.oneOf
    : Array.isArray(schema.anyOf)
      ? schema.anyOf
      : [];
  return raw.filter((option): option is JsonSchema =>
    Boolean(option && typeof option === "object" && !Array.isArray(option)),
  );
}

export function schemaUnionKind(schema: JsonSchema): "oneOf" | "anyOf" | undefined {
  if (Array.isArray(schema.oneOf)) return "oneOf";
  if (Array.isArray(schema.anyOf)) return "anyOf";
  return undefined;
}

export function unwrapNullable(schema: JsonSchema): {
  readonly schema: JsonSchema;
  readonly nullable: boolean;
} {
  const options = schemaUnionOptions(schema);
  if (options.length === 2) {
    const nonNull = options.filter((option) => option.type !== "null");
    if (nonNull.length === 1) return { schema: nonNull[0]!, nullable: true };
  }
  if (Array.isArray(schema.type) && schema.type.includes("null")) {
    const types = schema.type.filter((type) => type !== "null");
    if (types.length === 1) return { schema: { ...schema, type: types[0] }, nullable: true };
  }
  return { schema, nullable: schema.type === "null" };
}

export function objectFields(schema: JsonSchema, language: "swift" | "kotlin"): NativeField[] {
  const properties =
    schema.properties && typeof schema.properties === "object" && !Array.isArray(schema.properties)
      ? (schema.properties as Record<string, unknown>)
      : {};
  const required = new Set(Array.isArray(schema.required) ? schema.required : []);
  const baseNames = new Map<string, string[]>();
  for (const wireName of Object.keys(properties)) {
    const name = stableMemberName(wireName, language);
    const values = baseNames.get(name) ?? [];
    values.push(wireName);
    baseNames.set(name, values);
  }
  return Object.keys(properties)
    .sort(compareUnicodeCodePoints)
    .map((wireName) => {
      const raw = properties[wireName];
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
        throw new Error(`Object property ${wireName} is not a JSON Schema`);
      }
      const unwrapped = unwrapNullable(raw as JsonSchema);
      const base = stableMemberName(wireName, language);
      const collides = (baseNames.get(base)?.length ?? 0) > 1;
      return {
        wireName,
        memberName: collides ? `${base}_${collisionSuffix(wireName)}` : base,
        schema: unwrapped.schema,
        required: required.has(wireName),
        nullable: unwrapped.nullable,
      };
    });
}

export function nodeForSchema(
  graph: NativeSchemaGraph,
  schema: JsonSchema,
): NativeTypeNode | undefined {
  const hash = structuralSchemaHash(schema);
  return graph.nodes.find((node) => node.hash === hash);
}

export function semanticIds(schema: JsonSchema): string[] {
  const raw = schema["x-poracode-semanticValidators"];
  return Array.isArray(raw)
    ? raw
        .filter((value): value is string => typeof value === "string")
        .sort(compareUnicodeCodePoints)
    : [];
}

export function transformIds(schema: JsonSchema): string[] {
  const raw = schema["x-poracode-transforms"];
  return Array.isArray(raw) ? raw.filter((id): id is string => typeof id === "string") : [];
}

export function unknownFieldPolicy(schema: JsonSchema): "strip" | "reject" | "passthrough" {
  const policy = schema["x-poracode-unknownFields"];
  if (policy === "reject" || policy === "passthrough") return policy;
  return "strip";
}

export function shardDeclarations(args: {
  readonly extension: string;
  readonly prefix: string;
  readonly header: readonly string[];
  readonly declarations: readonly (readonly string[])[];
  readonly maxLines?: number;
}): Array<{ readonly path: string; readonly contents: string }> {
  const maxLines = args.maxLines ?? 450;
  const files: Array<{ path: string; contents: string }> = [];
  let lines = [...args.header];
  let index = 1;
  const flush = () => {
    if (lines.length === args.header.length) return;
    const path = `${args.prefix}${String(index).padStart(3, "0")}.${args.extension}`;
    files.push({ path, contents: `${lines.join("\n")}\n` });
    index += 1;
    lines = [...args.header];
  };
  for (const declaration of args.declarations) {
    if (args.header.length + declaration.length + 1 > maxLines) {
      throw new Error(`Generated declaration exceeds ${maxLines} lines`);
    }
    if (lines.length + declaration.length + 1 > maxLines) flush();
    if (lines.length > args.header.length) lines.push("");
    lines.push(...declaration);
  }
  flush();
  return files;
}
