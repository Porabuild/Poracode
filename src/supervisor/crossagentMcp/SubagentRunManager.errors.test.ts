import { describe, expect, it } from "vitest";
import { flush, makeHarness, PARENT } from "./testHarness";

describe("subagent provider failure details", () => {
  it("retains the provider's error when the turn fails without an onError callback", async () => {
    const h = makeHarness();
    const { runId } = h.manager.spawn(PARENT, { agent: "codex", prompt: "go" });
    await flush();
    h.handles[0]!.emit({
      type: "error",
      threadId: "child",
      message: "API rejected this model: subscription does not include access",
    });
    // ACP reports a runtime error and then turn.completed; it does not call onError.
    h.handles[0]!.completeTurn("failed");
    const result = await h.manager.waitFor(runId, 100, PARENT);
    expect(result).toMatchObject({
      status: "failed",
      error: {
        message: "API rejected this model: subscription does not include access",
        may_have_side_effects: true,
      },
    });
    expect(result.output).toContain("subscription does not include access");
    expect(h.appended).toContainEqual({
      threadId: PARENT,
      event: expect.objectContaining({
        type: "item.completed",
        payload: expect.objectContaining({ result: result.error!.message }),
      }),
    });
  });

  it("does not fail a turn that recovers after a provider error", async () => {
    const h = makeHarness();
    const { runId } = h.manager.spawn(PARENT, { agent: "codex", prompt: "go" });
    await flush();
    h.handles[0]!.emit({ type: "error", threadId: "child", message: "temporary failure" });
    h.handles[0]!.completeTurn("completed");
    expect(await h.manager.waitFor(runId, 100, PARENT)).toMatchObject({ status: "completed" });
  });

  it("does not carry an earlier provider's error into a fallback attempt", async () => {
    const h = makeHarness();
    const { runId } = h.manager.spawn(PARENT, {
      agent: "codex",
      prompt: "go",
      retryMode: "any-failure",
      fallbacks: [{ agent: "codex" }],
    });
    await flush();
    h.handles[0]!.emit({ type: "error", threadId: "child", message: "first provider failed" });
    h.handles[0]!.completeTurn("failed");
    await flush();
    h.handles[1]!.completeTurn("failed");
    const result = await h.manager.waitFor(runId, 100, PARENT);
    expect(result.error?.message).toBe("Subagent turn failed");
    expect(result.attempts?.[0]?.error).toBe("first provider failed");
  });

  it("clears an earlier turn's diagnostic when a new turn starts", async () => {
    const h = makeHarness();
    const { runId } = h.manager.spawn(PARENT, { agent: "codex", prompt: "go" });
    await flush();
    h.handles[0]!.emit({ type: "error", threadId: "child", message: "recovered earlier error" });
    h.handles[0]!.emit({ type: "turn.started", threadId: "child", turnId: "next-turn" });
    h.handles[0]!.completeTurn("failed");
    expect((await h.manager.waitFor(runId, 100, PARENT)).error?.message).toBe(
      "Subagent turn failed",
    );
  });
});
