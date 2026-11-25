import { create } from "zustand";
import type {
  UsageCost,
  UsageCredits,
  UsageSnapshot,
  UsageTokens,
  UsageWindowBreakdownItem,
} from "@/shared/contracts";
import { useHostUsageStore } from "./hostUsageStore";

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

function creditsEqual(a: UsageCredits | undefined, b: UsageCredits | undefined): boolean {
  if (!a || !b) return a === b;
  return (
    a.balance === b.balance &&
    a.currency === b.currency &&
    a.label === b.label &&
    a.unlimited === b.unlimited
  );
}

function costEqual(a: UsageCost | undefined, b: UsageCost | undefined): boolean {
  if (!a || !b) return a === b;
  return (
    a.amount === b.amount &&
    a.currency === b.currency &&
    a.period === b.period &&
    a.estimated === b.estimated
  );
}

function tokensEqual(a: UsageTokens | undefined, b: UsageTokens | undefined): boolean {
  if (!a || !b) return a === b;
  return (
    a.total === b.total &&
    a.input === b.input &&
    a.output === b.output &&
    a.cacheRead === b.cacheRead &&
    a.cacheWrite === b.cacheWrite &&
    a.period === b.period
  );
}

function breakdownEqual(
  a: readonly UsageWindowBreakdownItem[] | undefined,
  b: readonly UsageWindowBreakdownItem[] | undefined,
): boolean {
  if (!a || !b) return a === b;
  if (a.length !== b.length) return false;
  return a.every((item, i) => {
    const other = b[i]!;
    return (
      item.label === other.label &&
      item.used === other.used &&
      item.limit === other.limit &&
      item.currency === other.currency &&
      item.tokens === other.tokens
    );
  });
}

function snapshotEqual(a: UsageSnapshot | undefined, b: UsageSnapshot): boolean {
  if (!a) return false;
  if (
    a.status !== b.status ||
    a.plan !== b.plan ||
    a.fetchedAt !== b.fetchedAt ||
    a.error !== b.error ||
    a.rateLimitedUntil !== b.rateLimitedUntil ||
    !creditsEqual(a.credits, b.credits) ||
    !costEqual(a.cost, b.cost) ||
    !tokensEqual(a.tokens, b.tokens) ||
    a.windows.length !== b.windows.length
  ) {
    return false;
  }
  return a.windows.every((w, i) => {
    const o = b.windows[i]!;
    return (
      w.id === o.id &&
      w.label === o.label &&
      w.usedPercent === o.usedPercent &&
      w.unit === o.unit &&
      w.used === o.used &&
      w.limit === o.limit &&
      w.currency === o.currency &&
      w.resetsAt === o.resetsAt &&
      breakdownEqual(w.breakdown, o.breakdown)
    );
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
export function useProviderUsage(
  providerId: string,
  connectionId: string | null = null,
): UsageSnapshot | undefined {
  const managed = useProviderUsageStore((s) =>
    connectionId === null ? s.snapshots[providerId] : undefined,
  );
  const remote = useHostUsageStore((s) =>
    connectionId !== null
      ? s.hosts[connectionId]?.snapshots.find((snapshot) => snapshot.providerId === providerId)
      : undefined,
  );
  return connectionId === null ? managed : remote;
}
