import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionNotification } from "@agentclientprotocol/sdk/unstable";
import type { TranscriptStep } from "./acpSubagentTranscripts";
import {
  AntigravityTurnHoldDetector,
  isAntigravityBackgroundWaitTranscript,
  parseAntigravityAcpTurnSignal,
  type AntigravityTurnHoldOptions,
} from "./acpTurnHold";

// Lines captured verbatim from agy_acp_server_20260818_01_RC01 stderr.
const WAITING_LINE =
  'I0831 14:08:16.659332 51136 local_connection.py:521] RAW WS MSG: {"trajectoryStateUpdate":{"trajectoryId":"82dd91b2-63cc-41cf-8cf7-11c5cdf5036f", "state":"STATE_WAITING_FOR_TASKS"}, "seqNum":"17", "timestampMicros":"1788210496658811"}';
const RUNNING_LINE =
  'I0831 14:08:31.996059 51136 local_connection.py:521] RAW WS MSG: {"trajectoryStateUpdate":{"trajectoryId":"82dd91b2-63cc-41cf-8cf7-11c5cdf5036f", "state":"STATE_RUNNING"}, "seqNum":"20", "timestampMicros":"1788210511996059"}';
const FULLY_IDLE_LINE =
  'I0831 14:08:33.250897 51136 local_connection.py:521] RAW WS MSG: {"trajectoryStateUpdate":{"trajectoryId":"82dd91b2-63cc-41cf-8cf7-11c5cdf5036f", "state":"STATE_FULLY_IDLE"}, "seqNum":"27", "timestampMicros":"1788210513250897"}';

describe("parseAntigravityAcpTurnSignal", () => {
  it("signals background-wait on the trajectory WAITING_FOR_TASKS diagnostic", () => {
    expect(parseAntigravityAcpTurnSignal(WAITING_LINE)).toBe("background-wait");
  });

  it("ignores other trajectory states", () => {
    expect(parseAntigravityAcpTurnSignal(RUNNING_LINE)).toBeUndefined();
    expect(parseAntigravityAcpTurnSignal(FULLY_IDLE_LINE)).toBeUndefined();
  });

  it("ignores the state name outside a trajectoryStateUpdate payload", () => {
    // Model output echoed to stderr (or any prose mentioning the state) must
    // not complete a turn.
    expect(
      parseAntigravityAcpTurnSignal("the harness may report STATE_WAITING_FOR_TASKS here"),
    ).toBeUndefined();
    expect(
      parseAntigravityAcpTurnSignal(
        '{"stepUpdate":{"text":"STATE_WAITING_FOR_TASKS is a state"}, "seqNum":"3"}',
      ),
    ).toBeUndefined();
  });

  it("ignores unrelated diagnostics", () => {
    expect(
      parseAntigravityAcpTurnSignal(
        "I0831 14:08:05.818595 51136 main.py:80] Starting AGY ACP Server...",
      ),
    ).toBeUndefined();
    expect(parseAntigravityAcpTurnSignal("")).toBeUndefined();
  });
});

describe("isAntigravityBackgroundWaitTranscript", () => {
  const WAITING: TranscriptStep[] = [
    {
      step_index: 1,
      type: "PLANNER_RESPONSE",
      status: "DONE",
      tool_calls: [{ name: "run_command", args: {} }],
    },
    { step_index: 2, type: "RUN_COMMAND", status: "RUNNING", content: "started" },
    { step_index: 3, type: "PLANNER_RESPONSE", status: "DONE", content: "STARTED" },
  ];

  it("accepts a finished text-only reply over a still-running step", () => {
    expect(isAntigravityBackgroundWaitTranscript(WAITING)).toBe(true);
  });

  it("rejects a reply whose planner step still calls tools", () => {
    expect(isAntigravityBackgroundWaitTranscript(WAITING.slice(0, 1))).toBe(false);
  });

  it("rejects a transcript whose last step is not a planner reply", () => {
    expect(
      isAntigravityBackgroundWaitTranscript([WAITING[0]!, WAITING[1]!, WAITING[2]!].slice(0, 2)),
    ).toBe(false);
  });

  it("rejects a transcript with no running earlier step", () => {
    expect(
      isAntigravityBackgroundWaitTranscript([
        WAITING[0]!,
        { step_index: 2, type: "RUN_COMMAND", status: "DONE", content: "started" },
        WAITING[2]!,
      ]),
    ).toBe(false);
  });

  it("rejects an empty reply and an empty transcript", () => {
    expect(
      isAntigravityBackgroundWaitTranscript([
        WAITING[0]!,
        WAITING[1]!,
        { ...WAITING[2]!, content: "  " },
      ]),
    ).toBe(false);
    expect(isAntigravityBackgroundWaitTranscript([])).toBe(false);
  });
});

describe("AntigravityTurnHoldDetector", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const WAITING: TranscriptStep[] = [
    {
      step_index: 1,
      type: "PLANNER_RESPONSE",
      status: "DONE",
      tool_calls: [{ name: "run_command", args: {} }],
    },
    { step_index: 2, type: "RUN_COMMAND", status: "RUNNING", content: "started" },
    { step_index: 3, type: "PLANNER_RESPONSE", status: "DONE", content: "STARTED" },
  ];

  function makeDetector(steps: TranscriptStep[] | undefined, options?: AntigravityTurnHoldOptions) {
    const hold = vi.fn<() => void>();
    let current = steps;
    const readSteps = vi.fn<() => Promise<TranscriptStep[] | undefined>>(async () => current);
    const detector = new AntigravityTurnHoldDetector(
      hold,
      { readSteps },
      { pollIntervalMs: 100, settleMs: 300, ...options },
    );
    return {
      detector,
      hold,
      readSteps,
      setSteps: (next: TranscriptStep[] | undefined) => {
        current = next;
      },
    };
  }

  const cmd = (id: string) =>
    ({
      sessionId: "s",
      update: {
        sessionUpdate: "tool_call",
        toolCallId: id,
        title: "sleep 119",
        kind: "execute",
        status: "in_progress",
        rawInput: {},
      },
    }) as SessionNotification;

  it("holds after the settle period while a tool call is open", async () => {
    const { detector, hold } = makeDetector(WAITING);
    detector.onTurnStart();
    detector.onSessionUpdate(cmd("s:2"));
    await vi.advanceTimersByTimeAsync(100);
    expect(hold).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(300);
    expect(hold).toHaveBeenCalledOnce();
  });

  it("does not hold while the planner step still calls tools", async () => {
    const { detector, hold } = makeDetector(WAITING.slice(0, 1));
    detector.onTurnStart();
    detector.onSessionUpdate(cmd("s:2"));
    await vi.advanceTimersByTimeAsync(2000);
    expect(hold).not.toHaveBeenCalled();
  });

  it("does not hold without a running earlier step", async () => {
    const { detector, hold } = makeDetector([
      WAITING[0]!,
      { step_index: 2, type: "RUN_COMMAND", status: "DONE", content: "started" },
      WAITING[2]!,
    ]);
    detector.onTurnStart();
    detector.onSessionUpdate(cmd("s:2"));
    await vi.advanceTimersByTimeAsync(2000);
    expect(hold).not.toHaveBeenCalled();
  });

  it("does not poll while no tool call is open", async () => {
    const { detector, hold, readSteps } = makeDetector(WAITING);
    detector.onTurnStart();
    await vi.advanceTimersByTimeAsync(2000);
    expect(readSteps).not.toHaveBeenCalled();
    expect(hold).not.toHaveBeenCalled();
  });

  it("stops checking once the tool call closes on the wire", async () => {
    const { detector, hold } = makeDetector(WAITING);
    detector.onTurnStart();
    detector.onSessionUpdate(cmd("s:2"));
    await vi.advanceTimersByTimeAsync(100);
    detector.onSessionUpdate({
      sessionId: "s",
      update: {
        sessionUpdate: "tool_call_update",
        toolCallId: "s:2",
        status: "completed",
        rawOutput: { exitCode: 0, combinedOutput: "" },
      },
    });
    await vi.advanceTimersByTimeAsync(2000);
    expect(hold).not.toHaveBeenCalled();
  });

  it("does not hold when the last tool closes while the transcript read is in flight", async () => {
    const hold = vi.fn<() => void>();
    let resolveRead!: (steps: TranscriptStep[]) => void;
    const readSteps = vi.fn<() => Promise<TranscriptStep[] | undefined>>(
      () =>
        new Promise((resolve) => {
          resolveRead = resolve;
        }),
    );
    const detector = new AntigravityTurnHoldDetector(
      hold,
      { readSteps },
      { pollIntervalMs: 100, settleMs: 300 },
    );
    detector.onTurnStart();
    detector.onSessionUpdate(cmd("s:2"));
    await vi.advanceTimersByTimeAsync(100);
    detector.onSessionUpdate({
      sessionId: "s",
      update: {
        sessionUpdate: "tool_call_update",
        toolCallId: "s:2",
        status: "completed",
        rawOutput: { exitCode: 0, combinedOutput: "" },
      },
    });
    resolveRead(WAITING);
    await vi.advanceTimersByTimeAsync(1000);
    expect(hold).not.toHaveBeenCalled();
  });

  it("re-arms when a new turn opens a tool while the old read is in flight", async () => {
    let reads = 0;
    let release!: () => void;
    let entered!: () => void;
    const ready = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const readSteps = vi.fn<() => Promise<TranscriptStep[]>>(async () => {
      reads += 1;
      if (reads === 1) {
        entered();
        await gate;
      }
      return [] as TranscriptStep[];
    });
    const detector = new AntigravityTurnHoldDetector(
      () => {},
      { readSteps },
      { pollIntervalMs: 5, settleMs: 0 },
    );
    detector.onTurnStart();
    detector.onSessionUpdate(cmd("s:2"));
    await vi.advanceTimersByTimeAsync(5);
    await ready;
    detector.onTurnEnd();
    detector.onTurnStart();
    detector.onSessionUpdate(cmd("s:3"));
    release();
    await vi.advanceTimersByTimeAsync(30);
    expect(reads).toBeGreaterThanOrEqual(2);
    detector.dispose();
  });

  it("holds at most once per turn and re-arms on the next turn", async () => {
    const { detector, hold, setSteps } = makeDetector(WAITING);
    detector.onTurnStart();
    detector.onSessionUpdate(cmd("s:2"));
    await vi.advanceTimersByTimeAsync(400);
    expect(hold).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(2000);
    expect(hold).toHaveBeenCalledOnce();

    setSteps([
      WAITING[0]!,
      { step_index: 4, type: "RUN_COMMAND", status: "RUNNING", content: "restarted" },
      { step_index: 5, type: "PLANNER_RESPONSE", status: "DONE", content: "RESTARTED" },
    ]);
    detector.onTurnEnd();
    detector.onTurnStart();
    detector.onSessionUpdate(cmd("s:9"));
    await vi.advanceTimersByTimeAsync(500);
    expect(hold).toHaveBeenCalledTimes(2);
  });

  it("does nothing before a turn starts and after dispose", async () => {
    const { detector, hold, readSteps } = makeDetector(WAITING);
    detector.onSessionUpdate(cmd("s:2"));
    await vi.advanceTimersByTimeAsync(2000);
    expect(readSteps).not.toHaveBeenCalled();
    expect(hold).not.toHaveBeenCalled();

    detector.onTurnStart();
    detector.onSessionUpdate(cmd("s:3"));
    detector.dispose();
    await vi.advanceTimersByTimeAsync(2000);
    expect(hold).not.toHaveBeenCalled();
  });

  it("treats an unreadable transcript as not waiting", async () => {
    const { detector, hold } = makeDetector(undefined);
    detector.onTurnStart();
    detector.onSessionUpdate(cmd("s:2"));
    await vi.advanceTimersByTimeAsync(2000);
    expect(hold).not.toHaveBeenCalled();
  });
});
