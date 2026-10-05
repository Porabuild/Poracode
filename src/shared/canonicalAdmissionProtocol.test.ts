import { describe, expect, it } from "vitest";
import {
  isCanonicalAdmissionMessage,
  isCanonicalAdmissionControl,
} from "./canonicalAdmissionProtocol";
import { isSupervisorFlowControl, isSupervisorFlowControlCapabilities } from "./ipc/events";

const identity = { version: 2, generation: "boot", requestSeq: 1, threadId: "thread" };
const cost = { eventCount: 1, eventBytes: 300, maxEventBytes: 300 };
describe("private canonical admission2 grammar", () => {
  it("accepts quotes, deliveries and ordered token release independently of public events", () => {
    expect(isCanonicalAdmissionMessage({ ...identity, kind: "canonical-admission-cancel" })).toBe(
      true,
    );
    expect(
      isCanonicalAdmissionMessage({ ...identity, kind: "canonical-admission-request", cost }),
    ).toBe(true);
    expect(
      isCanonicalAdmissionMessage({
        ...identity,
        kind: "canonical-admission-delivery",
        reservationId: "token",
        events: [{ type: "item.completed", threadId: "thread", itemId: "item" }],
      }),
    ).toBe(true);
    expect(
      isCanonicalAdmissionMessage({
        ...identity,
        kind: "canonical-admission-release",
        reservationId: "token",
      }),
    ).toBe(true);
    expect(
      isCanonicalAdmissionMessage({ type: "thread-runtime-event", threadId: "thread", event: {} }),
    ).toBe(false);
  });
  it("rejects malformed identities, impossible costs and differently addressed payloads", () => {
    const q = { ...identity, kind: "canonical-admission-request", cost };
    for (const malformed of [
      null,
      {},
      { ...q, version: 1 },
      { ...q, generation: "" },
      { ...q, requestSeq: 0 },
      { ...q, requestSeq: 1.5 },
      { ...q, threadId: "x".repeat(1025) },
      { ...q, cost: { ...cost, eventBytes: Infinity } },
      { ...q, cost: { ...cost, eventCount: 0 } },
      { ...q, cost: { ...cost, maxEventBytes: 301 } },
      {
        ...identity,
        kind: "canonical-admission-delivery",
        reservationId: "token",
        events: [{ type: "item.completed", threadId: "other" }],
      },
      { ...identity, kind: "canonical-admission-delivery", reservationId: "token", events: [] },
    ])
      expect(isCanonicalAdmissionMessage(malformed)).toBe(false);
  });
  it("requires a versioned identity for every private control and preserves released flow1 shapes", () => {
    const controls = [
      { control: "canonical-admission-enable", version: 2, generation: "boot" },
      {
        ...identity,
        control: "canonical-admission-grant",
        reservationId: "token",
        queueGeneration: 1,
        cost,
      },
      {
        ...identity,
        control: "canonical-admission-resolved",
        outcome: "retry",
        acceptedEvents: 0,
        refusedEvents: 0,
      },
      {
        ...identity,
        control: "canonical-admission-resolved",
        outcome: "cancelled",
        acceptedEvents: 0,
        refusedEvents: 0,
      },
    ];
    for (const control of controls) {
      expect(isCanonicalAdmissionControl(control)).toBe(true);
      expect(isSupervisorFlowControl(control)).toBe(true);
      expect(isCanonicalAdmissionControl({ ...control, version: 1 })).toBe(false);
    }
    expect(isCanonicalAdmissionControl({ ...controls[1], queueGeneration: NaN })).toBe(false);
    expect(isCanonicalAdmissionControl({ ...controls[2], outcome: "other" })).toBe(false);
    expect(isCanonicalAdmissionControl({ ...controls[2], acceptedEvents: -1 })).toBe(false);
    const released = {
      kind: "supervisor-flow-control-capabilities",
      versions: [1],
      supportsCanonicalCredit: true,
      canonicalFlowGeneration: "released-boot",
    };
    expect(isSupervisorFlowControlCapabilities(released)).toBe(true);
    expect(
      isSupervisorFlowControl({
        control: "ack-canonical-flow",
        ackSeq: 1,
        generation: "released-boot",
      }),
    ).toBe(true);
    expect(
      isCanonicalAdmissionControl({
        control: "ack-canonical-flow",
        ackSeq: 1,
        generation: "released-boot",
      }),
    ).toBe(false);
  });
});
