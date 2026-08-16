import { z } from "zod";
import { omittedResultSchema } from "../../ipc/resultCodec";
import { compareUnicodeCodePoints } from "./unicodeOrder";
import { annotateUnknownFieldPolicy, zodObjectUnknownFieldPolicy } from "./unknownFields";
import { semanticValidatorsForSchema } from "./semanticValidators";
import {
  assertPortableTransformsRegistered,
  portableTransformIdsForSchema,
} from "./portableTransforms";
import { REMOTE_JSON_SCHEMA_DIALECT } from "./versions";

export const OMITTED_RESULT_JSON_SCHEMA = {
  $comment: "Void/unit result. The JSON field is omitted; null is not a valid unit value.",
  not: { type: ["null", "object", "array", "string", "number", "boolean"] },
  "x-poracode-wire": "omitted",
  "x-poracode-semanticValidators": ["void-result.omit-field"],
} as const;

function sortRecord(record: Record<string, unknown>): Record<string, unknown> {
  const next: Record<string, unknown> = {};
  for (const key of Object.keys(record).sort(compareUnicodeCodePoints)) {
    next[key] = record[key];
  }
  return next;
}

function unwrapTransforms(schema: z.ZodType): z.ZodType {
  let current: z.ZodType = schema;
  for (let depth = 0; depth < 8; depth += 1) {
    const def = (current as { _zod?: { def?: { type?: string; schema?: z.ZodType } } })._zod?.def;
    if (def?.type === "transform" && def.schema) {
      current = def.schema;
      continue;
    }
    break;
  }
  return current;
}

interface TraversableDef {
  readonly type?: string;
  readonly shape?: Record<string, z.ZodType>;
  readonly options?: readonly z.ZodType[];
  readonly in?: z.ZodType;
  readonly innerType?: z.ZodType;
  readonly element?: z.ZodType;
  readonly keyType?: z.ZodType;
  readonly valueType?: z.ZodType;
}

function annotatePortableTransforms(
  zodSchema: z.ZodType,
  jsonSchema: Record<string, unknown>,
  root: Record<string, unknown>,
  seen = new Set<z.ZodType>(),
): void {
  if (seen.has(zodSchema)) return;
  seen.add(zodSchema);
  let target = jsonSchema;
  if (typeof target.$ref === "string" && target.$ref.startsWith("#/$defs/")) {
    const name = target.$ref.slice("#/$defs/".length);
    const referenced = (root.$defs as Record<string, unknown> | undefined)?.[name];
    if (referenced && typeof referenced === "object" && !Array.isArray(referenced)) {
      target = referenced as Record<string, unknown>;
    }
  }
  const ids = portableTransformIdsForSchema(zodSchema);
  if (ids.length > 0) target["x-poracode-transforms"] = ids;
  const item = (zodSchema as unknown as { _zod?: { def?: TraversableDef } })._zod?.def ?? {};
  if (item.type === "pipe" && item.in) annotatePortableTransforms(item.in, target, root, seen);
  if (item.innerType) annotatePortableTransforms(item.innerType, target, root, seen);
  if (item.shape && target.properties && typeof target.properties === "object") {
    for (const [name, child] of Object.entries(item.shape)) {
      const nested = (target.properties as Record<string, unknown>)[name];
      if (nested && typeof nested === "object" && !Array.isArray(nested)) {
        annotatePortableTransforms(child, nested as Record<string, unknown>, root, seen);
      }
    }
  }
  if (
    item.element &&
    target.items &&
    typeof target.items === "object" &&
    !Array.isArray(target.items)
  ) {
    annotatePortableTransforms(item.element, target.items as Record<string, unknown>, root, seen);
  }
  if (
    item.valueType &&
    target.additionalProperties &&
    typeof target.additionalProperties === "object"
  ) {
    annotatePortableTransforms(
      item.valueType,
      target.additionalProperties as Record<string, unknown>,
      root,
      seen,
    );
  }
  if (item.keyType && target.propertyNames && typeof target.propertyNames === "object") {
    annotatePortableTransforms(
      item.keyType,
      target.propertyNames as Record<string, unknown>,
      root,
      seen,
    );
  }
  const jsonOptions = (target.oneOf ?? target.anyOf) as unknown;
  if (item.options && Array.isArray(jsonOptions)) {
    item.options.forEach((child, index) => {
      const nested = jsonOptions[index];
      if (nested && typeof nested === "object" && !Array.isArray(nested)) {
        annotatePortableTransforms(child, nested as Record<string, unknown>, root, seen);
      }
    });
  }
}

export function zodToJsonSchema(schema: z.ZodType, io: "input" | "output"): unknown {
  if (schema === omittedResultSchema) {
    return { ...OMITTED_RESULT_JSON_SCHEMA };
  }
  assertPortableTransformsRegistered(schema);
  const raw = z.toJSONSchema(unwrapTransforms(schema), {
    target: "draft-2020-12",
    io,
    reused: "ref",
    override: (ctx) => {
      const json = ctx.jsonSchema as Record<string, unknown>;
      const zodSchema = ctx.zodSchema;
      if (!zodSchema || typeof zodSchema !== "object") return;
      const policy = zodObjectUnknownFieldPolicy(zodSchema as unknown as z.ZodType);
      if (policy && json.type === "object") {
        Object.assign(json, annotateUnknownFieldPolicy(json, policy));
      }
      const semantic = semanticValidatorsForSchema(zodSchema as unknown as z.ZodType);
      if (semantic.length > 0) {
        json["x-poracode-semanticValidators"] = semantic.map((entry) => entry.id);
      }
      const transforms = portableTransformIdsForSchema(zodSchema as unknown as z.ZodType);
      if (transforms.length > 0) json["x-poracode-transforms"] = transforms;
    },
  });
  const processed = raw as Record<string, unknown>;
  annotatePortableTransforms(schema, processed, processed);
  processed.$schema = REMOTE_JSON_SCHEMA_DIALECT;
  return sortRecord(processed);
}
