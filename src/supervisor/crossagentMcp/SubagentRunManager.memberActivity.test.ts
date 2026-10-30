import { describe, expect, it, vi } from "vitest";
import { flush, makeHarness, PARENT } from "./testHarness";

describe("SubagentRunManager member run activity", () => {
  it("counts live runs and every start, so a run that came and went still shows", async () => {
    const h = makeHarness();
    expect(h.manager.memberRunActivity(PARENT)).toEqual({ active: 0, started: 0 });

    const { runId } = h.manager.spawn(PARENT, { agent: "codex", prompt: "go" });
    expect(h.manager.memberRunActivity(PARENT)).toEqual({ active: 1, started: 1 });
    await vi.waitFor(() => expect(h.handles[0]?.startTurns).toHaveLength(1));

    h.handles[0]!.completeTurn("completed");
    await h.manager.waitForSettlement(PARENT, runId);
    await vi.waitFor(() =>
      expect(h.manager.memberRunActivity(PARENT)).toEqual({ active: 0, started: 1 }),
    );
    // Other threads keep their own counters.
    expect(h.manager.memberRunActivity("other-thread")).toEqual({ active: 0, started: 0 });
  });

  it("forgets the counter when the lead thread closes", async () => {
    const h = makeHarness();
    h.manager.spawn(PARENT, { agent: "codex", prompt: "go" });
    await flush();
    h.manager.cancelAllForThread(PARENT);
    await flush();
    expect(h.manager.memberRunActivity(PARENT).started).toBe(0);
  });
});
