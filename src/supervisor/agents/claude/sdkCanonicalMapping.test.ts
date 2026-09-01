import type {
  SDKAssistantMessage,
  SDKControlGetContextUsageResponse,
  SDKMessage,
} from "@anthropic-ai/claude-agent-sdk";
import { describe, expect, it, vi } from "vitest";
import type { RuntimeEvent } from "@/shared/contracts";
import {
  accumulateActiveGoalAssistantSpend,
  buildClaudeQuestionAnswerEvents,
  ClaudeUsageScopeTracker,
  completeActiveGoalOnTaskDrainEvents,
  createClaudeMapperState,
  emitActiveGoalTick,
  mapClaudeContextUsageResponse,
  mapClaudePermissionRequest,
  mapClaudeQuestionRequest,
  mapClaudeSdkMessage,
  parseClaudeQuestions,
  startClaudeTurn,
  supportsNativeGoalFrames,
} from "./sdkCanonicalMapping";

function streamEvent(event: Record<string, unknown>): SDKMessage {
  return { type: "stream_event", session_id: "claude-session", event } as unknown as SDKMessage;
}

/** Whole assistant message carrying per-call API usage (main lane or sidechain). */
function assistantUsageMessage(
  id: string,
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  },
  parentToolUseId?: string,
): SDKAssistantMessage {
  return {
    type: "assistant",
    session_id: "claude-session",
    uuid: `uuid-${id}`,
    parent_tool_use_id: parentToolUseId ?? null,
    message: {
      id,
      role: "assistant",
      model: "claude-opus-4-8",
      content: [{ type: "text", text: "working" }],
      usage,
    },
  } as unknown as SDKAssistantMessage;
}

function activeGoalMessage(
  value: {
    condition: string;
    iterations: number;
    set_at: number;
    tokens_at_start: number;
    last_reason?: string;
  } | null,
): SDKMessage {
  return {
    type: "active_goal",
    value,
    uuid: "goal-uuid",
    session_id: "claude-session",
  } as unknown as SDKMessage;
}

function streamEventWithParent(
  event: Record<string, unknown>,
  parentToolUseId: string,
): SDKMessage {
  return {
    type: "stream_event",
    session_id: "claude-session",
    parent_tool_use_id: parentToolUseId,
    event,
  } as unknown as SDKMessage;
}

describe("sdkCanonicalMapping — prompt content", () => {
  it("starts a turn with the optimistic user message id and mapped attachments", () => {
    const state = createClaudeMapperState("thread-1");

    const events = startClaudeTurn(
      state,
      "turn-1",
      "see this",
      [
        { kind: "text", content: "see this" },
        { kind: "attachment", path: "C:\\tmp\\image.png", mimeType: "image/png" },
      ],
      "user-optimistic",
    );

    expect(events).toEqual([
      { type: "turn.started", threadId: "thread-1", turnId: "turn-1" },
      {
        type: "item.started",
        threadId: "thread-1",
        itemId: "user-optimistic",
        itemType: "user_message",
        payload: {
          content: [
            { kind: "text", text: "see this" },
            {
              kind: "image",
              mimeType: "image/png",
              dataUrl: "poracode-local://local/C:/tmp/image.png",
              path: "C:\\tmp\\image.png",
              name: "image.png",
              source: "attachment",
            },
          ],
        },
      },
      { type: "item.completed", threadId: "thread-1", itemId: "user-optimistic" },
    ]);
  });

  it("surfaces a Claude /goal command as a shared goal chat item", () => {
    const state = createClaudeMapperState("thread-1");
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-05-12T10:00:00Z"));

      const events = startClaudeTurn(
        state,
        "turn-goal",
        "/goal ship unified GUI goal support",
        undefined,
        "user-goal",
      );

      expect(events).toContainEqual({
        type: "item.started",
        threadId: "thread-1",
        itemId: "goal-turn-goal",
        itemType: "goal",
        payload: {
          action: "set",
          objective: "ship unified GUI goal support",
          status: "active",
          timeUsedSeconds: 0,
          updatedAt: Date.parse("2026-05-12T10:00:00Z") / 1000,
        },
      });
      expect(events).toContainEqual({
        type: "item.completed",
        threadId: "thread-1",
        itemId: "goal-turn-goal",
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("marks an active /goal complete with tokens and elapsed time when the turn result arrives", () => {
    const state = createClaudeMapperState("thread-1");
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-05-12T10:00:00Z"));
      startClaudeTurn(
        state,
        "turn-goal",
        "/goal ship unified GUI goal support",
        undefined,
        "user-goal",
      );

      vi.setSystemTime(new Date("2026-05-12T10:02:05Z"));
      // Goal spend accumulates from per-call assistant-message usage…
      mapClaudeSdkMessage(
        assistantUsageMessage("msg-goal-1", {
          input_tokens: 60_000,
          output_tokens: 8_000,
          cache_read_input_tokens: 1_000,
          cache_creation_input_tokens: 500,
        }),
        state,
      );
      const resultEvents = mapClaudeSdkMessage(
        {
          type: "result",
          subtype: "success",
          session_id: "claude-session",
          // …never from the result: the CLI reports this as a session-cumulative
          // counter, so it must be ignored for goal totals.
          usage: {
            input_tokens: 60_000,
            output_tokens: 8_000,
            cache_read_input_tokens: 1_000,
            cache_creation_input_tokens: 500,
            total_tokens: 69_500,
          },
        } as unknown as SDKMessage,
        state,
      );

      const goalUpdate = resultEvents.find(
        (event) => event.type === "item.updated" && event.itemId === "goal-turn-goal",
      );
      expect(goalUpdate).toMatchObject({
        type: "item.updated",
        threadId: "thread-1",
        itemId: "goal-turn-goal",
        payload: {
          action: "updated",
          objective: "ship unified GUI goal support",
          status: "complete",
          tokensUsed: 69_500,
          timeUsedSeconds: 125,
        },
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not emit a goal completion update when no /goal was issued", () => {
    const state = createClaudeMapperState("thread-1");
    startClaudeTurn(state, "turn-plain", "do a thing", undefined, "user-plain");

    const resultEvents = mapClaudeSdkMessage(
      {
        type: "result",
        subtype: "success",
        session_id: "claude-session",
        usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
      } as unknown as SDKMessage,
      state,
    );

    expect(resultEvents.some((event) => event.type === "item.updated")).toBe(false);
  });

  it("keeps the goal active on an interrupted (steered) turn and accumulates tokens", () => {
    const state = createClaudeMapperState("thread-1");
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-05-12T10:00:00Z"));
      startClaudeTurn(
        state,
        "turn-goal",
        "/goal ship unified GUI goal support",
        undefined,
        "user-goal",
      );

      vi.setSystemTime(new Date("2026-05-12T10:01:00Z"));
      mapClaudeSdkMessage(
        assistantUsageMessage("msg-goal-1", { input_tokens: 30_000, output_tokens: 4_000 }),
        state,
      );
      const interruptedResult = mapClaudeSdkMessage(
        {
          type: "result",
          subtype: "error_during_execution",
          is_error: true,
          errors: ["[ede_diagnostic] turn interrupted before assistant content"],
          session_id: "claude-session",
          // Session-cumulative — ignored for goal totals.
          usage: { input_tokens: 30_000, output_tokens: 4_000, total_tokens: 34_000 },
        } as unknown as SDKMessage,
        state,
      );

      const goalUpdate = interruptedResult.find(
        (event) => event.type === "item.updated" && event.itemId === "goal-turn-goal",
      );
      expect(goalUpdate).toMatchObject({
        type: "item.updated",
        itemId: "goal-turn-goal",
        payload: {
          action: "updated",
          objective: "ship unified GUI goal support",
          status: "active",
          tokensUsed: 34_000,
          timeUsedSeconds: 60,
        },
      });

      expect(state.activeGoalItemId).toBe("goal-turn-goal");
      expect(state.activeGoalTokensUsed).toBe(34_000);

      vi.setSystemTime(new Date("2026-05-12T10:03:00Z"));
      mapClaudeSdkMessage(
        assistantUsageMessage("msg-goal-2", { input_tokens: 50_000, output_tokens: 8_000 }),
        state,
      );
      const successResult = mapClaudeSdkMessage(
        {
          type: "result",
          subtype: "success",
          session_id: "claude-session",
          usage: { input_tokens: 92_000, output_tokens: 12_000, total_tokens: 104_000 },
        } as unknown as SDKMessage,
        state,
      );

      const completedUpdate = successResult.find(
        (event) => event.type === "item.updated" && event.itemId === "goal-turn-goal",
      );
      expect(completedUpdate).toMatchObject({
        payload: {
          status: "complete",
          tokensUsed: 92_000,
          timeUsedSeconds: 180,
        },
      });
      expect(state.activeGoalItemId).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it("preserves active goal state across steered turns when new prompt is not /goal", () => {
    const state = createClaudeMapperState("thread-1");
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-05-12T10:00:00Z"));
      startClaudeTurn(state, "turn-goal", "/goal fix the bug", undefined, "user-goal");

      vi.setSystemTime(new Date("2026-05-12T10:00:30Z"));
      mapClaudeSdkMessage(
        assistantUsageMessage("msg-goal-1", { input_tokens: 8_000, output_tokens: 2_000 }),
        state,
      );
      mapClaudeSdkMessage(
        {
          type: "result",
          subtype: "error_during_execution",
          is_error: true,
          errors: ["[ede_diagnostic] turn interrupted"],
          session_id: "claude-session",
          usage: { total_tokens: 10_000 },
        } as unknown as SDKMessage,
        state,
      );

      vi.setSystemTime(new Date("2026-05-12T10:00:35Z"));
      startClaudeTurn(state, "turn-steer", "actually focus on the auth module", undefined);

      expect(state.activeGoalItemId).toBe("goal-turn-goal");
      expect(state.activeGoalObjective).toBe("fix the bug");
      expect(state.activeGoalTokensUsed).toBe(10_000);
    } finally {
      vi.useRealTimers();
    }
  });

  it("replaces active goal when a new /goal command is issued after an interrupt", () => {
    const state = createClaudeMapperState("thread-1");
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-05-12T10:00:00Z"));
      startClaudeTurn(state, "turn-goal-1", "/goal old objective", undefined);

      vi.setSystemTime(new Date("2026-05-12T10:00:30Z"));
      mapClaudeSdkMessage(
        assistantUsageMessage("msg-goal-1", { input_tokens: 4_000, output_tokens: 1_000 }),
        state,
      );
      mapClaudeSdkMessage(
        {
          type: "result",
          subtype: "error_during_execution",
          is_error: true,
          errors: ["[ede_diagnostic] turn interrupted"],
          session_id: "claude-session",
          usage: { total_tokens: 5_000 },
        } as unknown as SDKMessage,
        state,
      );

      vi.setSystemTime(new Date("2026-05-12T10:00:35Z"));
      startClaudeTurn(state, "turn-goal-2", "/goal new objective", undefined);

      expect(state.activeGoalItemId).toBe("goal-turn-goal-2");
      expect(state.activeGoalObjective).toBe("new objective");
      expect(state.activeGoalStartedAtMs).toBe(Date.now());
      expect(state.activeGoalTokensUsed).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it("clears an active goal when /clear starts a new conversation", () => {
    const state = createClaudeMapperState("thread-1");
    startClaudeTurn(state, "turn-goal", "/goal fix the bug", undefined);

    const clearEvents = startClaudeTurn(state, "turn-clear", "/clear", undefined);

    expect(clearEvents).toContainEqual(
      expect.objectContaining({
        type: "item.updated",
        itemId: "goal-turn-goal",
        payload: expect.objectContaining({
          action: "cleared",
          objective: "fix the bug",
        }),
      }),
    );
    expect(state.activeGoalItemId).toBeUndefined();
    expect(state.activeGoalObjective).toBeUndefined();
  });

  it("accepts documented clear aliases for /goal", () => {
    const state = createClaudeMapperState("thread-1");
    startClaudeTurn(state, "turn-goal", "/goal fix the bug", undefined);

    const stopEvents = startClaudeTurn(state, "turn-stop", "/goal stop", undefined);

    expect(stopEvents).toContainEqual(
      expect.objectContaining({
        type: "item.started",
        itemId: "goal-turn-stop",
        itemType: "goal",
        payload: expect.objectContaining({ action: "cleared" }),
      }),
    );
    expect(state.activeGoalItemId).toBeUndefined();
  });

  it("keeps an active goal docked when the user checks status with a bare /goal", () => {
    const state = createClaudeMapperState("thread-1");
    startClaudeTurn(state, "turn-goal", "/goal fix the bug", undefined, "user-goal");

    const statusEvents = startClaudeTurn(state, "turn-status", "/goal", undefined, "user-status");

    // `/goal` with no argument is a status query — the goal stays active, so
    // no goal item may be emitted (an objective-less item would blank the
    // dock) and the tracking must survive.
    expect(statusEvents).not.toContainEqual(expect.objectContaining({ itemType: "goal" }));
    expect(state.activeGoalItemId).toBe("goal-turn-goal");
    expect(state.activeGoalObjective).toBe("fix the bug");
    expect(state.activeGoalStartedAtMs).toBeDefined();
  });

  it("ignores session-cumulative result usage for goal token totals", () => {
    const state = createClaudeMapperState("thread-1");
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-05-12T10:00:00Z"));
      startClaudeTurn(state, "turn-goal", "/goal ship it", undefined);

      vi.setSystemTime(new Date("2026-05-12T10:00:45Z"));
      mapClaudeSdkMessage(
        assistantUsageMessage("msg-goal-1", { input_tokens: 40_000, output_tokens: 2_000 }),
        state,
      );

      vi.setSystemTime(new Date("2026-05-12T10:01:00Z"));
      const resultEvents = mapClaudeSdkMessage(
        {
          type: "result",
          subtype: "success",
          session_id: "claude-session",
          // The CLI's result usage is session-cumulative (includes pre-goal and
          // sidechain spend): counting it would corrupt the goal total.
          usage: { total_tokens: 4_000_000 },
        } as unknown as SDKMessage,
        state,
      );

      const goalUpdate = resultEvents.find(
        (event) => event.type === "item.updated" && event.itemId === "goal-turn-goal",
      );
      expect(goalUpdate).toMatchObject({
        payload: {
          status: "complete",
          tokensUsed: 42_000,
        },
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("holds a legacy goal open after background subagents drain for the session grace", () => {
    const state = createClaudeMapperState("thread-1");
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-05-12T10:00:00Z"));
      startClaudeTurn(state, "turn-goal", "/goal ship it", undefined, "user-goal");
      mapClaudeSdkMessage(
        {
          type: "system",
          subtype: "task_started",
          session_id: "claude-session",
          task_id: "task-bg",
          tool_use_id: "toolu_bg",
          subagent_type: "Explore",
        } as unknown as SDKMessage,
        state,
      );

      vi.setSystemTime(new Date("2026-05-12T10:01:33Z"));
      const resultEvents = mapClaudeSdkMessage(
        {
          type: "result",
          subtype: "success",
          session_id: "claude-session",
          usage: { total_tokens: 30_000 },
        } as unknown as SDKMessage,
        state,
      );

      // The clean turn end is not the goal outcome — background work is live.
      const resultGoalUpdate = resultEvents.find(
        (event) => event.type === "item.updated" && event.itemId === "goal-turn-goal",
      );
      expect(resultGoalUpdate).toMatchObject({
        payload: { status: "active", timeUsedSeconds: 93 },
      });
      expect(state.activeGoalItemId).toBe("goal-turn-goal");

      const drainEvents = mapClaudeSdkMessage(
        {
          type: "system",
          subtype: "task_notification",
          session_id: "claude-session",
          task_id: "task-bg",
          status: "completed",
          summary: "Done",
        } as unknown as SDKMessage,
        state,
      );

      expect(drainEvents).not.toContainEqual(
        expect.objectContaining({
          type: "item.updated",
          itemId: "goal-turn-goal",
          payload: expect.objectContaining({ status: "complete" }),
        }),
      );
      expect(state.activeGoalItemId).toBe("goal-turn-goal");
      expect(state.pendingGoalCompletionOnTaskDrain).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("holds a legacy goal open across a clean turn end while a background Bash task is live", () => {
    const state = createClaudeMapperState("thread-1");
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-05-12T10:00:00Z"));
      startClaudeTurn(state, "turn-goal", "/goal ship it", undefined, "user-goal");
      // Plain background Bash: `task_started` without a subagent_type never
      // registers as a subagent; the level signal is what reports it live.
      mapClaudeSdkMessage(
        {
          type: "system",
          subtype: "background_tasks_changed",
          session_id: "claude-session",
          tasks: [
            { task_id: "bash-1", task_type: "local_bash", description: "cargo test" },
            {
              task_id: "housekeeper",
              task_type: "local_bash",
              description: "chore",
              ambient: true,
            },
          ],
        } as unknown as SDKMessage,
        state,
      );
      expect(state.liveBackgroundTaskIds).toEqual(new Set(["bash-1"]));

      vi.setSystemTime(new Date("2026-05-12T10:37:44Z"));
      const resultEvents = mapClaudeSdkMessage(
        {
          type: "result",
          subtype: "success",
          session_id: "claude-session",
        } as unknown as SDKMessage,
        state,
      );

      // The turn ended mid-work (the CLI wakes the model when the task
      // finishes) — the goal must not complete with the command still running.
      const resultGoalUpdate = resultEvents.find(
        (event) => event.type === "item.updated" && event.itemId === "goal-turn-goal",
      );
      expect(resultGoalUpdate).toMatchObject({
        payload: { status: "active", timeUsedSeconds: 2264 },
      });
      expect(state.activeGoalItemId).toBe("goal-turn-goal");
      expect(state.pendingGoalCompletionOnTaskDrain).toBe(true);

      // REPLACE semantics: the next level is the whole live set, so finishing
      // one task while another starts must not strand the first entry.
      mapClaudeSdkMessage(
        {
          type: "system",
          subtype: "background_tasks_changed",
          session_id: "claude-session",
          tasks: [{ task_id: "bash-2", task_type: "local_bash", description: "next check" }],
        } as unknown as SDKMessage,
        state,
      );
      expect(state.liveBackgroundTaskIds).toEqual(new Set(["bash-2"]));

      // Last task drains and the model never resumes: the held goal completes.
      mapClaudeSdkMessage(
        {
          type: "system",
          subtype: "background_tasks_changed",
          session_id: "claude-session",
          tasks: [],
        } as unknown as SDKMessage,
        state,
      );
      const drainEvents = completeActiveGoalOnTaskDrainEvents(state);
      expect(drainEvents).toContainEqual(
        expect.objectContaining({
          type: "item.updated",
          itemId: "goal-turn-goal",
          payload: expect.objectContaining({ status: "complete" }),
        }),
      );
      expect(state.activeGoalItemId).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it("replaces the live background task set wholesale and drops malformed entries", () => {
    const state = createClaudeMapperState("thread-1");
    mapClaudeSdkMessage(
      {
        type: "system",
        subtype: "background_tasks_changed",
        session_id: "claude-session",
        tasks: [
          { task_id: "task-1", task_type: "local_agent", description: "explore" },
          { task_id: "task-2", task_type: "local_bash", description: "serve" },
          null,
          "not-an-object",
          { description: "no id" },
          { task_id: "", task_type: "local_bash", description: "empty id" },
        ],
      } as unknown as SDKMessage,
      state,
    );
    expect(state.liveBackgroundTaskIds).toEqual(new Set(["task-1", "task-2"]));

    // REPLACE, not merge: task-1 finished, task-2 still live.
    mapClaudeSdkMessage(
      {
        type: "system",
        subtype: "background_tasks_changed",
        session_id: "claude-session",
        tasks: [{ task_id: "task-2", task_type: "local_bash", description: "serve" }],
      } as unknown as SDKMessage,
      state,
    );
    expect(state.liveBackgroundTaskIds).toEqual(new Set(["task-2"]));
  });

  it("detects frame-capable CLIs from the init version", () => {
    expect(supportsNativeGoalFrames("2.1.251")).toBe(true);
    // Boundary: the floor itself streams frames.
    expect(supportsNativeGoalFrames("2.1.234")).toBe(true);
    expect(supportsNativeGoalFrames("2.1.233")).toBe(false);
    expect(supportsNativeGoalFrames("2.2.0")).toBe(true);
    expect(supportsNativeGoalFrames("3.0.1")).toBe(true);
    expect(supportsNativeGoalFrames("1.9.9")).toBe(false);
    // Prerelease suffixes and decorations keep the numeric triple.
    expect(supportsNativeGoalFrames("2.1.251-beta.1")).toBe(true);
    expect(supportsNativeGoalFrames("2.1.251 (Claude Code)")).toBe(true);
    // Unknown versions keep the legacy fallback.
    expect(supportsNativeGoalFrames(undefined)).toBe(false);
    expect(supportsNativeGoalFrames("")).toBe(false);
    expect(supportsNativeGoalFrames("not-a-version")).toBe(false);
    expect(supportsNativeGoalFrames(42)).toBe(false);
  });

  it("marks a /goal failed on a frame-capable CLI that never confirmed it", () => {
    const state = createClaudeMapperState("thread-1");
    // A frame-capable CLI emits the first `active_goal` verdict at the end of
    // the turn that set the goal. Zero frames by a clean turn end means the
    // CLI refused to arm it (trust/hooks gate) or the evaluator never ran.
    state.cliReportsNativeGoalFrames = true;
    startClaudeTurn(state, "turn-goal", "/goal ship it", undefined, "user-goal");

    const resultEvents = mapClaudeSdkMessage(
      { type: "result", subtype: "success", session_id: "claude-session" } as unknown as SDKMessage,
      state,
    );

    const goalUpdate = resultEvents.find(
      (event) => event.type === "item.updated" && event.itemId === "goal-turn-goal",
    );
    expect(goalUpdate).toMatchObject({
      type: "item.updated",
      itemId: "goal-turn-goal",
      payload: {
        action: "updated",
        status: "failed",
        objective: "ship it",
        lastReason: expect.stringContaining("verdict"),
      },
    });
    // The goal is resolved: no zombie tracking, no pending legacy drain.
    expect(state.activeGoalItemId).toBeUndefined();
    expect(state.pendingGoalCompletionOnTaskDrain).toBeUndefined();
  });

  it("keeps a frame-capable CLI's goal open across background work and never refutes at drain", () => {
    const state = createClaudeMapperState("thread-1");
    state.cliReportsNativeGoalFrames = true;
    startClaudeTurn(state, "turn-goal", "/goal ship it", undefined, "user-goal");
    mapClaudeSdkMessage(
      {
        type: "system",
        subtype: "background_tasks_changed",
        session_id: "claude-session",
        tasks: [{ task_id: "bash-1", task_type: "local_bash", description: "cargo test" }],
      } as unknown as SDKMessage,
      state,
    );

    const resultEvents = mapClaudeSdkMessage(
      { type: "result", subtype: "success", session_id: "claude-session" } as unknown as SDKMessage,
      state,
    );

    // Evaluation is deferred while background work is live — the goal is held,
    // not failed: the CLI evaluates at the next turn end with no work running.
    const resultGoalUpdate = resultEvents.find(
      (event) => event.type === "item.updated" && event.itemId === "goal-turn-goal",
    );
    expect(resultGoalUpdate).toMatchObject({ payload: { status: "active" } });
    expect(state.activeGoalItemId).toBe("goal-turn-goal");
    // The frame-capable CLI has no drain fallback: only frames resolve the goal.
    expect(state.pendingGoalCompletionOnTaskDrain).toBeUndefined();

    mapClaudeSdkMessage(
      {
        type: "system",
        subtype: "background_tasks_changed",
        session_id: "claude-session",
        tasks: [],
      } as unknown as SDKMessage,
      state,
    );
    const drainEvents = completeActiveGoalOnTaskDrainEvents(state);
    expect(drainEvents).toEqual([]);
    expect(state.activeGoalItemId).toBe("goal-turn-goal");
  });

  it("updates the active goal from a native active_goal verdict with iterations and reason", () => {
    const state = createClaudeMapperState("thread-1");
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-05-12T10:00:00Z"));
      startClaudeTurn(state, "turn-goal", "/goal all auth tests pass", undefined, "user-goal");

      vi.setSystemTime(new Date("2026-05-12T10:02:00Z"));
      const events = mapClaudeSdkMessage(
        activeGoalMessage({
          condition: "all auth tests pass",
          iterations: 2,
          set_at: Date.parse("2026-05-12T10:00:00Z") / 1000,
          tokens_at_start: 0,
          last_reason: "login.test.ts still failing",
        }),
        state,
      );

      expect(events).toContainEqual(
        expect.objectContaining({
          type: "item.updated",
          itemId: "goal-turn-goal",
          payload: expect.objectContaining({
            action: "updated",
            objective: "all auth tests pass",
            status: "active",
            iterations: 2,
            lastReason: "login.test.ts still failing",
            timeUsedSeconds: 120,
          }),
        }),
      );
      expect(state.sawActiveGoalMessage).toBe(true);
      expect(state.activeGoalItemId).toBe("goal-turn-goal");
    } finally {
      vi.useRealTimers();
    }
  });

  it("resets evaluator metadata when a new goal replaces the active goal", () => {
    const state = createClaudeMapperState("thread-1");
    startClaudeTurn(state, "turn-first", "/goal first objective", undefined, "user-first");
    mapClaudeSdkMessage(
      activeGoalMessage({
        condition: "first objective",
        iterations: 4,
        set_at: Date.now() / 1000,
        tokens_at_start: 0,
        last_reason: "first objective is not met",
      }),
      state,
    );

    startClaudeTurn(state, "turn-second", "/goal second objective", undefined, "user-second");

    expect(state.activeGoalObjective).toBe("second objective");
    expect(state.activeGoalIterations).toBeUndefined();
    expect(state.activeGoalLastReason).toBeUndefined();
  });

  it("keeps the goal active on a clean turn result while native goal evaluation is live", () => {
    const state = createClaudeMapperState("thread-1");
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-05-12T10:00:00Z"));
      startClaudeTurn(state, "turn-goal", "/goal all auth tests pass", undefined, "user-goal");
      mapClaudeSdkMessage(
        activeGoalMessage({
          condition: "all auth tests pass",
          iterations: 1,
          set_at: Date.parse("2026-05-12T10:00:00Z") / 1000,
          tokens_at_start: 0,
          last_reason: "tests not run yet",
        }),
        state,
      );

      vi.setSystemTime(new Date("2026-05-12T10:01:00Z"));
      mapClaudeSdkMessage(
        assistantUsageMessage("msg-goal-1", { input_tokens: 15_000, output_tokens: 5_000 }),
        state,
      );
      const resultEvents = mapClaudeSdkMessage(
        {
          type: "result",
          subtype: "success",
          session_id: "claude-session",
          usage: { total_tokens: 20_000 },
        } as unknown as SDKMessage,
        state,
      );

      const goalUpdate = resultEvents.find(
        (event) => event.type === "item.updated" && event.itemId === "goal-turn-goal",
      );
      expect(goalUpdate).toMatchObject({
        payload: {
          status: "active",
          tokensUsed: 20_000,
          iterations: 1,
          lastReason: "tests not run yet",
        },
      });
      expect(state.activeGoalItemId).toBe("goal-turn-goal");
    } finally {
      vi.useRealTimers();
    }
  });

  it("completes the goal when the evaluator reports the condition met", () => {
    const state = createClaudeMapperState("thread-1");
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-05-12T10:00:00Z"));
      startClaudeTurn(state, "turn-goal", "/goal all auth tests pass", undefined, "user-goal");
      mapClaudeSdkMessage(
        activeGoalMessage({
          condition: "all auth tests pass",
          iterations: 3,
          set_at: Date.parse("2026-05-12T10:00:00Z") / 1000,
          tokens_at_start: 0,
          last_reason: "one test still red",
        }),
        state,
      );
      mapClaudeSdkMessage(
        assistantUsageMessage("msg-goal-1", { input_tokens: 35_000, output_tokens: 5_000 }),
        state,
      );
      mapClaudeSdkMessage(
        {
          type: "result",
          subtype: "success",
          session_id: "claude-session",
          usage: { total_tokens: 40_000 },
        } as unknown as SDKMessage,
        state,
      );

      vi.setSystemTime(new Date("2026-05-12T10:05:00Z"));
      const metEvents = mapClaudeSdkMessage(activeGoalMessage(null), state);

      expect(metEvents).toContainEqual(
        expect.objectContaining({
          type: "item.updated",
          itemId: "goal-turn-goal",
          payload: expect.objectContaining({
            action: "updated",
            objective: "all auth tests pass",
            status: "complete",
            tokensUsed: 40_000,
            iterations: 3,
            timeUsedSeconds: 300,
          }),
        }),
      );
      expect(metEvents).toContainEqual({
        type: "item.completed",
        threadId: "thread-1",
        itemId: "goal-turn-goal",
      });
      expect(state.activeGoalItemId).toBeUndefined();
      expect(state.activeGoalObjective).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it("creates a goal item when a native goal arrives without a local /goal (session resume)", () => {
    const state = createClaudeMapperState("thread-1");

    const events = mapClaudeSdkMessage(
      activeGoalMessage({
        condition: "the migration compiles cleanly",
        iterations: 4,
        set_at: Date.now() / 1000 - 600,
        tokens_at_start: 0,
        last_reason: "two call sites remain",
      }),
      state,
    );

    expect(events).toContainEqual(
      expect.objectContaining({
        type: "item.started",
        itemType: "goal",
        payload: expect.objectContaining({
          action: "set",
          objective: "the migration compiles cleanly",
          status: "active",
          iterations: 4,
          lastReason: "two call sites remain",
        }),
      }),
    );
    expect(state.activeGoalItemId).toBeDefined();
    expect(state.activeGoalObjective).toBe("the migration compiles cleanly");
  });

  it("ignores a null active_goal verdict when no goal is active", () => {
    const state = createClaudeMapperState("thread-1");
    startClaudeTurn(state, "turn-goal", "/goal fix the bug", undefined);
    // `/goal clear` clears local state eagerly in startClaudeTurn; the SDK's
    // trailing null verdict must not resurrect or re-complete anything.
    startClaudeTurn(state, "turn-clear", "/goal clear", undefined);

    const events = mapClaudeSdkMessage(activeGoalMessage(null), state);

    expect(events).toEqual([]);
    expect(state.sawActiveGoalMessage).toBe(true);
  });
});

describe("sdkCanonicalMapping — text streaming", () => {
  it("opens an assistant item on the first text delta and completes it on stop", () => {
    const state = createClaudeMapperState("thread-1");

    const delta = mapClaudeSdkMessage(
      streamEvent({
        type: "content_block_delta",
        index: 0,
        delta: { type: "text_delta", text: "Hello" },
      }),
      state,
    );
    const stop = mapClaudeSdkMessage(streamEvent({ type: "content_block_stop", index: 0 }), state);

    expect(delta).toHaveLength(2);
    expect(delta[0]).toMatchObject({ type: "item.started", itemType: "assistant_message" });
    expect(delta[1]).toMatchObject({
      type: "content.delta",
      stream: "assistant_text",
      delta: "Hello",
    });
    expect(stop).toHaveLength(1);
    expect(stop[0]).toMatchObject({ type: "item.completed" });
  });

  /** message_start for msg_display plus one streamed text delta ("Bonjour"). */
  function startDisplayStream() {
    const state = createClaudeMapperState("thread-1");
    mapClaudeSdkMessage(
      streamEvent({
        type: "message_start",
        message: { id: "msg_display", role: "assistant", content: [] },
      }),
      state,
    );
    const streamed = mapClaudeSdkMessage(
      streamEvent({
        type: "content_block_delta",
        index: 1,
        delta: { type: "text_delta", text: "Bonjour" },
      }),
      state,
    );
    const itemId = "itemId" in streamed[0]! ? streamed[0].itemId : undefined;
    return { state, itemId };
  }

  function displaySnapshot(displayText: string): SDKMessage {
    return {
      type: "assistant",
      session_id: "claude-session",
      message: {
        id: "msg_display",
        role: "assistant",
        // MessageDisplay snapshots can omit the preceding thinking block,
        // shifting text from stream index 1 to snapshot index 0.
        content: [{ type: "text", text: displayText }],
      },
    } as unknown as SDKMessage;
  }

  it.each([
    ["replace", "Hello"],
    ["append", "Bonjour\n\nHello"],
  ])(
    "updates the streamed item with a MessageDisplay %s snapshot that arrives before block completion",
    (_mode, displayText) => {
      const { state, itemId } = startDisplayStream();

      const snapshot = mapClaudeSdkMessage(displaySnapshot(displayText), state);
      expect(snapshot).toEqual([
        {
          type: "item.updated",
          threadId: "thread-1",
          itemId,
          payload: {
            content: [{ kind: "text", text: displayText }],
            displayAuthoritative: true,
          },
        },
      ]);

      const completion = mapClaudeSdkMessage(
        streamEvent({ type: "content_block_stop", index: 1 }),
        state,
      );
      expect(completion).toEqual([{ type: "item.completed", threadId: "thread-1", itemId }]);
    },
  );

  it.each([
    ["replace", "Hello"],
    ["append", "Bonjour\n\nHello"],
    ["empty", ""],
  ])(
    "updates the already-completed streamed item with a MessageDisplay %s snapshot",
    (_mode, displayText) => {
      const { state, itemId } = startDisplayStream();
      const completion = mapClaudeSdkMessage(
        streamEvent({ type: "content_block_stop", index: 1 }),
        state,
      );
      expect(completion).toEqual([{ type: "item.completed", threadId: "thread-1", itemId }]);

      const snapshot = mapClaudeSdkMessage(displaySnapshot(displayText), state);
      expect(snapshot).toEqual([
        {
          type: "item.updated",
          threadId: "thread-1",
          itemId,
          payload: {
            content: [{ kind: "text", text: displayText }],
            displayAuthoritative: true,
          },
        },
      ]);
    },
  );

  it("maps multiple snapshot text blocks to streamed items by text order", () => {
    const state = createClaudeMapperState("thread-1");
    mapClaudeSdkMessage(
      streamEvent({
        type: "message_start",
        message: { id: "msg_display", role: "assistant", content: [] },
      }),
      state,
    );
    const firstStreamed = mapClaudeSdkMessage(
      streamEvent({
        type: "content_block_delta",
        index: 1,
        delta: { type: "text_delta", text: "First raw block" },
      }),
      state,
    );
    mapClaudeSdkMessage(streamEvent({ type: "content_block_stop", index: 1 }), state);
    const secondStreamed = mapClaudeSdkMessage(
      streamEvent({
        type: "content_block_delta",
        index: 3,
        delta: { type: "text_delta", text: "Second raw block" },
      }),
      state,
    );
    const firstItemId = "itemId" in firstStreamed[0]! ? firstStreamed[0].itemId : undefined;
    const secondItemId = "itemId" in secondStreamed[0]! ? secondStreamed[0].itemId : undefined;

    const snapshot = mapClaudeSdkMessage(
      {
        type: "assistant",
        session_id: "claude-session",
        message: {
          id: "msg_display",
          role: "assistant",
          content: [
            { type: "text", text: "First display block" },
            { type: "text", text: "" },
          ],
        },
      } as unknown as SDKMessage,
      state,
    );

    expect(snapshot).toEqual([
      {
        type: "item.updated",
        threadId: "thread-1",
        itemId: firstItemId,
        payload: {
          content: [{ kind: "text", text: "First display block" }],
          displayAuthoritative: true,
        },
      },
      {
        type: "item.updated",
        threadId: "thread-1",
        itemId: secondItemId,
        payload: { content: [{ kind: "text", text: "" }], displayAuthoritative: true },
      },
    ]);
    expect(snapshot.some((event) => event.type === "item.started")).toBe(false);
  });

  it("skips the snapshot update when the text matches what already streamed", () => {
    // No MessageDisplay hook: the final snapshot repeats the streamed text
    // byte-for-byte. Emitting it would persist every ordinary Claude turn's
    // text twice and flag an untouched payload as display-authoritative.
    const { state } = startDisplayStream();
    mapClaudeSdkMessage(streamEvent({ type: "content_block_stop", index: 1 }), state);

    const snapshot = mapClaudeSdkMessage(displaySnapshot("Bonjour"), state);
    expect(snapshot).toEqual([]);
  });

  it("still drops a late snapshot whose frame was reset by a newer message", () => {
    const state = createClaudeMapperState("thread-1");
    mapClaudeSdkMessage(
      streamEvent({
        type: "message_start",
        message: { id: "msg_1", role: "assistant", content: [] },
      }),
      state,
    );
    mapClaudeSdkMessage(
      streamEvent({
        type: "content_block_delta",
        index: 0,
        delta: { type: "text_delta", text: "Answer one" },
      }),
      state,
    );
    mapClaudeSdkMessage(streamEvent({ type: "content_block_stop", index: 0 }), state);
    mapClaudeSdkMessage(
      streamEvent({
        type: "message_start",
        message: { id: "msg_2", role: "assistant", content: [] },
      }),
      state,
    );

    const lateSnapshot = mapClaudeSdkMessage(
      {
        type: "assistant",
        session_id: "claude-session",
        message: {
          id: "msg_1",
          role: "assistant",
          // A text that differs from what streamed proves the drop comes from
          // the reset frame (no streamed lane remains), not the
          // identical-snapshot skip.
          content: [{ type: "text", text: "Rewritten answer one" }],
        },
      } as unknown as SDKMessage,
      state,
    );

    expect(lateSnapshot).toEqual([]);
  });

  it("keeps a streamed item available when message_start replays the same message id", () => {
    const state = createClaudeMapperState("thread-1");
    mapClaudeSdkMessage(
      streamEvent({
        type: "message_start",
        message: { id: "msg_1", role: "assistant", content: [] },
      }),
      state,
    );
    const streamed = mapClaudeSdkMessage(
      streamEvent({
        type: "content_block_delta",
        index: 0,
        delta: { type: "text_delta", text: "Done" },
      }),
      state,
    );
    const itemId = "itemId" in streamed[0]! ? streamed[0].itemId : undefined;
    mapClaudeSdkMessage(streamEvent({ type: "content_block_stop", index: 0 }), state);
    mapClaudeSdkMessage(
      streamEvent({
        type: "message_start",
        message: { id: "msg_1", role: "assistant", content: [] },
      }),
      state,
    );

    const snapshot = mapClaudeSdkMessage(
      {
        type: "assistant",
        session_id: "claude-session",
        message: {
          id: "msg_1",
          role: "assistant",
          content: [{ type: "text", text: "Displayed result" }],
        },
      } as unknown as SDKMessage,
      state,
    );

    expect(snapshot).toEqual([
      {
        type: "item.updated",
        threadId: "thread-1",
        itemId,
        payload: {
          content: [{ kind: "text", text: "Displayed result" }],
          displayAuthoritative: true,
        },
      },
    ]);
  });

  it("ignores a repeat content_block_start at the same index after the block already completed", () => {
    const state = createClaudeMapperState("thread-1");
    mapClaudeSdkMessage(
      streamEvent({
        type: "content_block_start",
        index: 0,
        content_block: { type: "text", text: "" },
      }),
      state,
    );
    mapClaudeSdkMessage(
      streamEvent({
        type: "content_block_delta",
        index: 0,
        delta: { type: "text_delta", text: "Good idea" },
      }),
      state,
    );
    mapClaudeSdkMessage(streamEvent({ type: "content_block_stop", index: 0 }), state);

    // SDK redelivers the same block (e.g. retry / replay). Without the
    // dedup, ensureTextItem would create a second assistant_message item
    // with duplicate content.
    const replayStart = mapClaudeSdkMessage(
      streamEvent({
        type: "content_block_start",
        index: 0,
        content_block: { type: "text", text: "" },
      }),
      state,
    );
    const replayDelta = mapClaudeSdkMessage(
      streamEvent({
        type: "content_block_delta",
        index: 0,
        delta: { type: "text_delta", text: "Good idea" },
      }),
      state,
    );

    expect(replayStart).toEqual([]);
    expect(replayDelta).toEqual([]);
  });

  it("starts a fresh per-index frame when message_start arrives between assistant messages", () => {
    const state = createClaudeMapperState("thread-1");
    mapClaudeSdkMessage(
      streamEvent({
        type: "content_block_delta",
        index: 0,
        delta: { type: "text_delta", text: "First" },
      }),
      state,
    );
    mapClaudeSdkMessage(streamEvent({ type: "content_block_stop", index: 0 }), state);

    // A new assistant message begins. The next content_block at index 0
    // must produce a NEW assistant_message item — not be skipped as a
    // duplicate of the prior message's idx 0.
    const reset = mapClaudeSdkMessage(
      streamEvent({
        type: "message_start",
        message: { id: "msg_2", role: "assistant", content: [] },
      }),
      state,
    );
    const second = mapClaudeSdkMessage(
      streamEvent({
        type: "content_block_delta",
        index: 0,
        delta: { type: "text_delta", text: "Second" },
      }),
      state,
    );

    expect(reset).toEqual([]);
    expect(second).toHaveLength(2);
    expect(second[0]).toMatchObject({ type: "item.started", itemType: "assistant_message" });
    expect(second[1]).toMatchObject({
      type: "content.delta",
      stream: "assistant_text",
      delta: "Second",
    });
  });
});

describe("sdkCanonicalMapping — tool use", () => {
  it("routes legacy TodoWrite bulk replacements through the plan aggregator", () => {
    const state = createClaudeMapperState("thread-1");

    const started = mapClaudeSdkMessage(
      streamEvent({
        type: "content_block_start",
        index: 0,
        content_block: { type: "tool_use", id: "toolu_todo", name: "TodoWrite", input: {} },
      }),
      state,
    );
    const updated = mapClaudeSdkMessage(
      streamEvent({
        type: "content_block_delta",
        index: 0,
        delta: {
          type: "input_json_delta",
          partial_json:
            '{"todos":[{"content":"First task","status":"in_progress"},{"content":"Done","status":"completed"}]}',
        },
      }),
      state,
    );

    // Empty input at start = aggregator has nothing to publish yet — the
    // underlying tool_use row is suppressed and no event is emitted.
    expect(started).toEqual([]);
    expect(updated).toEqual([
      {
        type: "item.started",
        threadId: "thread-1",
        itemId: "plan-thread-1",
        itemType: "plan",
        payload: {
          steps: [
            { step: "First task", status: "in_progress" },
            { step: "Done", status: "completed" },
          ],
        },
      },
    ]);
  });

  it("surfaces file_path from partial input JSON before the full payload finishes streaming", () => {
    const state = createClaudeMapperState("thread-1");
    mapClaudeSdkMessage(
      streamEvent({
        type: "content_block_start",
        index: 0,
        content_block: { type: "tool_use", id: "toolu_read", name: "Read", input: {} },
      }),
      state,
    );

    const firstChunk = mapClaudeSdkMessage(
      streamEvent({
        type: "content_block_delta",
        index: 0,
        delta: { type: "input_json_delta", partial_json: '{"file_path":"src/foo.ts","of' },
      }),
      state,
    );

    expect(firstChunk).toEqual([
      {
        type: "item.updated",
        threadId: "thread-1",
        itemId: "toolu_read",
        payload: expect.objectContaining({
          name: "Read",
          args: expect.objectContaining({ file_path: "src/foo.ts" }),
          status: "running",
        }),
      },
    ]);

    const finalChunk = mapClaudeSdkMessage(
      streamEvent({
        type: "content_block_delta",
        index: 0,
        delta: { type: "input_json_delta", partial_json: 'fset":0}' },
      }),
      state,
    );

    expect(finalChunk[0]).toMatchObject({
      type: "item.updated",
      payload: expect.objectContaining({
        args: { file_path: "src/foo.ts", offset: 0 },
      }),
    });
  });

  it("surfaces Task model override from streamed input JSON", () => {
    const state = createClaudeMapperState("thread-1");
    mapClaudeSdkMessage(
      streamEvent({
        type: "content_block_start",
        index: 0,
        content_block: { type: "tool_use", id: "toolu_task", name: "Task", input: {} },
      }),
      state,
    );

    const events = mapClaudeSdkMessage(
      streamEvent({
        type: "content_block_delta",
        index: 0,
        delta: {
          type: "input_json_delta",
          partial_json:
            '{"description":"Audit","subagent_type":"general-purpose","model":"sonnet"}',
        },
      }),
      state,
    );

    expect(events).toMatchObject([
      {
        type: "item.updated",
        threadId: "thread-1",
        itemId: "toolu_task",
        payload: {
          name: "Task",
          args: {
            description: "Audit",
            subagent_type: "general-purpose",
            model: "sonnet",
          },
          status: "running",
          progress: { model: "sonnet" },
        },
      },
    ]);
  });

  it("maps Claude Workflow tool calls as subagent-like tool_call items", () => {
    const state = createClaudeMapperState("thread-1");
    const events = mapClaudeSdkMessage(
      streamEvent({
        type: "content_block_start",
        index: 0,
        content_block: {
          type: "tool_use",
          id: "toolu_workflow",
          name: "Workflow",
          input: { description: "Run release checks" },
        },
      }),
      state,
    );

    expect(events).toEqual([
      {
        type: "item.started",
        threadId: "thread-1",
        itemId: "toolu_workflow",
        itemType: "tool_call",
        payload: {
          name: "Workflow",
          args: { description: "Run release checks" },
          status: "running",
          isSubAgent: true,
        },
      },
    ]);
  });

  it("preserves Claude Skill and MCP tool names for usage capture", () => {
    const state = createClaudeMapperState("thread-1");

    const skill = mapClaudeSdkMessage(
      streamEvent({
        type: "content_block_start",
        index: 0,
        content_block: {
          type: "tool_use",
          id: "toolu_skill",
          name: "Skill",
          input: { skill: "heroui-react" },
        },
      }),
      state,
    );
    expect(skill[0]).toMatchObject({
      type: "item.started",
      itemType: "dynamic_tool_call",
      payload: {
        name: "Skill",
        args: { skill: "heroui-react" },
        status: "running",
      },
    });

    const mcp = mapClaudeSdkMessage(
      streamEvent({
        type: "content_block_start",
        index: 1,
        content_block: {
          type: "tool_use",
          id: "toolu_mcp",
          name: "mcp__github__search",
          input: { query: "deploy" },
        },
      }),
      state,
    );
    expect(mcp[0]).toMatchObject({
      type: "item.started",
      itemType: "mcp_tool_call",
      payload: {
        name: "mcp__github__search",
        args: { query: "deploy" },
        status: "running",
      },
    });

    for (const [index, tool] of [
      "list_agents",
      "get_agent",
      "spawn_agent",
      "run_agent",
      "wait_for_agent",
      "get_status",
      "cancel",
      "create_thread",
      "list_threads",
      "get_thread",
      "read_thread",
      "send_to_thread",
      "wait_for_thread",
      "interrupt_thread",
      "close_thread",
    ].entries()) {
      const subagentsCall = mapClaudeSdkMessage(
        streamEvent({
          type: "content_block_start",
          index: index + 10,
          content_block: {
            type: "tool_use",
            id: `toolu_subagents_${tool}`,
            name: `mcp__crossagents__${tool}`,
            input: {},
          },
        }),
        state,
      );
      expect(subagentsCall).toEqual([
        {
          type: "item.started",
          threadId: "thread-1",
          itemId: `toolu_subagents_${tool}`,
          itemType: "mcp_tool_call",
          payload: {
            name: `mcp__crossagents__${tool}`,
            args: {},
            result: undefined,
            status: "running",
          },
        },
      ]);
    }

    const resource = mapClaudeSdkMessage(
      streamEvent({
        type: "content_block_start",
        index: 2,
        content_block: {
          type: "tool_use",
          id: "toolu_mcp_resource",
          name: "ListMcpResources",
          input: { server: "github" },
        },
      }),
      state,
    );
    expect(resource[0]).toMatchObject({
      type: "item.started",
      itemType: "mcp_tool_call",
      payload: {
        name: "ListMcpResources",
        args: { server: "github" },
        status: "running",
      },
    });
  });

  it.each([["Read"], ["NotebookRead"]] as const)(
    "tags %s tool_use payloads with kind: read so the renderer applies syntax highlighting",
    (toolName) => {
      const state = createClaudeMapperState("thread-1");
      const events = mapClaudeSdkMessage(
        streamEvent({
          type: "content_block_start",
          index: 0,
          content_block: {
            type: "tool_use",
            id: `toolu_${toolName}`,
            name: toolName,
            input: { file_path: "src/foo.ts" },
          },
        }),
        state,
      );

      expect(events[0]).toMatchObject({
        type: "item.started",
        payload: expect.objectContaining({ kind: "read" }),
      });
    },
  );

  it("does not extract nested keys from partial input JSON for plan tools", () => {
    const state = createClaudeMapperState("thread-1");
    mapClaudeSdkMessage(
      streamEvent({
        type: "content_block_start",
        index: 0,
        content_block: { type: "tool_use", id: "toolu_todo_partial", name: "TodoWrite", input: {} },
      }),
      state,
    );

    const partial = mapClaudeSdkMessage(
      streamEvent({
        type: "content_block_delta",
        index: 0,
        delta: {
          type: "input_json_delta",
          partial_json: '{"todos":[{"content":"Working on it","status":"in_progress"',
        },
      }),
      state,
    );

    expect(partial).toEqual([]);
  });

  it("routes Claude TaskCreate calls through the plan aggregator as a stable plan item", () => {
    const state = createClaudeMapperState("thread-1");

    const first = mapClaudeSdkMessage(
      streamEvent({
        type: "content_block_start",
        index: 0,
        content_block: {
          type: "tool_use",
          id: "toolu_create_1",
          name: "TaskCreate",
          input: { subject: "Investigate bug", description: "details" },
        },
      }),
      state,
    );
    expect(first).toEqual([
      {
        type: "item.started",
        threadId: "thread-1",
        itemId: "plan-thread-1",
        itemType: "plan",
        payload: { steps: [{ step: "Investigate bug", status: "pending" }] },
      },
    ]);

    const second = mapClaudeSdkMessage(
      streamEvent({
        type: "content_block_start",
        index: 1,
        content_block: {
          type: "tool_use",
          id: "toolu_create_2",
          name: "TaskCreate",
          input: { subject: "Write fix" },
        },
      }),
      state,
    );
    expect(second).toEqual([
      {
        type: "item.updated",
        threadId: "thread-1",
        itemId: "plan-thread-1",
        payload: {
          steps: [
            { step: "Investigate bug", status: "pending" },
            { step: "Write fix", status: "pending" },
          ],
        },
      },
    ]);
  });

  it("uses the TaskCreate tool_result to map runtime task_ids to aggregator keys", () => {
    const state = createClaudeMapperState("thread-1");
    mapClaudeSdkMessage(
      streamEvent({
        type: "content_block_start",
        index: 0,
        content_block: {
          type: "tool_use",
          id: "toolu_create_1",
          name: "TaskCreate",
          input: { subject: "Investigate bug" },
        },
      }),
      state,
    );

    // The host returns "Task #N created successfully" — bind that to the
    // aggregator without producing a chat row.
    const resultEvents = mapClaudeSdkMessage(
      {
        type: "user",
        session_id: "claude-session",
        parent_tool_use_id: null,
        message: {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: "toolu_create_1",
              content: "Task #42 created successfully: Investigate bug",
            },
          ],
        },
      } as unknown as SDKMessage,
      state,
    );
    expect(resultEvents).toEqual([]);

    // A subsequent TaskUpdate referencing task_id 42 must update the same
    // aggregator entry, not create a new "Task 42" row.
    const updateEvents = mapClaudeSdkMessage(
      streamEvent({
        type: "content_block_start",
        index: 1,
        content_block: {
          type: "tool_use",
          id: "toolu_update_1",
          name: "TaskUpdate",
          input: { taskId: "42", status: "completed" },
        },
      }),
      state,
    );
    expect(updateEvents).toEqual([
      {
        type: "item.updated",
        threadId: "thread-1",
        itemId: "plan-thread-1",
        payload: { steps: [{ step: "Investigate bug", status: "completed" }] },
      },
    ]);
  });

  it("treats TaskUpdate with an unknown taskId as a new aggregator entry", () => {
    const state = createClaudeMapperState("thread-1");
    const events = mapClaudeSdkMessage(
      streamEvent({
        type: "content_block_start",
        index: 0,
        content_block: {
          type: "tool_use",
          id: "toolu_update_orphan",
          name: "TaskUpdate",
          input: { taskId: "99", subject: "Orphan task", status: "in_progress" },
        },
      }),
      state,
    );
    expect(events).toEqual([
      {
        type: "item.started",
        threadId: "thread-1",
        itemId: "plan-thread-1",
        itemType: "plan",
        payload: { steps: [{ step: "Orphan task", status: "in_progress" }] },
      },
    ]);
  });

  it("removes a task when TaskUpdate sets status=deleted", () => {
    const state = createClaudeMapperState("thread-1");
    mapClaudeSdkMessage(
      streamEvent({
        type: "content_block_start",
        index: 0,
        content_block: {
          type: "tool_use",
          id: "toolu_create_1",
          name: "TaskCreate",
          input: { subject: "Keep" },
        },
      }),
      state,
    );
    mapClaudeSdkMessage(
      streamEvent({
        type: "content_block_start",
        index: 1,
        content_block: {
          type: "tool_use",
          id: "toolu_create_2",
          name: "TaskCreate",
          input: { subject: "Remove" },
        },
      }),
      state,
    );
    // Bind task_id 7 to the second create
    mapClaudeSdkMessage(
      {
        type: "user",
        session_id: "claude-session",
        parent_tool_use_id: null,
        message: {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: "toolu_create_2",
              content: "Task #7 created successfully",
            },
          ],
        },
      } as unknown as SDKMessage,
      state,
    );

    const removed = mapClaudeSdkMessage(
      streamEvent({
        type: "content_block_start",
        index: 2,
        content_block: {
          type: "tool_use",
          id: "toolu_delete",
          name: "TaskUpdate",
          input: { taskId: "7", status: "deleted" },
        },
      }),
      state,
    );
    expect(removed).toEqual([
      {
        type: "item.updated",
        threadId: "thread-1",
        itemId: "plan-thread-1",
        payload: { steps: [{ step: "Keep", status: "pending" }] },
      },
    ]);
  });

  it("never registers Task* tools as standalone chat rows", () => {
    const state = createClaudeMapperState("thread-1");
    mapClaudeSdkMessage(
      streamEvent({
        type: "content_block_start",
        index: 0,
        content_block: {
          type: "tool_use",
          id: "toolu_create_1",
          name: "TaskCreate",
          input: { subject: "Investigate" },
        },
      }),
      state,
    );
    // Drain the (suppressed) tool_result — no item.completed for the TaskCreate
    // tool_use; only the aggregator's plan item is visible.
    const resultEvents = mapClaudeSdkMessage(
      {
        type: "user",
        session_id: "claude-session",
        parent_tool_use_id: null,
        message: {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: "toolu_create_1",
              content: "Task #1 created successfully",
            },
          ],
        },
      } as unknown as SDKMessage,
      state,
    );
    expect(resultEvents).toEqual([]);
  });

  it("streams command tool results to command_output and completes the item", () => {
    const state = createClaudeMapperState("thread-1");
    mapClaudeSdkMessage(
      streamEvent({
        type: "content_block_start",
        index: 0,
        content_block: {
          type: "tool_use",
          id: "toolu_bash",
          name: "Bash",
          input: { command: "pwd" },
        },
      }),
      state,
    );

    const events = mapClaudeSdkMessage(
      {
        type: "user",
        session_id: "claude-session",
        parent_tool_use_id: null,
        message: {
          role: "user",
          content: [{ type: "tool_result", tool_use_id: "toolu_bash", content: "C:\\repo" }],
        },
      } as unknown as SDKMessage,
      state,
    );

    expect(events).toEqual([
      {
        type: "content.delta",
        threadId: "thread-1",
        itemId: "toolu_bash",
        stream: "command_output",
        delta: "C:\\repo",
      },
      {
        type: "item.updated",
        threadId: "thread-1",
        itemId: "toolu_bash",
        payload: { command: "pwd" },
      },
      { type: "item.completed", threadId: "thread-1", itemId: "toolu_bash" },
    ]);
  });

  it("preserves image content blocks from a tool result onto payload.images", () => {
    const state = createClaudeMapperState("thread-1");
    mapClaudeSdkMessage(
      streamEvent({
        type: "content_block_start",
        index: 0,
        content_block: {
          type: "tool_use",
          id: "toolu_img",
          name: "generate_picture",
          input: { prompt: "a cat" },
        },
      }),
      state,
    );

    const events = mapClaudeSdkMessage(
      {
        type: "user",
        session_id: "claude-session",
        parent_tool_use_id: null,
        message: {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: "toolu_img",
              content: [
                {
                  type: "image",
                  source: { type: "base64", media_type: "image/png", data: "iVBORw0KGgo=" },
                },
              ],
            },
          ],
        },
      } as unknown as SDKMessage,
      state,
    );

    const updated = events.find((e) => e.type === "item.updated") as
      | { payload: Record<string, unknown> }
      | undefined;
    // The text-only extractor would drop the image; it must survive onto
    // payload.images as a renderable data URL so the chat row shows it inline.
    expect(updated?.payload.images).toEqual(["data:image/png;base64,iVBORw0KGgo="]);
  });

  it("maps Edit tool results as ACP-shaped file changes", () => {
    const state = createClaudeMapperState("thread-1");
    const args = {
      file_path: "src/renderer/components/composer/MentionInput.tsx",
      old_string: "const oldValue = true;",
      new_string: "const oldValue = false;",
    };

    const started = mapClaudeSdkMessage(
      streamEvent({
        type: "content_block_start",
        index: 0,
        content_block: {
          type: "tool_use",
          id: "toolu_edit",
          name: "Edit",
          input: args,
        },
      }),
      state,
    );

    expect(started).toEqual([
      {
        type: "item.started",
        threadId: "thread-1",
        itemId: "toolu_edit",
        itemType: "file_change",
        payload: {
          name: "Edit",
          path: "src/renderer/components/composer/MentionInput.tsx",
          changeKind: "edit",
          args,
        },
      },
    ]);

    const result = { type: "tool_result", tool_use_id: "toolu_edit", content: "Edit applied." };
    const completed = mapClaudeSdkMessage(
      {
        type: "user",
        session_id: "claude-session",
        parent_tool_use_id: null,
        message: {
          role: "user",
          content: [result],
        },
      } as unknown as SDKMessage,
      state,
    );

    expect(completed).toEqual([
      {
        type: "content.delta",
        threadId: "thread-1",
        itemId: "toolu_edit",
        stream: "file_change_output",
        delta: "Edit applied.",
      },
      {
        type: "item.updated",
        threadId: "thread-1",
        itemId: "toolu_edit",
        payload: {
          name: "Edit",
          path: "src/renderer/components/composer/MentionInput.tsx",
          changeKind: "edit",
          args,
          result: "Edit applied.",
        },
      },
      { type: "item.completed", threadId: "thread-1", itemId: "toolu_edit" },
    ]);
  });

  it("threads structuredPatch real line numbers onto Edit file changes", () => {
    const state = createClaudeMapperState("thread-1");
    const args = {
      file_path: "src/app.ts",
      old_string: "const oldValue = true;",
      new_string: "const oldValue = false;",
    };

    mapClaudeSdkMessage(
      streamEvent({
        type: "content_block_start",
        index: 0,
        content_block: { type: "tool_use", id: "toolu_edit", name: "Edit", input: args },
      }),
      state,
    );

    const completed = mapClaudeSdkMessage(
      {
        type: "user",
        session_id: "claude-session",
        parent_tool_use_id: null,
        tool_use_result: {
          filePath: "src/app.ts",
          oldString: args.old_string,
          newString: args.new_string,
          originalFile: "line 11\nconst oldValue = true;\nline 13\n",
          userModified: false,
          replaceAll: false,
          structuredPatch: [
            {
              oldStart: 11,
              oldLines: 3,
              newStart: 11,
              newLines: 3,
              lines: [
                " line 11",
                "-const oldValue = true;",
                "+const oldValue = false;",
                " line 13",
              ],
            },
          ],
        },
        message: {
          role: "user",
          content: [{ type: "tool_result", tool_use_id: "toolu_edit", content: "Edit applied." }],
        },
      } as unknown as SDKMessage,
      state,
    );

    const updated = completed.find((event) => event.type === "item.updated");
    const payload = (updated as { payload?: Record<string, unknown> }).payload;
    const metadata = payload?.metadata as { changes?: Array<{ path?: string; diff?: string }> };
    expect(metadata.changes?.[0]?.path).toBe("src/app.ts");
    // Real file line numbers from structuredPatch, not the synthetic `@@ -1 +1 @@`.
    expect(metadata.changes?.[0]?.diff).toContain("@@ -11,3 +11,3 @@");
    expect(metadata.changes?.[0]?.diff).toContain("-const oldValue = true;");
    expect(metadata.changes?.[0]?.diff).toContain("+const oldValue = false;");
    // The human-readable result text is still preserved for the accordion.
    expect(payload?.result).toBe("Edit applied.");
  });

  it("emits every structuredPatch hunk for a MultiEdit at its real start line", () => {
    const state = createClaudeMapperState("thread-1");
    const args = { file_path: "src/app.ts", edits: [] };

    mapClaudeSdkMessage(
      streamEvent({
        type: "content_block_start",
        index: 0,
        content_block: { type: "tool_use", id: "toolu_multi", name: "MultiEdit", input: args },
      }),
      state,
    );

    const completed = mapClaudeSdkMessage(
      {
        type: "user",
        session_id: "claude-session",
        parent_tool_use_id: null,
        tool_use_result: {
          filePath: "src/app.ts",
          structuredPatch: [
            { oldStart: 5, oldLines: 1, newStart: 5, newLines: 1, lines: ["-a", "+A"] },
            { oldStart: 40, oldLines: 1, newStart: 40, newLines: 2, lines: ["-b", "+B", "+C"] },
          ],
        },
        message: {
          role: "user",
          content: [{ type: "tool_result", tool_use_id: "toolu_multi", content: "ok" }],
        },
      } as unknown as SDKMessage,
      state,
    );

    const updated = completed.find((event) => event.type === "item.updated");
    const diff = (updated as { payload?: { metadata?: { changes?: Array<{ diff?: string }> } } })
      .payload?.metadata?.changes?.[0]?.diff;
    expect(diff).toContain("@@ -5 +5 @@");
    expect(diff).toContain("@@ -40 +40,2 @@");
  });

  it("ignores a structuredPatch whose filePath does not match the edited file", () => {
    const state = createClaudeMapperState("thread-1");
    const args = { file_path: "src/app.ts", old_string: "a", new_string: "b" };

    mapClaudeSdkMessage(
      streamEvent({
        type: "content_block_start",
        index: 0,
        content_block: { type: "tool_use", id: "toolu_edit", name: "Edit", input: args },
      }),
      state,
    );

    const completed = mapClaudeSdkMessage(
      {
        type: "user",
        session_id: "claude-session",
        parent_tool_use_id: null,
        tool_use_result: {
          filePath: "src/other.ts",
          structuredPatch: [
            { oldStart: 9, oldLines: 1, newStart: 9, newLines: 1, lines: ["-a", "+b"] },
          ],
        },
        message: {
          role: "user",
          content: [{ type: "tool_result", tool_use_id: "toolu_edit", content: "ok" }],
        },
      } as unknown as SDKMessage,
      state,
    );

    const updated = completed.find((event) => event.type === "item.updated");
    expect((updated as { payload?: Record<string, unknown> }).payload?.metadata).toBeUndefined();
  });

  it("counts Claude Write content lines as create diff summary", () => {
    const state = createClaudeMapperState("thread-1");
    const args = {
      file_path: "src/app.js",
      content: "const root = document.querySelector('#app');\nroot.textContent = 'hi';\n",
    };

    const events = mapClaudeSdkMessage(
      streamEvent({
        type: "content_block_start",
        index: 0,
        content_block: {
          type: "tool_use",
          id: "toolu_write",
          name: "Write",
          input: args,
        },
      }),
      state,
    );

    expect(events[0]).toMatchObject({
      type: "item.started",
      itemType: "file_change",
      payload: {
        path: "src/app.js",
        changeKind: "create",
        diffSummary: { added: 2, removed: 0 },
      },
    });
  });

  // TodoWrite, TaskCreate, TaskUpdate, and TaskStop are routed through the
  // plan aggregator (see dedicated tests above) — their underlying tool_use
  // rows never produce a standalone chat item, so they're excluded from this
  // classification grid.
  it.each([
    ["Agent", { prompt: "check this" }, "tool_call"],
    ["Task", { description: "check this" }, "tool_call"],
    ["ExitPlanMode", { plan: "# Plan" }, "tool_call"],
    ["Bash", { command: "pnpm test" }, "command_execution"],
    ["TaskOutput", { task_id: "task-1" }, "dynamic_tool_call"],
    ["Read", { file_path: "src/App.tsx" }, "dynamic_tool_call"],
    ["NotebookRead", { notebook_path: "analysis.ipynb" }, "dynamic_tool_call"],
    ["LS", { path: "src" }, "dynamic_tool_call"],
    ["Grep", { pattern: "needle" }, "dynamic_tool_call"],
    ["Glob", { pattern: "*.ts" }, "dynamic_tool_call"],
    ["ListMcpResources", { server: "github" }, "mcp_tool_call"],
    ["ReadMcpResource", { server: "github", uri: "repo://x" }, "mcp_tool_call"],
    ["mcp__github__search", { query: "deploy" }, "mcp_tool_call"],
    ["ToolSearch", { query: "deploy" }, "dynamic_tool_call"],
    ["WebSearch", { query: "docs" }, "web_search"],
    ["WebFetch", { url: "https://example.com" }, "web_search"],
    ["TaskGet", { task_id: "task-1" }, "dynamic_tool_call"],
    ["TaskList", {}, "dynamic_tool_call"],
    ["EnterWorktree", { path: "feature" }, "dynamic_tool_call"],
    ["ExitWorktree", {}, "dynamic_tool_call"],
    ["ViewImage", { path: "screen.png" }, "image_view"],
    ["BashOutput", { bash_id: "bash-1" }, "command_execution"],
    ["KillBash", { shell_id: "bash-1" }, "command_execution"],
    ["KillShell", { shell_id: "shell-1" }, "command_execution"],
    ["Edit", { file_path: "src/App.tsx", old_string: "a", new_string: "b" }, "file_change"],
    ["Write", { file_path: "src/new.ts", content: "" }, "file_change"],
    ["Patch", { file_path: "src/App.tsx" }, "file_change"],
    ["MultiEdit", { file_path: "src/App.tsx", edits: [] }, "file_change"],
    ["NotebookEdit", { notebook_path: "analysis.ipynb", new_source: "" }, "file_change"],
  ] as const)("classifies Claude %s tool_use blocks as %s", (name, input, itemType) => {
    const state = createClaudeMapperState("thread-1");

    const events = mapClaudeSdkMessage(
      streamEvent({
        type: "content_block_start",
        index: 0,
        content_block: {
          type: "tool_use",
          id: `toolu_${name}`,
          name,
          input,
        },
      }),
      state,
    );

    expect(events[0]).toMatchObject({
      type: "item.started",
      itemType,
      itemId: `toolu_${name}`,
    });
  });

  it("surfaces auto-denied tool calls as completed error items", () => {
    const state = createClaudeMapperState("thread-1");
    mapClaudeSdkMessage(
      streamEvent({
        type: "content_block_start",
        index: 0,
        content_block: {
          type: "tool_use",
          id: "toolu_bash",
          name: "Bash",
          input: { command: "rm -rf /" },
        },
      }),
      state,
    );

    const events = mapClaudeSdkMessage(
      {
        type: "system",
        subtype: "permission_denied",
        tool_name: "Bash",
        tool_use_id: "toolu_bash",
        decision_reason_type: "classifier",
        decision_reason: "Dangerous command",
        message: "Command was denied.",
        session_id: "claude-session",
        uuid: "msg-1",
      } as unknown as SDKMessage,
      state,
    );

    expect(events).toEqual([
      {
        type: "content.delta",
        threadId: "thread-1",
        itemId: "toolu_bash",
        stream: "command_output",
        delta: "Command was denied.",
      },
      {
        type: "item.updated",
        threadId: "thread-1",
        itemId: "toolu_bash",
        payload: {
          command: "rm -rf /",
          status: "error",
          errorMessage: "Command was denied.",
          result: {
            message: "Command was denied.",
            decisionReason: "Dangerous command",
            decisionReasonType: "classifier",
          },
        },
      },
      { type: "item.completed", threadId: "thread-1", itemId: "toolu_bash" },
    ]);
  });
});

describe("sdkCanonicalMapping — sub-agents", () => {
  it("drops sub-agent stream_event partials (parent_tool_use_id set)", () => {
    const state = createClaudeMapperState("thread-1");
    const events = mapClaudeSdkMessage(
      streamEventWithParent(
        { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
        "toolu_parent",
      ),
      state,
    );
    expect(events).toEqual([]);
  });

  it("sub-agent partials do not corrupt the main-thread stream lane", () => {
    const state = createClaudeMapperState("thread-1");
    // Main thread opens a streaming text block at index 0.
    mapClaudeSdkMessage(
      streamEvent({
        type: "content_block_start",
        index: 0,
        content_block: { type: "text", text: "" },
      }),
      state,
    );
    const mainItem = state.assistantTextItems.get(0);
    expect(mainItem).toBeDefined();
    mapClaudeSdkMessage(
      streamEvent({
        type: "content_block_delta",
        index: 0,
        delta: { type: "text_delta", text: "main-thread answer" },
      }),
      state,
    );

    // A sub-agent message_start at the same index must NOT clear the main lane,
    // and a sub-agent delta must NOT append to the main item.
    const subAgentEvents = [
      mapClaudeSdkMessage(
        streamEventWithParent(
          { type: "message_start", message: { id: "sub-msg" } },
          "toolu_parent",
        ),
        state,
      ),
      mapClaudeSdkMessage(
        streamEventWithParent(
          {
            type: "content_block_delta",
            index: 0,
            delta: { type: "text_delta", text: "SUBAGENT" },
          },
          "toolu_parent",
        ),
        state,
      ),
    ].flat();
    expect(subAgentEvents).toEqual([]);
    // Main lane still points at the same live item.
    expect(state.assistantTextItems.get(0)).toBe(mainItem);

    // Main thread continues streaming onto its own item, uncorrupted.
    const more = mapClaudeSdkMessage(
      streamEvent({
        type: "content_block_delta",
        index: 0,
        delta: { type: "text_delta", text: "!" },
      }),
      state,
    );
    expect(more).toEqual([
      {
        type: "content.delta",
        threadId: "thread-1",
        itemId: mainItem!.itemId,
        stream: "assistant_text",
        delta: "!",
      },
    ]);
  });

  it("renders a forwarded sub-agent assistant text message as a complete child item", () => {
    const state = createClaudeMapperState("thread-1");
    // Register the parent tool so tagParent can bump its step counter.
    mapClaudeSdkMessage(
      streamEvent({
        type: "content_block_start",
        index: 0,
        content_block: {
          type: "tool_use",
          id: "toolu_parent",
          name: "Agent",
          input: { description: "Investigate", subagent_type: "general-purpose" },
        },
      }),
      state,
    );

    const events = mapClaudeSdkMessage(
      {
        type: "assistant",
        session_id: "claude-session",
        uuid: "msg-sub-text",
        parent_tool_use_id: "toolu_parent",
        message: {
          id: "msg-sub-text",
          role: "assistant",
          content: [{ type: "text", text: "sub-agent thinking out loud" }],
        },
      } as unknown as SDKMessage,
      state,
    );

    expect(events).toMatchObject([
      {
        type: "item.started",
        itemType: "assistant_message",
        parentItemId: "toolu_parent",
        itemId: expect.stringMatching(/^asst-/),
      },
      { type: "content.delta", stream: "assistant_text", delta: "sub-agent thinking out loud" },
      { type: "item.completed" },
      { type: "item.updated", itemId: "toolu_parent", payload: { progress: { stepCount: 1 } } },
    ]);
    // The main lane's per-index text map is untouched by the sub-agent flush.
    expect(state.assistantTextItems.size).toBe(0);
  });

  it("folds the child assistant message model onto the parent Task progress", () => {
    const state = createClaudeMapperState("thread-1");
    // Task input has no `model` — the agent definition supplies it, so only
    // the child assistant messages reveal which model actually runs.
    mapClaudeSdkMessage(
      streamEvent({
        type: "content_block_start",
        index: 0,
        content_block: {
          type: "tool_use",
          id: "toolu_parent",
          name: "Task",
          input: { description: "Investigate", subagent_type: "Explore" },
        },
      }),
      state,
    );

    const childMessage = (id: string): SDKMessage =>
      ({
        type: "assistant",
        session_id: "claude-session",
        uuid: id,
        parent_tool_use_id: "toolu_parent",
        message: {
          id,
          role: "assistant",
          model: "claude-haiku-4-5-20251001",
          content: [{ type: "text", text: "looking around" }],
        },
      }) as unknown as SDKMessage;

    const events = mapClaudeSdkMessage(childMessage("msg-sub-1"), state);
    expect(events[0]).toMatchObject({
      type: "item.updated",
      itemId: "toolu_parent",
      payload: {
        name: "Task",
        status: "running",
        progress: { model: "claude-haiku-4-5-20251001" },
      },
    });

    // Later child messages don't re-emit a leading model update (only the
    // usual tagParent step-counter bump follows the child items).
    const repeat = mapClaudeSdkMessage(childMessage("msg-sub-2"), state);
    expect(repeat[0]).toMatchObject({ type: "item.started", itemType: "assistant_message" });
    expect(state.toolItemsById.get("toolu_parent")?.progress?.model).toBe(
      "claude-haiku-4-5-20251001",
    );
  });

  it("keeps an explicit Task input model over the child assistant message model", () => {
    const state = createClaudeMapperState("thread-1");
    mapClaudeSdkMessage(
      streamEvent({
        type: "content_block_start",
        index: 0,
        content_block: {
          type: "tool_use",
          id: "toolu_parent",
          name: "Task",
          input: { description: "Investigate", subagent_type: "Explore", model: "opus" },
        },
      }),
      state,
    );

    const events = mapClaudeSdkMessage(
      {
        type: "assistant",
        session_id: "claude-session",
        uuid: "msg-sub-1",
        parent_tool_use_id: "toolu_parent",
        message: {
          id: "msg-sub-1",
          role: "assistant",
          model: "claude-opus-4-8-20250915",
          content: [{ type: "text", text: "looking around" }],
        },
      } as unknown as SDKMessage,
      state,
    );

    // No leading model update — the input model already populated progress.
    expect(events[0]).toMatchObject({ type: "item.started", itemType: "assistant_message" });
    expect(state.toolItemsById.get("toolu_parent")?.progress?.model).toBe("opus");
  });

  it("does not set parentItemId on top-level messages (parent_tool_use_id null)", () => {
    const state = createClaudeMapperState("thread-1");
    const events = mapClaudeSdkMessage(
      streamEvent({
        type: "content_block_start",
        index: 0,
        content_block: { type: "text", text: "" },
      }),
      state,
    );
    expect(events[0]).not.toHaveProperty("parentItemId");
  });

  it("maps forwarded assistant tool_use blocks as subagent children", () => {
    const state = createClaudeMapperState("thread-1");
    mapClaudeSdkMessage(
      streamEvent({
        type: "content_block_start",
        index: 0,
        content_block: {
          type: "tool_use",
          id: "toolu_parent",
          name: "Task",
          input: { description: "Investigate", subagent_type: "Explore" },
        },
      }),
      state,
    );

    const events = mapClaudeSdkMessage(
      {
        type: "assistant",
        session_id: "claude-session",
        uuid: "msg-subagent-tool",
        parent_tool_use_id: "toolu_parent",
        message: {
          id: "msg-subagent-tool",
          role: "assistant",
          content: [
            {
              type: "tool_use",
              id: "toolu_read",
              name: "Read",
              input: { file_path: "src/App.tsx" },
            },
          ],
        },
      } as unknown as SDKMessage,
      state,
    );

    expect(events).toMatchObject([
      {
        type: "item.started",
        threadId: "thread-1",
        itemId: "toolu_read",
        itemType: "dynamic_tool_call",
        parentItemId: "toolu_parent",
        payload: {
          name: "Read",
          args: { file_path: "src/App.tsx" },
          status: "running",
        },
      },
      {
        type: "item.updated",
        threadId: "thread-1",
        itemId: "toolu_parent",
        payload: {
          name: "Task",
          status: "running",
          progress: { stepCount: 1 },
        },
      },
    ]);
  });

  it("drops child-scoped context updates so the composer tracks parent context only", () => {
    const state = createClaudeMapperState("thread-1");
    const events = mapClaudeSdkMessage(
      {
        type: "system",
        subtype: "compact_boundary",
        parent_tool_use_id: "toolu_parent",
        compact_metadata: { trigger: "auto", pre_tokens: 20_000, post_tokens: 6_000 },
        session_id: "claude-session",
      } as unknown as SDKMessage,
      state,
    );

    expect(events.some((event) => event.type === "context.updated")).toBe(false);
    expect(events).toMatchObject([
      {
        type: "item.started",
        itemType: "tool_call",
        parentItemId: "toolu_parent",
        payload: {
          name: "ContextCompaction",
          status: "success",
          args: { trigger: "auto", pre_tokens: 20_000, post_tokens: 6_000 },
        },
      },
      {
        type: "item.completed",
        payload: {
          name: "ContextCompaction",
          status: "success",
          args: { trigger: "auto", pre_tokens: 20_000, post_tokens: 6_000 },
        },
      },
    ]);
  });
});

describe("sdkCanonicalMapping — task progress", () => {
  it("absorbs task_progress into the parent Task tool_call as item.updated", () => {
    const state = createClaudeMapperState("thread-1");
    mapClaudeSdkMessage(
      streamEvent({
        type: "content_block_start",
        index: 0,
        content_block: {
          type: "tool_use",
          id: "toolu_T1",
          name: "Task",
          input: { description: "research", model: "opus" },
        },
      }),
      state,
    );

    const events = mapClaudeSdkMessage(
      {
        type: "system",
        subtype: "task_progress",
        session_id: "claude-session",
        task_id: "task-1",
        tool_use_id: "toolu_T1",
        description: "Searching for callers",
        last_tool_name: "Grep",
        usage: { total_tokens: 4200, tool_uses: 3, duration_ms: 1500 },
      } as unknown as SDKMessage,
      state,
    );

    expect(events).toMatchObject([
      {
        type: "item.updated",
        threadId: "thread-1",
        itemId: "toolu_T1",
        payload: {
          name: "Task",
          status: "running",
          progress: {
            description: "Searching for callers",
            lastToolName: "Grep",
            model: "opus",
            tokens: 4200,
            toolUses: 3,
            durationMs: 1500,
            stepCount: 3,
          },
        },
      },
    ]);
    expect(events.some((event) => event.type === "context.updated")).toBe(false);
  });

  it("does not treat task_progress usage as parent context-window usage", () => {
    const state = createClaudeMapperState("thread-1");
    const events = mapClaudeSdkMessage(
      {
        type: "system",
        subtype: "task_progress",
        session_id: "claude-session",
        task_id: "task-1",
        tool_use_id: "toolu_unknown",
        description: "x",
        usage: { total_tokens: 1, tool_uses: 1, duration_ms: 1 },
      } as unknown as SDKMessage,
      state,
    );
    expect(events).toEqual([]);
  });

  it("does not emit task_notification usage as parent context-window usage", () => {
    const state = createClaudeMapperState("thread-1");
    const events = mapClaudeSdkMessage(
      {
        type: "system",
        subtype: "task_notification",
        session_id: "claude-session",
        task_id: "task-1",
        status: "completed",
        summary: "Done",
        usage: { total_tokens: 98_765, tool_uses: 8, duration_ms: 12_000 },
      } as unknown as SDKMessage,
      state,
    );
    expect(events).toEqual([]);
  });

  it("does not count task_progress/task_notification usage toward goal tokens", () => {
    const state = createClaudeMapperState("thread-1");
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-05-12T10:00:00Z"));
      startClaudeTurn(state, "turn-goal", "/goal count subagent tokens", undefined);

      // Task usage is a cumulative-per-task counter over the same sidechain
      // calls whose assistant messages already fed the goal total — counting
      // it here would double-count subagent spend.
      const progress = mapClaudeSdkMessage(
        {
          type: "system",
          subtype: "task_progress",
          session_id: "claude-session",
          task_id: "task-1",
          tool_use_id: "toolu_T1",
          description: "Searching",
          usage: { total_tokens: 4_200, tool_uses: 3, duration_ms: 1_500 },
        } as unknown as SDKMessage,
        state,
      );
      expect(
        progress.some(
          (event) => event.type === "item.updated" && event.itemId === "goal-turn-goal",
        ),
      ).toBe(false);
      expect(state.activeGoalTokensUsed).toBeUndefined();

      const notification = mapClaudeSdkMessage(
        {
          type: "system",
          subtype: "task_notification",
          session_id: "claude-session",
          task_id: "task-1",
          status: "completed",
          summary: "Done",
          usage: { total_tokens: 4_900, tool_uses: 4, duration_ms: 2_100 },
        } as unknown as SDKMessage,
        state,
      );
      expect(
        notification.some(
          (event) => event.type === "item.updated" && event.itemId === "goal-turn-goal",
        ),
      ).toBe(false);
      expect(state.activeGoalTokensUsed).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it("counts subagent sidechain assistant spend in goal token totals", () => {
    const state = createClaudeMapperState("thread-1");
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-05-12T10:00:00Z"));
      startClaudeTurn(state, "turn-goal", "/goal count subagent tokens", undefined);

      vi.setSystemTime(new Date("2026-05-12T10:00:20Z"));
      const subAgentEvents = mapClaudeSdkMessage(
        assistantUsageMessage(
          "msg-sub-1",
          { input_tokens: 4_000, output_tokens: 200, cache_read_input_tokens: 3_000 },
          "toolu_T1",
        ),
        state,
      );
      expect(subAgentEvents).toContainEqual(
        expect.objectContaining({
          type: "item.updated",
          itemId: "goal-turn-goal",
          payload: expect.objectContaining({ status: "active", tokensUsed: 7_200 }),
        }),
      );

      const mainEvents = mapClaudeSdkMessage(
        assistantUsageMessage("msg-main-1", { input_tokens: 10, output_tokens: 5 }),
        state,
      );
      expect(mainEvents).toContainEqual(
        expect.objectContaining({
          type: "item.updated",
          itemId: "goal-turn-goal",
          payload: expect.objectContaining({ status: "active", tokensUsed: 7_215 }),
        }),
      );

      vi.setSystemTime(new Date("2026-05-12T10:01:00Z"));
      const resultEvents = mapClaudeSdkMessage(
        {
          type: "result",
          subtype: "success",
          session_id: "claude-session",
          usage: { total_tokens: 7_215 },
        } as unknown as SDKMessage,
        state,
      );
      expect(resultEvents).toContainEqual(
        expect.objectContaining({
          type: "item.updated",
          itemId: "goal-turn-goal",
          payload: expect.objectContaining({ status: "complete", tokensUsed: 7_215 }),
        }),
      );
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("sdkCanonicalMapping — background sub-agents", () => {
  function startAgentTool(
    state: ReturnType<typeof createClaudeMapperState>,
    toolUseId: string,
    name = "Agent",
  ): void {
    mapClaudeSdkMessage(
      streamEvent({
        type: "content_block_start",
        index: 0,
        content_block: {
          type: "tool_use",
          id: toolUseId,
          name,
          input: { description: "Investigate", subagent_type: "general-purpose" },
        },
      }),
      state,
    );
  }

  function taskStarted(toolUseId: string, subagentType: string | undefined): SDKMessage {
    return {
      type: "system",
      subtype: "task_started",
      session_id: "claude-session",
      task_id: "task-A",
      tool_use_id: toolUseId,
      description: "Investigate",
      ...(subagentType ? { subagent_type: subagentType } : {}),
    } as unknown as SDKMessage;
  }

  function launchToolResult(toolUseId: string): SDKMessage {
    return {
      type: "user",
      session_id: "claude-session",
      message: {
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: toolUseId,
            content: "Async agent launched successfully. It is running in the background.",
          },
        ],
      },
    } as unknown as SDKMessage;
  }

  it("keeps the Agent parent running after its launch tool_result when a subagent task is live", () => {
    const state = createClaudeMapperState("thread-1");
    startAgentTool(state, "toolu_parent");
    mapClaudeSdkMessage(taskStarted("toolu_parent", "general-purpose"), state);

    const events = mapClaudeSdkMessage(launchToolResult("toolu_parent"), state);
    expect(events).toEqual([
      {
        type: "item.updated",
        threadId: "thread-1",
        itemId: "toolu_parent",
        payload: expect.objectContaining({ name: "Agent", status: "running", isSubAgent: true }),
      },
    ]);
    // Parent item survives — not deleted, not completed.
    expect(state.toolItemsById.has("toolu_parent")).toBe(true);
  });

  it("marks the Agent parent as a sub-agent tool via isSubAgent payload", () => {
    const state = createClaudeMapperState("thread-1");
    const started = mapClaudeSdkMessage(
      streamEvent({
        type: "content_block_start",
        index: 0,
        content_block: { type: "tool_use", id: "toolu_parent", name: "Agent", input: {} },
      }),
      state,
    );
    expect(started).toMatchObject([
      { type: "item.started", payload: { name: "Agent", isSubAgent: true } },
    ]);
  });

  it("does not keep-alive a background Bash task_started without subagent_type", () => {
    const state = createClaudeMapperState("thread-1");
    // Bash tool opens at index 0.
    mapClaudeSdkMessage(
      streamEvent({
        type: "content_block_start",
        index: 0,
        content_block: {
          type: "tool_use",
          id: "toolu_bash",
          name: "Bash",
          input: { command: "ls" },
        },
      }),
      state,
    );
    mapClaudeSdkMessage(taskStarted("toolu_bash", undefined), state);
    expect(state.activeSubAgentToolToTask?.has("toolu_bash") ?? false).toBe(false);

    // Its tool_result completes it normally.
    const events = mapClaudeSdkMessage(
      {
        type: "user",
        session_id: "claude-session",
        message: {
          role: "user",
          content: [{ type: "tool_result", tool_use_id: "toolu_bash", content: "file.txt" }],
        },
      } as unknown as SDKMessage,
      state,
    );
    expect(events.some((e) => e.type === "item.completed" && e.itemId === "toolu_bash")).toBe(true);
    expect(state.toolItemsById.has("toolu_bash")).toBe(false);
  });

  it("maps task_updated patch onto the live parent without closing it", () => {
    const state = createClaudeMapperState("thread-1");
    startAgentTool(state, "toolu_parent");
    mapClaudeSdkMessage(taskStarted("toolu_parent", "general-purpose"), state);
    mapClaudeSdkMessage(launchToolResult("toolu_parent"), state);

    const events = mapClaudeSdkMessage(
      {
        type: "system",
        subtype: "task_updated",
        session_id: "claude-session",
        task_id: "task-A",
        patch: { status: "completed", end_time: 1_783_066_726_333 },
      } as unknown as SDKMessage,
      state,
    );
    // Terminal patch status alone does NOT close the parent — wait for
    // task_notification. No descriptive fields → no-op update here.
    expect(events).toEqual([]);
    expect(state.toolItemsById.has("toolu_parent")).toBe(true);
  });

  it("closes the parent on task_notification completed and cleans the registry", () => {
    const state = createClaudeMapperState("thread-1");
    startAgentTool(state, "toolu_parent");
    mapClaudeSdkMessage(taskStarted("toolu_parent", "general-purpose"), state);
    mapClaudeSdkMessage(launchToolResult("toolu_parent"), state);

    const events = mapClaudeSdkMessage(
      {
        type: "system",
        subtype: "task_notification",
        session_id: "claude-session",
        task_id: "task-A",
        tool_use_id: "toolu_parent",
        status: "completed",
        summary: "Investigation complete",
        usage: { total_tokens: 4_200, tool_uses: 3, duration_ms: 1_500 },
      } as unknown as SDKMessage,
      state,
    );
    expect(events).toMatchObject([
      {
        type: "item.updated",
        itemId: "toolu_parent",
        payload: { status: "success", progress: { summary: "Investigation complete" } },
      },
      { type: "item.completed", itemId: "toolu_parent", payload: { status: "success" } },
    ]);
    expect(state.toolItemsById.has("toolu_parent")).toBe(false);
    expect(state.activeSubAgentTaskToTool?.has("task-A") ?? false).toBe(false);
    expect(state.activeSubAgentToolToTask?.has("toolu_parent") ?? false).toBe(false);
  });

  /**
   * `SendMessage` resumes a completed sub-agent from its transcript. The
   * resumed run reports `task_started` / `task_notification` against the
   * SendMessage tool_use id, so that row must become an agent row — otherwise
   * the resumed agent shows as a raw tool call and never reaches the composer's
   * active-sub-agent dock (which keys off `isSubAgent`).
   */
  function startSendMessageTool(
    state: ReturnType<typeof createClaudeMapperState>,
    toolUseId: string,
  ): RuntimeEvent[] {
    return mapClaudeSdkMessage(
      streamEvent({
        type: "content_block_start",
        index: 0,
        content_block: {
          type: "tool_use",
          id: toolUseId,
          name: "SendMessage",
          input: { to: "af31fc7876375a53a", message: "keep going", summary: "ask for more" },
        },
      }),
      state,
    );
  }

  it("promotes a SendMessage that resumes a sub-agent to an agent row", () => {
    const state = createClaudeMapperState("thread-1");
    const started = startSendMessageTool(state, "toolu_send");
    // Opens as tool_call (the item type agent rows are drawn from) but is not
    // yet an agent row — the send may not resume anything.
    expect(started).toMatchObject([
      {
        type: "item.started",
        itemId: "toolu_send",
        itemType: "tool_call",
        payload: { name: "SendMessage", status: "running" },
      },
    ]);
    expect(
      (started[0] as { payload: { isSubAgent?: boolean } }).payload.isSubAgent,
    ).toBeUndefined();

    const bound = mapClaudeSdkMessage(taskStarted("toolu_send", "general-purpose"), state);
    expect(bound).toMatchObject([
      {
        type: "item.updated",
        itemId: "toolu_send",
        payload: {
          name: "SendMessage",
          // The send's own summary, not the agent's frozen spawn description.
          title: "ask for more",
          subAgentType: "general-purpose",
          status: "running",
          isSubAgent: true,
          isSubAgentResume: true,
          progress: { description: "Investigate" },
        },
      },
    ]);

    // The send's own tool_result must not close the row — the resumed run is
    // still going, and its task_notification owns the close.
    const resultEvents = mapClaudeSdkMessage(launchToolResult("toolu_send"), state);
    expect(resultEvents.some((e) => e.type === "item.completed")).toBe(false);
    expect(state.toolItemsById.has("toolu_send")).toBe(true);

    const closed = mapClaudeSdkMessage(
      {
        type: "system",
        subtype: "task_notification",
        session_id: "claude-session",
        task_id: "task-A",
        tool_use_id: "toolu_send",
        status: "completed",
        summary: "Recomputed per model",
      } as unknown as SDKMessage,
      state,
    );
    expect(closed).toMatchObject([
      { type: "item.updated", itemId: "toolu_send", payload: { status: "success" } },
      {
        type: "item.completed",
        itemId: "toolu_send",
        payload: {
          status: "success",
          isSubAgent: true,
          isSubAgentResume: true,
          title: "ask for more",
        },
      },
    ]);
    expect(state.toolItemsById.has("toolu_send")).toBe(false);
  });

  it("re-parents a resumed agent's children from the dead launch row to the resume row", () => {
    const state = createClaudeMapperState("thread-1");
    // Run 1: a normal Agent launch that completes and is dropped from state.
    startAgentTool(state, "toolu_launch");
    mapClaudeSdkMessage(taskStarted("toolu_launch", "general-purpose"), state);
    mapClaudeSdkMessage(launchToolResult("toolu_launch"), state);
    mapClaudeSdkMessage(
      {
        type: "system",
        subtype: "task_notification",
        session_id: "claude-session",
        task_id: "task-A",
        tool_use_id: "toolu_launch",
        status: "completed",
        summary: "ALPHA",
      } as unknown as SDKMessage,
      state,
    );
    expect(state.toolItemsById.has("toolu_launch")).toBe(false);

    // Run 2: SendMessage resumes the SAME task under a new tool_use id.
    startSendMessageTool(state, "toolu_send");
    mapClaudeSdkMessage(taskStarted("toolu_send", "general-purpose"), state);

    // The resumed run's forwarded children still name the ORIGINAL launch id.
    const childEvents = mapClaudeSdkMessage(
      {
        type: "assistant",
        session_id: "claude-session",
        parent_tool_use_id: "toolu_launch",
        message: {
          role: "assistant",
          model: "claude-opus-4-6",
          content: [
            { type: "tool_use", id: "toolu_child", name: "Glob", input: { pattern: "*.json" } },
          ],
        },
      } as unknown as SDKMessage,
      state,
    );
    const childStart = childEvents.find(
      (e) => e.type === "item.started" && e.itemId === "toolu_child",
    );
    // Without the alias this would be "toolu_launch" — a row the renderer has
    // already closed, so the child would nest under the finished agent.
    expect(childStart).toMatchObject({ parentItemId: "toolu_send" });
    // …and the live row is the one whose step counter ticks.
    expect(
      childEvents.some(
        (e) =>
          e.type === "item.updated" &&
          e.itemId === "toolu_send" &&
          (e.payload as { progress?: { stepCount?: number } }).progress?.stepCount === 1,
      ),
    ).toBe(true);
  });

  it("keeps live task_progress on the resume row (steps, last tool, description)", () => {
    const state = createClaudeMapperState("thread-1");
    startSendMessageTool(state, "toolu_send");
    mapClaudeSdkMessage(taskStarted("toolu_send", "general-purpose"), state);

    const events = mapClaudeSdkMessage(
      {
        type: "system",
        subtype: "task_progress",
        session_id: "claude-session",
        task_id: "task-A",
        tool_use_id: "toolu_send",
        description: "Finding *.json",
        last_tool_name: "Glob",
        usage: { total_tokens: 30_521, tool_uses: 2, duration_ms: 27_341 },
      } as unknown as SDKMessage,
      state,
    );
    expect(events).toMatchObject([
      {
        type: "item.updated",
        itemId: "toolu_send",
        payload: {
          isSubAgent: true,
          status: "running",
          progress: {
            description: "Finding *.json",
            lastToolName: "Glob",
            stepCount: 2,
            toolUses: 2,
            tokens: 30_521,
          },
        },
      },
    ]);
  });

  it("leaves a SendMessage that resumed nothing as a plain tool row", () => {
    const state = createClaudeMapperState("thread-1");
    startSendMessageTool(state, "toolu_send");
    // No task_started: an unreachable name, or a message to a teammate that is
    // already running, starts no new run.
    const events = mapClaudeSdkMessage(
      {
        type: "user",
        session_id: "claude-session",
        message: {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: "toolu_send",
              content: '{"success":false,"message":"No agent named \'probe\' is reachable."}',
            },
          ],
        },
      } as unknown as SDKMessage,
      state,
    );
    const updated = events.find((e) => e.type === "item.updated");
    expect(updated).toMatchObject({ payload: { name: "SendMessage", status: "success" } });
    expect(
      (updated as { payload: { isSubAgent?: boolean; title?: string } }).payload.isSubAgent,
    ).toBeUndefined();
    expect(events.some((e) => e.type === "item.completed" && e.itemId === "toolu_send")).toBe(true);
    expect(state.toolItemsById.has("toolu_send")).toBe(false);
  });

  it("preserves structured Workflow launch metadata through the task lifecycle", () => {
    const state = createClaudeMapperState("thread-1");
    startAgentTool(state, "toolu_wf", "Workflow");
    mapClaudeSdkMessage(
      {
        type: "system",
        subtype: "task_started",
        session_id: "claude-session",
        task_id: "task-WF",
        tool_use_id: "toolu_wf",
        description: "simplify review",
        task_type: "local_workflow",
        workflow_name: "simplify-review",
      } as unknown as SDKMessage,
      state,
    );

    // The launch tool_result carries the SDK's structured WorkflowOutput in
    // tool_use_result. The keepalive swallows the result text, but the
    // normalized workflow metadata must survive on the running payload.
    const launchEvents = mapClaudeSdkMessage(
      {
        type: "user",
        session_id: "claude-session",
        tool_use_result: {
          status: "async_launched",
          taskId: "task-WF",
          taskType: "local_workflow",
          workflowName: "simplify-review",
          runId: "wf_abc123",
          summary: "Four-angle simplify review",
          transcriptDir: "C:\\sess\\subagents\\workflows\\wf_abc123",
          scriptPath: "C:\\sess\\workflows\\scripts\\simplify-review-wf_abc123.js",
        },
        message: {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: "toolu_wf",
              content: "Workflow launched in background. Task ID: task-WF",
            },
          ],
        },
      } as unknown as SDKMessage,
      state,
    );
    expect(launchEvents).toMatchObject([
      {
        type: "item.updated",
        itemId: "toolu_wf",
        payload: {
          status: "running",
          workflow: {
            name: "simplify-review",
            runId: "wf_abc123",
            summary: "Four-angle simplify review",
            transcriptDir: "C:\\sess\\subagents\\workflows\\wf_abc123",
            scriptPath: "C:\\sess\\workflows\\scripts\\simplify-review-wf_abc123.js",
          },
        },
      },
    ]);
    expect(state.toolItemsById.has("toolu_wf")).toBe(true);

    // The authoritative task_notification close still carries the workflow
    // metadata so the overlay can locate the manifest after completion.
    const closeEvents = mapClaudeSdkMessage(
      {
        type: "system",
        subtype: "task_notification",
        session_id: "claude-session",
        task_id: "task-WF",
        tool_use_id: "toolu_wf",
        status: "completed",
        summary: "12 findings confirmed",
      } as unknown as SDKMessage,
      state,
    );
    expect(closeEvents).toMatchObject([
      {
        type: "item.updated",
        itemId: "toolu_wf",
        payload: { status: "success", workflow: { runId: "wf_abc123" } },
      },
      {
        type: "item.completed",
        itemId: "toolu_wf",
        payload: { status: "success", workflow: { runId: "wf_abc123" } },
      },
    ]);
    expect(state.toolItemsById.has("toolu_wf")).toBe(false);
  });

  it("closes the parent as error on task_notification stopped (interrupt)", () => {
    const state = createClaudeMapperState("thread-1");
    startAgentTool(state, "toolu_parent");
    mapClaudeSdkMessage(taskStarted("toolu_parent", "general-purpose"), state);
    mapClaudeSdkMessage(launchToolResult("toolu_parent"), state);

    const events = mapClaudeSdkMessage(
      {
        type: "system",
        subtype: "task_notification",
        session_id: "claude-session",
        task_id: "task-A",
        tool_use_id: "toolu_parent",
        status: "stopped",
        summary: "Stopped by user",
      } as unknown as SDKMessage,
      state,
    );
    expect(events).toMatchObject([
      { type: "item.updated", itemId: "toolu_parent", payload: { status: "error" } },
      { type: "item.completed", itemId: "toolu_parent", payload: { status: "error" } },
    ]);
    expect(state.toolItemsById.has("toolu_parent")).toBe(false);
  });

  it("registers a keep-alive when task_started omits subagent_type but the tool is Agent-like", () => {
    const state = createClaudeMapperState("thread-1");
    startAgentTool(state, "toolu_parent");
    // task_started arrives without subagent_type, but the tool is classified
    // sub-agent-like → still registers.
    mapClaudeSdkMessage(taskStarted("toolu_parent", undefined), state);
    expect(state.activeSubAgentToolToTask?.has("toolu_parent") ?? false).toBe(true);
  });

  it("keeps the live parent and its child tools alive across the main turn's result", () => {
    const state = createClaudeMapperState("thread-1");
    startClaudeTurn(state, "turn-1", "launch subagent", undefined);
    startAgentTool(state, "toolu_parent");
    mapClaudeSdkMessage(taskStarted("toolu_parent", "general-purpose"), state);
    mapClaudeSdkMessage(launchToolResult("toolu_parent"), state);

    // A forwarded child tool_use from the running subagent.
    mapClaudeSdkMessage(
      {
        type: "assistant",
        session_id: "claude-session",
        uuid: "sub-msg-tool",
        parent_tool_use_id: "toolu_parent",
        message: {
          id: "sub-msg-tool",
          role: "assistant",
          content: [
            { type: "tool_use", id: "toolu_child", name: "Read", input: { file_path: "a" } },
          ],
        },
      } as unknown as SDKMessage,
      state,
    );

    // Main turn ends while the subagent still runs. The parent and child must
    // NOT be completed/evicted here.
    const resultEvents = mapClaudeSdkMessage(
      {
        type: "result",
        subtype: "success",
        session_id: "claude-session",
        usage: { input_tokens: 1, output_tokens: 1 },
      } as unknown as SDKMessage,
      state,
    );
    expect(
      resultEvents.some(
        (e) =>
          e.type === "item.completed" &&
          (e.itemId === "toolu_parent" || e.itemId === "toolu_child"),
      ),
    ).toBe(false);
    expect(state.toolItemsById.has("toolu_parent")).toBe(true);
    expect(state.toolItemsById.has("toolu_child")).toBe(true);

    // The child's own forwarded tool_result still completes it.
    const childResult = mapClaudeSdkMessage(
      {
        type: "user",
        session_id: "claude-session",
        parent_tool_use_id: "toolu_parent",
        message: {
          role: "user",
          content: [{ type: "tool_result", tool_use_id: "toolu_child", content: "file body" }],
        },
      } as unknown as SDKMessage,
      state,
    );
    expect(childResult.some((e) => e.type === "item.completed" && e.itemId === "toolu_child")).toBe(
      true,
    );

    // The authoritative task_notification finally closes the parent.
    const close = mapClaudeSdkMessage(
      {
        type: "system",
        subtype: "task_notification",
        session_id: "claude-session",
        task_id: "task-A",
        tool_use_id: "toolu_parent",
        status: "completed",
        summary: "Done",
      } as unknown as SDKMessage,
      state,
    );
    expect(close.some((e) => e.type === "item.completed" && e.itemId === "toolu_parent")).toBe(
      true,
    );
    expect(state.toolItemsById.has("toolu_parent")).toBe(false);
  });

  it("keeps the live parent across a new user turn started while the subagent runs", () => {
    const state = createClaudeMapperState("thread-1");
    startClaudeTurn(state, "turn-1", "launch subagent", undefined);
    startAgentTool(state, "toolu_parent");
    mapClaudeSdkMessage(taskStarted("toolu_parent", "general-purpose"), state);
    mapClaudeSdkMessage(launchToolResult("toolu_parent"), state);

    // Main turn ends; thread goes idle while the task still runs.
    mapClaudeSdkMessage(
      {
        type: "result",
        subtype: "success",
        session_id: "claude-session",
        usage: { input_tokens: 1, output_tokens: 1 },
      } as unknown as SDKMessage,
      state,
    );

    // The user submits another message during the idle window. The new-turn
    // reset must not evict the live parent — the later task_notification
    // still needs to find and close it.
    startClaudeTurn(state, "turn-2", "unrelated follow-up", undefined);
    expect(state.toolItemsById.has("toolu_parent")).toBe(true);

    const close = mapClaudeSdkMessage(
      {
        type: "system",
        subtype: "task_notification",
        session_id: "claude-session",
        task_id: "task-A",
        tool_use_id: "toolu_parent",
        status: "completed",
        summary: "Done",
      } as unknown as SDKMessage,
      state,
    );
    expect(close.some((e) => e.type === "item.completed" && e.itemId === "toolu_parent")).toBe(
      true,
    );
    expect(state.toolItemsById.has("toolu_parent")).toBe(false);
  });

  it("flushes a dangling child of a stopped subagent instead of leaving it running", () => {
    const state = createClaudeMapperState("thread-1");
    startClaudeTurn(state, "turn-1", "launch subagent", undefined);
    startAgentTool(state, "toolu_parent");
    mapClaudeSdkMessage(taskStarted("toolu_parent", "general-purpose"), state);
    mapClaudeSdkMessage(launchToolResult("toolu_parent"), state);

    // Forwarded child tool_use whose tool_result will never arrive (the
    // subagent gets killed mid-execution).
    mapClaudeSdkMessage(
      {
        type: "assistant",
        session_id: "claude-session",
        uuid: "sub-msg-tool",
        parent_tool_use_id: "toolu_parent",
        message: {
          id: "sub-msg-tool",
          role: "assistant",
          content: [
            { type: "tool_use", id: "toolu_child", name: "Read", input: { file_path: "a" } },
          ],
        },
      } as unknown as SDKMessage,
      state,
    );

    // Interrupt: the subagent's task_notification "stopped" closes the parent
    // and unregisters the task, leaving the child dangling.
    mapClaudeSdkMessage(
      {
        type: "system",
        subtype: "task_notification",
        session_id: "claude-session",
        task_id: "task-A",
        tool_use_id: "toolu_parent",
        status: "stopped",
        summary: "Stopped by user",
      } as unknown as SDKMessage,
      state,
    );
    expect(state.toolItemsById.has("toolu_child")).toBe(true);

    // The interrupt's result closes open items; with no live subagent left the
    // dangling child must be completed, not silently dropped.
    const resultEvents = mapClaudeSdkMessage(
      {
        type: "result",
        subtype: "error_during_execution",
        session_id: "claude-session",
        is_error: true,
        errors: [],
        usage: { input_tokens: 1, output_tokens: 1 },
      } as unknown as SDKMessage,
      state,
    );
    expect(
      resultEvents.some((e) => e.type === "item.completed" && e.itemId === "toolu_child"),
    ).toBe(true);
    expect(state.toolItemsById.has("toolu_child")).toBe(false);
  });
});

describe("sdkCanonicalMapping — context usage", () => {
  it("maps SDK current context usage into provider context usage", () => {
    const event = mapClaudeContextUsageResponse("thread-1", {
      categories: [
        { name: "System prompt", tokens: 20_000, color: "#999999" },
        { name: "Messages", tokens: 45_000, color: "#3366ff" },
        { name: "Deferred tools", tokens: 0, color: "#666666", isDeferred: true },
      ],
      totalTokens: 65_000,
      maxTokens: 1_000_000,
      rawMaxTokens: 1_000_000,
      percentage: 6.5,
      gridRows: [],
      model: "claude-opus-4-7[1m]",
      memoryFiles: [],
      mcpTools: [],
      isAutoCompactEnabled: true,
      agents: [],
      apiUsage: null,
    } satisfies SDKControlGetContextUsageResponse);

    expect(event).toEqual({
      type: "context.updated",
      threadId: "thread-1",
      usage: {
        usedTokens: 65_000,
        maxTokens: 1_000_000,
        breakdown: [
          { id: "system-prompt-0", label: "System prompt", tokens: 20_000 },
          { id: "messages-1", label: "Messages", tokens: 45_000 },
        ],
      },
    });
  });

  it("does not emit placeholder zero-token context usage from a sparse SDK response", () => {
    const event = mapClaudeContextUsageResponse("thread-1", {
      categories: [],
      totalTokens: 0,
      maxTokens: 1_000_000,
      rawMaxTokens: 1_000_000,
      percentage: 0,
      gridRows: [],
      model: "claude-opus-4-7[1m]",
      memoryFiles: [],
      mcpTools: [],
      isAutoCompactEnabled: true,
      agents: [],
      apiUsage: null,
    } satisfies SDKControlGetContextUsageResponse);

    expect(event).toEqual({
      type: "context.updated",
      threadId: "thread-1",
      usage: { maxTokens: 1_000_000 },
    });
  });

  it("does not treat result billing usage as context-window usage", () => {
    const state = createClaudeMapperState("thread-1");
    const events = mapClaudeSdkMessage(
      {
        type: "result",
        subtype: "success",
        session_id: "claude-session",
        usage: {
          input_tokens: 60_000,
          output_tokens: 8_000,
          cache_read_input_tokens: 1_000,
          cache_creation_input_tokens: 500,
          total_tokens: 69_500,
        },
      } as unknown as SDKMessage,
      state,
    );

    expect(events.some((event) => event.type === "context.updated")).toBe(false);
  });
});

describe("sdkCanonicalMapping — compaction", () => {
  it("starts a running ContextCompaction tool_call for a manual /compact turn", () => {
    const state = createClaudeMapperState("thread-1");
    const events = startClaudeTurn(state, "turn-compact", "/compact", undefined, "user-compact");

    expect(events).toContainEqual({
      type: "item.started",
      threadId: "thread-1",
      itemId: "compact-turn-compact",
      itemType: "tool_call",
      payload: {
        name: "ContextCompaction",
        status: "running",
        args: { trigger: "manual" },
      },
    });
  });

  it("completes the running manual ContextCompaction tool_call when boundary arrives", () => {
    const state = createClaudeMapperState("thread-1");
    startClaudeTurn(state, "turn-compact", "/compact keep recent work", undefined, "user-compact");

    const events = mapClaudeSdkMessage(
      {
        type: "system",
        subtype: "compact_boundary",
        compact_metadata: { trigger: "manual", pre_tokens: 290000, post_tokens: 9900 },
        session_id: "claude-session",
      } as unknown as SDKMessage,
      state,
    );

    expect(events).toEqual([
      {
        type: "item.completed",
        threadId: "thread-1",
        itemId: "compact-turn-compact",
        payload: {
          name: "ContextCompaction",
          status: "success",
          args: { trigger: "manual", pre_tokens: 290000, post_tokens: 9900 },
        },
      },
      {
        type: "context.updated",
        threadId: "thread-1",
        usage: {
          usedTokens: 9900,
          breakdown: [{ id: "current-context", label: "Current context", tokens: 9900 }],
        },
      },
    ]);
  });

  it("synthesizes a ContextCompaction tool_call carrying compact_metadata when boundary arrives", () => {
    const state = createClaudeMapperState("thread-1");
    const events = mapClaudeSdkMessage(
      {
        type: "system",
        subtype: "compact_boundary",
        compact_metadata: { trigger: "auto", pre_tokens: 100000, post_tokens: 12000 },
        session_id: "claude-session",
      } as unknown as SDKMessage,
      state,
    );
    expect(events).toMatchObject([
      {
        type: "item.started",
        itemType: "tool_call",
        payload: {
          name: "ContextCompaction",
          status: "success",
          args: { trigger: "auto", pre_tokens: 100000, post_tokens: 12000 },
        },
      },
      {
        type: "item.completed",
        payload: {
          name: "ContextCompaction",
          status: "success",
          args: { trigger: "auto", pre_tokens: 100000, post_tokens: 12000 },
        },
      },
      {
        type: "context.updated",
        usage: {
          usedTokens: 12000,
          breakdown: [{ id: "current-context", label: "Current context", tokens: 12000 }],
        },
      },
    ]);
    expect((events[0] as { itemId: string }).itemId).toBe((events[1] as { itemId: string }).itemId);
  });
});

describe("sdkCanonicalMapping — turn completion", () => {
  it("maps a successful result to turn.completed", () => {
    const state = createClaudeMapperState("thread-1");
    startClaudeTurn(state, "turn-1", "hi", undefined);

    const events = mapClaudeSdkMessage(
      { type: "result", subtype: "success", session_id: "claude-session" } as unknown as SDKMessage,
      state,
    );

    expect(events).toEqual([
      { type: "turn.completed", threadId: "thread-1", turnId: "turn-1", state: "completed" },
    ]);
  });

  it("maps a success-subtype result with is_error to a failed turn and surfaces the API message", () => {
    const state = createClaudeMapperState("thread-1");
    startClaudeTurn(state, "turn-auth", "hi", undefined);

    const events = mapClaudeSdkMessage(
      {
        type: "result",
        subtype: "success",
        is_error: true,
        api_error_status: 401,
        result: "Failed to authenticate. API Error: 401 Invalid authentication credentials",
        session_id: "claude-session",
      } as unknown as SDKMessage,
      state,
    );

    expect(events).toContainEqual({
      type: "error",
      threadId: "thread-1",
      message: "Failed to authenticate. API Error: 401 Invalid authentication credentials",
    });
    expect(events).toContainEqual({
      type: "turn.completed",
      threadId: "thread-1",
      turnId: "turn-auth",
      state: "failed",
    });
  });

  it("maps an interrupted turn (error_during_execution + is_error) to interrupted, not failed", () => {
    const state = createClaudeMapperState("thread-1");
    startClaudeTurn(state, "turn-stop", "do the thing", undefined);

    const events = mapClaudeSdkMessage(
      {
        type: "result",
        subtype: "error_during_execution",
        is_error: true,
        errors: ["[ede_diagnostic] turn interrupted before assistant content"],
        session_id: "claude-session",
      } as unknown as SDKMessage,
      state,
    );

    // Pressing stop (or steering) must not surface a spurious error event.
    expect(events.some((event) => event.type === "error")).toBe(false);
    expect(events).toContainEqual({
      type: "turn.completed",
      threadId: "thread-1",
      turnId: "turn-stop",
      state: "interrupted",
    });
  });
});

describe("sdkCanonicalMapping — requests", () => {
  it("maps Bash permissions to command execution approvals", () => {
    expect(
      mapClaudePermissionRequest({
        threadId: "thread-1",
        requestId: "perm-1",
        toolName: "Bash",
        toolInput: { command: "pnpm test" },
      }),
    ).toMatchObject({
      type: "request.opened",
      requestId: "perm-1",
      requestType: "command_execution_approval",
      payload: { summary: "Bash: pnpm test" },
    });
  });

  it.each([
    ["Read", { file_path: "src/App.tsx" }, "file_read_approval", "Read: src/App.tsx"],
    [
      "NotebookRead",
      { notebook_path: "analysis.ipynb" },
      "file_read_approval",
      'NotebookRead: {"notebook_path":"analysis.ipynb"}',
    ],
    ["LS", { path: "src" }, "file_read_approval", "LS: src"],
    ["Grep", { pattern: "needle" }, "file_read_approval", 'Grep: {"pattern":"needle"}'],
    ["Glob", { pattern: "*.ts" }, "file_read_approval", 'Glob: {"pattern":"*.ts"}'],
    [
      "ListMcpResources",
      { server: "github" },
      "file_read_approval",
      'ListMcpResources: {"server":"github"}',
    ],
    [
      "ReadMcpResource",
      { uri: "repo://x" },
      "file_read_approval",
      'ReadMcpResource: {"uri":"repo://x"}',
    ],
    ["Bash", { command: "pnpm test" }, "command_execution_approval", "Bash: pnpm test"],
    [
      "KillShell",
      { shell_id: "shell-1" },
      "command_execution_approval",
      'KillShell: {"shell_id":"shell-1"}',
    ],
    [
      "Write",
      { file_path: "src/new.ts", content: "" },
      "file_change_approval",
      "Write: src/new.ts",
    ],
    ["Patch", { file_path: "src/App.tsx" }, "file_change_approval", "Patch: src/App.tsx"],
    ["ToolSearch", { query: "deploy" }, "file_read_approval", 'ToolSearch: {"query":"deploy"}'],
    [
      "mcp__github__search",
      { query: "deploy" },
      "file_read_approval",
      'mcp__github__search: {"query":"deploy"}',
    ],
    ["ViewImage", { path: "screen.png" }, "file_read_approval", "ViewImage: screen.png"],
  ] as const)("maps Claude %s permissions to %s", (toolName, toolInput, requestType, summary) => {
    expect(
      mapClaudePermissionRequest({
        threadId: "thread-1",
        requestId: `perm-${toolName}`,
        toolName,
        toolInput,
      }),
    ).toMatchObject({
      type: "request.opened",
      requestId: `perm-${toolName}`,
      requestType,
      payload: { summary },
    });
  });

  it("maps ExitPlanMode to plan-specific approval options", () => {
    const event = mapClaudePermissionRequest({
      threadId: "thread-1",
      requestId: "perm-plan",
      toolName: "ExitPlanMode",
      toolInput: {
        plan: "# Plan",
        planFilePath: "C:\\Users\\sdsle\\.claude\\plans\\plan.md",
      },
      title: 'ExitPlanMode: {"plan":"# Plan"}',
    });

    expect(event).toMatchObject({
      type: "request.opened",
      requestId: "perm-plan",
      payload: {
        summary: "Proposed plan",
        details: {
          toolName: "ExitPlanMode",
          input: {
            plan: "# Plan",
            planFilePath: "C:\\Users\\sdsle\\.claude\\plans\\plan.md",
          },
        },
        options: [
          { optionId: "deny", label: "No, keep planning" },
          { optionId: "default", label: "Yes, and manually approve edits" },
          { optionId: "auto", label: "Yes, and switch to Auto" },
        ],
      },
    });
  });

  it("forwards displayName, blockedPath, decisionReason, and toolUseID into details", () => {
    const event = mapClaudePermissionRequest({
      threadId: "thread-1",
      requestId: "perm-2",
      toolName: "Read",
      toolInput: { file_path: "/tmp/x.txt" },
      displayName: "Read",
      description: "/tmp/x.txt",
      blockedPath: "/tmp",
      decisionReason: "Path is outside allowed working directories",
      toolUseID: "toolu_01",
    });
    expect(event).toMatchObject({
      type: "request.opened",
      payload: {
        details: {
          toolName: "Read",
          displayName: "Read",
          description: "/tmp/x.txt",
          blockedPath: "/tmp",
          decisionReason: "Path is outside allowed working directories",
          toolUseID: "toolu_01",
          input: { file_path: "/tmp/x.txt" },
        },
      },
    });
  });

  it("translates suggestions into one option per suggestion plus accept/decline", () => {
    const event = mapClaudePermissionRequest({
      threadId: "thread-1",
      requestId: "perm-3",
      toolName: "Bash",
      toolInput: { command: "ls /tmp" },
      suggestions: [
        {
          type: "addRules",
          rules: [{ toolName: "Bash", ruleContent: "ls /tmp" }],
          behavior: "allow",
          destination: "localSettings",
        },
        {
          type: "addDirectories",
          directories: ["/tmp"],
          destination: "session",
        },
      ],
    });
    expect(event).toMatchObject({
      type: "request.opened",
      payload: {
        options: [
          { optionId: "accept", label: "Allow once" },
          {
            optionId: "accept-suggestion-0",
            label: "Always allow Bash (local)",
            description: "ls /tmp",
          },
          { optionId: "accept-suggestion-1", label: "Allow directories /tmp" },
          { optionId: "decline", label: "Deny" },
        ],
      },
    });
  });

  it("falls back to a single Always-allow option when no suggestions are present", () => {
    const event = mapClaudePermissionRequest({
      threadId: "thread-1",
      requestId: "perm-4",
      toolName: "Bash",
      toolInput: { command: "echo hi" },
    });
    expect(event).toMatchObject({
      payload: {
        options: [
          { optionId: "accept", label: "Allow once" },
          { optionId: "acceptForSession", label: "Always allow" },
          { optionId: "decline", label: "Deny" },
        ],
      },
    });
  });

  it("parses AskUserQuestion input and exposes single-question options with a structured form", () => {
    const questions = parseClaudeQuestions({
      questions: [
        {
          question: "Choose one",
          header: "Choice",
          multiSelect: true,
          options: [{ label: "A", description: "Alpha" }],
        },
      ],
    });

    expect(
      mapClaudeQuestionRequest({ threadId: "thread-1", requestId: "q-1", questions }),
    ).toMatchObject({
      type: "request.opened",
      requestType: "tool_user_input",
      payload: {
        summary: "Choose one",
        details: {
          userInputForm: { questions },
        },
        multiSelect: true,
        options: [{ optionId: "A", label: "A", description: "Alpha" }],
      },
    });
  });

  it("preserves AskUserQuestion option ids when Claude provides them", () => {
    const questions = parseClaudeQuestions({
      questions: [
        {
          question: "Which scope?",
          header: "Scope",
          options: [
            {
              optionId: "scope-a",
              label: "Scope A",
              description: "Minimal split.",
            },
          ],
        },
      ],
    });

    expect(questions[0]?.options).toEqual([
      { optionId: "scope-a", label: "Scope A", description: "Minimal split." },
    ]);
  });

  it("maps multi-question AskUserQuestion input to a structured form instead of fallback approvals", () => {
    const questions = parseClaudeQuestions({
      questions: [
        {
          question: "Which split scope should I execute?",
          header: "Scope",
          options: [
            {
              optionId: "Scope A: minimal",
              label: "Scope A: minimal",
              description: "Add the runtime package only.",
            },
          ],
        },
        {
          question: "Should I run validation after each phase?",
          header: "Validation cadence",
          options: [
            {
              optionId: "After each phase",
              label: "After each phase",
            },
          ],
        },
      ],
    });
    const event = mapClaudeQuestionRequest({
      threadId: "thread-1",
      requestId: "q-2",
      questions,
    });

    expect(event).toMatchObject({
      type: "request.opened",
      requestType: "tool_user_input",
      payload: {
        summary: "Which split scope should I execute?",
        details: {
          userInputForm: {
            questions,
          },
        },
      },
    });
    if (event.type !== "request.opened") throw new Error("unexpected event");
    expect(event.payload.options).toBeUndefined();
  });

  it("does not surface AskUserQuestion tool_use blocks as chat tool items", () => {
    const state = createClaudeMapperState("thread-1");
    const events = mapClaudeSdkMessage(
      {
        type: "assistant",
        session_id: "claude-session",
        parent_tool_use_id: null,
        message: {
          id: "msg_1",
          type: "message",
          role: "assistant",
          model: "claude",
          content: [
            {
              type: "tool_use",
              id: "toolu_question_1",
              name: "AskUserQuestion",
              input: { questions: [{ question: "Pick one", options: [] }] },
            },
            {
              type: "tool_use",
              id: "toolu_other_1",
              name: "Bash",
              input: { command: "ls" },
            },
          ],
          stop_reason: null,
          stop_sequence: null,
          usage: { input_tokens: 0, output_tokens: 0 },
        },
      } as unknown as SDKMessage,
      state,
    );
    const startedItemIds = events
      .filter((e) => e.type === "item.started")
      .map((e) => (e as { itemId: string }).itemId);
    expect(startedItemIds).toEqual(["toolu_other_1"]);
  });

  it("builds a question_answer item from a single-answer AskUserQuestion response", () => {
    const questions = parseClaudeQuestions({
      questions: [
        {
          question: "How wide should the scope be?",
          header: "Scope",
          options: [
            { label: "Replace nvm walk", description: "Tool-agnostic capture." },
            { label: "Keep fallback", description: "Static fallback." },
          ],
        },
      ],
    });
    const events = buildClaudeQuestionAnswerEvents({
      threadId: "thread-1",
      itemId: "question-answer-1",
      questions,
      answers: { "How wide should the scope be?": "Replace nvm walk" },
    });
    expect(events).toEqual([
      {
        type: "item.started",
        threadId: "thread-1",
        itemId: "question-answer-1",
        itemType: "question_answer",
        payload: {
          questions: [
            {
              header: "Scope",
              question: "How wide should the scope be?",
              selected: [{ label: "Replace nvm walk", description: "Tool-agnostic capture." }],
            },
          ],
        },
      },
      { type: "item.completed", threadId: "thread-1", itemId: "question-answer-1" },
    ]);
  });

  it("captures every selection from a multi-select answer", () => {
    const questions = parseClaudeQuestions({
      questions: [
        {
          question: "Pick categories",
          header: "Cats",
          multiSelect: true,
          options: [{ label: "A" }, { label: "B" }, { label: "C" }],
        },
      ],
    });
    const events = buildClaudeQuestionAnswerEvents({
      threadId: "thread-1",
      itemId: "question-answer-2",
      questions,
      answers: { "Pick categories": ["A", "C"] },
    });
    expect(events[0]).toMatchObject({
      itemType: "question_answer",
      payload: {
        questions: [
          {
            header: "Cats",
            question: "Pick categories",
            selected: [{ label: "A" }, { label: "C" }],
          },
        ],
      },
    });
  });

  it("resolves option ids to their labels when answers carry structured form arrays", () => {
    const questions = parseClaudeQuestions({
      questions: [
        {
          question: "Which scope?",
          header: "Scope",
          options: [{ optionId: "scope-a", label: "Scope A" }],
        },
      ],
    });
    const events = buildClaudeQuestionAnswerEvents({
      threadId: "thread-1",
      itemId: "question-answer-4",
      questions,
      answers: { "Which scope?": { answers: ["scope-a"] } },
    });

    expect(events[0]).toMatchObject({
      itemType: "question_answer",
      payload: {
        questions: [
          {
            header: "Scope",
            question: "Which scope?",
            selected: [{ label: "Scope A" }],
          },
        ],
      },
    });
  });

  it("treats unmatched answer strings as a freeform custom answer", () => {
    const questions = parseClaudeQuestions({
      questions: [
        {
          question: "Which scope?",
          header: "Scope",
          options: [{ optionId: "scope-a", label: "Scope A" }],
        },
      ],
    });
    const events = buildClaudeQuestionAnswerEvents({
      threadId: "thread-1",
      itemId: "question-answer-5",
      questions,
      answers: { "Which scope?": "Just rip out the old auth middleware" },
    });

    expect(events[0]).toMatchObject({
      itemType: "question_answer",
      payload: {
        questions: [
          {
            header: "Scope",
            question: "Which scope?",
            selected: [],
            customAnswer: "Just rip out the old auth middleware",
          },
        ],
      },
    });
  });

  it("returns no events when the answers map has no entries", () => {
    const events = buildClaudeQuestionAnswerEvents({
      threadId: "thread-1",
      itemId: "question-answer-3",
      questions: parseClaudeQuestions({
        questions: [
          {
            question: "Q?",
            header: "Q",
            options: [{ label: "A" }],
          },
        ],
      }),
      answers: {},
    });
    expect(events).toEqual([]);
  });
});

describe("sdkCanonicalMapping — goal token accumulation", () => {
  it("accumulates per-call assistant spend and emits a goal update on growth", () => {
    const state = createClaudeMapperState("thread-1");
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-05-12T10:00:00Z"));
      startClaudeTurn(state, "turn-goal", "/goal ship it", undefined);

      vi.setSystemTime(new Date("2026-05-12T10:00:45Z"));
      const message = assistantUsageMessage("msg-1", {
        input_tokens: 40_000,
        output_tokens: 2_000,
      });
      const event = accumulateActiveGoalAssistantSpend(state, message);

      expect(event).toMatchObject({
        type: "item.updated",
        threadId: "thread-1",
        itemId: "goal-turn-goal",
        payload: {
          objective: "ship it",
          status: "active",
          tokensUsed: 42_000,
          timeUsedSeconds: 45,
        },
      });

      const second = accumulateActiveGoalAssistantSpend(
        state,
        assistantUsageMessage("msg-2", { input_tokens: 1_000, output_tokens: 0 }),
      );
      expect(second).toMatchObject({ payload: { tokensUsed: 43_000 } });
      expect(accumulateActiveGoalAssistantSpend(state, message)).toBeUndefined();
      expect(state.activeGoalTokensUsed).toBe(43_000);
    } finally {
      vi.useRealTimers();
    }
  });

  it("skips assistant messages without usage and runs without an active goal", () => {
    const state = createClaudeMapperState("thread-1");
    startClaudeTurn(state, "turn-goal", "/goal ship it", undefined);
    const noUsage = {
      type: "assistant",
      session_id: "claude-session",
      uuid: "uuid-no-usage",
      parent_tool_use_id: null,
      message: {
        id: "msg-no-usage",
        role: "assistant",
        model: "claude-opus-4-8",
        content: [{ type: "text", text: "hi" }],
      },
    } as unknown as SDKAssistantMessage;
    expect(accumulateActiveGoalAssistantSpend(state, noUsage)).toBeUndefined();

    const idleState = createClaudeMapperState("thread-2");
    expect(
      accumulateActiveGoalAssistantSpend(
        idleState,
        assistantUsageMessage("msg-3", { input_tokens: 1_000, output_tokens: 0 }),
      ),
    ).toBeUndefined();
  });

  it("emits a tick with current totals only while a goal is active", () => {
    const state = createClaudeMapperState("thread-1");
    expect(emitActiveGoalTick(state)).toBeUndefined();

    startClaudeTurn(state, "turn-goal", "/goal ship it", undefined);
    accumulateActiveGoalAssistantSpend(
      state,
      assistantUsageMessage("msg-1", { input_tokens: 1_000, output_tokens: 0 }),
    );
    const tick = emitActiveGoalTick(state);
    expect(tick).toMatchObject({
      type: "item.updated",
      itemId: "goal-turn-goal",
      payload: { status: "active", tokensUsed: 1_000 },
    });
  });

  it("resets goal tokens and clock when a native verdict replaces the objective", () => {
    const state = createClaudeMapperState("thread-1");
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-05-12T10:00:00Z"));
      startClaudeTurn(state, "turn-goal", "/goal old objective", undefined);
      accumulateActiveGoalAssistantSpend(
        state,
        assistantUsageMessage("msg-1", { input_tokens: 9_000, output_tokens: 1_000 }),
      );
      mapClaudeSdkMessage(
        activeGoalMessage({
          condition: "old objective",
          iterations: 2,
          set_at: Date.parse("2026-05-12T10:00:00Z") / 1000,
          tokens_at_start: 0,
          last_reason: "old reason",
        }),
        state,
      );

      vi.setSystemTime(new Date("2026-05-12T10:10:00Z"));
      const events = mapClaudeSdkMessage(
        activeGoalMessage({
          condition: "new objective",
          iterations: 1,
          set_at: Date.parse("2026-05-12T10:10:00Z") / 1000,
          tokens_at_start: 0,
        }),
        state,
      );

      expect(state.activeGoalObjective).toBe("new objective");
      expect(state.activeGoalTokensUsed).toBeUndefined();
      expect(state.activeGoalLastReason).toBeUndefined();
      expect(events).toContainEqual(
        expect.objectContaining({
          type: "item.updated",
          itemId: "goal-turn-goal",
          payload: expect.objectContaining({
            objective: "new objective",
            timeUsedSeconds: 0,
          }),
        }),
      );
      // tokensUsed resets to 0 rather than disappearing: the renderer merges
      // goal payloads shallowly, so omitting it would keep the replaced
      // goal's total on the dock until new spend accumulates.
      const goalUpdate = events.find(
        (event): event is Extract<RuntimeEvent, { type: "item.updated" }> =>
          event.type === "item.updated" && event.itemId === "goal-turn-goal",
      );
      expect(goalUpdate?.payload).toMatchObject({ tokensUsed: 0 });
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps goal tokens identical to the Profile usage.spent ledger sum", () => {
    const state = createClaudeMapperState("thread-1");
    state.usageScope = new ClaudeUsageScopeTracker("claude-session", true);
    startClaudeTurn(state, "turn-goal", "/goal consistent totals", undefined);

    const stream: SDKMessage[] = [
      assistantUsageMessage("msg-1", { input_tokens: 10_000, output_tokens: 500 }),
      // Subagent sidechain call — counted by both.
      assistantUsageMessage(
        "msg-2",
        { input_tokens: 4_000, output_tokens: 200, cache_read_input_tokens: 900 },
        "toolu_T1",
      ),
      // Cumulative-per-task counter — excluded from both.
      {
        type: "system",
        subtype: "task_notification",
        session_id: "claude-session",
        task_id: "task-1",
        status: "completed",
        summary: "Done",
        usage: { total_tokens: 5_100, tool_uses: 4, duration_ms: 2_100 },
      } as unknown as SDKMessage,
      assistantUsageMessage("msg-3", { input_tokens: 2_000, output_tokens: 100 }),
      // Session-cumulative — excluded from both.
      {
        type: "result",
        subtype: "success",
        session_id: "claude-session",
        usage: { total_tokens: 999_999 },
      } as unknown as SDKMessage,
    ];

    let spentSum = 0;
    let completedTokens: number | undefined;
    for (const message of stream) {
      for (const event of mapClaudeSdkMessage(message, state)) {
        if (event.type === "usage.spent") spentSum += event.usage.counter;
        if (event.type === "item.updated" && event.itemId === "goal-turn-goal") {
          const payload = event.payload as { status?: string; tokensUsed?: number };
          if (payload.status === "complete") completedTokens = payload.tokensUsed;
        }
      }
    }
    expect(spentSum).toBe(17_700);
    expect(completedTokens).toBe(spentSum);
  });
});

describe("sdkCanonicalMapping — usage.spent", () => {
  function assistantMessage(options: {
    id: string;
    uuid?: string;
    parentToolUseId?: string;
    requestId?: string;
    model?: string;
    usage?: {
      input_tokens: number;
      output_tokens: number;
      cache_creation_input_tokens?: number;
      cache_read_input_tokens?: number;
    };
  }): SDKMessage {
    return {
      type: "assistant",
      session_id: "claude-session",
      uuid: options.uuid ?? `uuid-${options.id}`,
      parent_tool_use_id: options.parentToolUseId ?? null,
      ...(options.requestId ? { request_id: options.requestId } : {}),
      message: {
        id: options.id,
        role: "assistant",
        model: options.model ?? "claude-opus-4-8",
        content: [{ type: "text", text: "hello" }],
        usage: options.usage ?? { input_tokens: 10, output_tokens: 5 },
      },
    } as unknown as SDKMessage;
  }

  function spentOf(state: ReturnType<typeof createClaudeMapperState>, message: SDKMessage) {
    return mapClaudeSdkMessage(message, state).find((event) => event.type === "usage.spent");
  }

  it("emits a per-call usage.spent event with the four-field usage sum", () => {
    const state = createClaudeMapperState("thread-1");
    state.usageScope = new ClaudeUsageScopeTracker("claude-session", true);

    const spent = spentOf(
      state,
      assistantMessage({
        id: "msg-1",
        requestId: "req-1",
        usage: {
          input_tokens: 10,
          output_tokens: 5,
          cache_creation_input_tokens: 3,
          cache_read_input_tokens: 2,
        },
      }),
    );

    expect(spent).toEqual({
      type: "usage.spent",
      threadId: "thread-1",
      usage: {
        counterKind: "per-call",
        counter: 20,
        scopeId: "claude-session",
        epoch: 0,
        fresh: true,
        sampleId: "msg-1:req-1",
        occurredAt: expect.any(Number),
        model: "claude-opus-4-8",
      },
    });
  });

  it("emits usage.spent for sidechain (parent-attributed) assistant messages", () => {
    const state = createClaudeMapperState("thread-1");
    state.usageScope = new ClaudeUsageScopeTracker("claude-session", false);

    const events = mapClaudeSdkMessage(
      assistantMessage({
        id: "msg-sub-1",
        parentToolUseId: "toolu_parent",
        requestId: "req-sub-1",
        model: "claude-haiku-4-5-20251001",
        usage: {
          input_tokens: 100,
          output_tokens: 20,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 80,
        },
      }),
      state,
    );

    expect(events[0]).toEqual({
      type: "usage.spent",
      threadId: "thread-1",
      usage: {
        counterKind: "per-call",
        counter: 200,
        scopeId: "claude-session",
        epoch: 0,
        sampleId: "msg-sub-1:req-sub-1",
        occurredAt: expect.any(Number),
        model: "claude-haiku-4-5-20251001",
      },
    });
    // The child items still render alongside the spend event.
    expect(
      events.some(
        (event) => event.type === "item.started" && event.itemType === "assistant_message",
      ),
    ).toBe(true);
  });

  it("does not emit usage.spent from task_progress, task_notification, or result usage", () => {
    const state = createClaudeMapperState("thread-1");
    state.usageScope = new ClaudeUsageScopeTracker("claude-session", false);

    const progress = mapClaudeSdkMessage(
      {
        type: "system",
        subtype: "task_progress",
        session_id: "claude-session",
        task_id: "task-1",
        tool_use_id: "toolu_T1",
        description: "Searching",
        usage: { total_tokens: 4_200, tool_uses: 3, duration_ms: 1_500 },
      } as unknown as SDKMessage,
      state,
    );
    expect(progress.some((event) => event.type === "usage.spent")).toBe(false);

    const notification = mapClaudeSdkMessage(
      {
        type: "system",
        subtype: "task_notification",
        session_id: "claude-session",
        task_id: "task-1",
        status: "completed",
        summary: "Done",
        usage: { total_tokens: 98_765, tool_uses: 8, duration_ms: 12_000 },
      } as unknown as SDKMessage,
      state,
    );
    expect(notification.some((event) => event.type === "usage.spent")).toBe(false);

    const result = mapClaudeSdkMessage(
      {
        type: "result",
        subtype: "success",
        session_id: "claude-session",
        usage: { input_tokens: 10, output_tokens: 5 },
      } as unknown as SDKMessage,
      state,
    );
    expect(result.some((event) => event.type === "usage.spent")).toBe(false);
  });

  it("keeps the sampleId stable per API message (message.id + request_id)", () => {
    const state = createClaudeMapperState("thread-1");
    state.usageScope = new ClaudeUsageScopeTracker("claude-session", false);

    const first = spentOf(state, assistantMessage({ id: "msg-1", requestId: "req-1" }));
    const replay = spentOf(
      state,
      assistantMessage({ id: "msg-1", uuid: "uuid-replay", requestId: "req-1" }),
    );
    expect(first?.type === "usage.spent" && first.usage.sampleId).toBe("msg-1:req-1");
    expect(replay?.type === "usage.spent" && replay.usage.sampleId).toBe("msg-1:req-1");

    // Without an SDK request_id the API message id alone is the dedup key.
    const bare = spentOf(state, assistantMessage({ id: "msg-2" }));
    expect(bare?.type === "usage.spent" && bare.usage.sampleId).toBe("msg-2");
  });

  it("emits nothing for assistant messages without usage, and marks only the first sample fresh", () => {
    const state = createClaudeMapperState("thread-1");
    state.usageScope = new ClaudeUsageScopeTracker("claude-session", true);

    expect(
      spentOf(
        state,
        assistantMessage({ id: "msg-0", usage: { input_tokens: 0, output_tokens: 0 } }),
      ),
    ).toBeUndefined();
    // The zero-usage message did not consume the fresh baseline.
    const first = spentOf(state, assistantMessage({ id: "msg-1" }));
    expect(first).toMatchObject({ usage: { fresh: true, epoch: 0 } });
    const second = spentOf(state, assistantMessage({ id: "msg-2" }));
    expect(second).toMatchObject({ usage: { epoch: 0 } });
    expect(second?.type === "usage.spent" && second.usage).not.toHaveProperty("fresh");
  });

  it("bumps the epoch when the SDK session id is adopted mid-thread", () => {
    const state = createClaudeMapperState("thread-1");
    state.usageScope = new ClaudeUsageScopeTracker("claude-session", false);

    expect(spentOf(state, assistantMessage({ id: "msg-1" }))).toMatchObject({
      usage: { scopeId: "claude-session", epoch: 0, sampleId: "msg-1" },
    });

    state.usageScope.adoptScope("claude-session-2");

    expect(spentOf(state, assistantMessage({ id: "msg-2" }))).toMatchObject({
      usage: { scopeId: "claude-session-2", epoch: 1, sampleId: "msg-2" },
    });
  });

  it("emits no usage.spent without a usage scope", () => {
    const state = createClaudeMapperState("thread-1");
    expect(
      mapClaudeSdkMessage(assistantMessage({ id: "msg-1" }), state).some(
        (event) => event.type === "usage.spent",
      ),
    ).toBe(false);
  });
});
