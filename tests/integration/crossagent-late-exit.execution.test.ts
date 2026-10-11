import { describe, expect, it } from "vitest";
import { performance } from "node:perf_hooks";
import { createOrchestrationHarness } from "./helpers/orchestrationHarness";

describe.skipIf(process.platform === "win32")("late one-shot process retirement", () => {
  it("keeps an unconfirmed child counted, then automatically releases on real exit", async () => {
    const h = await createOrchestrationHarness({ oneShot: true, structuredDisposalTimeoutMs: 20 });
    try {
      const run = await h.call("spawn_agent", {
        provider: h.provider,
        background: true,
        prompt: h.plan({ label: "late-exit", holdMs: 60_000 }),
      });
      await h.until(() =>
        h.trace().some((row) => row.event === "prompt" && row.label === "late-exit"),
      );
      expect(h.manager.getStatus(run.run_id, h.parent).status).toBe("running");
      expect(h.admission.usage().total).toBe(1);
      const started = performance.now();
      const response = await h.rpc("tools/call", {
        name: "cancel",
        arguments: { run_id: run.run_id },
      });
      const body = await response.json();
      expect(body.result.isError).toBe(true);
      expect(body.result.content[0].text).toContain("did not confirm");
      expect(performance.now() - started).toBeLessThan(1000);
      expect(h.manager.getStatus(run.run_id, h.parent).status).toBe("cancelled");
      expect(h.admission.usage().total).toBe(1);
      expect(h.manager.getCapacity(h.parent).available_slots).toBe(15);
      // The real driver escalates after 3 seconds. Do not retry retirement or
      // produce unrelated runtime activity: the close observer must release it.
      await h.until(() => h.admission.usage().total === 0);
      expect(h.manager.getCapacity(h.parent).available_slots).toBe(16);
      await h.drained();
    } finally {
      await h.dispose();
    }
  });
});
