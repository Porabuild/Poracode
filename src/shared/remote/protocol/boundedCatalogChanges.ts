import { REMOTE_BOUNDED_CATALOG_CHANGES_VERSION } from "./core";

export { REMOTE_BOUNDED_CATALOG_CHANGES_VERSION };

/**
 * Per-connection declaration value for the bounded catalog-change notification
 * contract. The WS upgrade carries `catalogChanges=bounded-v1`; only the exact
 * value counts (fail closed), and it is honored only alongside `session:read`
 * — a connection without transcript read scope is treated as undeclared and
 * keeps receiving the legacy full list.
 */
export const REMOTE_BOUNDED_CATALOG_CHANGES_DECLARATION = "bounded-v1" as const;

/** WS upgrade query parameter carrying the {@link REMOTE_BOUNDED_CATALOG_CHANGES_DECLARATION}. */
export const REMOTE_BOUNDED_CATALOG_CHANGES_WS_PARAM = "catalogChanges" as const;

/**
 * True only when a host advertised `capabilities.boundedCatalogChanges`
 * version 1. A client uses this as the single pre-flight gate before adding the
 * upgrade declaration: an old host has no signal form at all (it always sends
 * the full list) and strips unknown capability keys, so declaring there would
 * only misclassify the frames the host actually sends.
 */
export function hostSupportsBoundedCatalogChanges(
  capability: { readonly versions: readonly number[] } | undefined,
): boolean {
  return capability?.versions.includes(REMOTE_BOUNDED_CATALOG_CHANGES_VERSION) === true;
}
