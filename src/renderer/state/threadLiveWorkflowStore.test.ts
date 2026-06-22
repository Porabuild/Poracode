import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  WORKFLOW_STALE_PROGRESS_MS,
  type ProjectLocation,
  type WorkflowRun,
} from "@/shared/contracts";

const { workflowGetRun } = vi.hoisted(() => ({
  workflowGetRun: vi.fn<(payload: unknown) => Promise<{ run: unknown }>>(),
}));
vi.mock("@/renderer/bridge", () => ({
  readBridge: () => ({ workflowGetRun }),
}));

import { useThreadLiveWorkflowStore } from "./threadLiveWorkflowStore";

const POLL_MS = 4000;
const location: ProjectLocation = { kind: "windows", path: "C:/repo" };
const { register, markTerminal } = useThreadLiveWorkflowStore.getState();
const isLive = (threadId: string) =>
  useThreadLiveWorkflowStore.getState().liveThreadIds.has(threadId);
const running = { run: { status: "running", phases: [], unphasedAgents: [], agentCount: 0 } };
const completed = { run: { status: "completed", phases: [], unphasedAgents: [], agentCount: 0 } };

function runningRun(lastProgressAt: number): WorkflowRun {
  return {
    runId: "wf-test",
    status: "running",
    startTime: lastProgressAt,
    agentCount: 1,
    phases: [
      {
        title: "Run",
        agents: [{ agentId: "agent-1", label: "agent-1", state: "running", lastProgressAt }],
      },
    ],
    unphasedAgents: [],
  };
}

beforeEach(() => {
  workflowGetRun.mockReset();
  workflowGetRun.mockResolvedValue({ run: null });
});

describe("threadLiveWorkflowStore", () => {
  it("marks a thread live on register and clears on terminal", () => {
    register({ threadId: "t1", itemId: "i1", manifestPath: "/m1.json", location });
    expect(isLive("t1")).toBe(true);

    markTerminal("t1", "i1");
    expect(isLive("t1")).toBe(false);
  });

  it("keeps a thread live until all its concurrent workflows go terminal", () => {
    register({ threadId: "t2", itemId: "a", manifestPath: "/a.json", location });
    register({ threadId: "t2", itemId: "b", manifestPath: "/b.json", location });
    expect(isLive("t2")).toBe(true);

    markTerminal("t2", "a");
    expect(isLive("t2")).toBe(true);
    markTerminal("t2", "b");
    expect(isLive("t2")).toBe(false);
  });

  it("is idempotent when the same workflow re-registers", () => {
    register({ threadId: "t3", itemId: "i", manifestPath: "/m.json", location });
    register({ threadId: "t3", itemId: "i", manifestPath: "/m-updated.json", location });
    expect(isLive("t3")).toBe(true);

    markTerminal("t3", "i");
    expect(isLive("t3")).toBe(false);
  });

  describe("manifest poller", () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-06-01T12:00:00.000Z"));
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it("stays working while the manifest is missing, well past the old 30s cliff", async () => {
      workflowGetRun.mockResolvedValue({ run: null });
      register({ threadId: "slow", itemId: "i", manifestPath: "/m.json", location });
      expect(isLive("slow")).toBe(true);

      // The first manifest write can lag the launch; a slow start must NOT be
      // mistaken for a dead launch and dropped.
      await vi.advanceTimersByTimeAsync(60_000);
      expect(workflowGetRun).toHaveBeenCalled();
      expect(isLive("slow")).toBe(true);

      // Once the manifest finally reports terminal, the spinner clears.
      workflowGetRun.mockResolvedValue(completed);
      await vi.advanceTimersByTimeAsync(POLL_MS + 1);
      expect(isLive("slow")).toBe(false);

      markTerminal("slow", "i");
    });

    it("clears a dead launch whose manifest never appears", async () => {
      workflowGetRun.mockResolvedValue({ run: null });
      register({ threadId: "dead", itemId: "i", manifestPath: "/never.json", location });
      expect(isLive("dead")).toBe(true);

      // Past the 10-minute launch deadline with no manifest -> treated as failed.
      await vi.advanceTimersByTimeAsync(11 * 60_000);
      expect(isLive("dead")).toBe(false);
    });

    it("clears a dead launch whose manifest read keeps failing", async () => {
      workflowGetRun.mockRejectedValue(new Error("parse failed"));
      register({ threadId: "error", itemId: "i", manifestPath: "/broken.json", location });
      expect(isLive("error")).toBe(true);

      await vi.advanceTimersByTimeAsync(11 * 60_000);
      expect(isLive("error")).toBe(false);
    });

    it("keeps polling a running manifest and never overlaps ticks", async () => {
      workflowGetRun.mockResolvedValue(running);
      register({ threadId: "live", itemId: "i", manifestPath: "/m.json", location });

      await vi.advanceTimersByTimeAsync(POLL_MS * 3 + 1);
      expect(isLive("live")).toBe(true);

      workflowGetRun.mockResolvedValue(completed);
      await vi.advanceTimersByTimeAsync(POLL_MS + 1);
      expect(isLive("live")).toBe(false);
    });

    it("clears a running manifest when its own progress is stale", async () => {
      workflowGetRun.mockResolvedValue({
        run: runningRun(Date.now() - WORKFLOW_STALE_PROGRESS_MS - 1),
      });
      register({ threadId: "stale", itemId: "i", manifestPath: "/stale.json", location });
      expect(isLive("stale")).toBe(true);

      await vi.advanceTimersByTimeAsync(POLL_MS + 1);
      expect(isLive("stale")).toBe(false);
    });
  });
});
