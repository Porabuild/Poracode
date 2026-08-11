import { readBridge } from "@/renderer/bridge";
import { useProviderUsageStore } from "@/renderer/state/providerUsageStore";

/**
 * Force-collect one provider and merge the reply into the usage store so the
 * rail/panel update immediately. The supervisor also broadcasts `provider-usage`,
 * but merging the IPC reply avoids the round-trip lag. Errors surface as the
 * provider's own error snapshot via that broadcast.
 *
 * Always uses `force: true` so a concurrent background poll that started before
 * a login / API-key paste / enable cannot be coalesced and returned as the
 * post-auth result.
 */
export async function refreshAndMergeProviderUsage(providerId: string): Promise<void> {
  try {
    const usage = await readBridge().refreshProviderUsage({
      providerIds: [providerId],
      force: true,
    });
    const fresh = usage.snapshots.find((s) => s.providerId === providerId);
    if (fresh) useProviderUsageStore.getState().mergeSnapshot(fresh);
  } catch {
    // Supervisor broadcasts the error snapshot; ignore the rejected promise here.
  }
}
