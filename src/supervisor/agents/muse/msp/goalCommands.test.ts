import { describe, expect, it, vi } from "vitest";
import { dispatchMuseGoalCommand } from "./goalCommands";
import { MspRpcError } from "./protocol";

type GoalRequest = (
  method: string,
  params?: Record<string, unknown>,
) => Promise<Record<string, unknown>>;

describe("dispatchMuseGoalCommand", () => {
  it("sends the goal RPC with an idempotency id and reports the woken turn", async () => {
    const request = vi.fn<GoalRequest>(async () => ({ status: "accepted", turnId: "turn-1" }));
    const ack = await dispatchMuseGoalCommand({ request }, "session-1", "goal/set", "Ship it");

    expect(ack).toEqual({ turnId: "turn-1" });
    expect(request).toHaveBeenCalledOnce();
    const [method, params] = request.mock.calls[0]!;
    expect(method).toBe("goal/set");
    expect(params).toMatchObject({ sessionId: "session-1", objective: "Ship it" });
    expect(typeof params?.["commandId"]).toBe("string");
  });

  it("omits the objective for bare verbs and reports no turn", async () => {
    const request = vi.fn<GoalRequest>(async () => ({ status: "accepted" }));
    const ack = await dispatchMuseGoalCommand({ request }, "session-1", "goal/pause");

    expect(ack).toEqual({});
    expect(request.mock.calls[0]?.[1]).not.toHaveProperty("objective");
  });

  it("maps methodNotFound to the unsupported-goal error", async () => {
    const request = vi.fn<GoalRequest>(async () => {
      throw new MspRpcError("method not found", { code: -32601, kind: "methodNotFound" });
    });
    await expect(
      dispatchMuseGoalCommand({ request }, "session-1", "goal/set", "Ship it"),
    ).rejects.toThrow(
      "This version of Muse Code does not support session goals. Update Muse Code and try again.",
    );
  });

  it("maps missing_goal rejections to the no-goal error", async () => {
    const request = vi.fn<GoalRequest>(async () => {
      throw new MspRpcError("goal/edit rejected: missing_goal", {
        code: -32030,
        kind: "commandRejected",
        data: { reason: "missing_goal" },
      });
    });
    await expect(
      dispatchMuseGoalCommand({ request }, "session-1", "goal/edit", "Ship it"),
    ).rejects.toThrow("No active goal in this session.");
  });

  it("maps invalid_goal_state rejections to the invalid-state error", async () => {
    const request = vi.fn<GoalRequest>(async () => {
      throw new MspRpcError("goal/pause rejected: invalid_goal_state", {
        code: -32030,
        kind: "commandRejected",
        data: { reason: "invalid_goal_state" },
      });
    });
    await expect(dispatchMuseGoalCommand({ request }, "session-1", "goal/pause")).rejects.toThrow(
      "The goal can't do that in its current state.",
    );
  });

  it("passes other host errors through untouched", async () => {
    const request = vi.fn<GoalRequest>(async () => {
      throw new MspRpcError("overloaded", { code: -32000, kind: "overloaded" });
    });
    await expect(dispatchMuseGoalCommand({ request }, "session-1", "goal/clear")).rejects.toThrow(
      "overloaded",
    );
  });
});
