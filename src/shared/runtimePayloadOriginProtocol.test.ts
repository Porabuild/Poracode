import { describe, expect, it } from "vitest";
import type { RuntimeEvent } from "./contracts";
import type { SupervisorEvent } from "./ipc";
import { coalesceRuntimeEvents } from "./coalesce";
import { estimateRuntimeEventBytes } from "./runtimeEventSize";
import {
  RUNTIME_PAYLOAD_ORIGIN_MAX_ENTRIES,
  admitRuntimePayloadOriginEnvelope,
  admittedRuntimePayloadBatch,
  captureRuntimePayloadOrigin,
  isRuntimePayloadFormatOwnerKey,
  isRuntimePayloadOriginNegotiation,
  readAdmittedRuntimePayloadOrigin,
  serializeRuntimePayloadOrigins,
  stripRuntimePayloadOriginMetadata,
} from "./runtimePayloadOriginProtocol";

const start = (id: string): RuntimeEvent => ({
  type: "item.started",
  threadId: "thread",
  itemId: id,
  itemType: "tool_call",
  payload: { evidence: id },
});
const envelope = (events: RuntimeEvent[]): SupervisorEvent => ({
  type: "thread-runtime-events",
  threadId: "thread",
  events,
});
const roundtrip = (event: SupervisorEvent) => JSON.parse(JSON.stringify(event)) as SupervisorEvent;

describe("private runtime payload custody format1", () => {
  it("validates the exact storage54 key boundary and boot identity", () => {
    expect(isRuntimePayloadFormatOwnerKey("a".repeat(128))).toBe(true);
    for (const invalid of ["", "a".repeat(129), "A", "a:1", "a é", "a\u0000", "🙂", 1])
      expect(isRuntimePayloadFormatOwnerKey(invalid)).toBe(false);
    expect(
      isRuntimePayloadOriginNegotiation({
        control: "enable-runtime-payload-origins",
        version: 1,
        generation: "boot",
      }),
    ).toBe(true);
    for (const invalid of ["", "x".repeat(129), "x\n", "é"])
      expect(
        isRuntimePayloadOriginNegotiation({
          control: "enable-runtime-payload-origins",
          version: 1,
          generation: invalid,
        }),
      ).toBe(false);
    expect(
      isRuntimePayloadOriginNegotiation({
        control: "enable-runtime-payload-origins",
        version: 2,
        generation: "boot",
      }),
    ).toBe(false);
  });
  it("native strings, old receivers, old senders and unsupported versions confer no authority", () => {
    const native = {
      ...start("native"),
      runtimePayloadOrigins: { formatOwnerKey: "forged" },
      origin: "forged",
    };
    expect(readAdmittedRuntimePayloadOrigin(native)).toBeUndefined();
    const captured = captureRuntimePayloadOrigin(native, "fixture.a/v1");
    expect(readAdmittedRuntimePayloadOrigin(captured)).toBeUndefined();
    expect(
      roundtrip(serializeRuntimePayloadOrigins(envelope([captured]), null)),
    ).not.toHaveProperty("runtimePayloadOrigins");
    expect(admitRuntimePayloadOriginEnvelope(envelope([start("old")]), "boot")).toBeUndefined();
    const wire = roundtrip(serializeRuntimePayloadOrigins(envelope([captured]), "boot"));
    expect(admitRuntimePayloadOriginEnvelope(wire, "different-boot")).toBeUndefined();
    const unknown = {
      ...wire,
      runtimePayloadOrigins: { version: 2, generation: "boot", entries: [[0, 0, "fixture.a/v1"]] },
    };
    expect(admitRuntimePayloadOriginEnvelope(unknown, "boot")).toBeUndefined();
  });
  it("owns only payload events, aligning mixed A/unknown/B after coalescing and retagging", () => {
    const delta: RuntimeEvent = {
      type: "content.delta",
      threadId: "thread",
      itemId: "a",
      stream: "assistant_text",
      delta: "1",
    };
    const events = coalesceRuntimeEvents([
      captureRuntimePayloadOrigin(start("a"), "fixture.a/v1"),
      captureRuntimePayloadOrigin(delta, "fixture.a/v1"),
      delta,
      start("unknown"),
      { ...captureRuntimePayloadOrigin(start("b"), "fixture.b/v1"), threadId: "parent" },
      captureRuntimePayloadOrigin(
        { type: "item.completed", threadId: "thread", itemId: "a" },
        "fixture.b/v1",
      ),
    ]);
    const wire = roundtrip(serializeRuntimePayloadOrigins(envelope(events), "boot"));
    expect(wire).toHaveProperty("runtimePayloadOrigins.entries", [
      [0, 0, "fixture.a/v1"],
      [0, 3, "fixture.b/v1"],
    ]);
    const admission = admitRuntimePayloadOriginEnvelope(wire, "boot")!;
    expect(
      admittedRuntimePayloadBatch(admission, 0).events.map(readAdmittedRuntimePayloadOrigin),
    ).toEqual([
      { formatOwnerKey: "fixture.a/v1", originFormatVersion: 1 },
      undefined,
      undefined,
      { formatOwnerKey: "fixture.b/v1", originFormatVersion: 1 },
      undefined,
    ]);
    expect(stripRuntimePayloadOriginMetadata(admission.event)).toEqual(
      envelope(events.map((e) => JSON.parse(JSON.stringify(e)) as RuntimeEvent)),
    );
    expect(() => admittedRuntimePayloadBatch({ event: wire } as never, 0)).toThrow(
      "owned IPC admission",
    );
  });
  it.each(
    [
      [
        [0, 0, "fixture.a/v1"],
        [0, 0, "fixture.b/v1"],
      ],
      [
        [0, 1, "fixture.a/v1"],
        [0, 0, "fixture.b/v1"],
      ],
      [[-1, 0, "fixture.a/v1"]],
      [[0, 9, "fixture.a/v1"]],
      [[1, 0, "fixture.a/v1"]],
      [[0, 0.1, "fixture.a/v1"]],
      [[0, 0, "bad:format"]],
      [[0, 0, "fixture.a/v1", "extra"]],
    ].map((entries) => ({ entries })),
  )("rejects the whole malformed sparse binding $entries", ({ entries }) => {
    const wire = {
      ...envelope([start("first"), start("second")]),
      runtimePayloadOrigins: { version: 1, generation: "boot", entries },
    };
    expect(admitRuntimePayloadOriginEnvelope(wire, "boot")).toBeUndefined();
    expect(stripRuntimePayloadOriginMetadata(wire)).not.toHaveProperty("runtimePayloadOrigins");
  });
  it("charges metadata against event limits and bounds the wire tuple count", () => {
    const event = start("bounded");
    const captured = captureRuntimePayloadOrigin(event, "a".repeat(128));
    expect(estimateRuntimeEventBytes(captured) - estimateRuntimeEventBytes(event)).toBe(768);
    const wire = roundtrip(serializeRuntimePayloadOrigins(envelope([captured]), "boot"));
    const admitted = admittedRuntimePayloadBatch(
      admitRuntimePayloadOriginEnvelope(wire, "boot")!,
      0,
    ).events[0]!;
    expect(estimateRuntimeEventBytes(admitted)).toBe(estimateRuntimeEventBytes(captured));
    const tooMany = {
      ...wire,
      runtimePayloadOrigins: {
        version: 1,
        generation: "boot",
        entries: Array(RUNTIME_PAYLOAD_ORIGIN_MAX_ENTRIES + 1).fill([0, 0, "fixture.a/v1"]),
      },
    };
    expect(admitRuntimePayloadOriginEnvelope(tooMany, "boot")).toBeUndefined();
  });
});
