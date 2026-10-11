import { z } from "zod";
import type { RemoteObjectUnknownFieldPolicy } from "./types";

interface ZodInternals {
  readonly _zod?: {
    readonly def?: {
      readonly type?: string;
      readonly catchall?: ZodInternals;
      readonly schema?: ZodInternals;
      readonly innerType?: ZodInternals;
    };
  };
}

function zodDef(
  schema: unknown,
): ZodInternals["_zod"] extends infer Z
  ? Z extends { def?: infer D }
    ? D
    : undefined
  : undefined {
  if (!schema || typeof schema !== "object") return undefined as never;
  return (schema as ZodInternals)._zod?.def as never;
}

export function unwrapZodSchema(schema: z.ZodType): z.ZodType {
  let current: z.ZodType = schema;
  for (let depth = 0; depth < 12; depth += 1) {
    const def = zodDef(current) as
      | { type?: string; schema?: z.ZodType; innerType?: z.ZodType }
      | undefined;
    if (!def) break;
    if (
      (def.type === "optional" ||
        def.type === "nullable" ||
        def.type === "default" ||
        def.type === "transform" ||
        def.type === "pipe" ||
        def.type === "readonly" ||
        def.type === "catch") &&
      (def.schema || def.innerType)
    ) {
      current = (def.schema ?? def.innerType)!;
      continue;
    }
    break;
  }
  return current;
}

/**
 * Zod 4 object unknown-key policies:
 * - default object: no catchall → strip
 * - `.strict()` / `strictObject()`: catchall `never` → reject
 * - `.passthrough()` / `looseObject()`: catchall `unknown` → passthrough
 */
export function zodObjectUnknownFieldPolicy(
  schema: z.ZodType,
): RemoteObjectUnknownFieldPolicy | undefined {
  const unwrapped = unwrapZodSchema(schema);
  const def = zodDef(unwrapped) as { type?: string; catchall?: unknown } | undefined;
  if (def?.type !== "object") return undefined;
  const catchallType = zodDef(def.catchall)?.type;
  if (catchallType === "never") return "reject";
  if (catchallType === "unknown") return "passthrough";
  return "strip";
}

export function annotateUnknownFieldPolicy(
  jsonSchema: Record<string, unknown>,
  policy: RemoteObjectUnknownFieldPolicy,
): Record<string, unknown> {
  const next = { ...jsonSchema };
  next["x-poracode-unknownFields"] = policy;
  if (policy === "reject") {
    next.additionalProperties = false;
    return next;
  }
  if (policy === "passthrough") {
    if (next.additionalProperties === false || next.additionalProperties === undefined) {
      next.additionalProperties = true;
    }
    return next;
  }
  // strip: override Zod 4's additionalProperties:false so extras stay legal
  // on the wire. Do not apply this to reject/passthrough objects.
  next.additionalProperties = true;
  return next;
}
