import { describe, expect, it, vi } from "vitest";
import { FakeHandle, flush, makeHarness, PARENT } from "./testHarness";

describe("subagent turn admission", () => {
  it.each(["event", "working"] as const)(
    "ignores configuration idle before the turn is admitted through %s",
    async (signal) => {
      const configured = Promise.withResolvers<void>();
      const start = vi.spyOn(FakeHandle.prototype, "startTurn").mockImplementation(async function (
        this: FakeHandle,
      ) {
        // Providers can report idle while applying model/effort before submitting a prompt.
        this.update("idle");
        await configured.promise;
        if (signal === "event")
          this.emit({ type: "turn.started", threadId: "child", turnId: "initial" });
        else this.update("working");
        this.emit({
          type: "content.delta",
          threadId: "child",
          itemId: "answer",
          stream: "assistant_text",
          delta: "SIDEKICK_OK",
        });
        this.update("idle");
      });
      const h = makeHarness();
      const { runId } = h.manager.spawn(PARENT, { agent: "codex", prompt: "go" });
      try {
        await flush();
        expect(start).toHaveBeenCalledOnce();
        expect(h.manager.getStatus(runId).status).toBe("running");
        expect(h.handles[0]!.disposed).toBe(false);
        configured.resolve();
        expect(await h.manager.waitFor(runId, 100, PARENT)).toMatchObject({
          status: "completed",
          output: "SIDEKICK_OK",
        });
      } finally {
        configured.resolve();
        h.manager.cancelAllForThread(PARENT);
        await flush();
        start.mockRestore();
      }
    },
  );
});
