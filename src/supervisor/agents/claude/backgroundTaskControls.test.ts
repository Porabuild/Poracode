import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { backgroundTaskOutputSchema } from "@/shared/contracts";
import { msg } from "@/shared/messages";
import { ClaudeBackgroundTaskControls } from "./backgroundTaskControls";
import { createClaudeMapperState } from "./sdkCanonicalMappingState";

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

  it("keeps a newer run's Stop pending when an older run's notification is observed", async () => {
    const { controls, action } = setup();
    controls.observe(message("task_started", { run_id: "run-2" }));
    controls.reconcile([task]);
    const current = controls.decorate([task])[0]!.stopAction!;
    expect(current.payload.token).not.toBe(action.payload.token);
    let settled = false;
    const pending = controls.invoke(current.id, current.payload).then(() => {
      settled = true;
    });
    controls.observe(message("task_notification", { status: "stopped" }));
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).toBe(false);
    controls.observe(message("task_notification", { run_id: "run-2", status: "stopped" }));
    await pending;
    expect(settled).toBe(true);
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
      controls.observe(
        message("task_started", {
          task_id: `fg-${index}`,
          is_backgrounded: false,
        }),
      );
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

  it("uses actual summary/last-tool progress, never the task description", () => {
    const { controls } = setup();
    controls.observe(
      message("task_progress", {
        description: "server",
        usage: { tool_uses: 1 },
      }),
    );
    expect(controls.decorate([task])[0]!.progress).toBeUndefined();

    controls.observe(
      message("task_progress", {
        description: "server",
        last_tool_name: "grep",
      }),
    );
    expect(controls.decorate([task])[0]!.progress).toBe("grep");

    controls.observe(message("task_progress", { description: "server", summary: "Ready" }));
    expect(controls.decorate([task])[0]!.progress).toBe("Ready");
  });

  it("bounds progress without splitting a Unicode character for native clients", () => {
    const { controls } = setup();
    controls.observe(
      message("task_progress", {
        summary: `${"a".repeat(4095)}😀`,
        description: "server",
      }),
    );
    expect(controls.decorate([task])[0]!.progress).toBe("a".repeat(4095));
  });

  function outputSetup(
    getTaskOutput = vi.fn<() => Promise<unknown>>(async () => ({
      output: "line\n",
      total_bytes: 5,
      truncated: false,
    })),
  ) {
    const state = createClaudeMapperState("thread");
    const stopTask = vi.fn<(taskId: string) => Promise<void>>().mockResolvedValue(undefined);
    const runtime = { stopTask, getTaskOutput };
    const controls = new ClaudeBackgroundTaskControls(state, () => runtime);
    const command = {
      taskId: "server",
      kind: "command" as const,
      description: "serve",
    };
    controls.observe(message("task_started"));
    state.reportedBackgroundTasks = [command];
    controls.reconcile([command]);
    const action = controls.decorate([command])[0]!.outputAction!;
    return { controls, state, stopTask, getTaskOutput, command, action };
  }

  it("advertises output only for shell/Monitor lanes and returns the bounded read", async () => {
    const { controls, state, stopTask, getTaskOutput, command, action } = outputSetup();
    expect(action).toMatchObject({
      id: "background-task.output.v1",
      payload: { taskId: "server" },
    });
    expect(controls.listActions()).toEqual([
      { id: "background-task.stop.v1" },
      { id: "background-task.output.v1" },
    ]);

    const monitor = {
      taskId: "watch",
      kind: "other" as const,
      description: "tail",
      category: "monitor" as const,
    };
    const tool = {
      taskId: "mcp",
      kind: "other" as const,
      description: "mcp",
      category: "tool" as const,
    };
    state.reportedBackgroundTasks = [command, monitor, tool];
    const decorated = controls.decorate(state.reportedBackgroundTasks);
    expect(decorated[0]!.outputAction).toBeDefined();
    expect(decorated[1]!.outputAction).toMatchObject({
      payload: { taskId: "watch" },
    });
    expect(decorated[2]!.outputAction).toBeUndefined();

    await expect(controls.invoke(action.id, action.payload)).resolves.toEqual({
      output: "line\n",
      totalBytes: 5,
      truncated: false,
    });
    expect(getTaskOutput).toHaveBeenCalledExactlyOnceWith("server");
    // The read path never touches Stop or the native task's lifecycle.
    expect(stopTask).not.toHaveBeenCalled();

    // Listed-task, token, action and taskId fencing.
    await expect(controls.invoke(action.id, { ...action.payload, token: "wrong" })).rejects.toThrow(
      "unavailable",
    );
    await expect(
      controls.invoke(action.id, { ...action.payload, taskId: "watch" }),
    ).rejects.toThrow("unavailable");
    state.reportedBackgroundTasks = [];
    await expect(controls.invoke(action.id, action.payload)).rejects.toThrow("unavailable");
    expect(getTaskOutput).toHaveBeenCalledTimes(1);
  });

  it("cancels a pending output read on reset, run replacement or terminal notification", async () => {
    for (const interrupt of ["reset", "run", "stop"] as const) {
      const pendingRead = Promise.withResolvers<unknown>();
      const getTaskOutput = vi.fn<() => Promise<unknown>>(() => pendingRead.promise);
      const { controls, action } = outputSetup(getTaskOutput);
      const pending = controls.invoke(action.id, action.payload).catch((error: unknown) => error);
      if (interrupt === "reset") {
        controls.reset();
      } else if (interrupt === "run") {
        controls.observe(message("task_started", { run_id: "run-2" }));
      } else {
        controls.observe(message("task_notification", { status: "stopped" }));
      }
      pendingRead.resolve({ output: "late", total_bytes: 4, truncated: false });
      expect(await pending).toMatchObject({
        message: expect.stringContaining("unavailable"),
      });
    }
  });

  it("times out a hung output read, releases the pending slot, and retries", async () => {
    const hung = Promise.withResolvers<unknown>();
    const getTaskOutput = vi
      .fn<() => Promise<unknown>>()
      .mockImplementationOnce(() => hung.promise)
      .mockResolvedValueOnce({ output: "after retry\n", total_bytes: 12, truncated: false });
    const { controls, state, stopTask, action } = outputSetup(getTaskOutput);
    const reported = state.reportedBackgroundTasks;

    const pending = controls.invoke(action.id, action.payload).catch((error: unknown) => error);

    await vi.advanceTimersByTimeAsync(10_000);
    expect(await pending).toMatchObject({
      message: msg("thread.sessionActionFailed"),
    });
    expect(getTaskOutput).toHaveBeenCalledTimes(1);
    expect(stopTask).not.toHaveBeenCalled();
    expect(state.reportedBackgroundTasks).toBe(reported);

    await expect(controls.invoke(action.id, action.payload)).resolves.toEqual({
      output: "after retry\n",
      totalBytes: 12,
      truncated: false,
    });
    expect(getTaskOutput).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);

    // The abandoned native read settling later must not revive the timed-out attempt.
    hung.resolve({ output: "late\n", total_bytes: 5, truncated: false });
    await vi.advanceTimersByTimeAsync(0);
    expect(state.reportedBackgroundTasks).toBe(reported);
  });

  it("rejects malformed or failed native output and bounds an oversized tail", async () => {
    const malformed = outputSetup(
      vi.fn(async () => ({ output: "x", total_bytes: -1, truncated: false })),
    );
    await expect(
      malformed.controls.invoke(malformed.action.id, malformed.action.payload),
    ).rejects.toThrow("failed");

    const failed = outputSetup(vi.fn(async () => Promise.reject(new Error("native down"))));
    await expect(failed.controls.invoke(failed.action.id, failed.action.payload)).rejects.toThrow(
      "native down",
    );

    const oversized = outputSetup(
      vi.fn(async () => ({
        output: "a".repeat(16_385),
        total_bytes: 16_385,
        truncated: false,
      })),
    );
    expect(await oversized.controls.invoke(oversized.action.id, oversized.action.payload)).toEqual({
      output: "a".repeat(16_384),
      totalBytes: 16_385,
      truncated: true,
    });
  });

  it("keeps the latest output tail and never splits a surrogate pair", async () => {
    const latest = outputSetup(
      vi.fn(async () => ({
        output: `START${"x".repeat(17_000)}LATEST`,
        total_bytes: 17_011,
        truncated: false,
      })),
    );
    const latestResult = backgroundTaskOutputSchema.parse(
      await latest.controls.invoke(latest.action.id, latest.action.payload),
    );
    expect(latestResult).toMatchObject({ totalBytes: 17_011, truncated: true });
    expect(latestResult.output).toHaveLength(16_384);
    expect(latestResult.output.startsWith("START")).toBe(false);
    expect(latestResult.output.endsWith("LATEST")).toBe(true);

    // The tail slice starts on the low half of an emoji, which must be dropped.
    const splitSurrogate = outputSetup(
      vi.fn(async () => ({
        output: `x😀${"b".repeat(16_383)}`,
        total_bytes: 16_386,
        truncated: true,
      })),
    );
    const surrogateResult = await splitSurrogate.controls.invoke(
      splitSurrogate.action.id,
      splitSurrogate.action.payload,
    );
    expect(surrogateResult.output).toBe("b".repeat(16_383));
    expect(surrogateResult).toMatchObject({ totalBytes: 16_386, truncated: true });
  });

  it("offers no output capability when the SDK query lacks the method", async () => {
    const controls = new ClaudeBackgroundTaskControls(createClaudeMapperState("t"), () => ({
      stopTask: vi.fn<() => Promise<void>>(async () => {}),
    }));
    const command = {
      taskId: "server",
      kind: "command" as const,
      description: "serve",
    };
    controls.observe(message("task_started"));
    controls.reconcile([command]);
    expect(controls.listActions()).toEqual([{ id: "background-task.stop.v1" }]);
    expect(controls.decorate([command])[0]!.outputAction).toBeUndefined();
    await expect(
      controls.invoke("background-task.output.v1", {
        taskId: "server",
        token: "token",
      }),
    ).rejects.toThrow("unavailable");
  });
});
