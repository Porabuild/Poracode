import { describe, expect, it, vi } from "vitest";
import { MuseMspApprovalDecisions } from "./approvalDecisions";
import { MspRpcError } from "./protocol";

const approval = {
  approvalId: "approval-1",
  requirementId: { approvalId: "approval-1", sourceIndex: 0 },
};

function fixture() {
  const request = vi.fn<
    (
      method: string,
      params?: Record<string, unknown>,
      timeoutMs?: number,
    ) => Promise<Record<string, unknown>>
  >(async () => ({ status: "accepted", terminal: false }));
  const onResolved = vi.fn<(approvalId: string, decision: string) => void>();
  const decisions = new MuseMspApprovalDecisions({ request }, () => "session-1", onResolved);
  return { request, onResolved, decisions };
}

describe("Muse MSP approval decisions", () => {
  it("deduplicates the same stage before and after its admission ack", async () => {
    const { request, decisions } = fixture();
    const first = decisions.decide(approval, "allow_once");
    const duplicate = decisions.decide(approval, "allow_once");
    await Promise.all([first, duplicate]);
    await decisions.decide(approval, "allow_once");
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("allows the next requirement while the preceding ack is outstanding", async () => {
    const { request, decisions } = fixture();
    let release!: (value: { status: string; terminal: boolean }) => void;
    request.mockReturnValueOnce(
      new Promise((resolve) => {
        release = resolve;
      }),
    );
    const first = decisions.decide(approval, "allow_once");
    await Promise.resolve();
    const next = {
      ...approval,
      requirementId: { ...approval.requirementId, sourceIndex: 1 },
    };
    await decisions.decide(next, "allow_next");
    release({ status: "accepted", terminal: false });
    await first;
    await decisions.decide(approval, "allow_once");
    expect(request).toHaveBeenCalledTimes(2);
    expect(request).toHaveBeenLastCalledWith(
      "approval/decide",
      expect.objectContaining({
        requirementId: next.requirementId,
        choiceId: "allow_next",
      }),
    );
  });

  it("ignores stale deliveries even if resolution preceded the request", async () => {
    const { request, decisions } = fixture();
    decisions.markResolved(approval.approvalId);
    await decisions.decide(approval, "allow_once");
    expect(request).not.toHaveBeenCalled();
  });

  it("adopts a typed conflict's winning decision", async () => {
    const { request, onResolved, decisions } = fixture();
    request.mockRejectedValueOnce(
      new MspRpcError("already resolved", {
        code: -32051,
        kind: "approvalAlreadyResolved",
        data: { resolution: { decision: "denied", resolvedBy: "user", viewCursor: "v:1" } },
      }),
    );
    await decisions.decide(approval, "allow_once");
    expect(onResolved).toHaveBeenCalledExactlyOnceWith("approval-1", "denied");
    expect(decisions.isResolved("approval-1")).toBe(true);
    await decisions.decide(approval, "allow_once");
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("propagates real failures and allows another attempt", async () => {
    const { request, decisions } = fixture();
    const error = new MspRpcError("choice rejected", {
      code: -32052,
      kind: "approvalChoiceInvalid",
    });
    request.mockRejectedValueOnce(error);
    await expect(decisions.decide(approval, "invalid")).rejects.toBe(error);
    await decisions.decide(approval, "allow_once");
    expect(request).toHaveBeenCalledTimes(2);
    expect(decisions.isResolved("approval-1")).toBe(false);
  });
});
