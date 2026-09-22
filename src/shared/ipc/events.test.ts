import { describe, expect, it } from "vitest";
import {
  SUPERVISOR_EVENT_BACKPRESSURE_VERSION,
  canonicalFlowSeqOf,
  isSupervisorFlowControl,
  isSupervisorFlowControlCapabilities,
} from "./events";

/**
 * B1 compatibility boundary: the supervisor discriminates flow-control
 * messages by `control` and ignores unknown values, and the host only sends
 * `set-event-backpressure` to a peer that advertised version 1. These guards
 * are the shared half of that contract.
 */
describe("supervisor flow-control guards", () => {
  it("recognizes both known controls and rejects unknown ones", () => {
    expect(isSupervisorFlowControl({ control: "set-output-backpressure", paused: true })).toBe(
      true,
    );
    expect(
      isSupervisorFlowControl({
        control: "set-event-backpressure",
        paused: true,
        reason: "host-persistence-degraded",
      }),
    ).toBe(true);
    expect(isSupervisorFlowControl({ control: "set-future-control", paused: true })).toBe(false);
    expect(isSupervisorFlowControl({ control: "set-event-backpressure" })).toBe(false);
    expect(isSupervisorFlowControl({ id: "req", type: "startThread", payload: {} })).toBe(false);
    expect(isSupervisorFlowControl(null)).toBe(false);
  });

  it("recognizes the capability advertisement shape", () => {
    expect(
      isSupervisorFlowControlCapabilities({
        kind: "supervisor-flow-control-capabilities",
        versions: [SUPERVISOR_EVENT_BACKPRESSURE_VERSION],
        maxInFlightBytes: 14 * 1024 * 1024,
        maxEnvelopeBytes: 8 * 1024 * 1024,
        supportsCanonicalCredit: true,
        canonicalFlowGeneration: "boot-1",
      }),
    ).toBe(true);
    expect(
      isSupervisorFlowControlCapabilities({
        kind: "supervisor-flow-control-capabilities",
        versions: ["1"],
      }),
    ).toBe(false);
    expect(isSupervisorFlowControlCapabilities({ type: "thread-reset", threadId: "t1" })).toBe(
      false,
    );
  });

  it("recognizes the dedicated canonical ack control only with a full identity", () => {
    expect(
      isSupervisorFlowControl({
        control: "ack-canonical-flow",
        ackSeq: 7,
        generation: "boot-1",
      }),
    ).toBe(true);
    expect(isSupervisorFlowControl({ control: "ack-canonical-flow", ackSeq: 7 })).toBe(false);
    expect(
      isSupervisorFlowControl({ control: "ack-canonical-flow", ackSeq: 7, generation: "" }),
    ).toBe(false);
    expect(
      isSupervisorFlowControl({ control: "ack-canonical-flow", ackSeq: "7", generation: "g" }),
    ).toBe(false);
  });

  it("extracts only well-formed canonical flow identities", () => {
    expect(canonicalFlowSeqOf({ type: "thread-runtime-events", threadId: "t1", events: [] })).toBe(
      undefined,
    );
    expect(
      canonicalFlowSeqOf({
        type: "thread-runtime-events",
        threadId: "t1",
        events: [],
        flowSeq: 3,
      }),
    ).toBe(3);
    expect(
      canonicalFlowSeqOf({
        type: "thread-runtime-events",
        threadId: "t1",
        events: [],
        flowSeq: 0,
      }),
    ).toBe(undefined);
    expect(
      canonicalFlowSeqOf({
        type: "thread-runtime-events",
        threadId: "t1",
        events: [],
        flowSeq: 1.5,
      }),
    ).toBe(undefined);
    expect(canonicalFlowSeqOf({ type: "thread-state", threadId: "t1" } as never)).toBe(undefined);
  });
});
