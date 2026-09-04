import { describe, expect, it } from "vitest";
import {
  createMuseMspItemMapperState,
  mapMuseMspDelta,
  mapMuseMspGoalChanged,
  mapMuseMspItem,
} from "./canonicalMapping";

describe("Muse MSP canonical mapping", () => {
  it("streams and completes assistant messages", () => {
    const state = createMuseMspItemMapperState("thread-1");
    expect(
      mapMuseMspItem(
        state,
        { itemId: "message-1", kind: "agentMessage", status: "inProgress", text: "" },
        "started",
      ),
    ).toEqual([
      expect.objectContaining({
        type: "item.started",
        itemId: "message-1",
        itemType: "assistant_message",
      }),
    ]);
    expect(
      mapMuseMspDelta(state, {
        itemId: "message-1",
        field: "text",
        delta: "hello",
      }),
    ).toEqual([
      {
        type: "content.delta",
        threadId: "thread-1",
        itemId: "message-1",
        stream: "assistant_text",
        delta: "hello",
      },
    ]);
    expect(
      mapMuseMspItem(
        state,
        { itemId: "message-1", kind: "agentMessage", status: "completed", text: "hello" },
        "completed",
      ),
    ).toEqual([
      expect.objectContaining({ type: "item.updated", itemId: "message-1" }),
      { type: "item.completed", threadId: "thread-1", itemId: "message-1" },
    ]);
  });

  it("maps completion-only messages and the protocol's default text delta", () => {
    const state = createMuseMspItemMapperState("thread-1");
    expect(
      mapMuseMspItem(
        state,
        { itemId: "message-1", kind: "agentMessage", status: "completed", text: "hello" },
        "completed",
      )[0],
    ).toMatchObject({
      type: "item.started",
      itemType: "assistant_message",
      payload: { content: [{ kind: "text", text: "hello" }] },
    });

    mapMuseMspItem(
      state,
      { itemId: "message-2", kind: "agentMessage", status: "inProgress", text: "" },
      "started",
    );
    expect(mapMuseMspDelta(state, { itemId: "message-2", delta: "default text" })).toEqual([
      expect.objectContaining({ stream: "assistant_text", delta: "default text" }),
    ]);
  });

  it("maps reasoning summaries and output-bearing terminal tool calls", () => {
    const state = createMuseMspItemMapperState("thread-1");
    expect(
      mapMuseMspItem(
        state,
        {
          itemId: "reason-1",
          kind: "reasoning",
          status: "completed",
          summary: ["First thought", "Second thought"],
        },
        "completed",
      ),
    ).toEqual([
      expect.objectContaining({ type: "item.started", itemType: "reasoning" }),
      expect.objectContaining({
        type: "content.delta",
        stream: "reasoning_text",
        delta: "First thought\n\nSecond thought",
      }),
      expect.objectContaining({ type: "item.completed" }),
    ]);

    mapMuseMspItem(
      state,
      { itemId: "reason-2", kind: "reasoning", status: "inProgress", summary: [] },
      "started",
    );
    expect(mapMuseMspDelta(state, { itemId: "reason-2", field: "summary.0", delta: "A" })).toEqual([
      expect.objectContaining({ stream: "reasoning_text", delta: "A" }),
    ]);
    expect(mapMuseMspDelta(state, { itemId: "reason-2", field: "summary.1", delta: "B" })).toEqual([
      expect.objectContaining({ stream: "reasoning_text", delta: "\n\nB" }),
    ]);

    expect(
      mapMuseMspItem(
        state,
        {
          itemId: "tool-failed",
          kind: "toolCall",
          tool: "shell",
          status: "timedOut",
          visibleOutput: "timed out after 30s",
        },
        "completed",
      )[0],
    ).toMatchObject({
      itemType: "tool_call",
      payload: { status: "error", result: "timed out after 30s" },
    });
    expect(
      mapMuseMspDelta(state, { itemId: "tool-failed", field: "output", delta: "tail" }),
    ).toEqual([expect.objectContaining({ stream: "command_output", delta: "tail" })]);
  });

  it("maps tool calls and unknown future item kinds", () => {
    const state = createMuseMspItemMapperState("thread-1");
    expect(
      mapMuseMspItem(
        state,
        {
          itemId: "tool-1",
          kind: "toolCall",
          tool: "shell",
          args: '{"command":"pwd"}',
          status: "inProgress",
        },
        "started",
      )[0],
    ).toMatchObject({
      itemType: "tool_call",
      payload: { name: "shell", kind: "execute", args: { command: "pwd" }, status: "running" },
    });
    expect(
      mapMuseMspItem(
        state,
        {
          itemId: "future-1",
          kind: "futureKind",
          fallbackText: "Future activity",
          status: "completed",
        },
        "completed",
      ),
    ).toEqual([
      expect.objectContaining({
        itemType: "dynamic_tool_call",
        payload: expect.objectContaining({ title: "Future activity", status: "success" }),
      }),
      { type: "item.completed", threadId: "thread-1", itemId: "future-1" },
    ]);
  });

  it("suppresses Muse reminder bookkeeping items", () => {
    const state = createMuseMspItemMapperState("thread-1");
    expect(
      mapMuseMspItem(
        state,
        { itemId: "reminder-1", kind: "reminderChild", status: "completed" },
        "completed",
      ),
    ).toEqual([]);
  });

  it("completes user messages that have no optimistic alias", () => {
    const state = createMuseMspItemMapperState("thread-1");
    expect(
      mapMuseMspItem(
        state,
        { itemId: "user-1", kind: "userMessage", status: "completed", text: "hello" },
        "completed",
      ),
    ).toEqual([
      expect.objectContaining({
        type: "item.started",
        itemType: "user_message",
        payload: { content: [{ kind: "text", text: "hello" }] },
      }),
      { type: "item.completed", threadId: "thread-1", itemId: "user-1" },
    ]);
  });

  it("maps session/goalChanged lifecycle: set, pause, resume, edit, clear", () => {
    const state = createMuseMspItemMapperState("thread-1");

    // 1. Goal set (active)
    const setEvents = mapMuseMspGoalChanged(state, {
      sessionId: "sess-1",
      goal: {
        objective: "Fix flaky network test",
        status: "active",
        percentComplete: 0,
        currentWork: "Investigating timeout",
      },
    });
    expect(setEvents).toHaveLength(2);
    expect(setEvents[0]).toMatchObject({
      type: "item.started",
      threadId: "thread-1",
      itemType: "goal",
      payload: {
        action: "set",
        objective: "Fix flaky network test",
        status: "active",
        availableActions: [],
        lastReason: "Investigating timeout",
      },
    });
    expect(setEvents[1]).toMatchObject({
      type: "item.completed",
      threadId: "thread-1",
    });
    const goalItemId = state.goalItemId;
    expect(goalItemId).toBeDefined();

    // 2. Goal paused
    const pauseEvents = mapMuseMspGoalChanged(state, {
      sessionId: "sess-1",
      goal: {
        objective: "Fix flaky network test",
        status: "paused",
        percentComplete: 0,
      },
    });
    expect(pauseEvents).toHaveLength(2);
    expect(pauseEvents[0]).toMatchObject({
      type: "item.updated",
      threadId: "thread-1",
      itemId: goalItemId,
      payload: {
        action: "updated",
        status: "paused",
        availableActions: [],
      },
    });
    expect(pauseEvents[1]).toMatchObject({
      type: "item.completed",
      threadId: "thread-1",
    });

    // 3. Goal edited
    const editEvents = mapMuseMspGoalChanged(state, {
      sessionId: "sess-1",
      goal: {
        objective: "Fix flaky network test and increase timeout",
        status: "paused",
        percentComplete: 0,
      },
    });
    expect(editEvents).toHaveLength(2);
    expect(editEvents[0]).toMatchObject({
      type: "item.updated",
      threadId: "thread-1",
      itemId: goalItemId,
      payload: {
        action: "updated",
        objective: "Fix flaky network test and increase timeout",
        status: "paused",
      },
    });
    expect(editEvents[1]).toMatchObject({
      type: "item.completed",
      threadId: "thread-1",
    });

    // 4. Goal resumed
    const resumeEvents = mapMuseMspGoalChanged(state, {
      sessionId: "sess-1",
      goal: {
        objective: "Fix flaky network test and increase timeout",
        status: "active",
        percentComplete: 50,
      },
    });
    expect(resumeEvents).toHaveLength(2);
    expect(resumeEvents[0]).toMatchObject({
      type: "item.updated",
      threadId: "thread-1",
      itemId: goalItemId,
      payload: {
        action: "updated",
        status: "active",
        availableActions: [],
      },
    });
    expect(resumeEvents[1]).toMatchObject({
      type: "item.completed",
      threadId: "thread-1",
    });

    // 5. Goal cleared
    const clearEvents = mapMuseMspGoalChanged(state, {
      sessionId: "sess-1",
      goal: null,
    });
    expect(clearEvents).toHaveLength(2);
    expect(clearEvents[0]).toMatchObject({
      type: "item.updated",
      threadId: "thread-1",
      itemId: goalItemId,
      payload: {
        action: "cleared",
      },
    });
    expect(clearEvents[1]).toMatchObject({
      type: "item.completed",
      threadId: "thread-1",
    });
    expect(state.goalItemId).toBeUndefined();

    // 6. New goal after clear creates a fresh goal item
    const newEvents = mapMuseMspGoalChanged(state, {
      sessionId: "sess-1",
      goal: {
        objective: "Next task",
        status: "active",
        percentComplete: 0,
      },
    });
    expect(newEvents).toHaveLength(2);
    expect(newEvents[0]).toMatchObject({
      type: "item.started",
      threadId: "thread-1",
      itemType: "goal",
      payload: {
        action: "set",
        objective: "Next task",
      },
    });
    expect(newEvents[1]).toMatchObject({
      type: "item.completed",
      threadId: "thread-1",
    });
    expect(state.goalItemId).not.toEqual(goalItemId);
  });
});

describe("Muse MSP subagent tool mapping", () => {
  const spawnItem = {
    itemId: "tool-spawn",
    kind: "toolCall",
    status: "inProgress",
    tool: "subagent_spawn",
    args: JSON.stringify({ id: "sa-1", agent: "reviewer", prompt: "review it" }),
  };
  const waitItem = {
    itemId: "tool-wait",
    kind: "toolCall",
    status: "inProgress",
    tool: "subagent_wait",
    args: JSON.stringify({ id: "sa-1" }),
  };

  it("marks spawn calls as sub-agent rows with their type", () => {
    const state = createMuseMspItemMapperState("thread-1");
    const [started] = mapMuseMspItem(state, spawnItem, "started");
    expect(started).toMatchObject({
      type: "item.started",
      itemType: "tool_call",
      payload: expect.objectContaining({
        name: "subagent_spawn",
        isSubAgent: true,
        subAgentType: "reviewer",
        subAgentStatus: "running",
      }),
    });
  });

  it("maps spawn completion to a completed sub-agent", () => {
    const state = createMuseMspItemMapperState("thread-1");
    mapMuseMspItem(state, spawnItem, "started");
    const events = mapMuseMspItem(state, { ...spawnItem, status: "completed" }, "completed");
    expect(events[events.length - 1]).toMatchObject({ type: "item.completed" });
    expect(events[0]).toMatchObject({
      type: "item.updated",
      payload: expect.objectContaining({ subAgentStatus: "completed" }),
    });
  });

  it("renders companion calls as resumes of the spawned agent", () => {
    const state = createMuseMspItemMapperState("thread-1");
    mapMuseMspItem(state, spawnItem, "started");
    const [started] = mapMuseMspItem(state, waitItem, "started");
    expect(started).toMatchObject({
      type: "item.started",
      payload: expect.objectContaining({
        name: "subagent_wait",
        isSubAgent: true,
        isSubAgentResume: true,
        subAgentType: "reviewer",
        subAgentStatus: "running",
      }),
    });
  });

  it("leaves non-subagent tools unmarked", () => {
    const state = createMuseMspItemMapperState("thread-1");
    const [started] = mapMuseMspItem(
      state,
      {
        itemId: "tool-read",
        kind: "toolCall",
        status: "inProgress",
        tool: "read_file",
        args: "{}",
      },
      "started",
    );
    expect(started).toMatchObject({
      type: "item.started",
      payload: expect.objectContaining({ name: "read_file" }),
    });
    const payload = (started as { payload: Record<string, unknown> }).payload;
    expect(payload.isSubAgent).toBeUndefined();
    expect(payload.subAgentStatus).toBeUndefined();
  });
});
