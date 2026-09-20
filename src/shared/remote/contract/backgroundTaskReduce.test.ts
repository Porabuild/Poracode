import { describe, expect, it } from "vitest";
import { applyBackgroundTaskReduce, backgroundTaskReduceAction } from "./backgroundTaskReduce";
import { followUpQueueReduceAction } from "./followUpQueueMachine";

describe("background-task reduce", () => {
  const a = { taskId: "a", kind: "command" as const, description: "one" };
  const b = { taskId: "b", kind: "other" as const, description: "two" };

  it("retains previous tasks when an event omits its incoming list", () => {
    const input = { eventType: "background_tasks.changed", incoming: null, previous: [a] };
    expect(backgroundTaskReduceAction(input)).toBe("noop");
    expect(applyBackgroundTaskReduce(input)).toBe(input.previous);
  });

  it("replaces, noops on equal, drains empty and session.exited", () => {
    expect(
      backgroundTaskReduceAction({
        eventType: "background_tasks.changed",
        incoming: [a],
        previous: null,
      }),
    ).toBe("replace");
    expect(
      backgroundTaskReduceAction({
        eventType: "background_tasks.changed",
        incoming: [a],
        previous: [a],
      }),
    ).toBe("noop");
    expect(
      backgroundTaskReduceAction({
        eventType: "background_tasks.changed",
        incoming: [],
        previous: [a],
      }),
    ).toBe("drain");
    expect(
      backgroundTaskReduceAction({ eventType: "session.exited", incoming: [a, b], previous: [a] }),
    ).toBe("drain");
    expect(
      applyBackgroundTaskReduce({ eventType: "session.exited", incoming: [a], previous: [a] }),
    ).toBeNull();
    expect(
      applyBackgroundTaskReduce({
        eventType: "background_tasks.changed",
        incoming: [b],
        previous: [a],
      }),
    ).toEqual([b]);
  });
});

describe("follow-up queue reduce", () => {
  it("ignores foreign or incomplete envelopes, clears null, replaces present", () => {
    expect(
      followUpQueueReduceAction({ sameThread: false, queueKeyPresent: true, queueIsNull: false }),
    ).toBe("ignore");
    expect(
      followUpQueueReduceAction({ sameThread: true, queueKeyPresent: false, queueIsNull: false }),
    ).toBe("ignore");
    expect(
      followUpQueueReduceAction({ sameThread: true, queueKeyPresent: true, queueIsNull: true }),
    ).toBe("clear");
    expect(
      followUpQueueReduceAction({ sameThread: true, queueKeyPresent: true, queueIsNull: false }),
    ).toBe("replace");
  });
});
