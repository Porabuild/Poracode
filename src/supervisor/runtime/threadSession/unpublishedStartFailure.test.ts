import { describe, expect, it } from "vitest";
import type { SupervisorEvent } from "@/shared/ipc";
import { RuntimeEventRouter } from "./runtimeEventRouter";
import {
  publishUnpublishedStartFailure,
  retainUnpublishedStartSessionRef,
  publishUnpublishedStartInterruption,
} from "./unpublishedStartFailure";

describe("unpublished startup failure delivery", () => {
  it("keeps the authoritative failed state behind its persisted error under backpressure", () => {
    const delivered: SupervisorEvent[] = [];
    const router = new RuntimeEventRouter((event) => {
      delivered.push(event);
    });
    router.setPaused(true);

    publishUnpublishedStartFailure("unopened", new Error("Configuration rejected"), router);
    router.flush();
    expect(delivered).toEqual([]);

    router.setPaused(false);
    router.flush();
    expect(delivered).toEqual([
      {
        type: "thread-runtime-event",
        threadId: "unopened",
        event: { type: "error", threadId: "unopened", message: "Configuration rejected" },
      },
      expect.objectContaining({
        type: "thread-state",
        threadId: "unopened",
        status: "error",
        forceCloseActiveTurn: true,
        threadStatusSource: "server",
      }),
    ]);
    expect(router.hasPending()).toBe(false);
  });
});

it("keeps reused error captures scoped to the exact failed thread and consumes them once", () => {
  const delivered: SupervisorEvent[] = [];
  const router = new RuntimeEventRouter((event) => {
    delivered.push(event);
  });
  const error = new Error("Selection unavailable");
  const referenceA = {
    providerSessionId: "owned-a",
    discoveredAt: "2026-10-08T00:00:00Z",
    executionIdentity: "owner-a",
  };
  const referenceB = { ...referenceA, providerSessionId: "owned-b", executionIdentity: "owner-b" };
  expect(retainUnpublishedStartSessionRef(error, "thread-a", "provider:a", referenceA)).toBe(error);
  retainUnpublishedStartSessionRef(error, "thread-b", "provider:b", referenceB);
  referenceA.executionIdentity = "mutated-after-capture";
  publishUnpublishedStartFailure("thread-b", error, router);
  publishUnpublishedStartFailure("thread-a", error, router);
  router.flush();
  const states = delivered.filter((event) => event.type === "thread-state");
  expect(states).toEqual([
    expect.objectContaining({
      threadId: "thread-b",
      agentKind: "provider:b",
      sessionRef: referenceB,
      canResumeWithConfig: true,
    }),
    expect.objectContaining({
      threadId: "thread-a",
      agentKind: "provider:a",
      sessionRef: { ...referenceA, executionIdentity: "owner-a" },
      canResumeWithConfig: true,
    }),
  ]);
  delivered.length = 0;
  publishUnpublishedStartFailure("thread-a", error, router);
  router.flush();
  expect(delivered.filter((event) => event.type === "thread-state")).toEqual([
    expect.objectContaining({ canResumeWithConfig: false }),
  ]);
});

it("retains an interrupted resource without publishing an error or inventing resume support", () => {
  const delivered: SupervisorEvent[] = [];
  const router = new RuntimeEventRouter((event) => {
    delivered.push(event);
  });
  const reference = {
    providerSessionId: "owned-interrupted",
    discoveredAt: "2026-10-08T00:00:00Z",
  };
  const error = retainUnpublishedStartSessionRef(
    new Error("Cancelled open"),
    "thread",
    "provider",
    reference,
    false,
  );
  publishUnpublishedStartInterruption("thread", error, router);
  router.flush();
  expect(delivered).toEqual([
    expect.objectContaining({
      type: "thread-state",
      threadId: "thread",
      status: "inactive",
      attention: "none",
      sessionRef: reference,
      canResumeWithConfig: false,
      forceCloseActiveTurn: true,
    }),
  ]);
});
