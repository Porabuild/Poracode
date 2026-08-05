import { describe, expect, it } from "vitest";
import { isPlanApprovalAccepted, outcomeForSelection } from "./helpers";

describe("isPlanApprovalAccepted", () => {
  // Kimi Code's plan review offers these three option ids, and its own result
  // text states the consequence: "Plan mode deactivated." for approve and
  // reject-and-exit, "Plan mode remains active." for revise. Only the first
  // means the thread leaves plan mode.
  it.each(["plan_approve", "approve", "default", "auto"])("accepts %s", (optionId) => {
    expect(isPlanApprovalAccepted(optionId)).toBe(true);
  });

  it.each(["plan_revise", "revise", "keep_planning", "keep-planning", "Revision requested"])(
    "does not accept %s",
    (optionId) => {
      expect(isPlanApprovalAccepted(optionId)).toBe(false);
    },
  );

  it.each(["plan_reject_and_exit", "deny", "reject", "cancel"])(
    "does not accept the negative option %s",
    (optionId) => {
      expect(isPlanApprovalAccepted(optionId)).toBe(false);
    },
  );

  it("stays independent of the outcome reported for the request", () => {
    // A revise selection is still forwarded to the agent as a selection — only
    // the "did we leave plan mode?" conclusion changes.
    expect(outcomeForSelection("tool_call_approval", "plan_revise", true)).toBe("accepted");
    expect(isPlanApprovalAccepted("plan_revise")).toBe(false);
  });
});
