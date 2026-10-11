import { describe, expect, it } from "vitest";
import { CanonicalFlowLedger } from "./canonicalFlowLedger";

/**
 * B1 credit-ledger invariants: bytes stay charged until the host resolves
 * them, sequence fencing prevents stale boots and skipped sequences from
 * releasing unaccepted entries, and the entry count is bounded independently
 * of the byte window.
 */
describe("CanonicalFlowLedger", () => {
  it("charges assigned bytes until a matching-generation ack covers them", () => {
    const ledger = new CanonicalFlowLedger({ generation: "boot-1", maxEntries: 64 });
    expect(ledger.isActive()).toBe(false);
    expect(ledger.remaining()).toBe(Number.POSITIVE_INFINITY);

    expect(ledger.setWindow({ windowBytes: 1_000, generation: "other-boot" })).toBe(false);
    expect(ledger.isActive()).toBe(false);

    expect(ledger.setWindow({ windowBytes: 1_000, generation: "boot-1" })).toBe(true);
    expect(ledger.assign(300)).toEqual({ flowSeq: 1, flowBytes: 300 });
    expect(ledger.assign(300)).toEqual({ flowSeq: 2, flowBytes: 300 });
    expect(ledger.remaining()).toBe(400);

    expect(ledger.acknowledge(1, "other-boot")).toBe(false);
    expect(ledger.acknowledge(3, "boot-1")).toBe(false);
    expect(ledger.remaining()).toBe(400);

    expect(ledger.acknowledge(1, "boot-1")).toBe(true);
    expect(ledger.remaining()).toBe(700);
    // Idempotent and cumulative.
    expect(ledger.acknowledge(1, "boot-1")).toBe(true);
    expect(ledger.acknowledge(2, "boot-1")).toBe(true);
    expect(ledger.remaining()).toBe(1_000);
    expect(ledger.outstanding()).toBe(0);
  });

  it("releases a skipped sequence once and never double-subtracts on a later ack", () => {
    const ledger = new CanonicalFlowLedger({ generation: "g", maxEntries: 64 });
    ledger.setWindow({ windowBytes: 1_000, generation: "g" });
    expect(ledger.assign(100)?.flowSeq).toBe(1);
    expect(ledger.assign(100)?.flowSeq).toBe(2);
    expect(ledger.assign(100)?.flowSeq).toBe(3);

    // Sequence 2 is refused locally before it reaches the wire.
    ledger.release(2);
    expect(ledger.remaining()).toBe(800);
    expect(ledger.acknowledge(3, "g")).toBe(true);
    expect(ledger.remaining()).toBe(1_000);
    expect(ledger.outstanding()).toBe(0);
  });

  it("bounds the entry count independently of the byte window", () => {
    const ledger = new CanonicalFlowLedger({ generation: "g", maxEntries: 2 });
    ledger.setWindow({ windowBytes: 1_000_000, generation: "g" });
    ledger.assign(1);
    ledger.assign(1);
    expect(ledger.remaining()).toBe(0);

    // Disabling the window (legacy host) clears the ledger entirely.
    expect(ledger.setWindow({ windowBytes: null, generation: "g" })).toBe(true);
    expect(ledger.isActive()).toBe(false);
    expect(ledger.remaining()).toBe(Number.POSITIVE_INFINITY);
    expect(ledger.assign(1)).toBeNull();
  });

  it("applies the ack carried by a window grant", () => {
    const ledger = new CanonicalFlowLedger({ generation: "g", maxEntries: 64 });
    ledger.setWindow({ windowBytes: 1_000, generation: "g" });
    ledger.assign(100);
    ledger.assign(100);
    expect(ledger.remaining()).toBe(800);

    ledger.setWindow({ windowBytes: 1_000, ackSeq: 1, generation: "g" });
    expect(ledger.remaining()).toBe(900);
  });
});
