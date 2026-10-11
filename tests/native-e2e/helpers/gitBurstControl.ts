import assert from "node:assert/strict";
import type { ProfileClient } from "./concurrencyProfileClient.ts";
import { GIT_BURST_BOUNDS } from "./gitBurstConfig.ts";
import { expectOk } from "./sharedHostWorkload.ts";

/**
 * Control-path probes for the §4 Git-burst cell: authenticated snapshot reads
 * and client pings issued while the burst (and the stalled fetch) run. They
 * measure the shared control surfaces Git admission must not starve, on the
 * dedicated control principal (the B3 fairness measurement) or, at size 1,
 * on the burst's own principal.
 */

export interface GitBurstControlProbeResult {
  readonly phase: "concurrent-with-burst" | "post-burst";
  /** Which authenticated principal issued the probes: the burst's own or the
   * dedicated control credential (the B3 fairness measurement). */
  readonly principal: "burst" | "control";
  readonly snapshotMs: readonly number[];
  readonly pingMs: readonly number[];
}

export async function controlProbes(
  client: ProfileClient,
  count: number,
  spacingMs: number,
  phase: GitBurstControlProbeResult["phase"],
  principal: GitBurstControlProbeResult["principal"] = "control",
): Promise<GitBurstControlProbeResult> {
  const snapshotMs: number[] = [];
  const pingMs: number[] = [];
  for (let index = 0; index < count; index += 1) {
    const snapshot = await client.fetchJson("snapshot-read", "/api/snapshot");
    expectOk(snapshot.status, "snapshot read under burst", snapshot.body);
    snapshotMs.push(snapshot.elapsedMs);
    const pingStartedAt = performance.now();
    await client.ping();
    pingMs.push(performance.now() - pingStartedAt);
    if (index < count - 1) {
      await new Promise((resolve) => setTimeout(resolve, spacingMs));
    }
  }
  return { phase, principal, snapshotMs, pingMs };
}

export function assertControlBounds(controls: GitBurstControlProbeResult): void {
  for (const snapshotMs of controls.snapshotMs) {
    assert(
      snapshotMs <= GIT_BURST_BOUNDS.controlAckMaxMs,
      `snapshot read took ${String(snapshotMs)}ms (bound ${String(GIT_BURST_BOUNDS.controlAckMaxMs)}ms)`,
    );
  }
  for (const pingMs of controls.pingMs) {
    assert(
      pingMs <= GIT_BURST_BOUNDS.clientPingMaxMs,
      `client ping took ${String(pingMs)}ms (bound ${String(GIT_BURST_BOUNDS.clientPingMaxMs)}ms)`,
    );
  }
}
