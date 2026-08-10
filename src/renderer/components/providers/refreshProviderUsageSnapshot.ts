import { readBridge } from "@/renderer/bridge";
import { useProviderUsageStore } from "@/renderer/state/providerUsageStore";

/**
 * Force-collect one provider and merge the reply into the usage store so the
 * rail/panel update immediately. The supervisor also broadcasts `provider-usage`,
 * but merging the IPC reply avoids the round-trip lag. Errors surface as the
 * provider's own error snapshot via that broadcast.
 */
export async function refreshAndMergeProviderUsage(providerId: string): Promise<void> {
  try {
    const usage = await readBridge().refreshProviderUsage({ providerIds: [providerId] });
    const fresh = usage.snapshots.find((s) => s.providerId === providerId);
    if (fresh) useProviderUsageStore.getState().mergeSnapshot(fresh);
  } catch {
    // Supervisor broadcasts the error snapshot; ignore the rejected promise here.
  }
}
