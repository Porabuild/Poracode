import { useEffect, useState } from "react";
import type { ProfileCoreStats } from "@/shared/contracts";
import { readBridge } from "@/renderer/bridge";

/** Stats change slowly; reuse one host read across new-thread pages for a while. */
const CACHE_TTL_MS = 10 * 60_000;

let cached: { at: number; stats: ProfileCoreStats } | null = null;
let inFlight: Promise<ProfileCoreStats | null> | null = null;

async function readStats(): Promise<ProfileCoreStats> {
  return readBridge().getProfileCoreStats({
    utcOffsetMinutes: -new Date().getTimezoneOffset(),
    scope: "device",
    window: "all",
  });
}

function loadProfileStats(): Promise<ProfileCoreStats | null> {
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return Promise.resolve(cached.stats);
  inFlight ??= readStats()
    .then((stats) => {
      cached = { at: Date.now(), stats };
      return stats;
    })
    // Older hosts or clients without profile stats: no insights.
    .catch(() => null)
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

/** The current device's all-time profile stats (daily heatmap included), or null when unavailable. */
export function useProfileStats(): ProfileCoreStats | null {
  const [stats, setStats] = useState<ProfileCoreStats | null>(() => cached?.stats ?? null);
  useEffect(() => {
    let active = true;
    void loadProfileStats().then((result) => {
      if (active) setStats(result);
    });
    return () => {
      active = false;
    };
  }, []);
  return stats;
}

/** Test seam: forget the cached host read. */
export function resetProfileStatsCache(): void {
  cached = null;
  inFlight = null;
}
