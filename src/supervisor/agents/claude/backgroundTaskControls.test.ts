import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { ClaudeBackgroundTaskControls } from "./backgroundTaskControls";
import { createClaudeMapperState } from "./sdkCanonicalMappingState";
import { hasAwaitedBackgroundWork } from "./canonicalMapping/backgroundTasks";

const task = { taskId: "server", kind: "command" as const, description: "Start admin UI" };
const message = (subtype: string, fields: Record<string, unknown> = {}) =>
  ({
    type: "system",
    subtype,
    task_id: "server",
    run_id: "run-1",
    ...(subtype === "task_notification" ? { status: "completed" } : {}),
    ...fields,
  }) as unknown as SDKMessage;

describe("Claude background task controls", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(100_000);
  });
  afterEach(() => vi.useRealTimers());
  function setup() {
    const state = createClaudeMapperState("thread");
    const stopTask = vi.fn<(taskId: string) => Promise<void>>().mockResolvedValue(undefined);
    const controls = new ClaudeBackgroundTaskControls(state, () => ({ stopTask }));
    controls.observe(message("task_started"));
    state.reportedBackgroundTasks = [task];
    controls.reconcile([task]);
    const action = controls.decorate([task])[0]!.stopAction!;
    return { controls, state, stopTask, action };
  }

  it("waits for native termination after Stop is accepted, and coalesces repeated Stop", async () => {
    const { controls, stopTask, action } = setup();
    let settled = false;
    const pending = controls.invoke(action.id, action.payload).then(() => {
      settled = true;
    });
    const duplicate = controls.invoke(action.id, action.payload);
    await vi.advanceTimersByTimeAsync(1000);
    expect(stopTask).toHaveBeenCalledExactlyOnceWith("server");
    expect(settled).toBe(false);
    controls.observe(message("task_notification", { status: "stopped" }));
    await Promise.all([pending, duplicate]);
    expect(settled).toBe(true);
  });

  it("confirms roster removal and rejects actions against an old task incarnation", async () => {
    const { controls, action } = setup();
    const pending = controls.invoke(action.id, action.payload);
    controls.reconcile([]);
    await expect(pending).resolves.toEqual({});
    controls.observe(message("task_started", { run_id: "run-2" }));
    controls.reconcile([task]);
    await expect(controls.invoke(action.id, action.payload)).rejects.toThrow("unavailable");
    expect(controls.decorate([task])[0]!.stopAction!.payload.token).not.toBe(action.payload.token);
  });

  it("times out without pretending the task stopped, then allows retry", async () => {
    const { controls, stopTask, action } = setup();
    const failure = controls.invoke(action.id, action.payload).catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await failure).toMatchObject({ message: expect.stringContaining("not confirmed") });
    expect(controls.decorate([task])).toHaveLength(1);
    const retry = controls.invoke(action.id, action.payload);
    controls.reconcile([]);
    await expect(retry).resolves.toEqual({});
    expect(stopTask).toHaveBeenCalledTimes(2);
  });

  it("rejects a pending request when the process exits", async () => {
    const { controls, action } = setup();
    const failure = controls.invoke(action.id, action.payload).catch((error: unknown) => error);
    controls.reset();
    expect(await failure).toMatchObject({ message: expect.stringContaining("unavailable") });
  });

  it("does not refresh progress for repeated payloads or stale run notifications", async () => {
    const { controls } = setup();
    const progress = message("task_progress", {
      description: "server",
      summary: "Ready",
      usage: { tool_uses: 1, total_tokens: 42 },
    });
    expect(controls.observe(progress)).toBe(true);
    expect(controls.decorate([task])[0]).toMatchObject({
      startedAt: 100_000,
      lastProgressAt: 100_000,
      progress: "Ready",
    });
    await vi.advanceTimersByTimeAsync(5000);
    expect(controls.observe(progress)).toBe(false);
    expect(controls.decorate([task])[0]!.lastProgressAt).toBe(100_000);
    controls.observe(message("task_started", { run_id: "run-2" }));
    expect(controls.shouldIgnore(message("task_notification"))).toBe(true);
    expect(controls.shouldIgnore(message("task_notification", { run_id: "run-2" }))).toBe(false);
  });

  it("keeps Monitor results awaited even if its roster arrives before its launch event", () => {
    const { controls, state } = setup();
    state.reportedBackgroundTasks = [task];
    state.liveBackgroundTaskIds = new Set([task.taskId]);
    expect(hasAwaitedBackgroundWork(state)).toBe(false);
    state.toolItemsById.set("tool-monitor", {
      itemId: "monitor",
      itemType: "tool_call",
      toolName: "Monitor",
      input: {},
      partialInputJson: "",
    });
    controls.observe(message("task_started", { tool_use_id: "tool-monitor" }));
    expect(state.reportedBackgroundTasks[0]!.kind).toBe("other");
    expect(hasAwaitedBackgroundWork(state)).toBe(true);
  });

  it("publishes metadata only for listed tasks while keeping unlisted runs for a later roster", async () => {
    const { controls, state } = setup();
    const agentProgress = message("task_progress", {
      task_id: "agent-1",
      description: "review",
      summary: "Reading",
      usage: { tool_uses: 1, total_tokens: 1 },
    });
    expect(controls.observe(agentProgress)).toBe(false);
    expect(
      controls.observe(message("task_started", { task_id: "fg-1", is_backgrounded: false })),
    ).toBe(false);
    expect(
      controls.observe(
        message("background_tasks_changed", {
          tasks: [
            { task_id: "server", run_id: "run-1" },
            { task_id: "agent-1", run_id: "run-1" },
          ],
        }),
      ),
    ).toBe(false);

    // Progress captured before the roster lists the task still reaches its first row.
    await vi.advanceTimersByTimeAsync(1000);
    expect(
      controls.observe(message("task_progress", { task_id: "late", summary: "Booting" })),
    ).toBe(false);
    const late = { taskId: "late", kind: "command" as const, description: "late" };
    state.reportedBackgroundTasks = [task, late];
    expect(controls.decorate([late])[0]).toMatchObject({ startedAt: 101_000, progress: "Booting" });

    // A new run of a listed task replaces its Stop token, so it must publish.
    expect(controls.observe(message("task_started", { run_id: "run-2" }))).toBe(true);
    expect(controls.observe(message("task_started", { run_id: "run-2" }))).toBe(false);
  });

  it("bounds retained foreground runs without dropping listed, live or stale-run state", async () => {
    const { controls, state } = setup();
    state.liveBackgroundTaskIds = new Set(["server", "agent-1"]);
    controls.observe(message("task_started", { task_id: "agent-1", run_id: "run-2" }));
    controls.observe(message("task_started", { task_id: "fg-0", is_backgrounded: false }));
    await vi.advanceTimersByTimeAsync(1000);
    for (let index = 1; index <= 200; index++) {
      controls.observe(message("task_started", { task_id: `fg-${index}`, is_backgrounded: false }));
    }
    const tracked = (controls as unknown as { tasks: Map<string, unknown> }).tasks;
    expect(tracked.size).toBeLessThanOrEqual(64);
    expect(tracked.has("fg-0")).toBe(false);
    expect(tracked.has("fg-200")).toBe(true);
    expect(controls.decorate([task])[0]!.startedAt).toBe(100_000);
    expect(
      controls.shouldIgnore(message("task_notification", { task_id: "agent-1", run_id: "run-1" })),
    ).toBe(true);
  });

  it("preserves pre-roster progress and run ids when a large live roster grows", () => {
    const { controls, state } = setup();
    const protectedTasks = [
      task,
      ...Array.from({ length: 63 }, (_, index) => ({
        ...task,
        taskId: `live-${index}`,
      })),
    ];
    state.reportedBackgroundTasks = protectedTasks;
    state.liveBackgroundTaskIds = new Set(protectedTasks.map((entry) => entry.taskId));
    controls.decorate(protectedTasks);
    controls.observe(
      message("task_progress", {
        task_id: "joining-a",
        run_id: "run-2",
        summary: "Booting",
      }),
    );
    const joining = ["joining-a", "joining-b"].map((taskId) => ({ ...task, taskId }));
    const next = [...protectedTasks, ...joining];
    controls.observe(
      message("background_tasks_changed", {
        tasks: next.map((entry) => ({ task_id: entry.taskId, task_type: "local_bash" })),
      }),
    );
    state.reportedBackgroundTasks = next;
    state.liveBackgroundTaskIds = new Set(next.map((entry) => entry.taskId));
    expect(controls.decorate(joining)[0]).toMatchObject({ progress: "Booting" });
    expect(
      controls.shouldIgnore(
        message("task_notification", {
          task_id: "joining-a",
          run_id: "run-1",
        }),
      ),
    ).toBe(true);
  });

  it("keeps legacy providers read-only and rejects unsupported actions", async () => {
    const controls = new ClaudeBackgroundTaskControls(
      createClaudeMapperState("t"),
      () => undefined,
    );
    controls.reconcile([task]);
    expect(controls.decorate([task])[0]).not.toHaveProperty("stopAction");
    expect(controls.listActions()).toEqual([]);
    await expect(controls.invoke("unknown", {})).rejects.toThrow("unavailable");
  });

  it("tolerates partial progress and malformed roster entries without breaking the session", () => {
    const { controls } = setup();
    expect(controls.observe(message("background_tasks_changed", { tasks: null }))).toBe(false);
    expect(controls.shouldIgnore(message("background_tasks_changed", { tasks: null }))).toBe(true);
    expect(controls.shouldIgnore(message("task_notification", { status: "running" }))).toBe(true);
    expect(
      controls.observe(
        message("background_tasks_changed", { tasks: [null, {}, { task_id: "server" }] }),
      ),
    ).toBe(false);
    expect(
      controls.observe(message("task_progress", { summary: "Ready", description: "server" })),
    ).toBe(true);
    expect(controls.decorate([task])[0]!.progress).toBe("Ready");
  });

  it("bounds progress without splitting a Unicode character for native clients", () => {
    const { controls } = setup();
    controls.observe(
      message("task_progress", { summary: `${"a".repeat(4095)}😀`, description: "server" }),
    );
    expect(controls.decorate([task])[0]!.progress).toBe("a".repeat(4095));
  });
});
