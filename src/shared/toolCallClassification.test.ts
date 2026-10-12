import { describe, expect, it } from "vitest";
import type { ToolCallPayload } from "./contracts";
import { interruptDelegatedAgentToolPayload } from "./toolCallClassification";

describe("delegated-agent interruption payload", () => {
  it.each(["running", "paused"] as const)(
    "ends a native %s status without losing details",
    (subAgentStatus) => {
      const payload: ToolCallPayload = {
        name: "Agent",
        isSubAgent: true,
        status: "running",
        subAgentStatus,
        args: { task: "Preserved work" },
        progress: { durationMs: 1234 },
      };
      expect(interruptDelegatedAgentToolPayload(payload, "Session interrupted")).toMatchObject({
        status: "error",
        subAgentStatus: "failed",
        args: payload.args,
        progress: payload.progress,
        result: { error: "Session interrupted" },
      });
      expect(payload.status).toBe("running");
    },
  );

  it.each(["", null, false, 0, { output: "Partial output" }])(
    "keeps existing output %j",
    (result) => {
      const payload: ToolCallPayload = {
        name: "Crossagent",
        isCrossagent: true,
        status: "running",
        crossagentStatus: "running",
        result,
      };
      const interrupted = interruptDelegatedAgentToolPayload(payload, "Session interrupted");
      expect(interrupted.result).toBe(result);
      expect(interrupted.crossagentStatus).toBe("failed");
    },
  );

  it("does not treat a truthy malformed Crossagent flag as Crossagent identity", () => {
    const payload = {
      name: "Task",
      isCrossagent: "true",
      status: "running",
    } as unknown as ToolCallPayload;
    expect(
      interruptDelegatedAgentToolPayload(payload, "Session interrupted").crossagentStatus,
    ).toBeUndefined();
  });

  it("uses the established Crossagent text shape when there is no saved output", () => {
    const payload: ToolCallPayload = { name: "Crossagent", isCrossagent: true, status: "running" };
    expect(interruptDelegatedAgentToolPayload(payload, "Session interrupted")).toMatchObject({
      status: "error",
      crossagentStatus: "failed",
      result: "Session interrupted",
    });
  });

  it("retains an explicitly cancelled native outcome", () => {
    expect(
      interruptDelegatedAgentToolPayload(
        {
          name: "Agent",
          status: "error",
          isSubAgent: true,
          subAgentStatus: "cancelled",
          result: "Cancelled by user",
        },
        "Session interrupted",
      ),
    ).toMatchObject({ subAgentStatus: "cancelled", result: "Cancelled by user" });
  });
});
