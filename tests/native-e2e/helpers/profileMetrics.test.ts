import { describe, expect, it } from "vitest";
import type { ProfileClient } from "./concurrencyProfileClient.ts";
import { type LatencySummary, buildMetricsArtifact, summarizeLatencies } from "./profileMetrics.ts";

/** Typed view over the artifact payload, which buildMetricsArtifact returns as
 * a free-form record so profiles can attach arbitrary extras. */
interface MetricsArtifactView {
  controlLatency: Record<string, LatencySummary>;
  eventPropagation: LatencySummary;
  wsPingRtt: LatencySummary;
  perClient: Array<{ eventPropagationMs: number[] }>;
}

describe("summarizeLatencies", () => {
  it("preserves sub-millisecond precision instead of rounding to whole ms", () => {
    const summary = summarizeLatencies([0.125, 0.5, 1.875]);
    expect(summary.count).toBe(3);
    expect(summary.meanMs).toBe(0.833);
    expect(summary.p50Ms).toBe(0.5);
    // ceil(0.95*3)-1 = index 2 under the nearest-rank rule.
    expect(summary.p95Ms).toBe(1.875);
    expect(summary.p99Ms).toBe(1.875);
    expect(summary.maxMs).toBe(1.875);
    expect(summary.negativeCount).toBe(0);
  });

  it("counts negative samples instead of clamping them into a confident 0", () => {
    const summary = summarizeLatencies([-1.375, 0.5, 3.25]);
    expect(summary.negativeCount).toBe(1);
    expect(summary.p50Ms).toBe(0.5);
    expect(summary.meanMs).toBe(0.792);
    expect(summary.maxMs).toBe(3.25);
  });

  it("normalizes negative zero so strict-equality consumers see plain 0", () => {
    const summary = summarizeLatencies([-0.0001]);
    expect(summary.p50Ms).toBe(0);
    expect(summary.maxMs).toBe(0);
    expect(summary.negativeCount).toBe(1);
  });

  it("summarizes an empty sample set as zeros", () => {
    expect(summarizeLatencies([])).toEqual({
      count: 0,
      meanMs: 0,
      p50Ms: 0,
      p95Ms: 0,
      p99Ms: 0,
      maxMs: 0,
      negativeCount: 0,
    });
  });
});

/** Minimal client-shaped stub: buildMetricsArtifact only aggregates these
 * metric fields; the rest of ProfileClient is irrelevant to artifact shape. */
function stubClient(metrics: {
  label: string;
  controlLatenciesMs: Record<string, number[]>;
  eventPropagationMs: number[];
  mutationToEndToEndMs: number[];
  wsPingRttMs: number[];
}): ProfileClient {
  return {
    metrics: {
      ...metrics,
      eventsReceived: metrics.eventPropagationMs.length,
      replayedEventCount: 0,
      resyncRequiredCount: 0,
      eventSeqGaps: 0,
      appBytesReceived: 0,
      appBytesSent: 0,
      transportSocketBytesReceived: 0,
      httpRequests: 0,
      httpRequestBodyBytes: 0,
      httpResponseBodyBytes: 0,
    },
  } as unknown as ProfileClient;
}

describe("buildMetricsArtifact", () => {
  it("retains raw per-client samples verbatim while summarizing coherently", () => {
    const raw = {
      label: "c1",
      controlLatenciesMs: { "project-update": [12.25, 12.5] },
      eventPropagationMs: [-0.375, 0.25, 2.125],
      mutationToEndToEndMs: [1.5],
      wsPingRttMs: [0.75],
    };
    const artifact = buildMetricsArtifact([stubClient(raw)], {
      profile: "n1",
    }) as unknown as MetricsArtifactView;
    expect(artifact.perClient).toHaveLength(1);
    expect(artifact.eventPropagation).toMatchObject({
      count: 3,
      p50Ms: 0.25,
      maxMs: 2.125,
      negativeCount: 1,
    });
    expect(artifact.controlLatency["project-update"]).toMatchObject({ meanMs: 12.375 });
    expect(artifact.wsPingRtt).toMatchObject({ maxMs: 0.75 });
  });

  it("merges the same operation across clients before summarizing", () => {
    const artifact = buildMetricsArtifact(
      [
        stubClient({
          label: "c1",
          controlLatenciesMs: { snapshot: [10, 20] },
          eventPropagationMs: [],
          mutationToEndToEndMs: [],
          wsPingRttMs: [],
        }),
        stubClient({
          label: "c2",
          controlLatenciesMs: { snapshot: [30.5] },
          eventPropagationMs: [],
          mutationToEndToEndMs: [],
          wsPingRttMs: [],
        }),
      ],
      {},
    ) as unknown as MetricsArtifactView;
    expect(artifact.controlLatency.snapshot).toMatchObject({ count: 3, meanMs: 20.167 });
  });
});
