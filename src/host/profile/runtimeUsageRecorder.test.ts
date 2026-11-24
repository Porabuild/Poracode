import { describe, expect, it, vi } from "vitest";
import type { StartThreadPayload, Thread, UsageEventInputPayload } from "@/shared/contracts";
import { RuntimeUsageRecorder } from "./runtimeUsageRecorder";

function makeThread(id: string, agentKind: string, overrides: Partial<Thread> = {}): Thread {
  return {
    id,
    projectId: "p1",
    title: "Thread",
    agentKind,
    presentationMode: "gui",
    status: "idle",
    attention: "none",
    canResumeWithConfig: false,
    archived: false,
    done: false,
    starred: false,
    config: { model: "test-model", fast: false },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function createHarness(threadsList: Thread[], initialNow = 10_000) {
  let now = initialNow;
  const threads = new Map(threadsList.map((t) => [t.id, t]));
  const getThread = vi.fn<(id: string) => Thread | null>((id) => threads.get(id) ?? null);
  const appended: UsageEventInputPayload[] = [];
  const recorder = new RuntimeUsageRecorder({
    getThread,
    appendUsageEvents: (events) => appended.push(...events),
    now: () => now,
  });
  return {
    recorder,
    getThread,
    appended,
    setNow: (next: number) => {
      now = next;
    },
    emitted: (kind?: string) =>
      kind === undefined ? appended : appended.filter((event) => event.kind === kind),
  };
}

describe("RuntimeUsageRecorder", () => {
  it("records a skill name from the completed payload when the start was generic", () => {
    const h = createHarness([makeThread("skill-thread", "skill-provider")]);
    h.recorder.observeRuntimeEvents("skill-thread", [
      {
        type: "item.started",
        threadId: "skill-thread",
        itemId: "skill-item",
        itemType: "dynamic_tool_call",
        payload: { name: "Skill", status: "running" },
      },
      {
        type: "item.completed",
        threadId: "skill-thread",
        itemId: "skill-item",
        payload: {
          name: "Skill",
          title: "Loaded skill: heroui-react",
          args: { name: "heroui-react" },
          status: "success",
        },
      },
    ]);

    h.recorder.flush();
    expect(h.emitted("skill")).toMatchObject([{ name: "heroui-react" }]);
  });

  it("records the subagent type from a later payload instead of the generic label", () => {
    const h = createHarness([makeThread("subagent-thread", "subagent-provider")]);
    h.recorder.observeRuntimeEvents("subagent-thread", [
      {
        type: "item.started",
        threadId: "subagent-thread",
        itemId: "subagent-item",
        itemType: "tool_call",
        payload: { name: "Agent", isSubAgent: true, status: "running" },
      },
      {
        type: "item.updated",
        threadId: "subagent-thread",
        itemId: "subagent-item",
        payload: {
          name: "Agent",
          isSubAgent: true,
          args: { description: "Review", subagent_type: "general-purpose" },
          status: "running",
        },
      },
      {
        type: "item.completed",
        threadId: "subagent-thread",
        itemId: "subagent-item",
        payload: {
          name: "Agent",
          isSubAgent: true,
          args: { description: "Review", subagent_type: "general-purpose" },
          status: "success",
        },
      },
    ]);

    h.recorder.flush();
    expect(h.emitted("subagent")).toMatchObject([{ name: "general-purpose" }]);
  });

  it("does not duplicate a skill that started with a specific name", () => {
    const h = createHarness([makeThread("specific-skill-thread", "skill-provider")]);
    h.recorder.observeRuntimeEvents("specific-skill-thread", [
      {
        type: "item.started",
        threadId: "specific-skill-thread",
        itemId: "specific-skill-item",
        itemType: "dynamic_tool_call",
        payload: {
          name: "Skill",
          args: { name: "interactive-testing" },
          status: "running",
        },
      },
      {
        type: "item.completed",
        threadId: "specific-skill-thread",
        itemId: "specific-skill-item",
        payload: {
          name: "Skill",
          args: { name: "interactive-testing" },
          status: "success",
        },
      },
    ]);

    h.recorder.flush();
    expect(h.emitted("skill")).toMatchObject([{ name: "interactive-testing" }]);
    expect(h.emitted("skill")).toHaveLength(1);
  });

  it("captures skills, workflows, subagents, MCP servers, messages, goals, and turn durations", () => {
    const h = createHarness([
      makeThread("t-1", "provider-a", { config: { model: "m-1", fast: true, effort: "high" } }),
    ]);

    h.recorder.observeSupervisorEvent({
      type: "thread-runtime-events",
      threadId: "t-1",
      events: [
        { type: "turn.started", threadId: "t-1", turnId: "turn-1" },
        {
          type: "item.started",
          threadId: "t-1",
          itemId: "msg-1",
          itemType: "user_message",
          payload: { text: "hello" },
        },
        {
          type: "item.started",
          threadId: "t-1",
          itemId: "goal-1",
          itemType: "goal",
          payload: { action: "set" },
        },
        {
          type: "item.started",
          threadId: "t-1",
          itemId: "skill-file",
          itemType: "dynamic_tool_call",
          payload: {
            name: "Read",
            args: { file_path: String.raw`C:\Users\dev\.agent\skills\.system\imagegen\SKILL.md` },
          },
        },
        {
          type: "item.started",
          threadId: "t-1",
          itemId: "wf-1",
          itemType: "tool_call",
          payload: { name: "Workflow", args: { description: "Run review" } },
        },
        {
          type: "item.started",
          threadId: "t-1",
          itemId: "mcp-1",
          itemType: "tool_call",
          payload: { name: "spawn_agent", serverId: "crossagents", isSubAgent: true },
        },
        {
          type: "item.started",
          threadId: "t-1",
          itemId: "generic-mcp",
          itemType: "mcp_tool_call",
          payload: { name: "Mcp" },
        },
        {
          type: "item.completed",
          threadId: "t-1",
          itemId: "generic-mcp",
          payload: { name: "Mcp" },
        },
      ],
    });

    h.setNow(13_500);
    h.recorder.observeSupervisorEvent({
      type: "thread-runtime-events",
      threadId: "t-1",
      events: [{ type: "turn.completed", threadId: "t-1", turnId: "turn-1", state: "completed" }],
    });
    h.recorder.dispose();

    expect(h.emitted("message")).toHaveLength(1);
    expect(h.emitted("goal")).toHaveLength(1);
    expect(h.emitted("skill")).toMatchObject([{ name: "imagegen", provider: "provider-a" }]);
    expect(h.emitted("workflow")).toMatchObject([{ name: "Run review" }]);
    expect(h.emitted("mcp")).toEqual([
      expect.objectContaining({ kind: "mcp", name: "crossagents" }),
    ]);
    expect(h.emitted("subagent")).toEqual([]);
    expect(h.emitted("turn")).toMatchObject([
      {
        kind: "turn",
        provider: "provider-a",
        model: "m-1",
        mode: "chat",
        fast: true,
        effort: "high",
        value: 3500,
      },
    ]);
  });

  it("does zero thread lookups for streaming content.delta batches", () => {
    const h = createHarness([makeThread("t-1", "provider-a")]);
    h.recorder.observeRuntimeEvents("t-1", [
      {
        type: "content.delta",
        threadId: "t-1",
        itemId: "i-1",
        stream: "assistant_text",
        delta: "abc",
      },
      {
        type: "content.delta",
        threadId: "t-1",
        itemId: "i-1",
        stream: "assistant_text",
        delta: "def",
      },
    ]);
    expect(h.getThread).not.toHaveBeenCalled();
    h.recorder.flush();
    expect(h.appended).toEqual([]);
  });

  it("records thread_started once for fresh launches and skips resumes or already-sessioned threads", () => {
    const h = createHarness([
      makeThread("fresh", "provider-a"),
      makeThread("imported", "provider-a", {
        sessionRef: {
          providerSessionId: "existing-session",
          discoveredAt: "2026-01-01T00:00:00.000Z",
        },
      }),
    ]);
    const baseLaunch: StartThreadPayload = {
      threadId: "fresh",
      projectLocation: { kind: "posix", path: "/repo" },
      agentKind: "provider-a",
      presentationMode: "gui",
      prompt: "hello",
      config: { model: "m-1", fast: true, effort: "medium" },
      initialSize: { cols: 80, rows: 24 },
    };

    h.recorder.observeThreadLaunch(baseLaunch);
    // Repeat launch for same thread (e.g. ensureThreadRunning) is deduplicated.
    h.recorder.observeThreadLaunch(baseLaunch);
    // Resume is skipped.
    h.recorder.observeThreadLaunch({
      ...baseLaunch,
      threadId: "resumed",
      sessionRef: {
        providerSessionId: "sess-1",
        discoveredAt: "2026-01-01T00:00:00.000Z",
      },
    });
    // Thread that already has a sessionId in DB (e.g. imported) is skipped.
    h.recorder.observeThreadLaunch({
      ...baseLaunch,
      threadId: "imported",
    });

    h.recorder.flush();
    expect(h.emitted("thread_started")).toEqual([
      {
        ts: 10_000,
        kind: "thread_started",
        provider: "provider-a",
        model: "m-1",
        mode: "chat",
        fast: true,
        effort: "medium",
        value: 1,
      },
    ]);
  });
});
