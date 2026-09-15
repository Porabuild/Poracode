import { z } from "zod";
import { remoteAgentSettingsSchema, remotePushRegistrationRoutingSchema } from "../protocol";
import { compareUnicodeCodePoints } from "./unicodeOrder";
import { remoteSettingsWireSchema } from "./routeSchemas";

export const PORTABLE_TRANSFORM_IDS = [
  "agent-settings.strip-sensitive",
  "push.routing.client-connection-id.lowercase",
  "string.trim",
] as const;

export type PortableTransformId = (typeof PORTABLE_TRANSFORM_IDS)[number];

interface ZodDef {
  readonly type?: string;
  readonly checks?: readonly z.ZodType[];
  readonly shape?: Record<string, z.ZodType>;
  readonly options?: readonly z.ZodType[];
  readonly in?: z.ZodType;
  readonly out?: z.ZodType;
  readonly innerType?: z.ZodType;
  readonly element?: z.ZodType;
  readonly keyType?: z.ZodType;
  readonly valueType?: z.ZodType;
  readonly schema?: z.ZodType;
}

function def(schema: z.ZodType): ZodDef {
  return (schema as unknown as { _zod?: { def?: ZodDef } })._zod?.def ?? {};
}

function objectProperty(schema: z.ZodType, name: string): z.ZodType {
  const property = (schema as unknown as { shape?: Record<string, z.ZodType> }).shape?.[name];
  if (!property) throw new Error(`Unable to register portable transform for property ${name}`);
  return property;
}

const clientConnectionIdSchema = objectProperty(
  remotePushRegistrationRoutingSchema,
  "clientConnectionId",
);

const EXPLICIT = new Map<z.ZodType, PortableTransformId>([
  [remoteAgentSettingsSchema, "agent-settings.strip-sensitive"],
  [remoteSettingsWireSchema.shape.agentSettings, "agent-settings.strip-sensitive"],
  [clientConnectionIdSchema, "push.routing.client-connection-id.lowercase"],
]);

function isEcmaTrimOverwrite(check: z.ZodType): boolean {
  const checkDef = def(check) as ZodDef & { readonly check?: string; readonly tx?: unknown };
  if (checkDef.check !== "overwrite" || typeof checkDef.tx !== "function") return false;
  const transform = checkDef.tx as (value: unknown) => unknown;
  const probes = [" x ", "\uFEFFx\uFEFF", "\u1680x\u3000", "x y", "\u200Bx\u200B"];
  return probes.every((value) => transform(value) === value.trim());
}

function directTransformIds(schema: z.ZodType): PortableTransformId[] {
  const ids: PortableTransformId[] = [];
  const explicit = EXPLICIT.get(schema);
  if (explicit) ids.push(explicit);
  for (const check of def(schema).checks ?? []) {
    if (isEcmaTrimOverwrite(check)) ids.push("string.trim");
  }
  return [...new Set(ids)].sort(compareUnicodeCodePoints);
}

function children(schema: z.ZodType): z.ZodType[] {
  const item = def(schema);
  return [
    ...Object.values(item.shape ?? {}),
    ...(item.options ?? []),
    ...[
      item.in,
      item.out,
      item.innerType,
      item.element,
      item.keyType,
      item.valueType,
      item.schema,
    ].filter((value): value is z.ZodType => Boolean(value)),
  ];
}

/** Fail closed before JSON Schema conversion if any reachable transform/overwrite
 * lacks an executable portable transform ID. */
export function assertPortableTransformsRegistered(root: z.ZodType): void {
  const seen = new Set<z.ZodType>();
  const visit = (schema: z.ZodType, coveredBy?: PortableTransformId): void => {
    if (seen.has(schema)) return;
    seen.add(schema);
    const item = def(schema);
    const direct = directTransformIds(schema)[0] ?? coveredBy;
    if (item.type === "transform" && !direct) {
      throw new Error("Reachable Zod transform has no registered portable implementation");
    }
    for (const check of item.checks ?? []) {
      const checkDef = def(check) as ZodDef & { readonly check?: string };
      if (checkDef.check === "overwrite" && !isEcmaTrimOverwrite(check)) {
        throw new Error("Reachable Zod overwrite has no registered portable implementation");
      }
    }
    for (const child of children(schema)) {
      visit(child, item.type === "pipe" && child === item.out ? direct : undefined);
    }
  };
  visit(root);
}

export function portableTransformIdsForSchema(schema: z.ZodType): readonly PortableTransformId[] {
  return directTransformIds(schema);
}

export function collectRegisteredPortableTransformIds(): string[] {
  return [...PORTABLE_TRANSFORM_IDS].sort(compareUnicodeCodePoints);
}
