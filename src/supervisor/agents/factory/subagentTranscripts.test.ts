import { appendFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SessionNotification } from "@agentclientprotocol/sdk";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PORACODE_ACP_PARENT_TOOL_CALL_ID_META_KEY } from "../acp/canonicalMapping/subagents";
import { createAcpMapperState, mapAcpSessionUpdate } from "../acp/canonicalMapping";
import { mapFactoryTranscriptRecord } from "./subagentTranscriptMapping";
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
    bridge.onSessionUpdate(parentStart);
    const [parentStarted] = mapAcpSessionUpdate(parentStart, mapperState);
    expect(parentStarted).toMatchObject({
      type: "item.started",
      itemType: "tool_call",
      payload: { isSubAgent: true },
    });
    const parentItemId = parentStarted?.type === "item.started" ? parentStarted.itemId : undefined;

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
});

function makeNotification(sessionId: string, update: Record<string, unknown>): SessionNotification {
  return { sessionId, update } as unknown as SessionNotification;
}
