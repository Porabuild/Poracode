import { appendFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SessionNotification } from "@agentclientprotocol/sdk";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PORACODE_ACP_PARENT_TOOL_CALL_ID_META_KEY } from "../acp/canonicalMapping/subagents";
import {
  closeOpenTurnItems,
  createAcpMapperState,
  mapAcpSessionUpdate,
} from "../acp/canonicalMapping";
import {
  factoryBackgroundTaskSessionId,
  mapFactoryTranscriptRecord,
} from "./subagentTranscriptMapping";
import { FactorySubagentTranscriptBridge } from "./subagentTranscripts";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const path of temporaryDirectories.splice(0)) {
    rmSync(path, { recursive: true, force: true });
  }
});

describe("Factory subagent transcripts", () => {
  it("maps child reasoning, tool calls, results, and assistant text into parented ACP updates", () => {
    const assistant = mapFactoryTranscriptRecord("child-session", "task-parent", {
      type: "message",
      message: {
        role: "assistant",
        content: [
          { type: "thinking", thinking: "Inspecting the implementation." },
          {
            type: "tool_use",
            id: "child-read",
            name: "Read",
            input: { file_path: "E:\\repo\\src\\feature.ts" },
          },
          { type: "text", text: "The implementation is correct." },
        ],
      },
    });
    const result = mapFactoryTranscriptRecord("child-session", "task-parent", {
      type: "message",
      message: {
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: "child-read",
            is_error: false,
            content: "export const feature = true;",
          },
        ],
      },
    });
    const failedResult = mapFactoryTranscriptRecord("child-session", "task-parent", {
      type: "message",
      message: {
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: "child-read",
            is_error: true,
            content: "Unable to read file",
          },
        ],
      },
    });

    expect(
      [...assistant, ...result, ...failedResult].map(({ update }) => update.sessionUpdate),
    ).toEqual([
      "agent_thought_chunk",
      "tool_call",
      "agent_message_chunk",
      "tool_call_update",
      "tool_call_update",
    ]);
    expect(assistant[1]?.update).toMatchObject({
      toolCallId: "child-read",
      title: "Read E:\\repo\\src\\feature.ts",
      kind: "read",
      status: "in_progress",
      _meta: { [PORACODE_ACP_PARENT_TOOL_CALL_ID_META_KEY]: "task-parent" },
    });
    expect(result[0]?.update).toMatchObject({
      toolCallId: "child-read",
      status: "completed",
      rawOutput: { text: "export const feature = true;" },
    });
    expect(failedResult[0]?.update).toMatchObject({
      toolCallId: "child-read",
      status: "failed",
      rawOutput: { text: "Unable to read file" },
    });
  });

  it("recovers the full child transcript correlated through Factory's task registry", async () => {
    const factoryHome = mkdtempSync(join(tmpdir(), "poracode-factory-subagents-"));
    temporaryDirectories.push(factoryHome);
    const sessionsDir = join(factoryHome, "sessions", "project-key");
    mkdirSync(sessionsDir, { recursive: true });
    writeFileSync(
      join(factoryHome, "task-invocations.json"),
      JSON.stringify({
        invocations: [
          {
            parentSessionId: "parent-session",
            parentToolUseId: "parent-task",
            childSessionId: "child-session",
            status: "running",
          },
          {
            parentSessionId: "child-session",
            parentToolUseId: "nested-task",
            childSessionId: "grandchild-session",
            status: "running",
          },
        ],
      }),
    );
    writeFileSync(
      join(sessionsDir, "child-session.jsonl"),
      [
        JSON.stringify({ type: "session_start", id: "child-session" }),
        JSON.stringify({
          type: "message",
          id: "assistant-1",
          message: {
            role: "assistant",
            content: [
              { type: "thinking", thinking: "Checking the file." },
              {
                type: "tool_use",
                id: "read-1",
                name: "Read",
                input: { file_path: "E:\\repo\\README.md" },
              },
            ],
          },
        }),
        JSON.stringify({
          type: "message",
          id: "result-1",
          message: {
            role: "user",
            content: [
              {
                type: "tool_result",
                tool_use_id: "read-1",
                is_error: false,
                content: "README content",
              },
            ],
          },
        }),
        JSON.stringify({
          type: "message",
          id: "assistant-2",
          message: {
            role: "assistant",
            content: [
              {
                type: "tool_use",
                id: "nested-task",
                name: "Task",
                input: { subagent_type: "explorer", description: "Review nested files" },
              },
            ],
          },
        }),
        JSON.stringify({
          type: "message",
          id: "assistant-3",
          message: { role: "assistant", content: [{ type: "text", text: "Review complete." }] },
        }),
      ].join("\n"),
    );
    writeFileSync(
      join(sessionsDir, "grandchild-session.jsonl"),
      `${JSON.stringify({
        type: "message",
        id: "nested-assistant-1",
        message: {
          role: "assistant",
          content: [{ type: "text", text: "Nested review complete." }],
        },
      })}\n`,
    );

    const recovered: SessionNotification[] = [];
    const runtimeEvents: ReturnType<typeof mapAcpSessionUpdate> = [];
    const mapperState = createAcpMapperState("thread-1");
    const bridge = new FactorySubagentTranscriptBridge(
      { kind: "windows", path: "E:\\repo" },
      (notification) => {
        recovered.push(notification);
        runtimeEvents.push(...mapAcpSessionUpdate(notification, mapperState));
      },
      { factoryHome, monitor: false },
    );
    const parentStart = makeNotification("parent-session", {
      sessionUpdate: "tool_call",
      toolCallId: "parent-task",
      title: "Task",
      status: "in_progress",
      rawInput: { subagent_type: "explorer", description: "Review files" },
    });
    expect(bridge.onSessionUpdate(parentStart)).toBe(true);
    const [parentStarted] = runtimeEvents;
    expect(parentStarted).toMatchObject({
      type: "item.started",
      itemType: "tool_call",
      payload: { isSubAgent: true },
    });
    const parentItemId = parentStarted?.type === "item.started" ? parentStarted.itemId : undefined;
    recovered.length = 0;

    await bridge.sync();
    await bridge.sync();

    expect(recovered.map(({ update }) => update.sessionUpdate)).toEqual([
      "agent_thought_chunk",
      "tool_call",
      "tool_call_update",
      "tool_call",
      "agent_message_chunk",
    ]);
    expect(recovered.at(-1)).toMatchObject({
      sessionId: "grandchild-session",
      update: {
        _meta: { [PORACODE_ACP_PARENT_TOOL_CALL_ID_META_KEY]: "nested-task" },
      },
    });

    const parentComplete = makeNotification("parent-session", {
      sessionUpdate: "tool_call_update",
      toolCallId: "parent-task",
      status: "completed",
    });
    expect(bridge.onSessionUpdate(parentComplete)).toBe(true);
    await vi.waitFor(() => {
      expect(recovered.at(-1)).toBe(parentComplete);
    });

    expect(recovered.at(-2)).toMatchObject({
      sessionId: "child-session",
      update: {
        sessionUpdate: "agent_message_chunk",
        content: { text: "Review complete." },
        _meta: { [PORACODE_ACP_PARENT_TOOL_CALL_ID_META_KEY]: "parent-task" },
      },
    });
    const recoveredCount = recovered.length;
    appendFileSync(
      join(sessionsDir, "child-session.jsonl"),
      `\n${JSON.stringify({
        type: "message",
        id: "assistant-late",
        message: { role: "assistant", content: [{ type: "text", text: "Too late." }] },
      })}\n`,
    );
    await bridge.sync();
    expect(recovered).toHaveLength(recoveredCount);

    expect(
      recovered.slice(0, -1).every(({ update }) => {
        const meta = update._meta as Record<string, unknown>;
        return typeof meta[PORACODE_ACP_PARENT_TOOL_CALL_ID_META_KEY] === "string";
      }),
    ).toBe(true);
    expect(runtimeEvents).toContainEqual(
      expect.objectContaining({
        type: "item.started",
        itemType: "reasoning",
        parentItemId,
      }),
    );
    expect(runtimeEvents).toContainEqual(
      expect.objectContaining({
        type: "item.started",
        itemType: "tool_call",
        parentItemId,
      }),
    );
    expect(runtimeEvents).toContainEqual(
      expect.objectContaining({
        type: "item.updated",
        itemId: parentItemId,
        payload: expect.objectContaining({
          progress: expect.objectContaining({ stepCount: 3 }),
        }),
      }),
    );
    bridge.dispose();
  });

  it.each(["completed", "failed", "cancelled"])(
    "keeps background siblings alive across foreground turns until the registry reports %s",
    async (status) => {
      const factoryHome = mkdtempSync(join(tmpdir(), "poracode-factory-background-"));
      temporaryDirectories.push(factoryHome);
      const sessionsDir = join(factoryHome, "sessions", "project-key");
      mkdirSync(sessionsDir, { recursive: true });
      const invocations = ["first", "second"].map((name) => ({
        parentSessionId: "parent-session",
        parentToolUseId: `${name}-task`,
        childSessionId: `${name}-child`,
        runInBackground: true,
        status: "running",
      }));
      const writeRegistry = () =>
        writeFileSync(
          join(factoryHome, "state", "task-invocations.json"),
          JSON.stringify({ invocations }),
        );
      mkdirSync(join(factoryHome, "state"));
      writeFileSync(
        join(factoryHome, "task-invocations.json"),
        JSON.stringify({ invocations: [] }),
      );
      writeRegistry();
      const state = createAcpMapperState("thread-background");
      const events: ReturnType<typeof mapAcpSessionUpdate> = [];
      const bridge = new FactorySubagentTranscriptBridge(
        { kind: "windows", path: "E:\\repo" },
        (notification) => events.push(...mapAcpSessionUpdate(notification, state)),
        { factoryHome, monitor: false },
      );
      for (const name of ["first", "second"]) {
        bridge.onSessionUpdate(
          makeNotification("parent-session", {
            sessionUpdate: "tool_call",
            toolCallId: `${name}-task`,
            title: "Task",
            status: "in_progress",
            rawInput: { subagent_type: "explorer", description: `Review ${name}` },
          }),
        );
        expect(
          bridge.onSessionUpdate(
            makeNotification("parent-session", {
              sessionUpdate: "tool_call_update",
              toolCallId: `${name}-task`,
              status: "completed",
              content: [
                {
                  type: "content",
                  content: {
                    type: "text",
                    text: `Task launched in background.\ntask_id: ${name}-child\nsession_id: ${name}-child\n`,
                  },
                },
              ],
            }),
          ),
        ).toBe(true);
      }
      await bridge.sync();
      expect(events.filter((event) => event.type === "item.started")).toHaveLength(2);
      expect(
        events
          .filter((event) => event.type === "item.started")
          .every((event) => !("parentItemId" in event)),
      ).toBe(true);
      expect(closeOpenTurnItems(state)).toEqual([]);
      expect(state.toolCallItems.size).toBe(2);
      const foreground = mapAcpSessionUpdate(
        makeNotification("parent-session", {
          sessionUpdate: "agent_message_chunk",
          content: { type: "text", text: "Continuing foreground work." },
        }),
        state,
      );
      expect(foreground.find((event) => event.type === "item.started")).not.toHaveProperty(
        "parentItemId",
      );
      closeOpenTurnItems(state);

      const firstItemId = state.toolCallItems.get("first-task")!.itemId;
      writeFileSync(
        join(sessionsDir, "first-child.jsonl"),
        JSON.stringify({
          type: "message",
          message: { role: "assistant", content: [{ type: "text", text: "Late child report." }] },
        }),
      );
      invocations[0]!.status = status;
      writeRegistry();
      await bridge.sync();
      expect(events).toContainEqual(
        expect.objectContaining({
          type: "item.started",
          itemType: "assistant_message",
          parentItemId: firstItemId,
        }),
      );
      const completeIndex = events.findIndex(
        (event) => event.type === "item.completed" && event.itemId === firstItemId,
      );
      expect(completeIndex).toBeGreaterThan(
        events.findIndex(
          (event) => event.type === "content.delta" && event.delta === "Late child report.",
        ),
      );
      expect(events[completeIndex]).toMatchObject({
        payload: { status: status === "completed" ? "success" : "error" },
      });
      expect(state.toolCallItems.has("first-task")).toBe(false);
      expect(state.toolCallItems.has("second-task")).toBe(true);
      const eventCount = events.length;
      await bridge.sync();
      expect(events).toHaveLength(eventCount);
      bridge.dispose();
      invocations[1]!.status = "completed";
      writeRegistry();
      await bridge.sync();
      expect(events).toHaveLength(eventCount);
    },
  );

  it("recognizes background launch results without treating ordinary reports as launches", () => {
    const text = "Task launched in background.\ntask_id: child\nsession_id: child\n";
    expect(factoryBackgroundTaskSessionId({ rawOutput: text })).toBe("child");
    expect(factoryBackgroundTaskSessionId({ rawOutput: { text } })).toBe("child");
    expect(factoryBackgroundTaskSessionId({ rawOutput: "Review complete." })).toBeUndefined();
  });

  it("allows turn cleanup to close a foreground task interrupted before a launch receipt", () => {
    const state = createAcpMapperState("thread-cancelled");
    const bridge = new FactorySubagentTranscriptBridge(
      { kind: "windows", path: "E:\\repo" },
      (notification) => mapAcpSessionUpdate(notification, state),
      { monitor: false },
    );
    bridge.onSessionUpdate(
      makeNotification("parent-session", {
        sessionUpdate: "tool_call",
        toolCallId: "foreground-task",
        title: "Task",
        status: "in_progress",
        rawInput: { subagent_type: "explorer" },
      }),
    );
    expect(closeOpenTurnItems(state)).toContainEqual(
      expect.objectContaining({ type: "item.completed" }),
    );
    expect(state.toolCallItems.size).toBe(0);
    bridge.dispose();
  });

  it.each([false, true])(
    "keeps nested background reports after parent completion (late receipt: %s)",
    async (lateReceipt) => {
      const factoryHome = mkdtempSync(join(tmpdir(), "poracode-factory-nested-background-"));
      temporaryDirectories.push(factoryHome);
      const sessionsDir = join(factoryHome, "sessions", "project-key");
      mkdirSync(sessionsDir, { recursive: true });
      const invocations = [
        {
          parentSessionId: "parent-session",
          parentToolUseId: "parent-task",
          childSessionId: "child-session",
          status: "running",
        },
        {
          parentSessionId: "child-session",
          parentToolUseId: "nested-task",
          childSessionId: "grandchild-session",
          status: "running",
        },
      ];
      const writeRegistry = () =>
        writeFileSync(join(factoryHome, "task-invocations.json"), JSON.stringify({ invocations }));
      writeRegistry();
      const childTranscript =
        [
          {
            type: "message",
            message: {
              role: "assistant",
              content: [
                {
                  type: "tool_use",
                  id: "nested-task",
                  name: "Task",
                  input: { subagent_type: "explorer", description: "Nested review" },
                },
              ],
            },
          },
          {
            type: "message",
            message: {
              role: "user",
              content: [
                {
                  type: "tool_result",
                  tool_use_id: "nested-task",
                  content:
                    "Task launched in background.\ntask_id: grandchild-session\nsession_id: grandchild-session\n",
                },
              ],
            },
          },
        ]
          .map((record) => JSON.stringify(record))
          .join("\n") + (lateReceipt ? "" : "\n");
      const state = createAcpMapperState("thread-nested");
      const events: ReturnType<typeof mapAcpSessionUpdate> = [];
      const bridge = new FactorySubagentTranscriptBridge(
        { kind: "windows", path: "E:\\repo" },
        (notification) => events.push(...mapAcpSessionUpdate(notification, state)),
        { factoryHome, monitor: false },
      );
      bridge.onSessionUpdate(
        makeNotification("parent-session", {
          sessionUpdate: "tool_call",
          toolCallId: "parent-task",
          title: "Task",
          status: "in_progress",
          rawInput: { subagent_type: "explorer" },
        }),
      );
      if (lateReceipt) {
        writeFileSync(join(sessionsDir, "child-session.jsonl"), "");
        await bridge.sync();
        bridge.onSessionUpdate(
          makeNotification("parent-session", {
            sessionUpdate: "tool_call_update",
            toolCallId: "parent-task",
            status: "completed",
            rawOutput:
              "Task launched in background.\ntask_id: child-session\nsession_id: child-session\n",
          }),
        );
        writeFileSync(join(sessionsDir, "child-session.jsonl"), childTranscript);
        writeFileSync(
          join(sessionsDir, "grandchild-session.jsonl"),
          JSON.stringify({
            type: "message",
            message: {
              role: "assistant",
              content: [{ type: "text", text: "Nested late report." }],
            },
          }),
        );
        invocations[0]!.status = "completed";
        invocations[1]!.status = "completed";
        writeRegistry();
        await bridge.sync();
        await bridge.sync();
      } else {
        writeFileSync(join(sessionsDir, "child-session.jsonl"), childTranscript);
        await bridge.sync();
        bridge.onSessionUpdate(
          makeNotification("parent-session", {
            sessionUpdate: "tool_call_update",
            toolCallId: "parent-task",
            status: "completed",
          }),
        );
        await vi.waitUntil(() => !state.toolCallItems.has("parent-task"));
        closeOpenTurnItems(state);
        writeFileSync(
          join(sessionsDir, "grandchild-session.jsonl"),
          JSON.stringify({
            type: "message",
            message: {
              role: "assistant",
              content: [{ type: "text", text: "Nested late report." }],
            },
          }),
        );
        invocations[1]!.status = "completed";
        writeRegistry();
        await bridge.sync();
      }
      const nestedStart = events.filter(
        (event) => event.type === "item.started" && event.itemType === "tool_call",
      )[1];
      expect(nestedStart).toBeDefined();
      const nestedItemId = nestedStart && "itemId" in nestedStart ? nestedStart.itemId : undefined;
      expect(events).toContainEqual(
        expect.objectContaining({ type: "item.started", parentItemId: nestedItemId }),
      );
      expect(events).toContainEqual(
        expect.objectContaining({ type: "content.delta", delta: "Nested late report." }),
      );
      expect(events.at(-1)).toMatchObject({ type: "item.completed", itemId: nestedItemId });
      expect(state.toolCallItems.size).toBe(0);
      bridge.dispose();
    },
  );
});

function makeNotification(sessionId: string, update: Record<string, unknown>): SessionNotification {
  return { sessionId, update } as unknown as SessionNotification;
}
