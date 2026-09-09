import type { ProfileClient } from "./concurrencyProfileClient.ts";

export interface LatencySummary {
  readonly count: number;
  readonly meanMs: number;
  readonly p50Ms: number;
  readonly p95Ms: number;
  readonly p99Ms: number;
  readonly maxMs: number;
  /** Samples below zero. Propagation samples are negative when the event
   * stream wins the race against the HTTP response (waiters are armed before
   * the request) — with sub-millisecond clocks that is common and real. A
   * nonzero count means the summary is not clamped/saturated at 0. */
  readonly negativeCount: number;
}

/** Latency summaries keep sub-millisecond detail: `performance.now()` samples
 * carry fractional milliseconds, and rounding them to whole ms collapses all
 * loopback measurements to a confident-looking 0. Microsecond (3-decimal)
 * precision preserves the information while keeping artifacts compact. */
function roundMs(value: number): number {
  const rounded = Math.round(value * 1000) / 1000;
  return rounded === 0 ? 0 : rounded; // normalize -0 for strict-equality consumers
}

export function summarizeLatencies(samples: readonly number[]): LatencySummary {
  if (samples.length === 0) {
    return { count: 0, meanMs: 0, p50Ms: 0, p95Ms: 0, p99Ms: 0, maxMs: 0, negativeCount: 0 };
  }
  const sorted = [...samples].sort((left, right) => left - right);
  const at = (fraction: number): number => {
    const index = Math.min(sorted.length - 1, Math.ceil(fraction * sorted.length) - 1);
    return roundMs(sorted[index] ?? 0);
  };
  const total = sorted.reduce((sum, value) => sum + value, 0);
  return {
    count: sorted.length,
    meanMs: roundMs(total / sorted.length),
    p50Ms: at(0.5),
    p95Ms: at(0.95),
    p99Ms: at(0.99),
    maxMs: roundMs(sorted[sorted.length - 1] ?? 0),
    negativeCount: sorted.filter((value) => value < 0).length,
  };
}

/** Aggregates per-client instrumentation into one artifact payload. Byte
 * figures are labeled by measurement scope: application bytes are decompressed
 * WS frame payloads; transport bytes are raw TCP after the WS upgrade and are
 * not comparable 1:1 with application bytes. Raw latency samples are retained
 * verbatim in `perClient` (fractional and negative included) so summary
 * saturation is always checkable against the underlying data. */
export function buildMetricsArtifact(
  clients: readonly ProfileClient[],
  extra: Record<string, unknown>,
): Record<string, unknown> {
  const operations = new Set<string>();
  for (const client of clients) {
    for (const operation of Object.keys(client.metrics.controlLatenciesMs)) {
      operations.add(operation);
    }
  }
  const controlLatency: Record<string, unknown> = {};
  for (const operation of operations) {
    const samples = clients.flatMap((client) => client.metrics.controlLatenciesMs[operation] ?? []);
    controlLatency[operation] = summarizeLatencies(samples);
  }
  const appBytesRx = clients.reduce((total, client) => total + client.metrics.appBytesReceived, 0);
  const transportBytesRx = clients.reduce(
    (total, client) => total + client.metrics.transportSocketBytesReceived,
    0,
  );
  return {
    ...extra,
    clients: clients.length,
    controlLatency,
    eventPropagation: summarizeLatencies(
      clients.flatMap((client) => client.metrics.eventPropagationMs),
    ),
    mutationToEndToEnd: summarizeLatencies(
      clients.flatMap((client) => client.metrics.mutationToEndToEndMs),
    ),
    wsPingRtt: summarizeLatencies(clients.flatMap((client) => client.metrics.wsPingRttMs)),
    bytes: {
      accounting:
        "applicationReceived/Sent: JSON WS frame payload after decompression. " +
        "transportSocketReceived: raw TCP bytes after the WS upgrade — excludes HTTP " +
        "upgrade, TCP/IP and handshake overhead, so application/transport ratios are " +
        "indicative, not exact.",
      applicationReceived: appBytesRx,
      transportSocketReceived: transportBytesRx,
      applicationSent: clients.reduce((total, client) => total + client.metrics.appBytesSent, 0),
      compressionRatio:
        transportBytesRx > 0 ? Math.round((appBytesRx / transportBytesRx) * 100) / 100 : null,
      http: {
        accounting:
          "Measured control API calls only; excludes pairing and ticket acquisition. " +
          "Request JSON and decoded response body bytes exclude headers, transport overhead, " +
          "and content encoding. These are application sizes, not network traffic totals.",
        requests: clients.reduce((total, client) => total + client.metrics.httpRequests, 0),
        requestBodyBytes: clients.reduce(
          (total, client) => total + client.metrics.httpRequestBodyBytes,
          0,
        ),
        responseBodyBytes: clients.reduce(
          (total, client) => total + client.metrics.httpResponseBodyBytes,
          0,
        ),
      },
    },
    events: {
      received: clients.reduce((total, client) => total + client.metrics.eventsReceived, 0),
      replayed: clients.reduce((total, client) => total + client.metrics.replayedEventCount, 0),
      resyncRequired: clients.reduce(
        (total, client) => total + client.metrics.resyncRequiredCount,
        0,
      ),
      seqGaps: clients.reduce((total, client) => total + client.metrics.eventSeqGaps, 0),
    },
    perClient: clients.map((client) => ({ ...client.metrics })),
  };
}
