import { describe, expect, it } from "vitest";
import type { SessionUpdate } from "@agentclientprotocol/sdk";
import { AcpPlanModeToolTracker } from "./sessionPlanMode";

function toolCall(fields: Record<string, unknown>): SessionUpdate {
  return { sessionUpdate: "tool_call", ...fields } as unknown as SessionUpdate;
}

function toolCallUpdate(fields: Record<string, unknown>): SessionUpdate {
  return { sessionUpdate: "tool_call_update", ...fields } as unknown as SessionUpdate;
}

describe("AcpPlanModeToolTracker", () => {
  it("reports entry when a completed update lands on a call announced as EnterPlanMode", () => {
    // Verbatim shape of a real Kimi Code sequence: the call is renamed to
    // "Requesting to enter plan mode" and the completed update carries no
    // title, so the id announced first is the only thing to correlate on.
    const tracker = new AcpPlanModeToolTracker();
    expect(
      tracker.observe(
        toolCall({
          toolCallId: "0:tool_x",
          title: "EnterPlanMode",
          kind: "other",
          status: "pending",
        }),
      ),
    ).toBeUndefined();
    expect(
      tracker.observe(toolCallUpdate({ toolCallId: "0:tool_x", status: "in_progress" })),
    ).toBeUndefined();
    expect(
      tracker.observe(
        toolCallUpdate({
          toolCallId: "0:tool_x",
          title: "Requesting to enter plan mode",
          status: "in_progress",
        }),
      ),
    ).toBeUndefined();
    expect(tracker.observe(toolCallUpdate({ toolCallId: "0:tool_x", status: "completed" }))).toBe(
      "entered",
    );
  });

  it("reports entry only once per call", () => {
    const tracker = new AcpPlanModeToolTracker();
    tracker.observe(toolCall({ toolCallId: "t1", title: "enter_plan_mode", status: "pending" }));
    expect(tracker.observe(toolCallUpdate({ toolCallId: "t1", status: "completed" }))).toBe(
      "entered",
    );
    expect(
      tracker.observe(toolCallUpdate({ toolCallId: "t1", status: "completed" })),
    ).toBeUndefined();
  });

  it("does not report entry when the tool call fails", () => {
    // The regression this whole path came from: EnterPlanMode failing with
    // `Internal error` must leave the client's mode untouched.
    const tracker = new AcpPlanModeToolTracker();
    tracker.observe(toolCall({ toolCallId: "t1", title: "EnterPlanMode", status: "pending" }));
    expect(tracker.observe(toolCallUpdate({ toolCallId: "t1", status: "failed" }))).toBeUndefined();
    expect(
      tracker.observe(toolCallUpdate({ toolCallId: "t1", status: "completed" })),
    ).toBeUndefined();
  });

  it("ignores unrelated tool calls", () => {
    const tracker = new AcpPlanModeToolTracker();
    tracker.observe(toolCall({ toolCallId: "t1", title: "Read", status: "pending" }));
    expect(
      tracker.observe(toolCallUpdate({ toolCallId: "t1", status: "completed" })),
    ).toBeUndefined();
  });

  it("matches the tool on kind as well as title, and ignores non-tool updates", () => {
    const tracker = new AcpPlanModeToolTracker();
    tracker.observe(toolCall({ toolCallId: "t1", kind: "enterPlanMode", status: "pending" }));
    expect(tracker.observe(toolCallUpdate({ toolCallId: "t1", status: "completed" }))).toBe(
      "entered",
    );
    expect(
      tracker.observe({
        sessionUpdate: "current_mode_update",
        currentModeId: "plan",
      } as SessionUpdate),
    ).toBeUndefined();
  });

  // The `output` strings below are the real branches of Kimi's ExitPlanMode
  // review: approve/auto-approve and "Reject and Exit" both deactivate plan
  // mode, while Revise, dismiss, and a plain reject keep it active — and the
  // ones that decline the plan are reported as a FAILED tool call either way,
  // so the status alone cannot tell them apart.
  function exitCall(id: string): SessionUpdate {
    return toolCall({ toolCallId: id, title: "ExitPlanMode", kind: "other", status: "pending" });
  }

  function exitResult(id: string, status: string, text: string): SessionUpdate {
    return toolCallUpdate({
      toolCallId: id,
      status,
      content: [{ type: "content", content: { type: "text", text } }],
    });
  }

  it("reports exit when an approved ExitPlanMode completes", () => {
    const tracker = new AcpPlanModeToolTracker();
    tracker.observe(exitCall("t1"));
    expect(
      tracker.observe(
        exitResult(
          "t1",
          "completed",
          "Exited plan mode. Plan mode deactivated. All tools are now available.",
        ),
      ),
    ).toBe("exited");
  });

  it("reports exit for a rejection that also left plan mode", () => {
    const tracker = new AcpPlanModeToolTracker();
    tracker.observe(exitCall("t1"));
    expect(
      tracker.observe(exitResult("t1", "failed", "Plan rejected by user. Plan mode deactivated.")),
    ).toBe("exited");
  });

  it.each([
    ["Revise", "User requested revisions. Plan mode remains active."],
    ["dismissed", "Plan approval dismissed. Plan mode remains active."],
    ["plain reject", "Plan rejected by user. Plan mode remains active."],
  ])("stays in plan mode when the review ends with %s", (_case, output) => {
    const tracker = new AcpPlanModeToolTracker();
    tracker.observe(exitCall("t1"));
    expect(tracker.observe(exitResult("t1", "failed", output))).toBeUndefined();
  });

  it("stays in plan mode when a failed ExitPlanMode says nothing about the mode", () => {
    // Conservative default: an unexplained failure is not evidence of an exit.
    const tracker = new AcpPlanModeToolTracker();
    tracker.observe(exitCall("t1"));
    expect(tracker.observe(exitResult("t1", "failed", "Tool call aborted."))).toBeUndefined();
  });

  it("keeps plan mode when a completed ExitPlanMode reports it still active", () => {
    const tracker = new AcpPlanModeToolTracker();
    tracker.observe(exitCall("t1"));
    expect(
      tracker.observe(
        exitResult("t1", "completed", "Plan approval dismissed. Plan mode remains active."),
      ),
    ).toBeUndefined();
  });

  it("drops correlations on reset so a reopened session starts clean", () => {
    const tracker = new AcpPlanModeToolTracker();
    tracker.observe(toolCall({ toolCallId: "t1", title: "EnterPlanMode", status: "pending" }));
    tracker.reset();
    expect(
      tracker.observe(toolCallUpdate({ toolCallId: "t1", status: "completed" })),
    ).toBeUndefined();
  });
});
