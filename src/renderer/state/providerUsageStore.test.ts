import type { UsageSnapshot } from "@poracode/agents-usage/types";
import { beforeEach, describe, expect, it } from "vitest";
import { useProviderUsageStore } from "./providerUsageStore";

const NOW = 1_795_000_000_000;

function makeSnapshot(overrides: Partial<UsageSnapshot> = {}): UsageSnapshot {
  return {
    providerId: "cursor:work",
    status: "ok",
    plan: "Cursor Team",
    fetchedAt: NOW,
    windows: [
      {
        id: "cursor-auto",
        label: "Cursor Models",
        usedPercent: 67.41,
        unit: "percent",
        currency: "USD",
        used: 706.77,
        resetsAt: NOW + 86_400_000,
        breakdown: [{ label: "model-fast", used: 706.77, currency: "USD", tokens: 100_000 }],
      },
    ],
    cost: { amount: 183.62, currency: "USD", period: "cycle", estimated: false },
    tokens: { total: 100_000, input: 80_000, output: 20_000, period: "cycle" },
    ...overrides,
  };
}

describe("providerUsageStore", () => {
  beforeEach(() => {
    useProviderUsageStore.setState({ snapshots: {} });
  });

  it("keeps snapshot reference stable when merged content is identical", () => {
    const first = makeSnapshot();
    useProviderUsageStore.getState().setSnapshots([first]);
    const stored = useProviderUsageStore.getState().snapshots["cursor:work"];

    useProviderUsageStore.getState().mergeSnapshot(makeSnapshot());
    expect(useProviderUsageStore.getState().snapshots["cursor:work"]).toBe(stored);

    useProviderUsageStore.getState().setSnapshots([makeSnapshot()]);
    expect(useProviderUsageStore.getState().snapshots["cursor:work"]).toBe(stored);
  });

  it("updates stored snapshots even with identical fetchedAt when window or cycle fields change", () => {
    const base = makeSnapshot();
    useProviderUsageStore.getState().setSnapshots([base]);

    const mutations: Array<{ name: string; next: UsageSnapshot }> = [
      {
        name: "window.unit",
        next: makeSnapshot({
          windows: [{ ...base.windows[0]!, unit: "usd" }],
        }),
      },
      {
        name: "window.used",
        next: makeSnapshot({
          windows: [{ ...base.windows[0]!, used: 710 }],
        }),
      },
      {
        name: "window.limit",
        next: makeSnapshot({
          windows: [{ ...base.windows[0]!, limit: 1050 }],
        }),
      },
      {
        name: "window.currency",
        next: makeSnapshot({
          windows: [{ ...base.windows[0]!, currency: "EUR" }],
        }),
      },
      {
        name: "window.label",
        next: makeSnapshot({
          windows: [{ ...base.windows[0]!, label: "Auto" }],
        }),
      },
      {
        name: "window.breakdown",
        next: makeSnapshot({
          windows: [
            {
              ...base.windows[0]!,
              breakdown: [{ label: "model-fast", used: 706.77, currency: "USD", tokens: 200_000 }],
            },
          ],
        }),
      },
      {
        name: "snapshot.cost",
        next: makeSnapshot({
          cost: { amount: 200, currency: "USD", period: "cycle", estimated: false },
        }),
      },
      {
        name: "snapshot.tokens",
        next: makeSnapshot({
          tokens: { total: 150_000, input: 120_000, output: 30_000, period: "cycle" },
        }),
      },
    ];

    for (const { next } of mutations) {
      useProviderUsageStore.getState().setSnapshots([base]);
      const prevRef = useProviderUsageStore.getState().snapshots["cursor:work"];
      useProviderUsageStore.getState().mergeSnapshot(next);
      expect(useProviderUsageStore.getState().snapshots["cursor:work"]).toBe(next);
      expect(useProviderUsageStore.getState().snapshots["cursor:work"]).not.toBe(prevRef);
    }
  });
});
