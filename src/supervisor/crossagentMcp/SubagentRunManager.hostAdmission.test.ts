import { describe, expect, it, vi } from "vitest";
import {
  HostResourceAdmissionOwner,
  UNLIMITED_HOST_RESOURCE_ADMISSION_POLICY,
} from "@/supervisor/runtime/hostResourceAdmission";
import { flush, makeHarness, PARENT } from "./testHarness";

describe("SubagentRunManager host admission", () => {
  it("counts structured children and refuses beyond the shared owner's cap", async () => {
    const owner = new HostResourceAdmissionOwner(() => ({
      ...UNLIMITED_HOST_RESOURCE_ADMISSION_POLICY,
      maxActiveAgentSessions: 1,
    }));
    const h = makeHarness({ admission: owner });

    const first = h.manager.spawn(PARENT, { agent: "codex", prompt: "first child" });
    await flush();
    expect(owner.usage()).toMatchObject({
      total: 1,
      agentSessions: { active: 1, pending: 0, retiring: 0 },
    });

    const second = h.manager.spawn(PARENT, { agent: "codex", prompt: "second child" });
    await flush();
    const result = h.manager.getStatus(second.runId, PARENT);
    expect(result.status).toBe("failed");
    expect(`${result.output}${result.error?.message ?? ""}`).toContain("capacity is full");
    expect(h.handles).toHaveLength(1);

    await h.manager.cancel(first.runId, PARENT);
    expect(owner.usage().total).toBe(0);
  });

  it("frees the slot only after a child's disposal is confirmed", async () => {
    const owner = new HostResourceAdmissionOwner(() => ({
      ...UNLIMITED_HOST_RESOURCE_ADMISSION_POLICY,
      maxActiveAgentSessions: 1,
    }));
    const h = makeHarness({ admission: owner });
    const run = h.manager.spawn(PARENT, { agent: "codex", prompt: "held child" });
    await flush();
    expect(owner.usage().total).toBe(1);

    const handle = h.handles[0]!;
    await h.manager.cancel(run.runId, PARENT);
    expect(handle.disposed).toBe(true);
    expect(owner.usage().total).toBe(0);
  });

  it("retains cancelAll custody until the child disposal retry confirms", async () => {
    const owner = new HostResourceAdmissionOwner(() => ({
      ...UNLIMITED_HOST_RESOURCE_ADMISSION_POLICY,
      maxActiveAgentSessions: 1,
    }));
    const h = makeHarness({ admission: owner });
    const run = h.manager.spawn(PARENT, { agent: "codex", prompt: "held child" });
    await flush();
    const handle = h.handles[0]!;
    let disposeFails = true;
    handle.dispose = vi.fn<() => Promise<void>>(async () => {
      if (disposeFails) throw new Error("child cleanup rejected");
    });

    h.manager.cancelAllForThread(PARENT);
    await flush();
    // Records are evicted, but the child's {lease, handle} custody stays
    // reachable through the runner's retained retirement.
    expect(owner.usage().total).toBe(1);
    expect(h.manager.getStatus(run.runId).output).toContain("Unknown run_id");

    disposeFails = false;
    await h.manager.retryRetirements();
    expect(owner.usage().total).toBe(0);
  });
});
