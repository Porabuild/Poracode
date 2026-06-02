import { create } from "zustand";
import type { UsageSnapshot } from "@/shared/contracts";

/**
 * Per-provider usage snapshots streamed from the supervisor (`provider-usage` /
 * `provider-usage-all`). Snapshot entries are replaced only when their content
 * changes so per-entity selectors stay reference-stable and don't re-render
 * sibling provider circles. Mirrors the agentStatusesStore conventions.
 */

interface ProviderUsageStore {
  snapshots: Record<string, UsageSnapshot>;
  setSnapshots: (snapshots: UsageSnapshot[]) => void;
  mergeSnapshot: (snapshot: UsageSnapshot) => void;
}

function snapshotEqual(a: UsageSnapshot | undefined, b: UsageSnapshot): boolean {
  if (!a) return false;
  if (
    a.status !== b.status ||
    a.plan !== b.plan ||
    a.fetchedAt !== b.fetchedAt ||
    a.windows.length !== b.windows.length
  ) {
    return false;
  }
  return a.windows.every((w, i) => {
    const o = b.windows[i]!;
    return w.id === o.id && w.usedPercent === o.usedPercent && w.resetsAt === o.resetsAt;
  });
}

export const useProviderUsageStore = create<ProviderUsageStore>()((set) => ({
  snapshots: {},
  setSnapshots: (incoming) =>
    set((prev) => {
      const next: Record<string, UsageSnapshot> = {};
      let changed = Object.keys(prev.snapshots).length !== incoming.length;
      for (const snapshot of incoming) {
        const existing = prev.snapshots[snapshot.providerId];
        // Reuse the existing reference when unchanged so selectors stay stable.
        if (existing && snapshotEqual(existing, snapshot)) {
          next[snapshot.providerId] = existing;
        } else {
          next[snapshot.providerId] = snapshot;
          changed = true;
        }
      }
      if (!changed) return prev;
      return { snapshots: next };
    }),
  mergeSnapshot: (snapshot) =>
    set((prev) => {
      if (snapshotEqual(prev.snapshots[snapshot.providerId], snapshot)) {
        return prev;
      }
      return {
        snapshots: { ...prev.snapshots, [snapshot.providerId]: snapshot },
      };
    }),
}));

/** Narrow per-provider selector — re-renders only when this provider changes. */
export function useProviderUsage(providerId: string): UsageSnapshot | undefined {
  return useProviderUsageStore((s) => s.snapshots[providerId]);
}
