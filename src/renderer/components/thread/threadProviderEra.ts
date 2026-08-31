import type { AppStoreState } from "@/renderer/state/slices/shared";

/**
 * Index of the first transcript item that belongs to the thread's current
 * provider — one past the last `provider_handoff` divider, or 0 when the thread
 * never switched.
 *
 * The docks show live state, not history: a plan or goal the previous provider
 * left behind is not the incoming provider's, and leaving it docked makes the
 * new session look like it adopted work it knows nothing about. The transcript
 * still keeps those rows above the divider.
 */
export function currentProviderItemStart(
  itemIds: readonly string[] | undefined,
  itemsById: AppStoreState["runtimeItemsByIdByThread"][string] | undefined,
): number {
  if (!itemIds?.length) return 0;
  for (let index = itemIds.length - 1; index >= 0; index -= 1) {
    if (itemsById?.[itemIds[index]!]?.type === "provider_handoff") return index + 1;
  }
  return 0;
}
