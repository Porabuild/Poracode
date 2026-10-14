import { describe, expect, it } from "vitest";
import { isSupervisorFlowControl } from "@/shared/ipc";
import { CanonicalFlowLedger } from "./canonicalFlowLedger";
import { canonicalCreditGrant } from "./canonicalCreditControl";

describe("host credit control receiver", () => {
  it("activates finite credit from the initial window-only host grant", () => {
    const ledger = new CanonicalFlowLedger({ generation: "current-boot", maxEntries: 8 });
    const control = {
      control: "set-event-backpressure" as const,
      paused: false,
      canonicalCreditBytes: 1024,
      canonicalFlowGeneration: ledger.generation,
    };
    expect(isSupervisorFlowControl(control)).toBe(true);
    expect(ledger.setWindow(canonicalCreditGrant(control)!)).toBe(true);
    expect(ledger.remaining()).toBe(1024);
    expect(ledger.isActive()).toBe(true);
  });

  it("preserves a combined grant and ACK without releasing capacity twice", () => {
    const ledger = new CanonicalFlowLedger({ generation: "current-boot", maxEntries: 8 });
    ledger.setWindow({ windowBytes: 128, generation: ledger.generation });
    const flow = ledger.assign(32)!;
    const grant = canonicalCreditGrant({
      control: "set-event-backpressure",
      paused: false,
      canonicalCreditBytes: 256,
      canonicalAckSeq: flow.flowSeq,
      canonicalFlowGeneration: ledger.generation,
    })!;
    expect(ledger.setWindow(grant)).toBe(true);
    expect(ledger.remaining()).toBe(256);
    ledger.setWindow(grant);
    expect(ledger.remaining()).toBe(256);
  });

  it("does not authorize stale or generation-less credit", () => {
    const ledger = new CanonicalFlowLedger({ generation: "current-boot", maxEntries: 8 });
    ledger.setWindow({ windowBytes: 128, generation: ledger.generation });
    ledger.assign(32);
    for (const control of [
      {
        control: "set-event-backpressure" as const,
        paused: false,
        canonicalCreditBytes: 999,
        canonicalFlowGeneration: "previous-boot",
      },
      { control: "set-event-backpressure" as const, paused: false, canonicalCreditBytes: 999 },
    ])
      expect(ledger.setWindow(canonicalCreditGrant(control)!)).toBe(false);
    expect(ledger.remaining()).toBe(96);
  });

  it("leaves ACK-only and ordinary pressure controls on their existing paths", () => {
    expect(
      canonicalCreditGrant({
        control: "set-event-backpressure",
        paused: false,
        canonicalAckSeq: 1,
        canonicalFlowGeneration: "current-boot",
      }),
    ).toBeNull();
    expect(canonicalCreditGrant({ control: "set-event-backpressure", paused: true })).toBeNull();
  });
});
