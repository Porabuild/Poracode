import { pickUsageRings } from "@poracode/agents-usage/providers";
import type { UsageSnapshot } from "@poracode/agents-usage/types";
import type { ProviderUsageResponse } from "@/shared/contracts";

/** Derive presentation only from the final, account-filtered response rows. */
export function providerUsageResponse(
  snapshots: UsageSnapshot[],
  fromCache: boolean,
  selectedRingGroups: Readonly<Record<string, string>>,
): ProviderUsageResponse {
  if (snapshots.length === 0) return { snapshots, fromCache };
  return {
    snapshots,
    fromCache,
    ringLayouts: Object.fromEntries(
      snapshots.map((snapshot) => {
        const { outer, inner } = pickUsageRings(
          snapshot.providerId,
          snapshot.windows,
          selectedRingGroups[snapshot.providerId],
        );
        return [
          snapshot.providerId,
          {
            ...(outer ? { outerWindowId: outer.id } : {}),
            ...(inner ? { innerWindowId: inner.id } : {}),
          },
        ];
      }),
    ),
  };
}
