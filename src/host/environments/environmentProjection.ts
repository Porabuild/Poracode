import {
  environmentProjectionSchema,
  type EnvironmentProjection,
  type EnvironmentRecord,
} from "@/shared/environments";

/**
 * Recursively freeze a projection so a returned value is immutable (callers
 * cannot mutate shared store state through a read result).
 */
export function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const key of Object.keys(value)) {
    deepFreeze((value as Record<string, unknown>)[key]);
  }
  return value;
}

/**
 * Project a durable record for authorized remote readers. The configured SSH
 * target and port are included (ADR §2) so clients can display and edit the
 * target accurately. Redacted by construction: `credentialRef` (an opaque host
 * reference), local tunnel endpoints or ports, device identity-file paths, and
 * tokens are never copied.
 */
export function environmentProjection(record: EnvironmentRecord): EnvironmentProjection {
  const projection = environmentProjectionSchema.parse({
    environmentId: record.environmentId,
    revision: record.revision,
    label: record.label,
    target: record.target,
    ...(record.port === undefined ? {} : { port: record.port }),
    trust: record.trust,
    runtime: record.runtime,
    credential: record.credentialRef === undefined ? "none" : "configured",
    legacyConnectionIds: [...record.legacyConnectionIds],
    desired: record.desired,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    ...(record.childIdentity === undefined ? {} : { childIdentity: record.childIdentity }),
  });
  return deepFreeze(projection);
}

export function environmentProjections(
  records: readonly EnvironmentRecord[],
): readonly EnvironmentProjection[] {
  return Object.freeze(records.map(environmentProjection));
}
