import type { SupervisorEvent, SupervisorReply } from "@/shared/ipc";
import { describe, expect, it } from "vitest";
import {
  canonicalThreadIdsOf,
  estimateMessageBytes,
  isCanonicalRuntimeMessage,
  isSupervisorReply,
  laneForMessage,
  messageType,
} from "./supervisorIpcMessagePolicy";

const reply: SupervisorReply = { replyTo: "r1", ok: true, data: null };

function output(threadId: string, data: string): SupervisorEvent {
  return {
    type: "thread-output",
    threadId,
    data,
    outputLength: data.length,
    terminalInstanceId: "gen-1",
  };
}

function runtimeEvent(threadId: string, event: { type: string }): SupervisorEvent {
  return { type: "thread-runtime-event", threadId, event: event as never };
}

function runtimeEvents(threadId: string, events: Array<{ type: string }>): SupervisorEvent {
  return { type: "thread-runtime-events", threadId, events: events as never };
}

function runtimeEventsMulti(
  batches: Array<{ threadId: string; events: Array<{ type: string }> }>,
): SupervisorEvent {
  return {
    type: "thread-runtime-events-multi",
    batches: batches.map((batch) => ({ threadId: batch.threadId, events: batch.events as never })),
  };
}

const delta = { type: "content.delta" };
const error = { type: "error" };

describe("supervisorIpcMessagePolicy addressing and routing", () => {
  it("recognizes replies structurally by replyTo", () => {
    expect(isSupervisorReply(reply)).toBe(true);
    expect(isSupervisorReply(output("t", "x"))).toBe(false);
    expect(isSupervisorReply({ kind: "bulk" })).toBe(false);
  });

  it("derives a message type from type, then kind, then the primitive type", () => {
    expect(messageType({ type: "thread-state" } as never)).toBe("thread-state");
    expect(messageType({ kind: "supervisor-flow-control-capabilities" } as never)).toBe(
      "supervisor-flow-control-capabilities",
    );
    expect(messageType({ other: true } as never)).toBe("unknown");
    expect(messageType("raw" as never)).toBe("string");
  });

  it("routes replies, lifecycle, capabilities, and stop-path errors to the control lane", () => {
    expect(laneForMessage(reply)).toBe("control");
    expect(
      laneForMessage({
        type: "thread-state",
        threadId: "t",
        status: "error",
        attention: "error",
        canResumeWithConfig: false,
      }),
    ).toBe("control");
    expect(laneForMessage({ type: "thread-exited", threadId: "t", exitCode: 0 })).toBe("control");
    expect(
      laneForMessage({
        kind: "supervisor-flow-control-capabilities",
        versions: [1],
      } as never),
    ).toBe("control");
    expect(laneForMessage(runtimeEvent("t", error))).toBe("control");
    expect(laneForMessage(runtimeEvents("t", [delta, error]))).toBe("control");
    expect(
      laneForMessage(
        runtimeEventsMulti([
          { threadId: "t1", events: [delta] },
          { threadId: "t2", events: [error] },
        ]),
      ),
    ).toBe("control");
  });

  it("keeps non-error runtime traffic and other events in the bulk lane", () => {
    expect(laneForMessage(runtimeEvent("t", delta))).toBe("bulk");
    expect(laneForMessage(runtimeEvents("t", [delta]))).toBe("bulk");
    expect(laneForMessage(runtimeEvents("t", []))).toBe("bulk");
    expect(laneForMessage(runtimeEventsMulti([{ threadId: "t1", events: [delta] }]))).toBe("bulk");
    expect(laneForMessage(output("t", "x"))).toBe("bulk");
    expect(laneForMessage({ type: "git-changed", projectId: "p" })).toBe("bulk");
  });

  it("recognizes exactly the three canonical runtime envelope types", () => {
    expect(isCanonicalRuntimeMessage(runtimeEvent("t", delta))).toBe(true);
    expect(isCanonicalRuntimeMessage(runtimeEvents("t", [delta]))).toBe(true);
    expect(
      isCanonicalRuntimeMessage(runtimeEventsMulti([{ threadId: "t", events: [delta] }])),
    ).toBe(true);
    expect(isCanonicalRuntimeMessage(output("t", "x"))).toBe(false);
    expect(isCanonicalRuntimeMessage({ type: "git-changed", projectId: "p" })).toBe(false);
    expect(isCanonicalRuntimeMessage(reply)).toBe(false);
    expect(isCanonicalRuntimeMessage({ kind: "supervisor-output-shed", threadIds: [] })).toBe(
      false,
    );
  });

  it("addresses canonical envelopes by thread with multi batches deduplicated", () => {
    expect(canonicalThreadIdsOf(runtimeEvent("t1", delta))).toEqual(["t1"]);
    expect(canonicalThreadIdsOf(runtimeEvents("t2", [delta]))).toEqual(["t2"]);
    expect(
      canonicalThreadIdsOf(
        runtimeEventsMulti([
          { threadId: "b", events: [delta] },
          { threadId: "a", events: [delta] },
          { threadId: "b", events: [delta] },
        ]),
      ),
    ).toEqual(["b", "a"]);
    expect(canonicalThreadIdsOf({ type: "thread-exited", threadId: "t", exitCode: null })).toEqual(
      [],
    );
  });

  it("estimates terminal output as utf8 data bytes plus the envelope overhead", () => {
    expect(estimateMessageBytes(output("t", "a🧪"), 999)).toBe(
      Buffer.byteLength("a🧪", "utf8") + 128,
    );
  });

  it("estimates other messages as their utf8 JSON serialization", () => {
    expect(estimateMessageBytes(reply, 999)).toBe(Buffer.byteLength(JSON.stringify(reply), "utf8"));
    expect(estimateMessageBytes({ kind: "bulk", label: "x" }, 999)).toBe(
      Buffer.byteLength(JSON.stringify({ kind: "bulk", label: "x" }), "utf8"),
    );
  });

  it("returns the caller-supplied unmeasurable bound when serialization fails", () => {
    expect(estimateMessageBytes({ kind: "bulk", big: 1n } as never, 1234)).toBe(1234);
  });
});
