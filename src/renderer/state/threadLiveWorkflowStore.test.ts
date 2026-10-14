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
const { register: registerWorkflow, markTerminal } = useThreadLiveWorkflowStore.getState();
const registrations: Array<{ threadId: string; itemId: string }> = [];
function register(input: Parameters<typeof registerWorkflow>[0]): void {
  registrations.push(input);
  registerWorkflow(input);
}
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

function deferred() {
  let resolve!: (value: { run: unknown }) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<{ run: unknown }>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-06-01T12:00:00.000Z"));
  workflowGetRun.mockReset();
  workflowGetRun.mockResolvedValue({ run: null });
});

afterEach(() => {
  for (const { threadId, itemId } of registrations) markTerminal(threadId, itemId);
  registrations.length = 0;
  vi.useRealTimers();
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

    it.each(["running", "unknown"] as const)(
      "expires repeatedly successful timestamp-free %s snapshots without extending their age on register",
      async (status) => {
        workflowGetRun.mockResolvedValue({ run: { ...running.run, status } });
        const registeredAt = Date.now();
        register({ threadId: "fallback", itemId: "i", manifestPath: "/fallback.json", location });
        await vi.advanceTimersByTimeAsync(POLL_MS * 3);
        vi.setSystemTime(registeredAt + WORKFLOW_STALE_PROGRESS_MS - POLL_MS);
        await vi.advanceTimersByTimeAsync(POLL_MS);
        expect(isLive("fallback")).toBe(true);
        register({ threadId: "fallback", itemId: "i", manifestPath: "/fallback.json", location });
        await vi.advanceTimersByTimeAsync(POLL_MS);
        expect(isLive("fallback")).toBe(false);
        expect(vi.getTimerCount()).toBe(0);
        const polls = workflowGetRun.mock.calls.length;
        await vi.advanceTimersByTimeAsync(POLL_MS * 2);
        expect(workflowGetRun).toHaveBeenCalledTimes(polls);
        markTerminal("fallback", "i");
      },
    );

    it("keeps an old registration live when the workflow reports fresh progress", async () => {
      workflowGetRun.mockImplementation(async () => ({ run: runningRun(Date.now()) }));
      register({ threadId: "fresh", itemId: "i", manifestPath: "/fresh.json", location });
      await vi.advanceTimersByTimeAsync(POLL_MS);
      const snapshot = useThreadLiveWorkflowStore.getState().liveThreadIds;
      vi.setSystemTime(Date.now() + WORKFLOW_STALE_PROGRESS_MS * 2);
      await vi.advanceTimersByTimeAsync(POLL_MS);
      expect(isLive("fresh")).toBe(true);
      expect(useThreadLiveWorkflowStore.getState().liveThreadIds).toBe(snapshot);
      markTerminal("fresh", "i");
      expect(vi.getTimerCount()).toBe(0);
    });

    it.each([
      { surface: "run", field: "startTime" },
      { surface: "phased", field: "queuedAt" },
      { surface: "phased", field: "startedAt" },
      { surface: "phased", field: "lastProgressAt" },
      { surface: "unphased", field: "queuedAt" },
      { surface: "unphased", field: "startedAt" },
      { surface: "unphased", field: "lastProgressAt" },
    ] as const)(
      "honors fresh $surface $field beyond the fallback lifetime",
      async ({ surface, field }) => {
        register({ threadId: "timed", itemId: "i", manifestPath: "/timed.json", location });
        await vi.advanceTimersByTimeAsync(POLL_MS);
        vi.setSystemTime(Date.now() + WORKFLOW_STALE_PROGRESS_MS * 2);
        const agent = { agentId: "agent", label: "Agent", [field]: Date.now() };
        const run: WorkflowRun = {
          runId: "run",
          status: "running",
          agentCount: 1,
          phases: surface === "phased" ? [{ title: "Phase", agents: [agent] }] : [],
          unphasedAgents: surface === "unphased" ? [agent] : [],
          ...(surface === "run" ? { startTime: Date.now() } : {}),
        };
        workflowGetRun.mockResolvedValue({ run });
        const before = useThreadLiveWorkflowStore.getState();
        await vi.advanceTimersByTimeAsync(POLL_MS);
        expect(isLive("timed")).toBe(true);
        expect(useThreadLiveWorkflowStore.getState()).toBe(before);
      },
    );

    it("uses fallback age when a duration has no start time and is not an activity timestamp", async () => {
      workflowGetRun.mockResolvedValue({
        run: { ...running.run, durationMs: WORKFLOW_STALE_PROGRESS_MS * 10 },
      });
      register({ threadId: "duration", itemId: "i", manifestPath: "/duration.json", location });
      await vi.advanceTimersByTimeAsync(POLL_MS);
      vi.setSystemTime(Date.now() + WORKFLOW_STALE_PROGRESS_MS);
      await vi.advanceTimersByTimeAsync(POLL_MS);
      expect(isLive("duration")).toBe(false);
      expect(vi.getTimerCount()).toBe(0);
    });

    it.each(["null", "error"] as const)(
      "retains the longer seen-snapshot fallback for subsequent %s responses",
      async (response) => {
        workflowGetRun.mockResolvedValue(running);
        register({ threadId: "seen", itemId: "i", manifestPath: "/seen.json", location });
        await vi.advanceTimersByTimeAsync(POLL_MS);
        if (response === "null") workflowGetRun.mockResolvedValue({ run: null });
        else workflowGetRun.mockRejectedValue(new Error("read failed"));
        vi.setSystemTime(Date.now() + 11 * 60_000);
        await vi.advanceTimersByTimeAsync(POLL_MS);
        expect(isLive("seen")).toBe(true);
        vi.setSystemTime(Date.now() + WORKFLOW_STALE_PROGRESS_MS);
        await vi.advanceTimersByTimeAsync(POLL_MS);
        expect(isLive("seen")).toBe(false);
        expect(vi.getTimerCount()).toBe(0);
      },
    );

    it.each(["terminal", "error"] as const)(
      "fences an old pending %s result after a same-key owner refresh",
      async (settle) => {
        const pending = deferred();
        workflowGetRun.mockReturnValueOnce(pending.promise);
        workflowGetRun.mockImplementation(async () => ({ run: runningRun(Date.now()) }));
        register({ threadId: "owner", itemId: "i", manifestPath: "/old.json", location });
        await vi.advanceTimersByTimeAsync(POLL_MS);
        vi.setSystemTime(Date.now() + 11 * 60_000);
        const latestOwner = { ...location, remoteServerId: "latest-host" };
        register({
          threadId: "owner",
          itemId: "i",
          manifestPath: "/latest.json",
          location: latestOwner,
          transcriptDir: "/latest-transcripts",
        });
        const before = useThreadLiveWorkflowStore.getState();
        if (settle === "terminal") pending.resolve(completed);
        else pending.reject(new Error("obsolete owner"));
        await vi.advanceTimersByTimeAsync(0);
        expect(isLive("owner")).toBe(true);
        expect(useThreadLiveWorkflowStore.getState()).toBe(before);
        await vi.advanceTimersByTimeAsync(POLL_MS);
        expect(isLive("owner")).toBe(true);
        expect(workflowGetRun.mock.lastCall?.[0]).toEqual({
          manifestPath: "/latest.json",
          location: latestOwner,
          transcriptDir: "/latest-transcripts",
        });
      },
    );

    it("does not reset timestamp-free age when the source changes", async () => {
      workflowGetRun.mockResolvedValue(running);
      register({ threadId: "age", itemId: "i", manifestPath: "/old.json", location });
      await vi.advanceTimersByTimeAsync(POLL_MS);
      vi.setSystemTime(Date.now() + WORKFLOW_STALE_PROGRESS_MS);
      register({
        threadId: "age",
        itemId: "i",
        manifestPath: "/new.json",
        location: { ...location, remoteServerId: "new-host" },
      });
      await vi.advanceTimersByTimeAsync(POLL_MS);
      expect(isLive("age")).toBe(false);
      expect(vi.getTimerCount()).toBe(0);
    });

    it.each(["terminal", "error"] as const)(
      "preserves same-key re-registration while an old %s promise settles without overlapping batches",
      async (settle) => {
        const pending = deferred();
        workflowGetRun.mockReturnValueOnce(pending.promise);
        workflowGetRun.mockResolvedValue(running);
        register({ threadId: "reopen", itemId: "i", manifestPath: "/old.json", location });
        await vi.advanceTimersByTimeAsync(POLL_MS);
        markTerminal("reopen", "i");
        register({ threadId: "reopen", itemId: "i", manifestPath: "/new.json", location });
        await vi.advanceTimersByTimeAsync(POLL_MS * 3);
        expect(workflowGetRun).toHaveBeenCalledTimes(1);
        expect(vi.getTimerCount()).toBe(0);
        if (settle === "terminal") pending.resolve(completed);
        else pending.reject(new Error("old read"));
        await vi.advanceTimersByTimeAsync(0);
        expect(isLive("reopen")).toBe(true);
        expect(vi.getTimerCount()).toBe(1);
        await vi.advanceTimersByTimeAsync(POLL_MS);
        expect(workflowGetRun).toHaveBeenCalledTimes(2);
        expect(isLive("reopen")).toBe(true);
        expect(workflowGetRun.mock.lastCall?.[0]).toHaveProperty("manifestPath", "/new.json");
      },
    );

    it("consumes a removed entry's pending promise before allowing a new batch", async () => {
      const pending = deferred();
      workflowGetRun.mockReturnValueOnce(pending.promise);
      register({ threadId: "removed", itemId: "i", manifestPath: "/removed.json", location });
      await vi.advanceTimersByTimeAsync(POLL_MS);
      markTerminal("removed", "i");
      pending.resolve(running);
      await vi.advanceTimersByTimeAsync(0);
      expect(isLive("removed")).toBe(false);
      expect(vi.getTimerCount()).toBe(0);
      register({ threadId: "next", itemId: "i", manifestPath: "/next.json", location });
      expect(vi.getTimerCount()).toBe(1);
      workflowGetRun.mockResolvedValue(completed);
      await vi.advanceTimersByTimeAsync(POLL_MS);
      expect(isLive("next")).toBe(false);
      expect(vi.getTimerCount()).toBe(0);
    });
  });
});
// @vitest-environment node
