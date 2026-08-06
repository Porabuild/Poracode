import type { SessionNotification } from "@agentclientprotocol/sdk";
import { describe, expect, it, vi } from "vitest";
import type { ProjectLocation } from "@/shared/contracts";
import {
  PORACODE_ACP_DETACHED_SUBAGENT_ACTIVITY_META_KEY,
  PORACODE_ACP_NEW_ASSISTANT_ITEM_META_KEY,
  PORACODE_ACP_PARENT_TOOL_CALL_ID_META_KEY,
} from "../acp/canonicalMapping";
import { createKimiBackgroundBridge } from "./backgroundBridge";
import { parseCompletedKimiWireTurns, parseKimiTaskRecord } from "./kimiWireJournal";

function wireLine(time: number, event: Record<string, unknown>): string {
  return JSON.stringify({ type: "context.append_loop_event", event, time });
}

type ReadTextFake = ReturnType<
  typeof vi.fn<
    (location: ProjectLocation, path: string, maxBytes?: number) => Promise<string | undefined>
  >
>;

/**
 * Builds the `readText` dependency fake shared by the wire-polling tests.
 * `wire` answers `/wire.jsonl` reads — pass a function to flip from the
 * launch wire to the completed wire on a later poll, keyed by the 1-based
 * read count. `task` answers any `*.json` task-record read. `output` maps
 * output-log path suffixes to their contents.
 */
function makeReadText({
  wire,
  task,
  output,
}: {
  wire: string | ((reads: number) => string);
  task: string;
  output: Record<string, string>;
}): ReadTextFake {
  let wireReads = 0;
  return vi.fn<
    (location: ProjectLocation, path: string, maxBytes?: number) => Promise<string | undefined>
  >(async (_location, path) => {
    if (path.endsWith("/wire.jsonl")) {
      wireReads += 1;
      return typeof wire === "function" ? wire(wireReads) : wire;
    }
    if (path.endsWith(".json")) return task;
    return Object.entries(output).find(([suffix]) => path.endsWith(suffix))?.[1];
  });
}

/** Starts a bridge wired to `readText` and collects every emitted notification. */
function startBridge(readText: ReadTextFake, overrides: { now?: () => number } = {}) {
  const updates: SessionNotification[] = [];
  const bridge = createKimiBackgroundBridge(
    { kind: "posix", path: "/repo" },
    (notification) => updates.push(notification),
    {
      readText,
      resolveSessionDir: async () => "/kimi/session",
      pollIntervalMs: 1,
      ...(overrides.now ? { now: overrides.now } : {}),
    },
  );
  return { bridge, updates };
}

describe("Kimi background subagent bridge", () => {
  it("parses terminal task metadata defensively", () => {
    expect(parseKimiTaskRecord('{"status":"completed","endedAt":42}')).toEqual({
      status: "completed",
      endedAt: 42,
    });
    expect(parseKimiTaskRecord("not-json")).toBeUndefined();
    expect(parseKimiTaskRecord('{"endedAt":42}')).toBeUndefined();
  });

  it("reads every v2 terminal status plus legacy snake_case timestamps", () => {
    expect(parseKimiTaskRecord('{"status":"killed","endedAt":7}')).toEqual({
      status: "killed",
      endedAt: 7,
    });
    expect(parseKimiTaskRecord('{"status":"timed_out","endedAt":null}')).toEqual({
      status: "timed_out",
    });
    expect(parseKimiTaskRecord('{"status":"lost"}')).toEqual({ status: "lost" });
    expect(parseKimiTaskRecord('{"status":"failed","ended_at":9}')).toEqual({
      status: "failed",
      endedAt: 9,
    });
  });

  it("ignores v2 metadata and task lifecycle wire records", () => {
    const wire = [
      JSON.stringify({ type: "metadata", protocol_version: "1", created_at: 1, time: 1 }),
      JSON.stringify({
        type: "task.terminated",
        info: { taskId: "agent-task", status: "completed", endedAt: 12 },
        outputTail: "tail",
        time: 12,
      }),
      wireLine(10, {
        type: "content.part",
        turnId: "1",
        part: { type: "text", text: "reply" },
      }),
      wireLine(11, { type: "step.end", turnId: "1", finishReason: "end_turn" }),
    ].join("\n");
    expect(parseCompletedKimiWireTurns(wire)).toEqual([
      {
        turnId: "1",
        completionId: "1:10:11",
        firstTime: 10,
        lastTime: 11,
        text: "reply",
        taskIds: [],
      },
    ]);
  });

  it("links a numeric v2 notification turn to its originating background task", () => {
    const wire = [
      JSON.stringify({
        type: "turn.prompt",
        input: [{ type: "text", text: "<notification>completed</notification>" }],
        origin: { kind: "task", taskId: "agent-task", status: "completed" },
        time: 20,
      }),
      wireLine(21, { type: "step.begin", turnId: 1 }),
      wireLine(22, {
        type: "content.part",
        turnId: 1,
        part: { type: "text", text: "automatic reply" },
      }),
      wireLine(23, { type: "step.end", turnId: 1, finishReason: "end_turn" }),
    ].join("\n");

    expect(parseCompletedKimiWireTurns(wire)).toEqual([
      {
        turnId: "1",
        completionId: "1:21:23",
        firstTime: 21,
        lastTime: 23,
        text: "automatic reply",
        taskIds: ["agent-task"],
      },
    ]);
  });

  it("collects text from completed Kimi wire turns", () => {
    const wire = [
      wireLine(10, {
        type: "content.part",
        turnId: "1",
        part: { type: "text", text: "first " },
      }),
      wireLine(11, {
        type: "tool.call",
        turnId: "1",
        args: { path: "/kimi/tasks/agent-task/output.log" },
      }),
      wireLine(11, {
        type: "content.part",
        turnId: "1",
        part: { type: "text", text: "second" },
      }),
      wireLine(12, { type: "step.end", turnId: "1", finishReason: "end_turn" }),
      "partial-json",
    ].join("\n");
    expect(parseCompletedKimiWireTurns(wire)).toEqual([
      {
        turnId: "1",
        completionId: "1:10:12",
        firstTime: 10,
        lastTime: 12,
        text: "first second",
        taskIds: ["agent-task"],
      },
    ]);
  });

  it("associates automatic turns that retrieve results through TaskOutput", () => {
    const wire = [
      wireLine(20, {
        type: "tool.call",
        turnId: "2",
        name: "TaskOutput",
        args: { task_id: "agent-task" },
      }),
      wireLine(21, {
        type: "content.part",
        turnId: "2",
        part: { type: "text", text: "automatic reply" },
      }),
      wireLine(22, { type: "step.end", turnId: "2", finishReason: "end_turn" }),
    ].join("\n");

    expect(parseCompletedKimiWireTurns(wire)).toEqual([
      {
        turnId: "2",
        completionId: "2:20:22",
        firstTime: 20,
        lastTime: 22,
        text: "automatic reply",
        taskIds: ["agent-task"],
      },
    ]);
  });

  it("keeps resumed segments of the same Kimi turn separate", () => {
    const wire = [
      wireLine(10, {
        type: "content.part",
        turnId: "1",
        part: { type: "text", text: "Still waiting for another task." },
      }),
      wireLine(11, { type: "step.end", turnId: "1", finishReason: "end_turn" }),
      wireLine(20, {
        type: "tool.call",
        turnId: "1",
        name: "TaskOutput",
        args: { task_id: "agent-task" },
      }),
      wireLine(21, {
        type: "content.part",
        turnId: "1",
        part: { type: "text", text: "Final automatic reply" },
      }),
      wireLine(22, { type: "step.end", turnId: "1", finishReason: "end_turn" }),
    ].join("\n");

    expect(parseCompletedKimiWireTurns(wire)).toEqual([
      {
        turnId: "1",
        completionId: "1:10:11",
        firstTime: 10,
        lastTime: 11,
        text: "Still waiting for another task.",
        taskIds: [],
      },
      {
        turnId: "1",
        completionId: "1:20:22",
        firstTime: 20,
        lastTime: 22,
        text: "Final automatic reply",
        taskIds: ["agent-task"],
      },
    ]);
  });

  it("re-emits task output, automatic reply, and terminal tool status", async () => {
    const initialWire = [
      wireLine(100, {
        type: "content.part",
        turnId: "0",
        part: { type: "text", text: "launched" },
      }),
      wireLine(101, { type: "step.end", turnId: "0", finishReason: "end_turn" }),
    ].join("\n");
    const completedWire = [
      initialWire,
      wireLine(190, {
        type: "content.part",
        turnId: "1",
        part: { type: "text", text: "Still waiting for another task." },
      }),
      wireLine(191, { type: "step.end", turnId: "1", finishReason: "end_turn" }),
      wireLine(201, {
        type: "tool.call",
        turnId: "1",
        args: { path: "/kimi/tasks/agent-task/output.log" },
      }),
      wireLine(201, {
        type: "content.part",
        turnId: "1",
        part: { type: "text", text: "final answer" },
      }),
      wireLine(202, { type: "step.end", turnId: "1", finishReason: "end_turn" }),
    ].join("\n");
    const readText = makeReadText({
      wire: (reads) => (reads === 1 ? initialWire : completedWire),
      task: '{"status":"completed","endedAt":200}',
      output: { "/agent-task/output.log": "child result" },
    });
    const { bridge, updates } = startBridge(readText);

    bridge.onBackgroundLaunch({
      sessionId: "session-1",
      toolCallId: "tool-1",
      taskId: "agent-task",
    });
    await vi.waitFor(() => expect(updates).toHaveLength(3));
    bridge.dispose();

    expect(updates.map((notification) => notification.update.sessionUpdate)).toEqual([
      "agent_message_chunk",
      "agent_message_chunk",
      "tool_call_update",
    ]);
    expect(updates[0]?.update).toMatchObject({
      content: { type: "text", text: "child result" },
      _meta: { [PORACODE_ACP_PARENT_TOOL_CALL_ID_META_KEY]: "tool-1" },
    });
    expect(updates[1]?.update).toMatchObject({
      content: { type: "text", text: "final answer" },
      _meta: { [PORACODE_ACP_NEW_ASSISTANT_ITEM_META_KEY]: true },
    });
    expect(updates[2]?.update).toMatchObject({
      toolCallId: "tool-1",
      status: "completed",
      rawOutput: "child result",
      _meta: { [PORACODE_ACP_DETACHED_SUBAGENT_ACTIVITY_META_KEY]: "tool-1" },
    });
  });

  it("accepts Kimi v2 completion segments that resume the launch turn id", async () => {
    const launchWire = [
      wireLine(100, {
        type: "tool.call",
        turnId: "10",
        name: "Agent",
        args: { run_in_background: true },
      }),
      wireLine(101, { type: "step.end", turnId: "10", finishReason: "tool_use" }),
    ].join("\n");
    const completedWire = [
      launchWire,
      wireLine(201, {
        type: "tool.call",
        turnId: "10",
        name: "TaskOutput",
        args: { task_id: "agent-task" },
      }),
      wireLine(202, {
        type: "content.part",
        turnId: "10",
        part: { type: "text", text: "same-turn automatic reply" },
      }),
      wireLine(203, { type: "step.end", turnId: "10", finishReason: "end_turn" }),
    ].join("\n");
    const readText = makeReadText({
      wire: (reads) => (reads === 1 ? launchWire : completedWire),
      task: '{"status":"completed","endedAt":200}',
      output: { "/agent-task/output.log": "child result" },
    });
    const { bridge, updates } = startBridge(readText);

    bridge.onBackgroundLaunch({
      sessionId: "session-1",
      toolCallId: "tool-1",
      taskId: "agent-task",
    });
    await vi.waitFor(() => expect(updates).toHaveLength(3));
    bridge.dispose();

    expect(updates[1]?.update).toMatchObject({
      content: { type: "text", text: "same-turn automatic reply" },
      _meta: { [PORACODE_ACP_NEW_ASSISTANT_ITEM_META_KEY]: true },
    });
    expect(updates[2]?.update).toMatchObject({
      toolCallId: "tool-1",
      status: "completed",
      rawOutput: "child result",
    });
  });

  it("completes every task included in one shared automatic turn", async () => {
    const initialWire = [
      wireLine(100, {
        type: "content.part",
        turnId: "0",
        part: { type: "text", text: "launched" },
      }),
      wireLine(101, { type: "step.end", turnId: "0", finishReason: "end_turn" }),
    ].join("\n");
    const completedWire = [
      initialWire,
      wireLine(201, {
        type: "tool.call",
        turnId: "1",
        name: "TaskOutput",
        args: { task_id: "agent-alpha" },
      }),
      wireLine(202, {
        type: "tool.call",
        turnId: "1",
        name: "TaskOutput",
        args: { task_id: "agent-beta" },
      }),
      wireLine(203, {
        type: "content.part",
        turnId: "1",
        part: { type: "text", text: "combined automatic reply" },
      }),
      wireLine(204, { type: "step.end", turnId: "1", finishReason: "end_turn" }),
    ].join("\n");
    const readText = makeReadText({
      wire: (reads) => (reads <= 2 ? initialWire : completedWire),
      task: '{"status":"completed","endedAt":200}',
      output: {
        "/agent-alpha/output.log": "alpha result",
        "/agent-beta/output.log": "beta result",
      },
    });
    const { bridge, updates } = startBridge(readText);

    bridge.onBackgroundLaunch({
      sessionId: "session-1",
      toolCallId: "tool-alpha",
      taskId: "agent-alpha",
    });
    bridge.onBackgroundLaunch({
      sessionId: "session-1",
      toolCallId: "tool-beta",
      taskId: "agent-beta",
    });
    await vi.waitFor(() => {
      expect(
        updates.filter((notification) => notification.update.sessionUpdate === "tool_call_update"),
      ).toHaveLength(2);
    });
    bridge.dispose();

    const terminalUpdates = updates.filter(
      (notification) => notification.update.sessionUpdate === "tool_call_update",
    );
    expect(
      terminalUpdates
        .map((notification) => (notification.update as { toolCallId?: string }).toolCallId)
        .sort(),
    ).toEqual(["tool-alpha", "tool-beta"]);
    expect(
      updates.filter(
        (notification) =>
          notification.update.sessionUpdate === "agent_message_chunk" &&
          (notification.update as { _meta?: Record<string, unknown> })._meta?.[
            PORACODE_ACP_NEW_ASSISTANT_ITEM_META_KEY
          ] === true,
      ),
    ).toHaveLength(1);
    expect(
      updates.find(
        (notification) =>
          notification.update.sessionUpdate === "agent_message_chunk" &&
          (notification.update as { _meta?: Record<string, unknown> })._meta?.[
            PORACODE_ACP_NEW_ASSISTANT_ITEM_META_KEY
          ] === true,
      )?.update,
    ).toMatchObject({ content: { type: "text", text: "combined automatic reply" } });
  });

  it.each([
    { status: "killed", expected: "failed" },
    { status: "timed_out", expected: "failed" },
    { status: "lost", expected: "failed" },
    { status: "failed", expected: "failed" },
    { status: "completed", expected: "completed" },
  ])(
    "completes $status tasks without a parent reply when no wire turn references them",
    async ({ status, expected }) => {
      const initialWire = [
        wireLine(100, {
          type: "content.part",
          turnId: "0",
          part: { type: "text", text: "launched" },
        }),
        wireLine(101, { type: "step.end", turnId: "0", finishReason: "end_turn" }),
      ].join("\n");
      // v2 notification turns are invisible over ACP; when the model's reply
      // turn never references the task, the wire poll expires its grace
      // window and the completion must still be emitted. Fast-forward the
      // injected clock past the window once the wire polling starts.
      let clock = 1_000;
      const readText = makeReadText({
        wire: (reads) => {
          if (reads >= 2) clock = 1_000 + 15 * 60 * 1_000 + 1_000;
          return initialWire;
        },
        task: `{"status":"${status}","endedAt":200}`,
        output: { "/agent-task/output.log": "child result" },
      });
      const { bridge, updates } = startBridge(readText, { now: () => clock });

      bridge.onBackgroundLaunch({
        sessionId: "session-1",
        toolCallId: "tool-1",
        taskId: "agent-task",
      });
      await vi.waitFor(() => expect(updates).toHaveLength(2));
      bridge.dispose();

      expect(updates.map((notification) => notification.update.sessionUpdate)).toEqual([
        "agent_message_chunk",
        "tool_call_update",
      ]);
      expect(updates[0]?.update).toMatchObject({
        content: { type: "text", text: "child result" },
        _meta: { [PORACODE_ACP_PARENT_TOOL_CALL_ID_META_KEY]: "tool-1" },
      });
      expect(updates[1]?.update).toMatchObject({
        toolCallId: "tool-1",
        status: expected,
        rawOutput: "child result",
        _meta: { [PORACODE_ACP_DETACHED_SUBAGENT_ACTIVITY_META_KEY]: "tool-1" },
      });
    },
  );
});
