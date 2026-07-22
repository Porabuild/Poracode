import type { SessionNotification } from "@agentclientprotocol/sdk";
import { describe, expect, it } from "vitest";
import {
  createAcpMapperState,
  mapAcpSessionUpdate,
  PORACODE_ACP_DETACHED_SUBAGENT_META_KEY,
  PORACODE_ACP_NEW_ASSISTANT_ITEM_META_KEY,
  PORACODE_ACP_PARENT_TOOL_CALL_ID_META_KEY,
  PORACODE_ACP_TOP_LEVEL_TOOL_CALL_META_KEY,
} from "../acp/canonicalMapping";
import { isAcpSubAgentToolCall } from "../acp/canonicalMapping/subagents";
import {
  createKimiAcpSessionUpdateTransform,
  transformKimiAcpSessionUpdate,
  type KimiBackgroundLaunch,
} from "./acpTransform";

function toolCall(overrides: Record<string, unknown>): SessionNotification {
  return {
    sessionId: "ses-1",
    update: {
      sessionUpdate: "tool_call",
      toolCallId: "tc-agent",
      status: "pending",
      ...overrides,
    },
  } as unknown as SessionNotification;
}

function transformedRawInput(input: SessionNotification): Record<string, unknown> {
  return (transformKimiAcpSessionUpdate(input).update as { rawInput?: unknown }).rawInput as Record<
    string,
    unknown
  >;
}

describe("transformKimiAcpSessionUpdate", () => {
  it("recovers subagent_type and description from a Kimi launch title", () => {
    // Verbatim shape Kimi's ACP server sends for its `Agent` tool: a human
    // title, `kind: "other"`, and no rawInput.
    const input = toolCall({
      kind: "other",
      title: "Launching explore agent: Investigate PWA state bugs 3-7",
    });
    const rawInput = transformedRawInput(input);
    expect(rawInput).toMatchObject({
      subagent_type: "explore",
      description: "Investigate PWA state bugs 3-7",
    });
    expect(isAcpSubAgentToolCall({ rawInput })).toBe(true);
  });

  it("recognizes background agent launches", () => {
    const input = toolCall({
      kind: "other",
      title: "Launching background coder agent: Serve local images to PWA",
    });
    expect(transformedRawInput(input)).toMatchObject({
      subagent_type: "coder",
      description: "Serve local images to PWA",
      background: true,
    });
  });

  it("also normalizes tool_call_update notifications", () => {
    const input = toolCall({
      sessionUpdate: "tool_call_update",
      status: "completed",
      title: "Launching explore agent: Investigate PWA state bugs 3-7",
      rawOutput: "agent_id: agent-0\nactual_subagent_type: explore\nstatus: completed",
    });
    expect(transformedRawInput(input)).toMatchObject({ subagent_type: "explore" });
  });

  it("removes Kimi's transport header from foreground subagent output", () => {
    const input = toolCall({
      sessionUpdate: "tool_call_update",
      status: "completed",
      title: "Launching explore agent: Investigate",
      rawOutput:
        "agent_id: agent-0\nactual_subagent_type: explore\nstatus: completed\n\n[summary]\nThe useful result",
    });
    expect((transformKimiAcpSessionUpdate(input).update as { rawOutput?: unknown }).rawOutput).toBe(
      "The useful result",
    );
  });

  it("preserves an existing rawInput subagent_type", () => {
    const input = toolCall({
      title: "Launching explore agent: Investigate",
      rawInput: { subagent_type: "custom", prompt: "p" },
    });
    expect(transformedRawInput(input)).toMatchObject({
      subagent_type: "custom",
      prompt: "p",
    });
  });

  it("merges recovered fields into an existing rawInput", () => {
    const input = toolCall({
      title: "Launching explore agent: Investigate",
      rawInput: { prompt: "the full prompt" },
    });
    expect(transformedRawInput(input)).toMatchObject({
      prompt: "the full prompt",
      subagent_type: "explore",
      description: "Investigate",
    });
  });

  it("ignores ordinary tool calls and non-tool updates", () => {
    const read = toolCall({ kind: "read", title: "Reading src/mobile/views/ThreadView.tsx" });
    expect(transformKimiAcpSessionUpdate(read)).toBe(read);
    const untitled = toolCall({ kind: "other" });
    expect(transformKimiAcpSessionUpdate(untitled)).toBe(untitled);
    const chunk = {
      sessionId: "ses-1",
      update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "hi" } },
    } as unknown as SessionNotification;
    expect(transformKimiAcpSessionUpdate(chunk)).toBe(chunk);
  });

  it("classifies the initial empty Agent call and hides streamed JSON input", () => {
    const transform = createKimiAcpSessionUpdateTransform();
    const initial = transform(toolCall({ title: "Agent", content: [] }));
    const initialUpdate = initial.update as {
      rawInput?: Record<string, unknown>;
      _meta?: Record<string, unknown>;
      content?: unknown;
    };
    expect(initialUpdate.rawInput).toMatchObject({ subagent_type: "agent" });
    expect(initialUpdate._meta?.[PORACODE_ACP_DETACHED_SUBAGENT_META_KEY]).toBeUndefined();
    expect(initialUpdate._meta?.[PORACODE_ACP_TOP_LEVEL_TOOL_CALL_META_KEY]).toBe(true);
    expect(initialUpdate).not.toHaveProperty("content");

    const streamed = transform(
      toolCall({
        sessionUpdate: "tool_call_update",
        status: "in_progress",
        title: undefined,
        content: [
          {
            type: "content",
            content: {
              type: "text",
              text: '{"description":"Inspect files","subagent_type":"explore"}',
            },
          },
        ],
      }),
    );
    expect((streamed.update as { rawInput?: unknown }).rawInput).toMatchObject({
      description: "Inspect files",
      subagent_type: "explore",
    });
    expect(streamed.update).not.toHaveProperty("content");
  });

  it("keeps concurrent foreground Agent calls as top-level siblings", () => {
    const transform = createKimiAcpSessionUpdateTransform();
    const state = createAcpMapperState("thread-1");

    const first = mapAcpSessionUpdate(
      transform(toolCall({ toolCallId: "agent-a", title: "Agent" })),
      state,
    );
    const second = mapAcpSessionUpdate(
      transform(toolCall({ toolCallId: "agent-b", title: "Agent" })),
      state,
    );

    expect(first.find((event) => event.type === "item.started")).not.toHaveProperty("parentItemId");
    expect(second.find((event) => event.type === "item.started")).not.toHaveProperty(
      "parentItemId",
    );
  });

  it("keeps a background launch running and reports its task to the bridge", () => {
    const launches: KimiBackgroundLaunch[] = [];
    const transform = createKimiAcpSessionUpdateTransform({
      onBackgroundLaunch: (launch) => launches.push(launch),
    });
    transform(toolCall({ title: "Agent" }));
    transform(
      toolCall({
        sessionUpdate: "tool_call_update",
        status: "in_progress",
        title: "Launching background explore agent: Inspect files",
        rawInput: {
          description: "Inspect files",
          subagent_type: "explore",
          run_in_background: true,
        },
      }),
    );
    const receipt = transform(
      toolCall({
        sessionUpdate: "tool_call_update",
        status: "completed",
        title: undefined,
        rawOutput:
          "task_id: agent-task\nstatus: running\nagent_id: agent-0\nautomatic_notification: true",
        content: [{ type: "content", content: { type: "text", text: "launch receipt" } }],
      }),
    );
    expect((receipt.update as { status?: unknown }).status).toBe("in_progress");
    expect(
      (receipt.update as { _meta?: Record<string, unknown> })._meta?.[
        PORACODE_ACP_DETACHED_SUBAGENT_META_KEY
      ],
    ).toBe(true);
    expect(receipt.update).not.toHaveProperty("rawOutput");
    expect(receipt.update).not.toHaveProperty("content");
    expect(launches).toEqual([
      {
        sessionId: "ses-1",
        toolCallId: "tc-agent",
        taskId: "agent-task",
        agentId: "agent-0",
        subagentType: "explore",
        description: "Inspect files",
      },
    ]);
  });

  it("maps streamed input as arguments and foreground output as a nested child", () => {
    const transform = createKimiAcpSessionUpdateTransform();
    const state = createAcpMapperState("thread-1");
    const started = mapAcpSessionUpdate(transform(toolCall({ title: "Agent" })), state);
    const parentItemId = (started[0] as { itemId: string }).itemId;
    expect((started[0] as { payload?: unknown }).payload).toMatchObject({ isSubAgent: true });

    const inputEvents = mapAcpSessionUpdate(
      transform(
        toolCall({
          sessionUpdate: "tool_call_update",
          status: "in_progress",
          title: "Launching explore agent: Inspect files",
          rawInput: { description: "Inspect files", subagent_type: "explore" },
          content: [{ type: "content", content: { type: "text", text: "input JSON" } }],
        }),
      ),
      state,
    );
    expect(inputEvents).toContainEqual(
      expect.objectContaining({
        type: "item.updated",
        payload: expect.objectContaining({
          args: {
            _toolName: "task",
            description: "Inspect files",
            subagent_type: "explore",
          },
        }),
      }),
    );
    expect(inputEvents).not.toContainEqual(
      expect.objectContaining({ type: "content.delta", delta: "input JSON" }),
    );
    const child = inputEvents.find(
      (event) => event.type === "item.started" && event.itemType === "assistant_message",
    );
    expect(child).toMatchObject({ parentItemId });

    const completed = mapAcpSessionUpdate(
      transform(
        toolCall({
          sessionUpdate: "tool_call_update",
          status: "completed",
          title: undefined,
          rawOutput:
            "agent_id: agent-0\nactual_subagent_type: explore\nstatus: completed\n\n[summary]\nUseful result",
        }),
      ),
      state,
    );
    expect(completed).toContainEqual(
      expect.objectContaining({
        type: "content.delta",
        delta: expect.stringContaining("Useful result"),
      }),
    );
  });

  it("promotes a launch to detached when background input arrives late", () => {
    const transform = createKimiAcpSessionUpdateTransform();
    const state = createAcpMapperState("thread-1");
    mapAcpSessionUpdate(transform(toolCall({ title: "Agent" })), state);
    expect(state.toolCallItems.get("tc-agent")?.detached).toBe(false);
    mapAcpSessionUpdate(
      transform(
        toolCall({
          sessionUpdate: "tool_call_update",
          status: "in_progress",
          title: "Launching background explore agent: Inspect files",
          rawInput: { subagent_type: "explore", run_in_background: true },
        }),
      ),
      state,
    );
    expect(state.toolCallItems.get("tc-agent")?.detached).toBe(true);
  });

  it("separates recovered background output from the automatic parent reply", () => {
    const transform = createKimiAcpSessionUpdateTransform();
    const state = createAcpMapperState("thread-1");
    mapAcpSessionUpdate(transform(toolCall({ title: "Agent" })), state);
    const parentItemId = state.toolCallItems.get("tc-agent")?.itemId;
    mapAcpSessionUpdate(
      transform(
        toolCall({
          sessionUpdate: "tool_call_update",
          status: "in_progress",
          title: "Launching background explore agent: Inspect files",
          rawInput: { subagent_type: "explore", run_in_background: true },
        }),
      ),
      state,
    );

    const nested = mapAcpSessionUpdate(
      {
        sessionId: "ses-1",
        update: {
          sessionUpdate: "agent_message_chunk",
          content: { type: "text", text: "child result" },
          _meta: { [PORACODE_ACP_PARENT_TOOL_CALL_ID_META_KEY]: "tc-agent" },
        },
      } as SessionNotification,
      state,
    );
    expect(nested.find((event) => event.type === "item.started")).toMatchObject({
      parentItemId,
    });

    const parentReply = mapAcpSessionUpdate(
      {
        sessionId: "ses-1",
        update: {
          sessionUpdate: "agent_message_chunk",
          content: { type: "text", text: "parent reply" },
          _meta: { [PORACODE_ACP_NEW_ASSISTANT_ITEM_META_KEY]: true },
        },
      } as SessionNotification,
      state,
    );
    expect(parentReply.map((event) => event.type)).toEqual([
      "item.completed",
      "item.started",
      "content.delta",
    ]);
    expect(parentReply[1]).not.toHaveProperty("parentItemId");
  });
});
