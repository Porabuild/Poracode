import { describe, expect, it } from "vitest";
import {
  BACKGROUND_TASK_OUTPUT_MAX_UTF16_LENGTH,
  backgroundTaskCategorySchema,
  backgroundTaskOutputSchema,
} from "@/shared/contracts";
import {
  applyBackgroundTaskReduce,
  backgroundTaskReduceAction,
  type BackgroundTaskIdentity,
} from "./backgroundTaskReduce";
import {
  BACKGROUND_TASK_OUTPUT_ACTION_ID,
  BACKGROUND_TASK_OUTPUT_RESULT,
  BACKGROUND_TASK_REDUCE_CATEGORIES,
  BACKGROUND_TASK_REDUCE_SPEC,
} from "./backgroundTaskReduceSpec";
import { followUpQueueReduceAction } from "./followUpQueueMachine";

describe("background-task reduce", () => {
  const a = { taskId: "a", kind: "command" as const, description: "one" };
  const b = { taskId: "b", kind: "other" as const, description: "two" };

  it("keeps the reduce category vocabulary in sync with the wire schema", () => {
    expect([...BACKGROUND_TASK_REDUCE_CATEGORIES]).toEqual([
      ...backgroundTaskCategorySchema.options,
    ]);
    expect(BACKGROUND_TASK_OUTPUT_RESULT).toEqual(BACKGROUND_TASK_REDUCE_SPEC.outputResult);
    expect(BACKGROUND_TASK_OUTPUT_RESULT.actionId).toBe(BACKGROUND_TASK_OUTPUT_ACTION_ID);
    expect(BACKGROUND_TASK_OUTPUT_RESULT.fields).toEqual(["output", "totalBytes", "truncated"]);
    expect(BACKGROUND_TASK_OUTPUT_RESULT.maxOutputUtf16Length).toBe(
      BACKGROUND_TASK_OUTPUT_MAX_UTF16_LENGTH,
    );
    expect(BACKGROUND_TASK_OUTPUT_RESULT.maxTotalBytes).toBe(Number.MAX_SAFE_INTEGER);
  });

  it("validates the neutral background-task output response", () => {
    expect(
      backgroundTaskOutputSchema.parse({
        output: "tail\n",
        totalBytes: 4096,
        truncated: true,
      }),
    ).toEqual({ output: "tail\n", totalBytes: 4096, truncated: true });
    expect(
      backgroundTaskOutputSchema.safeParse({
        output: "x",
        totalBytes: 1.5,
        truncated: false,
      }).success,
    ).toBe(false);
    expect(
      backgroundTaskOutputSchema.safeParse({
        output: "x",
        totalBytes: -1,
        truncated: false,
      }).success,
    ).toBe(false);
    expect(
      backgroundTaskOutputSchema.safeParse({
        output: "x".repeat(16_385),
        totalBytes: 16_385,
        truncated: false,
      }).success,
    ).toBe(false);
  });

  it("accepts old task lists and retains progress-only and capability changes", () => {
    const rich: BackgroundTaskIdentity = {
      ...a,
      category: "command",
      command: "pnpm test",
      startedAt: 123,
      lastProgressAt: 456,
      progress: "Ready",
      stopAction: { id: "stop.v1", payload: { task: "a", token: "run-1" } },
      outputAction: { id: "output.v1", payload: { task: "a", token: "run-1" } },
    };
    const reduce = (incoming: typeof rich) =>
      backgroundTaskReduceAction({
        eventType: "background_tasks.changed",
        incoming: [incoming],
        previous: [rich],
      });
    expect(
      backgroundTaskReduceAction({
        eventType: "background_tasks.changed",
        incoming: [rich],
        previous: [a],
      }),
    ).toBe("replace");
    expect(reduce({ ...rich, lastProgressAt: 457 })).toBe("replace");
    expect(reduce({ ...rich, progress: "Checking" })).toBe("replace");
    expect(reduce({ ...rich, category: "other" })).toBe("replace");
    expect(reduce({ ...rich, command: "pnpm build" })).toBe("replace");
    expect(
      reduce({
        ...rich,
        outputAction: { id: "output.v2", payload: { token: "run-1" } },
      }),
    ).toBe("replace");
    expect(
      reduce({
        ...rich,
        stopAction: {
          ...rich.stopAction!,
          payload: { ...rich.stopAction!.payload, token: "run-2" },
        },
      }),
    ).toBe("replace");
    expect(
      reduce({
        ...rich,
        outputAction: {
          ...rich.outputAction!,
          payload: { ...rich.outputAction!.payload, token: "run-2" },
        },
      }),
    ).toBe("replace");
    expect(
      reduce({
        ...rich,
        stopAction: {
          ...rich.stopAction!,
          payload: { token: "run-1", task: "a" },
        },
      }),
    ).toBe("noop");
    expect(
      reduce({
        ...rich,
        outputAction: {
          ...rich.outputAction!,
          payload: { token: "run-1", task: "a" },
        },
      }),
    ).toBe("noop");
    expect(
      backgroundTaskReduceAction({
        eventType: "background_tasks.changed",
        incoming: [a],
        previous: [rich],
      }),
    ).toBe("replace");
  });

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
