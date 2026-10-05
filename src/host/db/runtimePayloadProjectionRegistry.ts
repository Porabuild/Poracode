import { runtimePayloadProjections } from "poracode:runtime-payload-projections";
import type { RuntimePayloadProjectionSpec } from "@/shared/runtimePayloadProjection";

/** Stable format capability lookup; no session/provider-kind or mutable profile routing. */
export function createRuntimePayloadProjectionRegistry(
  specs: readonly RuntimePayloadProjectionSpec[],
) {
  if (specs.length > 64) throw new Error("Runtime payload projection count exceeds64.");
  const byKey = new Map<string, RuntimePayloadProjectionSpec>();
  for (const spec of specs) {
    if (
      !spec ||
      typeof spec.formatOwnerKey !== "string" ||
      !/^[a-z0-9][a-z0-9._/-]{0,127}$/.test(spec.formatOwnerKey) ||
      spec.originFormatVersion !== 1 ||
      typeof spec.normalizePersistedRuntimePayload !== "function" ||
      !Array.isArray(spec.itemTypes) ||
      spec.itemTypes.length === 0 ||
      spec.itemTypes.length > 32 ||
      spec.itemTypes.some((type) => typeof type !== "string" || !/^[a-z_]{1,64}$/.test(type)) ||
      !Number.isSafeInteger(spec.maxStoredJsonUnits) ||
      spec.maxStoredJsonUnits < 0 ||
      spec.maxStoredJsonUnits > 1048576 ||
      !Number.isSafeInteger(spec.maxWireExpansionBytes) ||
      spec.maxWireExpansionBytes < 0 ||
      spec.maxWireExpansionBytes > 1024 ||
      spec.maxDecodeExpansionBytes !== spec.maxWireExpansionBytes * 2 ||
      byKey.has(spec.formatOwnerKey)
    ) {
      throw new Error("Invalid or ambiguous runtime payload projection declaration.");
    }
    byKey.set(spec.formatOwnerKey, spec);
  }
  return byKey as ReadonlyMap<string, RuntimePayloadProjectionSpec>;
}

export const runtimePayloadProjectionRegistry =
  createRuntimePayloadProjectionRegistry(runtimePayloadProjections);
