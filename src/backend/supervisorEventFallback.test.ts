import type { SupervisorEvent } from "@/shared/ipc";
import { describe, expect, it } from "vitest";
import {
  filterEventForWindow,
  planDesktopRelay,
  splitSupervisorEvent,
  type DesktopRelayPlannerInput,
} from "./supervisorEventFallback";
import { filterSupervisorEventForInterests } from "./BackendHostCore";

const BULK: SupervisorEvent = {
  type: "thread-output",
  threadId: "thread-1",
  data: "bytes",
  outputLength: 5,
  terminalInstanceId: "gen-1",
};

const CONTROL: SupervisorEvent = {
  type: "thread-state",
  threadId: "thread-1",
  status: "working",
  attention: "none",
  canResumeWithConfig: false,
};

function interests(threads: string[]): {
  terminalThreadIds: string[];
  runtimeThreadIds: string[];
  allRuntimeEvents: boolean;
} {
  return {
    terminalThreadIds: [...threads],
    runtimeThreadIds: [...threads],
    allRuntimeEvents: false,
  };
}

/** The production interest filter is injected by the caller; tests use it identically. */
function passThroughFilter(event: SupervisorEvent): SupervisorEvent {
  return event;
}

function plannerInput(
  overrides: Partial<DesktopRelayPlannerInput> & Pick<DesktopRelayPlannerInput, "event">,
): DesktopRelayPlannerInput {
  return {
    ownershipArmed: true,
    fallbackWindows: [],
    isTerminalBootstrapRetainedFor: () => false,
    filterEventForInterests: (event, windowInterests) =>
      filterSupervisorEventForInterests(event, windowInterests),
    filterShellEvent: passThroughFilter,
    ...overrides,
  };
}

describe("splitSupervisorEvent", () => {
  it("splits pure bulk, pure control, single, list, and multi batches", () => {
    expect(splitSupervisorEvent(BULK)).toEqual({ bulk: BULK, controls: null });
    expect(splitSupervisorEvent(CONTROL)).toEqual({ bulk: null, controls: CONTROL });

    const bulkRuntime: SupervisorEvent = {
      type: "thread-runtime-event",
      threadId: "thread-1",
      event: { type: "item.completed", threadId: "thread-1", itemId: "i1" },
    };
    expect(splitSupervisorEvent(bulkRuntime)).toEqual({ bulk: bulkRuntime, controls: null });
    const controlRuntime: SupervisorEvent = {
      type: "thread-runtime-event",
      threadId: "thread-1",
      event: { type: "turn.completed", threadId: "thread-1", turnId: "t1", state: "completed" },
    };
    expect(splitSupervisorEvent(controlRuntime)).toEqual({ bulk: null, controls: controlRuntime });

    const mixedList: SupervisorEvent = {
      type: "thread-runtime-events",
      threadId: "thread-1",
      events: [
        { type: "item.started", threadId: "thread-1", itemId: "i1", itemType: "assistant_message" },
        { type: "turn.completed", threadId: "thread-1", turnId: "t1", state: "completed" },
      ],
    };
    const splitList = splitSupervisorEvent(mixedList);
    expect(splitList.bulk).toMatchObject({ events: [{ type: "item.started" }] });
    expect(splitList.controls).toMatchObject({ events: [{ type: "turn.completed" }] });

    const mixedMulti: SupervisorEvent = {
      type: "thread-runtime-events-multi",
      batches: [
        {
          threadId: "thread-1",
          events: [{ type: "item.completed", threadId: "thread-1", itemId: "i1" }],
        },
        {
          threadId: "thread-2",
          events: [
            { type: "turn.completed", threadId: "thread-2", turnId: "t2", state: "completed" },
          ],
        },
      ],
    };
    const splitMulti = splitSupervisorEvent(mixedMulti);
    expect(splitMulti.bulk).toMatchObject({ batches: [{ threadId: "thread-1" }] });
    expect(splitMulti.controls).toMatchObject({ batches: [{ threadId: "thread-2" }] });
  });

  it("keeps empty terminal output out of the bulk half", () => {
    const empty: SupervisorEvent = { ...BULK, data: "", outputLength: 0 };
    expect(splitSupervisorEvent(empty)).toEqual({ bulk: null, controls: empty });
  });
});

describe("filterEventForWindow", () => {
  it("narrows a multi-thread event to the window's own threads", () => {
    const multi: SupervisorEvent = {
      type: "thread-runtime-events-multi",
      batches: [
        {
          threadId: "thread-1",
          events: [{ type: "item.completed", threadId: "thread-1", itemId: "i1" }],
        },
        {
          threadId: "thread-2",
          events: [{ type: "item.completed", threadId: "thread-2", itemId: "i2" }],
        },
      ],
    };
    const narrowed = filterEventForWindow(
      multi,
      { windowId: 8, interests: interests(["thread-2"]) },
      filterSupervisorEventForInterests,
      () => false,
    );
    expect(narrowed).toMatchObject({
      type: "thread-runtime-events-multi",
      batches: [{ threadId: "thread-2" }],
    });
  });

  it("fails open for a terminal-bootstrap thread the window itself retained", () => {
    const narrowed = filterEventForWindow(
      BULK,
      { windowId: 7, interests: interests([]) },
      filterSupervisorEventForInterests,
      (windowId, threadId) => windowId === 7 && threadId === "thread-1",
    );
    expect(narrowed).toEqual(BULK);
    // Retention never widens unrelated threads — or unrelated windows: only
    // the authenticated requesting window's copy is augmented.
    const unrelatedThread = filterEventForWindow(
      { ...BULK, threadId: "thread-9" },
      { windowId: 7, interests: interests([]) },
      filterSupervisorEventForInterests,
      (windowId, threadId) => windowId === 7 && threadId === "thread-1",
    );
    expect(unrelatedThread).toBeNull();
    const otherWindow = filterEventForWindow(
      BULK,
      { windowId: 8, interests: interests([]) },
      filterSupervisorEventForInterests,
      (windowId, threadId) => windowId === 7 && threadId === "thread-1",
    );
    expect(otherWindow).toBeNull();
  });

  it("returns null for an uninterested window without bootstrap retention", () => {
    expect(
      filterEventForWindow(
        BULK,
        { windowId: 8, interests: interests(["thread-2"]) },
        filterSupervisorEventForInterests,
        () => false,
      ),
    ).toBeNull();
  });
});

describe("planDesktopRelay", () => {
  const FALLBACK_B = {
    windowId: 8,
    generation: 2,
    interests: interests(["thread-2"]),
    receivesShellRemainder: false,
  };

  it("plans a legacy full relay when ownership was never armed", () => {
    const plan = planDesktopRelay(
      plannerInput({ event: BULK, ownershipArmed: false, fallbackWindows: [FALLBACK_B] }),
    );
    expect(plan).toEqual({ mode: "legacy", shellEvent: BULK, copies: [] });
  });

  it("never plans bulk for an uninterested fallback window and never a bulk shell remainder", () => {
    const plan = planDesktopRelay(plannerInput({ event: BULK, fallbackWindows: [FALLBACK_B] }));
    expect(plan.mode).toBe("targeted");
    expect(plan.copies).toEqual([]);
    // Pure bulk has no control half: the shell remainder is null.
    expect(plan.mode === "targeted" ? plan.shellEvent : null).toBeNull();
  });

  it("plans targeted copies for an interested fallback window with its identity", () => {
    const plan = planDesktopRelay(
      plannerInput({
        event: BULK,
        fallbackWindows: [
          {
            windowId: 8,
            generation: 2,
            interests: interests(["thread-1"]),
            receivesShellRemainder: false,
          },
        ],
      }),
    );
    expect(plan.mode).toBe("targeted");
    if (plan.mode !== "targeted") throw new Error("unreachable");
    expect(plan.copies).toEqual([{ target: { windowId: 8, generation: 2 }, event: BULK }]);
    expect(plan.shellEvent).toBeNull();
  });

  it("keeps controls in a non-shell window's copy: that window has no other path for them", () => {
    const plan = planDesktopRelay(
      plannerInput({ event: CONTROL, fallbackWindows: [FALLBACK_B], filterShellEvent: () => null }),
    );
    if (plan.mode !== "targeted") throw new Error("unreachable");
    expect(plan.copies).toEqual([{ target: { windowId: 8, generation: 2 }, event: CONTROL }]);
    // The shell remainder was suppressed to prove the copy is the window's
    // only control path — stripping it there would strand its controls.
    expect(plan.shellEvent).toBeNull();
  });

  it("keeps controls out of the shell-recipient window's copy (exact-once via the shell)", () => {
    const mixed: SupervisorEvent = {
      type: "thread-runtime-events",
      threadId: "thread-1",
      events: [
        { type: "item.started", threadId: "thread-1", itemId: "i1", itemType: "assistant_message" },
        { type: "turn.completed", threadId: "thread-1", turnId: "t1", state: "completed" },
      ],
    };
    const plan = planDesktopRelay(
      plannerInput({
        event: mixed,
        fallbackWindows: [
          {
            windowId: 7,
            generation: 1,
            interests: interests(["thread-1"]),
            receivesShellRemainder: true,
          },
        ],
      }),
    );
    if (plan.mode !== "targeted") throw new Error("unreachable");
    // The main-window copy carries the bulk half only; the sequence-less shell
    // remainder carries its controls, so it applies each control exactly once
    // and its native consumers (sleep state, agent statuses) see them once.
    expect(plan.copies).toEqual([
      {
        target: { windowId: 7, generation: 1 },
        event: {
          type: "thread-runtime-events",
          threadId: "thread-1",
          events: [
            {
              type: "item.started",
              threadId: "thread-1",
              itemId: "i1",
              itemType: "assistant_message",
            },
          ],
        },
      },
    ]);
    expect(plan.shellEvent).toMatchObject({ events: [{ type: "turn.completed" }] });
  });

  it("plans no copy for the shell-recipient window when the event is pure control", () => {
    const plan = planDesktopRelay(
      plannerInput({
        event: CONTROL,
        fallbackWindows: [
          {
            windowId: 7,
            generation: 1,
            interests: interests(["thread-1"]),
            receivesShellRemainder: true,
          },
        ],
        filterShellEvent: passThroughFilter,
      }),
    );
    if (plan.mode !== "targeted") throw new Error("unreachable");
    expect(plan.copies).toEqual([]);
    expect(plan.shellEvent).toEqual(CONTROL);
  });

  it("attributes bootstrap retention: only the initiating window's copy is widened", () => {
    const starting: SupervisorEvent = {
      type: "thread-output",
      threadId: "shell:new",
      data: "first frame",
      outputLength: 11,
      terminalInstanceId: "gen-1",
    };
    // Window 7 started the shell (authenticated origin) and has not
    // subscribed yet; window 8 is an unrelated fallback consumer.
    const plan = planDesktopRelay(
      plannerInput({
        event: starting,
        fallbackWindows: [
          {
            windowId: 7,
            generation: 1,
            interests: interests([]),
            receivesShellRemainder: true,
          },
          {
            windowId: 8,
            generation: 2,
            interests: interests([]),
            receivesShellRemainder: false,
          },
        ],
        isTerminalBootstrapRetainedFor: (windowId, threadId) =>
          windowId === 7 && threadId === "shell:new",
      }),
    );
    if (plan.mode !== "targeted") throw new Error("unreachable");
    expect(plan.copies).toEqual([{ target: { windowId: 7, generation: 1 }, event: starting }]);
  });

  it("delivers shared subscribed interests during bootstrap without retention widening", () => {
    const starting: SupervisorEvent = {
      type: "thread-output",
      threadId: "shell:new",
      data: "first frame",
      outputLength: 11,
      terminalInstanceId: "gen-1",
    };
    // Both windows subscribe normally: ordinary interest delivery reaches
    // both even though only window 7's retention is attributed.
    const plan = planDesktopRelay(
      plannerInput({
        event: starting,
        fallbackWindows: [
          {
            windowId: 7,
            generation: 1,
            interests: interests(["shell:new"]),
            receivesShellRemainder: true,
          },
          {
            windowId: 8,
            generation: 2,
            interests: interests(["shell:new"]),
            receivesShellRemainder: false,
          },
        ],
        isTerminalBootstrapRetainedFor: (windowId, threadId) =>
          windowId === 7 && threadId === "shell:new",
      }),
    );
    if (plan.mode !== "targeted") throw new Error("unreachable");
    expect(plan.copies.map((copy) => copy.target.windowId).sort()).toEqual([7, 8]);
  });

  it("splits a mixed batch so the shell remainder holds controls only", () => {
    const mixed: SupervisorEvent = {
      type: "thread-runtime-events",
      threadId: "thread-2",
      events: [
        { type: "item.started", threadId: "thread-2", itemId: "i1", itemType: "assistant_message" },
        { type: "turn.completed", threadId: "thread-2", turnId: "t1", state: "completed" },
      ],
    };
    const plan = planDesktopRelay(
      plannerInput({
        event: mixed,
        fallbackWindows: [FALLBACK_B],
        filterEventForInterests: (event) => event,
        filterShellEvent: (event) => event,
      }),
    );
    if (plan.mode !== "targeted") throw new Error("unreachable");
    // The window copy carries the full event it subscribes to.
    expect(plan.copies).toHaveLength(1);
    expect(plan.copies[0]!.event).toEqual(mixed);
    expect(plan.copies[0]!.target).toEqual({ windowId: 8, generation: 2 });
    // The shell remainder is the control half only — bulk never rides it.
    expect(plan.shellEvent).toMatchObject({
      events: [{ type: "turn.completed" }],
    });
  });
});
